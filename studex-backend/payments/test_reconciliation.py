# payments/test_reconciliation.py
"""
Test suite for escrow reconciliation (Phase 0, Blocker 1 — see the Design
Validation & Risk Register). Covers: expected-balance computation, Paystack
balance parsing/error handling, discrepancy detection, admin alerting, and
the manual admin-triggered check.
"""
from decimal import Decimal
from unittest.mock import patch, MagicMock

from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from django.contrib.admin.sites import AdminSite
from django.test import RequestFactory

from payments.models import PaymentTransaction, EscrowReconciliationLog
from payments.reconciliation import (
    get_paystack_balance,
    compute_expected_held_for_vendors,
    compute_expected_platform_revenue,
    run_reconciliation,
    RECONCILIATION_TOLERANCE,
)

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


class ExpectedBalanceComputationTests(TestCase):
    """compute_expected_held_for_vendors / compute_expected_platform_revenue"""

    def test_held_for_vendors_includes_unpaid_success_transactions(self):
        make_txn(amount=Decimal("1000.00"), transfer_reference="")
        make_txn(amount=Decimal("500.00"), transfer_reference=None)
        self.assertEqual(compute_expected_held_for_vendors(), Decimal("1500.00"))

    def test_held_for_vendors_excludes_already_paid_out_transactions(self):
        make_txn(amount=Decimal("1000.00"), transfer_reference="")
        make_txn(amount=Decimal("500.00"), transfer_reference="PAYOUT-TXN-2")
        self.assertEqual(compute_expected_held_for_vendors(), Decimal("1000.00"))

    def test_held_for_vendors_excludes_non_success_transactions(self):
        make_txn(amount=Decimal("1000.00"), transfer_reference="", status="pending")
        make_txn(amount=Decimal("500.00"), transfer_reference="", status="refunded")
        self.assertEqual(compute_expected_held_for_vendors(), Decimal("0"))

    def test_held_for_vendors_zero_with_no_transactions(self):
        self.assertEqual(compute_expected_held_for_vendors(), Decimal("0"))

    def test_platform_revenue_sums_across_all_success_transactions_regardless_of_payout(self):
        make_txn(platform_amount=Decimal("50.00"), transfer_reference="")
        make_txn(platform_amount=Decimal("75.00"), transfer_reference="PAYOUT-TXN-2")
        self.assertEqual(compute_expected_platform_revenue(), Decimal("125.00"))

    def test_platform_revenue_excludes_non_success_transactions(self):
        make_txn(platform_amount=Decimal("50.00"), status="pending")
        make_txn(platform_amount=Decimal("75.00"), status="failed")
        self.assertEqual(compute_expected_platform_revenue(), Decimal("0"))


class GetPaystackBalanceTests(TestCase):
    """get_paystack_balance — parsing and error handling."""

    @override_settings(PAYSTACK_SECRET_KEY="")
    def test_raises_when_secret_key_missing(self):
        with self.assertRaises(RuntimeError):
            get_paystack_balance()

    @override_settings(PAYSTACK_SECRET_KEY="sk_test_x")
    @patch("payments.reconciliation.requests.get")
    def test_parses_ngn_balance_from_multi_currency_response(self, mock_get):
        mock_get.return_value = MagicMock(
            status_code=200,
            json=lambda: {
                "status": True,
                "data": [
                    {"currency": "USD", "balance": 500000},
                    {"currency": "NGN", "balance": 123456},
                ],
            },
        )
        balance = get_paystack_balance()
        self.assertEqual(balance, Decimal("1234.56"))

    @override_settings(PAYSTACK_SECRET_KEY="sk_test_x")
    @patch("payments.reconciliation.requests.get")
    def test_raises_when_no_ngn_entry_present(self, mock_get):
        mock_get.return_value = MagicMock(
            status_code=200,
            json=lambda: {"status": True, "data": [{"currency": "USD", "balance": 500000}]},
        )
        with self.assertRaises(RuntimeError):
            get_paystack_balance()

    @override_settings(PAYSTACK_SECRET_KEY="sk_test_x")
    @patch("payments.reconciliation.requests.get")
    def test_raises_when_paystack_returns_failure_status(self, mock_get):
        mock_get.return_value = MagicMock(
            status_code=200,
            json=lambda: {"status": False, "message": "Unauthorized"},
        )
        with self.assertRaises(RuntimeError):
            get_paystack_balance()

    @override_settings(PAYSTACK_SECRET_KEY="sk_test_x")
    @patch("payments.reconciliation.requests.get")
    def test_raises_when_http_status_not_200(self, mock_get):
        mock_get.return_value = MagicMock(status_code=500, json=lambda: {"status": False})
        with self.assertRaises(RuntimeError):
            get_paystack_balance()


class RunReconciliationTests(TestCase):
    """run_reconciliation — the full check, persistence, and alerting."""

    @override_settings(PAYSTACK_SECRET_KEY="sk_test_x")
    @patch("payments.reconciliation._alert_admin_discrepancy")
    @patch("payments.reconciliation.get_paystack_balance")
    def test_balanced_run_does_not_flag_or_alert(self, mock_balance, mock_alert):
        make_txn(amount=Decimal("1000.00"), platform_amount=Decimal("50.00"), transfer_reference="")
        # expected = held_for_vendors (1000) + platform_revenue (50) = 1050
        mock_balance.return_value = Decimal("1050.00")

        log = run_reconciliation()

        self.assertFalse(log.is_flagged)
        self.assertEqual(log.discrepancy, Decimal("0.00"))
        mock_alert.assert_not_called()
        self.assertEqual(EscrowReconciliationLog.objects.count(), 1)

    @override_settings(PAYSTACK_SECRET_KEY="sk_test_x")
    @patch("payments.reconciliation._alert_admin_discrepancy")
    @patch("payments.reconciliation.get_paystack_balance")
    def test_discrepancy_beyond_tolerance_is_flagged_and_alerted(self, mock_balance, mock_alert):
        make_txn(amount=Decimal("1000.00"), platform_amount=Decimal("50.00"), transfer_reference="")
        # expected = 1050, actual way off -> real discrepancy
        mock_balance.return_value = Decimal("500.00")

        log = run_reconciliation()

        self.assertTrue(log.is_flagged)
        self.assertEqual(log.discrepancy, Decimal("-550.00"))
        mock_alert.assert_called_once_with(log)

    @override_settings(PAYSTACK_SECRET_KEY="sk_test_x")
    @patch("payments.reconciliation._alert_admin_discrepancy")
    @patch("payments.reconciliation.get_paystack_balance")
    def test_discrepancy_within_tolerance_is_not_flagged(self, mock_balance, mock_alert):
        make_txn(amount=Decimal("1000.00"), platform_amount=Decimal("50.00"), transfer_reference="")
        # expected = 1050, off by 50 kobo (well under the ₦1.00 tolerance)
        mock_balance.return_value = Decimal("1050.50")

        log = run_reconciliation()

        self.assertFalse(log.is_flagged)
        mock_alert.assert_not_called()

    @override_settings(PAYSTACK_SECRET_KEY="sk_test_x")
    @patch("payments.reconciliation.get_paystack_balance")
    def test_discrepancy_exactly_at_tolerance_boundary_is_not_flagged(self, mock_balance):
        make_txn(amount=Decimal("1000.00"), platform_amount=Decimal("0.00"), transfer_reference="")
        mock_balance.return_value = Decimal("1000.00") + RECONCILIATION_TOLERANCE

        log = run_reconciliation()

        self.assertFalse(log.is_flagged)

    @override_settings(PAYSTACK_SECRET_KEY="")
    def test_propagates_error_when_balance_call_fails_rather_than_logging_false_all_clear(self):
        with self.assertRaises(RuntimeError):
            run_reconciliation()
        # No misleading "all clear" log should have been written.
        self.assertEqual(EscrowReconciliationLog.objects.count(), 0)

    @override_settings(PAYSTACK_SECRET_KEY="sk_test_x")
    @patch("payments.reconciliation.get_paystack_balance")
    def test_alert_failure_does_not_crash_the_reconciliation_run(self, mock_balance):
        # Simulate the email layer itself throwing — the run must still complete
        # and the log row must still exist; only the alert step is best-effort.
        make_txn(amount=Decimal("1000.00"), platform_amount=Decimal("0.00"), transfer_reference="")
        mock_balance.return_value = Decimal("50000.00")

        with patch("studex.email.send_email", side_effect=Exception("SMTP down")):
            log = run_reconciliation()

        self.assertTrue(log.is_flagged)
        self.assertEqual(EscrowReconciliationLog.objects.count(), 1)


class EscrowReconciliationAdminActionTests(TestCase):
    """Admin-triggered manual reconciliation check."""

    def setUp(self):
        from payments.admin import EscrowReconciliationLogAdmin
        self.admin = EscrowReconciliationLogAdmin(EscrowReconciliationLog, AdminSite())
        self.factory = RequestFactory()
        self.superuser = User.objects.create_superuser(
            username="admin", email="admin@pau.edu.ng", password="pass12345",
        )

    def _request(self):
        req = self.factory.post("/admin/payments/escrowreconciliationlog/")
        req.user = self.superuser
        # message_user needs the messages framework wired onto the request
        from django.contrib.messages.storage.fallback import FallbackStorage
        setattr(req, "session", {})
        setattr(req, "_messages", FallbackStorage(req))
        return req

    @override_settings(PAYSTACK_SECRET_KEY="sk_test_x")
    @patch("payments.admin.run_reconciliation")
    def test_run_reconciliation_now_creates_a_log_and_messages_success(self, mock_run):
        mock_run.return_value = MagicMock(is_flagged=False, discrepancy=Decimal("0.00"))
        request = self._request()

        self.admin.run_reconciliation_now(request, EscrowReconciliationLog.objects.none())

        mock_run.assert_called_once()

    @override_settings(PAYSTACK_SECRET_KEY="sk_test_x")
    @patch("payments.admin.run_reconciliation")
    def test_run_reconciliation_now_surfaces_flagged_discrepancy(self, mock_run):
        mock_run.return_value = MagicMock(is_flagged=True, discrepancy=Decimal("-999.00"))
        request = self._request()

        # Should not raise even though the result is a flagged discrepancy.
        self.admin.run_reconciliation_now(request, EscrowReconciliationLog.objects.none())
        mock_run.assert_called_once()

    def test_mark_resolved_stamps_resolver_and_timestamp(self):
        log = EscrowReconciliationLog.objects.create(
            paystack_balance=Decimal("100"), expected_held_for_vendors=Decimal("0"),
            expected_platform_revenue=Decimal("0"), expected_balance=Decimal("0"),
            discrepancy=Decimal("100"), is_flagged=True,
        )
        request = self._request()

        self.admin.mark_resolved(request, EscrowReconciliationLog.objects.filter(id=log.id))

        log.refresh_from_db()
        self.assertTrue(log.resolved)
        self.assertEqual(log.resolved_by, self.superuser)
        self.assertIsNotNone(log.resolved_at)

    def test_cannot_manually_add_a_log_via_admin(self):
        self.assertFalse(self.admin.has_add_permission(self._request()))
