# payments/test_payout_audit.py
"""
Test suite for the permanent PayoutAuditRecord (Blocker 4 revision — Rider
Verification Evidence / Responsibility Transfer). Covers: audit record
creation on every payout resolution path (success, debt-offset, failure,
exception) in both trigger_vendor_payout and scheduler.retry_failed_transfers,
correct linkage to rider/pickup-verification data when a DeliveryAssignment
exists, and idempotency (one row per transaction, never duplicated).
"""
from decimal import Decimal
from unittest.mock import patch, MagicMock

from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from django.utils import timezone

from services.models import Category, Listing
from orders.models import Order
from delivery.models import CampusPickupPoint, DeliveryAssignment
from payments.models import PaymentTransaction, SellerBankAccount, PayoutAuditRecord, VendorDebt
from payments.views import trigger_vendor_payout, record_payout_audit

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


class PayoutAuditRecordBase(TestCase):
    def setUp(self):
        self.seller = User.objects.create_user(
            username="seller", email="seller@pau.edu.ng", password="pass12345",
        )
        SellerBankAccount.objects.create(
            user=self.seller, bank_code="058", bank_name="GTBank",
            account_number="0123456789", account_name="Seller",
            paystack_recipient_code="RCP_test123",
        )


class TriggerVendorPayoutSkipsBankTransferTests(PayoutAuditRecordBase):
    """
    Regression: RiderUpdateStatusView's pickup-triggered settlement (and
    every other trigger_vendor_payout call site — admin order-complete,
    dispute resolution, the admin "retry transfer" action, buyer
    confirmation, the hourly retry scheduler) called trigger_vendor_payout
    with no awareness that the underlying order might have been paid via
    the manual bank-transfer path, not Paystack. A bank-transfer
    transaction's transfer_reference is always blank (no automated
    transfer was ever attempted), which made it look exactly like a normal
    unpaid vendor — so a real Paystack Transfer fired for it, paying the
    vendor a second time (once by the admin manually, once from Paystack
    balance actually contributed by some other buyer). The guard lives
    inside trigger_vendor_payout itself so every call site is protected at
    once, not just the ones that remember to check.
    """
    @override_settings(PAYSTACK_SECRET_KEY="sk_test_x")
    def test_no_paystack_call_for_bank_transfer_transaction(self):
        txn = make_txn(seller=self.seller, seller_amount=Decimal("950.00"), is_bank_transfer=True)
        with patch("payments.views.requests.post") as mock_post:
            trigger_vendor_payout(txn, "Test Listing")
            mock_post.assert_not_called()

    @override_settings(PAYSTACK_SECRET_KEY="sk_test_x")
    def test_transfer_reference_stays_blank_for_bank_transfer_transaction(self):
        txn = make_txn(seller=self.seller, seller_amount=Decimal("950.00"), is_bank_transfer=True)
        with patch("payments.views.requests.post") as mock_post:
            trigger_vendor_payout(txn, "Test Listing")
        txn.refresh_from_db()
        self.assertFalse(txn.transfer_reference)  # untouched — model default (None), never set to a real Paystack ref
        self.assertNotEqual(txn.transfer_status, "success")

    @override_settings(PAYSTACK_SECRET_KEY="sk_test_x")
    def test_no_payout_audit_record_created_for_bank_transfer_transaction(self):
        from payments.models import PayoutAuditRecord
        txn = make_txn(seller=self.seller, seller_amount=Decimal("950.00"), is_bank_transfer=True)
        with patch("payments.views.requests.post") as mock_post:
            trigger_vendor_payout(txn, "Test Listing")
        self.assertFalse(PayoutAuditRecord.objects.filter(transaction=txn).exists())

    @override_settings(PAYSTACK_SECRET_KEY="sk_test_x")
    def test_normal_paystack_transaction_still_pays_out_as_before(self):
        """Sanity check the guard doesn't accidentally swallow the normal path."""
        txn = make_txn(seller=self.seller, seller_amount=Decimal("950.00"), is_bank_transfer=False)
        with patch("payments.views.requests.post") as mock_post:
            mock_post.return_value = MagicMock(
                status_code=200,
                json=lambda: {"status": True, "data": {"reference": "PSTK-REF", "status": "success"}},
            )
            trigger_vendor_payout(txn, "Test Listing")
            mock_post.assert_called_once()
        txn.refresh_from_db()
        self.assertEqual(txn.transfer_reference, "PSTK-REF")


class TransferToVendorAuditTests(PayoutAuditRecordBase):
    @override_settings(PAYSTACK_SECRET_KEY="sk_test_x")
    def test_audit_record_created_on_successful_transfer(self):
        txn = make_txn(seller=self.seller, seller_amount=Decimal("950.00"))
        with patch("payments.views.requests.post") as mock_post:
            mock_post.return_value = MagicMock(
                status_code=200,
                json=lambda: {"status": True, "data": {"reference": "PSTK-REF", "status": "success"}},
            )
            trigger_vendor_payout(txn, "Test Listing")

        audit = PayoutAuditRecord.objects.get(transaction=txn)
        self.assertEqual(audit.vendor, self.seller)
        self.assertEqual(audit.amount_released, Decimal("950.00"))
        self.assertEqual(audit.transfer_reference, "PSTK-REF")
        self.assertEqual(audit.transfer_status, "success")
        self.assertEqual(audit.order_id, txn.order_id)
        self.assertIsNone(audit.rider)
        self.assertIsNone(audit.delivery_assignment)

    @override_settings(PAYSTACK_SECRET_KEY="sk_test_x")
    def test_audit_record_links_rider_and_pickup_evidence(self):
        rider = User.objects.create_user(
            username="rider", email="rider@pau.edu.ng", password="pass12345", user_type="rider",
        )
        category = Category.objects.create(title="Cat", slug="cat")
        listing = Listing.objects.create(
            title="Product", description="Desc", price=Decimal("1000.00"),
            vendor=self.seller, category=category,
        )
        buyer = User.objects.create_user(username="buyer", email="buyer@pau.edu.ng", password="pass12345")
        order = Order.objects.create(
            reference="ORD-1", buyer=buyer, listing=listing, amount=Decimal("1000.00"), status="paid",
        )
        point = CampusPickupPoint.objects.create(name="Gate", campus="pau")
        pickup_time = timezone.now()
        assignment = DeliveryAssignment.objects.create(
            order=order, rider=rider, pickup_point=point, status="picked_up",
            picked_up_at=pickup_time, pickup_proof_image="https://cdn.example.com/pickup.jpg",
        )
        txn = make_txn(seller=self.seller, seller_amount=Decimal("950.00"), order_id=order.id)

        with patch("payments.views.requests.post") as mock_post:
            mock_post.return_value = MagicMock(
                status_code=200,
                json=lambda: {"status": True, "data": {"reference": "PSTK-REF2", "status": "success"}},
            )
            trigger_vendor_payout(txn, "Product")

        audit = PayoutAuditRecord.objects.get(transaction=txn)
        self.assertEqual(audit.rider, rider)
        self.assertEqual(audit.delivery_assignment, assignment)
        self.assertEqual(audit.pickup_verified_at, pickup_time)
        self.assertEqual(audit.pickup_evidence_image, "https://cdn.example.com/pickup.jpg")

    @override_settings(PAYSTACK_SECRET_KEY="sk_test_x")
    def test_audit_record_created_on_debt_offset(self):
        VendorDebt.objects.create(
            vendor=self.seller, original_amount=Decimal("2000.00"), outstanding_amount=Decimal("2000.00"),
        )
        txn = make_txn(seller=self.seller, seller_amount=Decimal("950.00"))
        with patch("payments.views.requests.post") as mock_post:
            trigger_vendor_payout(txn, "Test Listing")
            mock_post.assert_not_called()

        audit = PayoutAuditRecord.objects.get(transaction=txn)
        self.assertEqual(audit.amount_released, Decimal("0"))
        self.assertEqual(audit.transfer_status, "offset_by_debt")
        self.assertEqual(audit.transfer_reference, f"DEBT-OFFSET-{txn.reference}")

    @override_settings(PAYSTACK_SECRET_KEY="sk_test_x")
    def test_audit_record_created_on_failed_transfer(self):
        txn = make_txn(seller=self.seller, seller_amount=Decimal("950.00"))
        with patch("payments.views.requests.post") as mock_post:
            mock_post.return_value = MagicMock(
                status_code=400, json=lambda: {"status": False, "message": "Insufficient balance"},
            )
            trigger_vendor_payout(txn, "Test Listing")

        audit = PayoutAuditRecord.objects.get(transaction=txn)
        self.assertEqual(audit.amount_released, Decimal("0"))
        self.assertEqual(audit.transfer_status, "failed")

    @override_settings(PAYSTACK_SECRET_KEY="sk_test_x")
    def test_txn_transfer_status_marked_failed_on_rejected_transfer(self):
        """
        Regression: a Paystack 400 rejection (e.g. the ₦50 minimum-transfer
        validation error) used to only update PayoutAuditRecord, leaving
        PaymentTransaction.transfer_status blank — indistinguishable from
        "payout never attempted" in the admin list_display/list_filter.
        """
        txn = make_txn(seller=self.seller, seller_amount=Decimal("30.00"))
        with patch("payments.views.requests.post") as mock_post:
            mock_post.return_value = MagicMock(
                status_code=400,
                json=lambda: {"status": False, "message": "The minimum amount you may send in a single transfer at this time is: 50.00 NGN."},
            )
            trigger_vendor_payout(txn, "Test Listing")

        txn.refresh_from_db()
        self.assertEqual(txn.transfer_status, "failed")

    @override_settings(PAYSTACK_SECRET_KEY="sk_test_x")
    def test_audit_record_created_on_transfer_exception(self):
        txn = make_txn(seller=self.seller, seller_amount=Decimal("950.00"))
        with patch("payments.views.requests.post", side_effect=Exception("timeout")):
            trigger_vendor_payout(txn, "Test Listing")

        audit = PayoutAuditRecord.objects.get(transaction=txn)
        self.assertEqual(audit.transfer_status, "failed")
        self.assertEqual(audit.amount_released, Decimal("0"))

    @override_settings(PAYSTACK_SECRET_KEY="sk_test_x")
    def test_txn_transfer_status_marked_failed_on_transfer_exception(self):
        txn = make_txn(seller=self.seller, seller_amount=Decimal("950.00"))
        with patch("payments.views.requests.post", side_effect=Exception("timeout")):
            trigger_vendor_payout(txn, "Test Listing")

        txn.refresh_from_db()
        self.assertEqual(txn.transfer_status, "failed")

    def test_audit_recording_never_raises_even_if_lookup_fails(self):
        """record_payout_audit must never blow up the payout flow itself."""
        txn = make_txn(seller=self.seller)
        with patch("payments.models.PayoutAuditRecord.objects.update_or_create", side_effect=Exception("db down")):
            try:
                record_payout_audit(txn, Decimal("950.00"))
            except Exception:
                self.fail("record_payout_audit must swallow its own errors")


class PayoutAuditIdempotencyTests(PayoutAuditRecordBase):
    def test_one_row_per_transaction_even_across_repeated_calls(self):
        txn = make_txn(seller=self.seller, transfer_reference="PAYOUT-1", transfer_status="pending")
        record_payout_audit(txn, Decimal("950.00"))
        self.assertEqual(PayoutAuditRecord.objects.filter(transaction=txn).count(), 1)

        txn.transfer_status = "success"
        txn.save(update_fields=["transfer_status"])
        record_payout_audit(txn, Decimal("950.00"))

        self.assertEqual(PayoutAuditRecord.objects.filter(transaction=txn).count(), 1)
        audit = PayoutAuditRecord.objects.get(transaction=txn)
        self.assertEqual(audit.transfer_status, "success")

    def test_permanent_record_survives_even_though_transaction_is_protected(self):
        """
        transaction is on_delete=PROTECT specifically so a permanent payout
        audit row can never be silently orphaned by a transaction deletion.
        """
        txn = make_txn(seller=self.seller)
        record_payout_audit(txn, Decimal("950.00"))
        from django.db.models.deletion import ProtectedError
        with self.assertRaises(ProtectedError):
            txn.delete()


class RetryFailedTransfersAuditTests(PayoutAuditRecordBase):
    @override_settings(PAYSTACK_SECRET_KEY="sk_test_x")
    def test_retry_success_records_audit(self):
        from scheduler import retry_failed_transfers
        txn = make_txn(seller=self.seller, seller_amount=Decimal("950.00"), transfer_reference="")
        with patch("requests.post") as mock_post:
            mock_post.return_value = MagicMock(
                status_code=200,
                json=lambda: {"status": True, "data": {"reference": "PSTK-R1", "status": "success"}},
            )
            retry_failed_transfers()

        audit = PayoutAuditRecord.objects.get(transaction=txn)
        self.assertEqual(audit.transfer_status, "success")
        self.assertEqual(audit.amount_released, Decimal("950.00"))

    @override_settings(PAYSTACK_SECRET_KEY="sk_test_x")
    def test_retry_failure_records_audit(self):
        from scheduler import retry_failed_transfers
        txn = make_txn(seller=self.seller, seller_amount=Decimal("950.00"), transfer_reference="")
        with patch("requests.post") as mock_post:
            mock_post.return_value = MagicMock(
                status_code=400, json=lambda: {"status": False, "message": "error"},
            )
            retry_failed_transfers()

        audit = PayoutAuditRecord.objects.get(transaction=txn)
        self.assertEqual(audit.transfer_status, "failed")
        self.assertEqual(audit.amount_released, Decimal("0"))

    @override_settings(PAYSTACK_SECRET_KEY="sk_test_x")
    def test_retry_debt_offset_records_audit(self):
        from scheduler import retry_failed_transfers
        VendorDebt.objects.create(
            vendor=self.seller, original_amount=Decimal("2000.00"), outstanding_amount=Decimal("2000.00"),
        )
        txn = make_txn(seller=self.seller, seller_amount=Decimal("950.00"), transfer_reference="")
        with patch("requests.post") as mock_post:
            retry_failed_transfers()
            mock_post.assert_not_called()

        audit = PayoutAuditRecord.objects.get(transaction=txn)
        self.assertEqual(audit.transfer_status, "offset_by_debt")
        self.assertEqual(audit.amount_released, Decimal("0"))
