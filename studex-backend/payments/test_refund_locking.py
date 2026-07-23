# payments/test_refund_locking.py
"""
Test suite for Blocker 3 (Refund Locking) — see the Design Validation &
Risk Register. Covers: the refund_pending claim/release state machine in
refund_payment(), the refund.failed webhook auto-revert, and the
recover_stuck_refunds scheduler safety net.
"""
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch, MagicMock

from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from payments.models import PaymentTransaction, VendorDebt
from payments.views import refund_payment
from scheduler import recover_stuck_refunds

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


class RefundClaimStateMachineTests(TestCase):
    """The core refund_pending claim/release/finalize sequence."""

    def setUp(self):
        self.client = APIClient()
        self.buyer = User.objects.create_user(
            username="buyer", email="buyer@pau.edu.ng", password="pass12345",
        )
        self.seller = User.objects.create_user(
            username="seller", email="seller@pau.edu.ng", password="pass12345",
        )

    def test_successful_refund_ends_in_refunded_not_stuck_pending(self):
        txn = make_txn(buyer=self.buyer, seller=self.seller, buyer_email=self.buyer.email)
        self.client.force_authenticate(user=self.buyer)

        with patch("payments.views.requests.post") as mock_post:
            mock_post.return_value = MagicMock(status_code=200, json=lambda: {"status": True})
            response = self.client.post("/api/payments/refund/", {"reference": txn.reference})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        txn.refresh_from_db()
        self.assertEqual(txn.status, "refunded")

    def test_paystack_rejection_reverts_claim_to_success_not_stuck_pending(self):
        txn = make_txn(buyer=self.buyer, seller=self.seller, buyer_email=self.buyer.email)
        self.client.force_authenticate(user=self.buyer)

        with patch("payments.views.requests.post") as mock_post:
            mock_post.return_value = MagicMock(
                status_code=400, json=lambda: {"status": False, "message": "Charge not found"},
            )
            response = self.client.post("/api/payments/refund/", {"reference": txn.reference})

        self.assertEqual(response.status_code, 400)
        txn.refresh_from_db()
        self.assertEqual(txn.status, "success")  # released, not stuck at refund_pending

    def test_network_exception_reverts_claim_to_success(self):
        txn = make_txn(buyer=self.buyer, seller=self.seller, buyer_email=self.buyer.email)
        self.client.force_authenticate(user=self.buyer)

        with patch("payments.views.requests.post", side_effect=Exception("timeout")):
            response = self.client.post("/api/payments/refund/", {"reference": txn.reference})

        self.assertEqual(response.status_code, 400)
        txn.refresh_from_db()
        self.assertEqual(txn.status, "success")

    def test_second_request_while_first_is_pending_gets_409(self):
        """
        Simulates the race directly: manually put the row in refund_pending
        (as if another request's atomic block just committed the claim) and
        confirm a fresh request is rejected instead of re-attempting Paystack.
        """
        txn = make_txn(
            buyer=self.buyer, seller=self.seller, buyer_email=self.buyer.email,
            status="refund_pending",
        )
        self.client.force_authenticate(user=self.buyer)

        with patch("payments.views.requests.post") as mock_post:
            response = self.client.post("/api/payments/refund/", {"reference": txn.reference})
            mock_post.assert_not_called()

        self.assertEqual(response.status_code, 409)
        txn.refresh_from_db()
        self.assertEqual(txn.status, "refund_pending")  # untouched by the rejected request

    def test_already_refunded_is_rejected_before_any_claim(self):
        txn = make_txn(
            buyer=self.buyer, seller=self.seller, buyer_email=self.buyer.email,
            status="refunded",
        )
        self.client.force_authenticate(user=self.buyer)

        with patch("payments.views.requests.post") as mock_post:
            response = self.client.post("/api/payments/refund/", {"reference": txn.reference})
            mock_post.assert_not_called()

        self.assertEqual(response.status_code, 400)

    def test_pending_or_failed_transaction_cannot_be_refunded(self):
        txn = make_txn(
            buyer=self.buyer, seller=self.seller, buyer_email=self.buyer.email,
            status="pending",
        )
        self.client.force_authenticate(user=self.buyer)

        with patch("payments.views.requests.post") as mock_post:
            response = self.client.post("/api/payments/refund/", {"reference": txn.reference})
            mock_post.assert_not_called()

        self.assertEqual(response.status_code, 400)

    def test_only_one_vendor_debt_created_even_if_claim_race_is_attempted_sequentially(self):
        """
        Two sequential calls against the real view function (simulating what
        would be a race if truly concurrent — DB-level select_for_update
        serializes real concurrent threads onto this same sequence): the
        second call must see the claim/refunded state and never reach
        Paystack or create a second VendorDebt.
        """
        txn = make_txn(
            buyer=self.buyer, seller=self.seller, buyer_email=self.buyer.email,
            transfer_reference="PAYOUT-TXN-1",
        )
        staff = User.objects.create_user(
            username="staff", email="staff@pau.edu.ng", password="pass12345", is_staff=True,
        )
        self.client.force_authenticate(user=staff)

        with patch("payments.views.requests.post") as mock_post:
            mock_post.return_value = MagicMock(status_code=200, json=lambda: {"status": True})
            first = self.client.post("/api/payments/refund/", {"reference": txn.reference})
            second = self.client.post("/api/payments/refund/", {"reference": txn.reference})

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 400)  # "Already refunded"
        self.assertEqual(VendorDebt.objects.filter(source_transaction=txn).count(), 1)
        self.assertEqual(mock_post.call_count, 1)


class RefundFailedWebhookRevertTests(TestCase):
    def setUp(self):
        self.seller = User.objects.create_user(
            username="seller", email="seller@pau.edu.ng", password="pass12345",
        )
        self.client = APIClient()

    def _post_webhook(self, payload):
        import json
        import hmac
        import hashlib
        from django.conf import settings
        body = json.dumps(payload).encode("utf-8")
        secret = (getattr(settings, "PAYSTACK_WEBHOOK_SECRET", "") or "").strip()
        sig = hmac.new(secret.encode("utf-8"), body, hashlib.sha512).hexdigest()
        return self.client.post(
            "/api/payments/webhook/", data=body, content_type="application/json",
            HTTP_X_PAYSTACK_SIGNATURE=sig, REMOTE_ADDR="52.31.139.75",
        )

    @override_settings(PAYSTACK_WEBHOOK_SECRET="whsec_test", PAYSTACK_SKIP_IP_CHECK="true")
    def test_refund_failed_webhook_releases_stuck_refund_pending(self):
        txn = make_txn(seller=self.seller, status="refund_pending")

        response = self._post_webhook({
            "event": "refund.failed",
            "data": {"transaction": {"reference": txn.reference}},
        })

        self.assertEqual(response.status_code, 200)
        txn.refresh_from_db()
        self.assertEqual(txn.status, "success")

    @override_settings(PAYSTACK_WEBHOOK_SECRET="whsec_test", PAYSTACK_SKIP_IP_CHECK="true")
    def test_refund_failed_webhook_does_not_touch_non_pending_transaction(self):
        txn = make_txn(seller=self.seller, status="success")

        response = self._post_webhook({
            "event": "refund.failed",
            "data": {"transaction": {"reference": txn.reference}},
        })

        self.assertEqual(response.status_code, 200)
        txn.refresh_from_db()
        self.assertEqual(txn.status, "success")  # unchanged, not corrupted


class RecoverStuckRefundsJobTests(TestCase):
    def setUp(self):
        self.seller = User.objects.create_user(
            username="seller", email="seller@pau.edu.ng", password="pass12345",
        )

    def test_recovers_refund_stuck_past_grace_window(self):
        txn = make_txn(seller=self.seller, status="refund_pending")
        stale_time = timezone.now() - timedelta(minutes=15)
        PaymentTransaction.objects.filter(pk=txn.pk).update(updated_at=stale_time)

        recover_stuck_refunds()

        txn.refresh_from_db()
        self.assertEqual(txn.status, "success")

    def test_does_not_touch_recently_claimed_refund(self):
        txn = make_txn(seller=self.seller, status="refund_pending")
        # updated_at is auto_now — freshly created, well within the grace window

        recover_stuck_refunds()

        txn.refresh_from_db()
        self.assertEqual(txn.status, "refund_pending")

    def test_does_not_touch_transactions_in_other_statuses(self):
        success_txn = make_txn(seller=self.seller, status="success")
        stale_time = timezone.now() - timedelta(minutes=15)
        PaymentTransaction.objects.filter(pk=success_txn.pk).update(updated_at=stale_time)

        recover_stuck_refunds()

        success_txn.refresh_from_db()
        self.assertEqual(success_txn.status, "success")
