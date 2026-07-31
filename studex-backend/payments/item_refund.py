# payments/item_refund.py
"""
Partial refund for one unavailable OrderItem (Phase 1 — Food Commerce
Engine, Step 6). Reuses payments.contracts.refund_paystack_transaction
exactly — the same function full refunds already use, which already
accepts a partial amount (Blocker 8 only renamed it). No new refund
mechanism.

Refund amount is exactly OrderItem.line_total — nothing added or
re-derived. line_total is already fee-inclusive: each line's own fee was
computed once, on that line's own combined payout+add-ons, via
calculate_final_price (see payments.cart_checkout) and independently
floored/capped there. Adding a further proportional "share of the order's
total fee" on top — the reading TDS §19 suggests in isolation — would
double-count that line's own already-embedded fee (confirmed by example:
a single ₦3,000 item alone prices at ₦3,240; its line_total IS ₦3,240 —
refunding line_total plus a further 100%-attributed fee share would return
₦3,480, ₦240 more than the buyer ever paid). line_total alone is the
amount that returns the buyer to exactly even.

Claim-then-external-call-then-finalize discipline, mirroring
refund_payment()'s refund_pending claim exactly: (1) lock the OrderItem
and flip its status inside a fast atomic transaction — the claim, visible
to a concurrent call immediately; (2) call Paystack outside any lock;
(3) on failure, revert the claim; on success, adjust the PaymentTransaction
split (or create a VendorDebt if the vendor was already paid out) in a
second fast atomic transaction.
"""
from decimal import Decimal
from django.db import transaction as db_transaction

from orders.models import OrderItem
from payments.models import PaymentTransaction, VendorDebt


class ItemRefundError(Exception):
    """`.detail` is safe to show the caller directly."""
    def __init__(self, detail):
        self.detail = detail
        super().__init__(detail)


def mark_order_item_unavailable(order_item_id):
    """
    Marks one OrderItem unavailable and refunds exactly its line_total.
    Returns (refund_amount: Decimal, vendor_debt: VendorDebt | None) — the
    latter is set only in the rare case the vendor had already been paid
    out for this order before the item was marked unavailable (normally
    prevented by the caller rejecting a mark-unavailable request after
    pickup verification — see orders.views.OrderViewSet.mark_item_unavailable
    — this is a defensive race guard, not a normally-reachable path).

    Raises ItemRefundError (buyer-facing `.detail`) if the item was already
    unavailable, no successful PaymentTransaction exists for its order, or
    the Paystack refund call itself fails.

    For a bank-transfer order (PaymentTransaction.is_bank_transfer — the
    temporary manual-settlement path, see payments.models.
    BankTransferSettings) there is no real Paystack transaction to refund
    at all — calling refund_paystack_transaction against a reference
    Paystack has never seen just fails every time. That branch instead
    creates a ManualRefund record (the buyer submits their own bank details,
    an admin sends the money back and marks it settled) and never raises —
    marking the item unavailable succeeds immediately from the caller's
    perspective; the refund itself becomes an async, admin-driven step.
    """
    from payments.views import refund_paystack_transaction

    with db_transaction.atomic():
        try:
            item = OrderItem.objects.select_for_update().select_related('order', 'listing').get(id=order_item_id)
        except OrderItem.DoesNotExist:
            raise ItemRefundError("Item not found.")

        if item.status == 'unavailable':
            raise ItemRefundError("This item has already been marked unavailable.")

        order = item.order
        try:
            txn = PaymentTransaction.objects.select_for_update().get(reference=order.reference, status='success')
        except PaymentTransaction.DoesNotExist:
            raise ItemRefundError("No successful payment found for this order.")

        refund_amount = item.line_total
        order_total = order.amount or Decimal("1")
        item_share = refund_amount / order_total
        vendor_share = (txn.seller_amount * item_share).quantize(Decimal("0.01"))
        platform_share = refund_amount - vendor_share  # whatever's left — avoids a rounding gap
        already_paid_out = bool(txn.transfer_reference)
        is_bank_transfer = txn.is_bank_transfer

        # The claim — visible to a concurrent call on this same item
        # immediately, before the slow external call below.
        item.status = 'unavailable'
        item.save(update_fields=['status'])

    if is_bank_transfer:
        # Bookkeeping still adjusts down (same as the normal path below) so
        # whatever the vendor is manually paid out of pocket reflects this
        # item no longer being part of the order — just no Paystack call
        # and no VendorDebt (the vendor was never auto-paid via Transfer
        # API for a bank-transfer order in the first place).
        with db_transaction.atomic():
            txn = PaymentTransaction.objects.select_for_update().get(pk=txn.pk)
            txn.seller_amount = txn.seller_amount - vendor_share
            txn.platform_amount = txn.platform_amount - platform_share
            txn.save(update_fields=['seller_amount', 'platform_amount'])

        from payments.models import ManualRefund
        manual_refund = ManualRefund.objects.create(
            order=order, order_item=item, buyer=order.buyer, amount=refund_amount,
            reason=f'Item "{item.listing.title}" marked unavailable on order #{order.id}',
        )
        try:
            from accounts.utils import send_notification
            send_notification(
                recipient=order.buyer, notification_type='order_update',
                title='Item Unavailable — Refund Owed',
                message=(
                    f'"{item.listing.title}" from your order is unavailable. You are owed '
                    f'₦{refund_amount:,.2f} back. Since you paid by bank transfer, please submit your '
                    f'own bank account details so we can send your refund directly.'
                ),
                action_url=f'/account/refunds/{manual_refund.id}',
            )
        except Exception:
            pass
        try:
            from accounts.utils import send_notification
            from django.contrib.auth import get_user_model
            User = get_user_model()
            for admin in User.objects.filter(is_staff=True):
                send_notification(
                    recipient=admin, notification_type='admin_message',
                    title=f'Manual Refund Needed — ₦{refund_amount:,.2f}',
                    message=(
                        f'{order.buyer.username} is owed ₦{refund_amount:,.2f} for order #{order.id} '
                        f'(item marked unavailable, paid by bank transfer). Waiting on their bank details.'
                    ),
                    action_url='/studex-portal-9f3a2/payments/manualrefund/',
                    send_email=False,
                )
        except Exception:
            pass
        return refund_amount, None

    ok = refund_paystack_transaction(order.reference, int(refund_amount * 100))

    if not ok:
        # Release the claim — same "revert on failure" discipline as
        # refund_payment(). The item is fulfilled again as far as the
        # system knows; the caller can retry.
        OrderItem.objects.filter(id=order_item_id).update(status='fulfilled')
        raise ItemRefundError("Refund could not be processed. Please contact support.")

    vendor_debt = None
    with db_transaction.atomic():
        txn = PaymentTransaction.objects.select_for_update().get(pk=txn.pk)
        if already_paid_out:
            vendor_debt = VendorDebt.objects.create(
                vendor=txn.seller, source_transaction=txn,
                original_amount=vendor_share, outstanding_amount=vendor_share,
                reason=f"Item \"{item.listing.title}\" marked unavailable on order #{order.id} after vendor payout",
            )
        else:
            txn.seller_amount = txn.seller_amount - vendor_share
            txn.platform_amount = txn.platform_amount - platform_share
            txn.save(update_fields=['seller_amount', 'platform_amount'])

    return refund_amount, vendor_debt
