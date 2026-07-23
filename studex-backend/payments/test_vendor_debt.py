# payments/test_vendor_debt.py
"""
Test suite for Blocker 2 (Refund-After-Payout) — see the Design Validation &
Risk Register. Covers: refund_payment()'s new post-payout path, VendorDebt
creation, debt settlement/deduction in trigger_vendor_payout and the
retry_failed_transfers scheduler job, and the related admin surface.
"""
from decimal import Decimal
from unittest.mock import patch, MagicMock

from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from django.contrib.admin.sites import AdminSite
from django.test import RequestFactory
from rest_framework.test import APIClient
from rest_framework import status

from payments.models import PaymentTransaction, SellerBankAccount, VendorDebt
from payments.views import settle_vendor_debt, trigger_vendor_payout

User = get_user_model()


def make_txn(**overrides):
    defaults = dict(
        reference=f"TXN-{PaymentTransaction.objects.count() + 1}",
        amount=Decimal("1000.00"),
        seller_amount=Decimal("950.00"),
        platform_amount=Decimal("50.00"),
        buyer_email="buyer@pau.edu.ng",
        status="success",
    )
    defaults.update(overrides)
    return PaymentTransaction.objects.create(**defaults)


class RefundAfterPayoutPermissionTests(TestCase):
    """refund_payment() — the new staff-gated post-payout branch."""

    def setUp(self):
        self.client = APIClient()
        self.buyer = User.objects.create_user(
            username="buyer", email="buyer@pau.edu.ng", password="pass12345",
        )
        self.seller = User.objects.create_user(
            username="seller", email="seller@pau.edu.ng", password="pass12345",
            user_type="vendor",
        )
        self.staff = User.objects.create_user(
            username="staff", email="staff@pau.edu.ng", password="pass12345",
            is_staff=True,
        )

    def test_buyer_can_still_self_refund_before_payout_unchanged(self):
        """Backward compatibility: pre-payout self-service refund is untouched."""
        txn = make_txn(
            buyer=self.buyer, seller=self.seller, buyer_email=self.buyer.email,
            transfer_reference="",
        )
        self.client.force_authenticate(user=self.buyer)

        with patch("payments.views.requests.post") as mock_post:
            mock_post.return_value = MagicMock(
                status_code=200, json=lambda: {"status": True},
            )
            response = self.client.post("/api/payments/refund/", {"reference": txn.reference})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn("vendor_debt_created", response.data)
        self.assertEqual(VendorDebt.objects.count(), 0)

    def test_buyer_cannot_self_refund_after_payout(self):
        txn = make_txn(
            buyer=self.buyer, seller=self.seller, buyer_email=self.buyer.email,
            transfer_reference="PAYOUT-TXN-1",
        )
        self.client.force_authenticate(user=self.buyer)

        response = self.client.post("/api/payments/refund/", {"reference": txn.reference})

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(VendorDebt.objects.count(), 0)
        txn.refresh_from_db()
        self.assertEqual(txn.status, "success")  # untouched

    def test_staff_can_refund_after_payout_and_debt_is_created(self):
        txn = make_txn(
            buyer=self.buyer, seller=self.seller, buyer_email=self.buyer.email,
            transfer_reference="PAYOUT-TXN-1", seller_amount=Decimal("950.00"),
        )
        self.client.force_authenticate(user=self.staff)

        with patch("payments.views.requests.post") as mock_post:
            mock_post.return_value = MagicMock(
                status_code=200, json=lambda: {"status": True},
            )
            response = self.client.post(
                "/api/payments/refund/",
                {"reference": txn.reference, "reason": "Item never delivered"},
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("vendor_debt_created", response.data)
        self.assertEqual(response.data["vendor_debt_created"]["amount"], 950.00)

        txn.refresh_from_db()
        self.assertEqual(txn.status, "refunded")

        debt = VendorDebt.objects.get(source_transaction=txn)
        self.assertEqual(debt.vendor, self.seller)
        self.assertEqual(debt.original_amount, Decimal("950.00"))
        self.assertEqual(debt.outstanding_amount, Decimal("950.00"))
        self.assertEqual(debt.status, "outstanding")

    def test_no_debt_created_if_paystack_refund_call_fails(self):
        txn = make_txn(
            buyer=self.buyer, seller=self.seller, buyer_email=self.buyer.email,
            transfer_reference="PAYOUT-TXN-1",
        )
        self.client.force_authenticate(user=self.staff)

        with patch("payments.views.requests.post") as mock_post:
            mock_post.return_value = MagicMock(
                status_code=400, json=lambda: {"status": False, "message": "Charge not found"},
            )
            response = self.client.post("/api/payments/refund/", {"reference": txn.reference})

        self.assertEqual(response.status_code, 400)
        self.assertEqual(VendorDebt.objects.count(), 0)
        txn.refresh_from_db()
        self.assertEqual(txn.status, "success")

    def test_already_refunded_transaction_rejected_regardless_of_staff(self):
        txn = make_txn(
            buyer=self.buyer, seller=self.seller, buyer_email=self.buyer.email,
            status="refunded",
        )
        self.client.force_authenticate(user=self.staff)

        response = self.client.post("/api/payments/refund/", {"reference": txn.reference})

        self.assertEqual(response.status_code, 400)


class SettleVendorDebtTests(TestCase):
    """settle_vendor_debt — the core deduction/FIFO logic."""

    def setUp(self):
        self.seller = User.objects.create_user(
            username="seller", email="seller@pau.edu.ng", password="pass12345",
        )

    def test_no_outstanding_debt_returns_full_amount_untouched(self):
        remaining, settled = settle_vendor_debt(self.seller, Decimal("500.00"))
        self.assertEqual(remaining, Decimal("500.00"))
        self.assertEqual(settled, Decimal("0"))

    def test_debt_smaller_than_payout_settles_fully_and_returns_remainder(self):
        VendorDebt.objects.create(
            vendor=self.seller, original_amount=Decimal("200.00"),
            outstanding_amount=Decimal("200.00"),
        )
        remaining, settled = settle_vendor_debt(self.seller, Decimal("500.00"))

        self.assertEqual(settled, Decimal("200.00"))
        self.assertEqual(remaining, Decimal("300.00"))
        debt = VendorDebt.objects.first()
        self.assertEqual(debt.status, "settled")
        self.assertEqual(debt.outstanding_amount, Decimal("0"))
        self.assertIsNotNone(debt.settled_at)

    def test_debt_larger_than_payout_partially_settles_and_returns_zero(self):
        VendorDebt.objects.create(
            vendor=self.seller, original_amount=Decimal("800.00"),
            outstanding_amount=Decimal("800.00"),
        )
        remaining, settled = settle_vendor_debt(self.seller, Decimal("500.00"))

        self.assertEqual(settled, Decimal("500.00"))
        self.assertEqual(remaining, Decimal("0"))
        debt = VendorDebt.objects.first()
        self.assertEqual(debt.status, "outstanding")  # still owes the rest
        self.assertEqual(debt.outstanding_amount, Decimal("300.00"))

    def test_multiple_debts_settled_oldest_first(self):
        old_debt = VendorDebt.objects.create(
            vendor=self.seller, original_amount=Decimal("100.00"),
            outstanding_amount=Decimal("100.00"),
        )
        new_debt = VendorDebt.objects.create(
            vendor=self.seller, original_amount=Decimal("100.00"),
            outstanding_amount=Decimal("100.00"),
        )
        remaining, settled = settle_vendor_debt(self.seller, Decimal("150.00"))

        old_debt.refresh_from_db()
        new_debt.refresh_from_db()
        self.assertEqual(old_debt.status, "settled")
        self.assertEqual(new_debt.status, "outstanding")
        self.assertEqual(new_debt.outstanding_amount, Decimal("50.00"))
        self.assertEqual(remaining, Decimal("0"))
        self.assertEqual(settled, Decimal("150.00"))

    def test_written_off_and_settled_debts_are_not_deducted_again(self):
        VendorDebt.objects.create(
            vendor=self.seller, original_amount=Decimal("100.00"),
            outstanding_amount=Decimal("0"), status="settled",
        )
        VendorDebt.objects.create(
            vendor=self.seller, original_amount=Decimal("100.00"),
            outstanding_amount=Decimal("0"), status="written_off",
        )
        remaining, settled = settle_vendor_debt(self.seller, Decimal("500.00"))
        self.assertEqual(remaining, Decimal("500.00"))
        self.assertEqual(settled, Decimal("0"))

    def test_debt_isolated_per_vendor(self):
        other_seller = User.objects.create_user(
            username="other_seller", email="other@pau.edu.ng", password="pass12345",
        )
        VendorDebt.objects.create(
            vendor=other_seller, original_amount=Decimal("999.00"),
            outstanding_amount=Decimal("999.00"),
        )
        remaining, settled = settle_vendor_debt(self.seller, Decimal("500.00"))
        self.assertEqual(remaining, Decimal("500.00"))
        self.assertEqual(settled, Decimal("0"))


class TransferToVendorDebtIntegrationTests(TestCase):
    """trigger_vendor_payout — debt deduction wired into the real payout path."""

    def setUp(self):
        self.seller = User.objects.create_user(
            username="seller", email="seller@pau.edu.ng", password="pass12345",
        )
        SellerBankAccount.objects.create(
            user=self.seller, bank_code="058", bank_name="GTBank",
            account_number="0123456789", account_name="Seller",
            paystack_recipient_code="RCP_test123",
        )

    @override_settings(PAYSTACK_SECRET_KEY="sk_test_x")
    def test_no_debt_transfers_full_amount_unchanged(self):
        """Backward compatibility: no debt means identical behavior to before."""
        txn = make_txn(seller=self.seller, seller_amount=Decimal("950.00"))

        with patch("payments.views.requests.post") as mock_post:
            mock_post.return_value = MagicMock(
                status_code=200,
                json=lambda: {"status": True, "data": {"reference": "PSTK-REF", "status": "success"}},
            )
            trigger_vendor_payout(txn, "Test Listing")

            called_amount = mock_post.call_args.kwargs["json"]["amount"]
            self.assertEqual(called_amount, 95000)  # 950.00 naira in kobo, untouched

        txn.refresh_from_db()
        self.assertEqual(txn.transfer_reference, "PSTK-REF")

    @override_settings(PAYSTACK_SECRET_KEY="sk_test_x")
    def test_partial_debt_reduces_transfer_amount(self):
        VendorDebt.objects.create(
            vendor=self.seller, original_amount=Decimal("200.00"),
            outstanding_amount=Decimal("200.00"),
        )
        txn = make_txn(seller=self.seller, seller_amount=Decimal("950.00"))

        with patch("payments.views.requests.post") as mock_post:
            mock_post.return_value = MagicMock(
                status_code=200,
                json=lambda: {"status": True, "data": {"reference": "PSTK-REF", "status": "success"}},
            )
            trigger_vendor_payout(txn, "Test Listing")

            called_amount = mock_post.call_args.kwargs["json"]["amount"]
            self.assertEqual(called_amount, 75000)  # (950 - 200) naira in kobo

        debt = VendorDebt.objects.get(vendor=self.seller)
        self.assertEqual(debt.status, "settled")

    @override_settings(PAYSTACK_SECRET_KEY="sk_test_x")
    def test_debt_exceeding_payout_absorbs_it_entirely_no_paystack_call(self):
        VendorDebt.objects.create(
            vendor=self.seller, original_amount=Decimal("2000.00"),
            outstanding_amount=Decimal("2000.00"),
        )
        txn = make_txn(seller=self.seller, seller_amount=Decimal("950.00"))

        with patch("payments.views.requests.post") as mock_post:
            trigger_vendor_payout(txn, "Test Listing")
            mock_post.assert_not_called()

        txn.refresh_from_db()
        self.assertEqual(txn.transfer_reference, f"DEBT-OFFSET-{txn.reference}")
        self.assertEqual(txn.transfer_status, "offset_by_debt")

        debt = VendorDebt.objects.get(vendor=self.seller)
        self.assertEqual(debt.outstanding_amount, Decimal("1050.00"))  # 2000 - 950
        self.assertEqual(debt.status, "outstanding")

    @override_settings(PAYSTACK_SECRET_KEY="sk_test_x")
    def test_debt_offset_transaction_excluded_from_future_retry_candidates(self):
        """
        Confirms the sentinel transfer_reference/status keep this transaction
        out of retry_failed_transfers' candidate filter (Q(transfer_status in
        failed/reversed) | Q(transfer_reference empty)).
        """
        from django.db.models import Q
        VendorDebt.objects.create(
            vendor=self.seller, original_amount=Decimal("2000.00"),
            outstanding_amount=Decimal("2000.00"),
        )
        txn = make_txn(seller=self.seller, seller_amount=Decimal("950.00"))
        with patch("payments.views.requests.post"):
            trigger_vendor_payout(txn, "Test Listing")

        candidates = PaymentTransaction.objects.filter(
            status="success", transfer_retry_count__lt=3,
        ).filter(
            Q(transfer_status="failed") | Q(transfer_status="reversed") |
            Q(transfer_reference="") | Q(transfer_reference__isnull=True)
        )
        self.assertNotIn(txn, list(candidates))


class RetryFailedTransfersDebtTests(TestCase):
    """scheduler.retry_failed_transfers — must not bypass debt collection."""

    def setUp(self):
        self.seller = User.objects.create_user(
            username="seller", email="seller@pau.edu.ng", password="pass12345",
        )
        SellerBankAccount.objects.create(
            user=self.seller, bank_code="058", bank_name="GTBank",
            account_number="0123456789", account_name="Seller",
            paystack_recipient_code="RCP_test123",
        )

    @override_settings(PAYSTACK_SECRET_KEY="sk_test_x")
    def test_retry_deducts_outstanding_debt_before_sending(self):
        from scheduler import retry_failed_transfers

        VendorDebt.objects.create(
            vendor=self.seller, original_amount=Decimal("300.00"),
            outstanding_amount=Decimal("300.00"),
        )
        txn = make_txn(
            seller=self.seller, seller_amount=Decimal("950.00"), transfer_reference="",
        )

        with patch("requests.post") as mock_post:
            mock_post.return_value = MagicMock(
                status_code=200,
                json=lambda: {"status": True, "data": {"reference": "PSTK-R1", "status": "success"}},
            )
            retry_failed_transfers()

            called_amount = mock_post.call_args.kwargs["json"]["amount"]
            self.assertEqual(called_amount, 65000)  # (950 - 300) naira in kobo

    @override_settings(PAYSTACK_SECRET_KEY="sk_test_x")
    def test_retry_fully_absorbed_by_debt_sends_no_transfer(self):
        from scheduler import retry_failed_transfers

        VendorDebt.objects.create(
            vendor=self.seller, original_amount=Decimal("5000.00"),
            outstanding_amount=Decimal("5000.00"),
        )
        txn = make_txn(
            seller=self.seller, seller_amount=Decimal("950.00"), transfer_reference="",
        )

        with patch("requests.post") as mock_post:
            retry_failed_transfers()
            mock_post.assert_not_called()

        txn.refresh_from_db()
        self.assertEqual(txn.transfer_status, "offset_by_debt")


class VendorDebtAdminTests(TestCase):
    def setUp(self):
        from payments.admin import VendorDebtAdmin
        self.admin = VendorDebtAdmin(VendorDebt, AdminSite())
        self.factory = RequestFactory()
        self.superuser = User.objects.create_superuser(
            username="admin", email="admin@pau.edu.ng", password="pass12345",
        )
        self.seller = User.objects.create_user(
            username="seller", email="seller@pau.edu.ng", password="pass12345",
        )

    def _request(self):
        req = self.factory.post("/admin/payments/vendordebt/")
        req.user = self.superuser
        from django.contrib.messages.storage.fallback import FallbackStorage
        setattr(req, "session", {})
        setattr(req, "_messages", FallbackStorage(req))
        return req

    def test_cannot_manually_add_a_debt_via_admin(self):
        self.assertFalse(self.admin.has_add_permission(self._request()))

    def test_write_off_zeroes_outstanding_and_marks_written_off(self):
        debt = VendorDebt.objects.create(
            vendor=self.seller, original_amount=Decimal("500.00"),
            outstanding_amount=Decimal("500.00"),
        )
        request = self._request()

        self.admin.write_off(request, VendorDebt.objects.filter(id=debt.id))

        debt.refresh_from_db()
        self.assertEqual(debt.status, "written_off")
        self.assertEqual(debt.outstanding_amount, Decimal("0"))
        self.assertIsNotNone(debt.settled_at)

    def test_write_off_does_not_touch_already_settled_debts(self):
        debt = VendorDebt.objects.create(
            vendor=self.seller, original_amount=Decimal("500.00"),
            outstanding_amount=Decimal("0"), status="settled",
        )
        request = self._request()

        self.admin.write_off(request, VendorDebt.objects.filter(id=debt.id))

        debt.refresh_from_db()
        self.assertEqual(debt.status, "settled")  # unchanged, not overwritten
