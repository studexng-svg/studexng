# payments/reconciliation.py
"""
Escrow reconciliation — verifies that Paystack's actual account balance
agrees with what StudEx's own records say should be sitting there.

Nothing in the payment/payout flow previously checked this. A missed
webhook, a bug in the transfer/refund path, or a manual Paystack-dashboard
action could silently desync the two with no alarm — this module closes
that gap. See EscrowReconciliationLog (payments/models.py) for the known
assumption this makes about platform-revenue withdrawals.
"""
import logging
from decimal import Decimal

import requests
from django.conf import settings
from django.db.models import Sum, Q

from payments.models import PaymentTransaction, EscrowReconciliationLog

logger = logging.getLogger(__name__)

PAYSTACK_BASE = "https://api.paystack.co"

# Below this, a gap is treated as benign rounding, not a real discrepancy.
RECONCILIATION_TOLERANCE = Decimal("1.00")


def get_paystack_balance() -> Decimal:
    """
    Calls Paystack's Balance API and returns the NGN balance in naira.
    Raises on any failure — a reconciliation run must never treat an API
    error as a balance of ₦0, which would falsely flag every subsequent run.
    """
    secret_key = (getattr(settings, "PAYSTACK_SECRET_KEY", "") or "").strip()
    if not secret_key:
        raise RuntimeError("get_paystack_balance: PAYSTACK_SECRET_KEY not configured")

    headers = {"Authorization": f"Bearer {secret_key}"}
    res = requests.get(f"{PAYSTACK_BASE}/balance", headers=headers, timeout=15)
    res_json = res.json()

    if res.status_code != 200 or not res_json.get("status"):
        raise RuntimeError(f"get_paystack_balance: Paystack returned {res.status_code}: {res_json}")

    for entry in res_json.get("data", []):
        if entry.get("currency") == "NGN":
            return Decimal(str(entry["balance"])) / Decimal("100")

    raise RuntimeError("get_paystack_balance: no NGN balance entry in Paystack response")


def compute_expected_held_for_vendors() -> Decimal:
    """Buyer money collected (status='success') but not yet paid out to a vendor."""
    total = PaymentTransaction.objects.filter(status="success").filter(
        Q(transfer_reference__isnull=True) | Q(transfer_reference="")
    ).aggregate(total=Sum("amount"))["total"]
    return total or Decimal("0")


def compute_expected_platform_revenue() -> Decimal:
    """
    Accumulated platform fee revenue across every successful transaction ever,
    assuming none of it has been separately withdrawn from the Paystack
    balance to a company bank account. See EscrowReconciliationLog's
    docstring — this assumption is the honest limit of what's trackable
    without a dedicated withdrawal ledger, which doesn't exist today.
    """
    total = PaymentTransaction.objects.filter(status="success").aggregate(
        total=Sum("platform_amount")
    )["total"]
    return total or Decimal("0")


def run_reconciliation() -> EscrowReconciliationLog:
    """
    Runs one reconciliation check, persists the result, and alerts the admin
    if the discrepancy exceeds RECONCILIATION_TOLERANCE. Only raises if the
    Paystack balance call itself fails — a check that can't get real data
    must not silently log a false "all clear."
    """
    actual_balance = get_paystack_balance()
    held_for_vendors = compute_expected_held_for_vendors()
    platform_revenue = compute_expected_platform_revenue()
    expected_balance = held_for_vendors + platform_revenue
    discrepancy = actual_balance - expected_balance
    is_flagged = abs(discrepancy) > RECONCILIATION_TOLERANCE

    log = EscrowReconciliationLog.objects.create(
        paystack_balance=actual_balance,
        expected_held_for_vendors=held_for_vendors,
        expected_platform_revenue=platform_revenue,
        expected_balance=expected_balance,
        discrepancy=discrepancy,
        is_flagged=is_flagged,
    )

    if is_flagged:
        logger.error(
            f"run_reconciliation: DISCREPANCY of ₦{discrepancy} detected "
            f"(actual=₦{actual_balance}, expected=₦{expected_balance})"
        )
        _alert_admin_discrepancy(log)
    else:
        logger.info(f"run_reconciliation: balanced (discrepancy ₦{discrepancy}, within tolerance)")

    return log


def _alert_admin_discrepancy(log: EscrowReconciliationLog):
    try:
        from studex.email import send_email

        admin_email = getattr(settings, "ADMIN_EMAIL", "studex.ng@gmail.com")
        html = f'''
            <div style="font-family:DM Sans,sans-serif;max-width:560px;margin:0 auto;padding:32px;">
                <h2 style="color:#DC2626;">Escrow Reconciliation Discrepancy</h2>
                <p>The platform's Paystack balance does not match internal records by more
                   than the ₦{RECONCILIATION_TOLERANCE} tolerance.</p>
                <table style="border-collapse:collapse;width:100%;margin-top:16px;">
                    <tr><td style="padding:8px;border:1px solid #E5E7EB;font-weight:600;">Actual Paystack Balance</td><td style="padding:8px;border:1px solid #E5E7EB;">₦{log.paystack_balance:,.2f}</td></tr>
                    <tr><td style="padding:8px;border:1px solid #E5E7EB;font-weight:600;">Expected (held for vendors)</td><td style="padding:8px;border:1px solid #E5E7EB;">₦{log.expected_held_for_vendors:,.2f}</td></tr>
                    <tr><td style="padding:8px;border:1px solid #E5E7EB;font-weight:600;">Expected (platform revenue)</td><td style="padding:8px;border:1px solid #E5E7EB;">₦{log.expected_platform_revenue:,.2f}</td></tr>
                    <tr><td style="padding:8px;border:1px solid #E5E7EB;font-weight:600;">Expected Total</td><td style="padding:8px;border:1px solid #E5E7EB;">₦{log.expected_balance:,.2f}</td></tr>
                    <tr><td style="padding:8px;border:1px solid #E5E7EB;font-weight:600;">Discrepancy</td><td style="padding:8px;border:1px solid #E5E7EB;color:#DC2626;font-weight:bold;">₦{log.discrepancy:,.2f}</td></tr>
                </table>
                <p style="margin-top:24px;color:#6B7280;font-size:14px;">
                    If this is a known manual withdrawal, mark this reconciliation log resolved in
                    Django admin with a note explaining why. Otherwise, investigate immediately.
                </p>
            </div>
        '''
        send_email(
            to=admin_email,
            subject=f"[ACTION REQUIRED] Escrow reconciliation discrepancy: ₦{log.discrepancy:,.2f}",
            html=html,
            _async=False,
        )
        logger.info(f"Admin reconciliation-discrepancy alert sent for log {log.id}")
    except Exception as e:
        logger.error(f"Failed to send admin reconciliation-discrepancy email: {e}")
