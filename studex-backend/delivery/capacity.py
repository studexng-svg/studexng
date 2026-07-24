# delivery/capacity.py
"""
Delivery batch capacity reservation (Phase 1 — Food Commerce Engine, Step 4).
The one service checkout, cancellation, and any future caller reserve/release
DeliveryBatch capacity through — nothing else in the codebase touches
DeliveryBatch.current_orders/status directly. Same lock discipline already
proven in payments.settle_vendor_debt and refund_payment()'s claim step:
transaction.atomic() + select_for_update(), external calls (none here —
this module makes none) only ever happen after commit.

Batching is a vendor capability (accounts.VendorType.supports_batched_delivery),
never a hardcoded vendor-type check — see vendor_uses_batched_delivery. A
vendor without it never has a DeliveryBatch to reserve, so every function
here is a guaranteed no-op for them, preserving today's behavior exactly.
"""
from django.db import transaction as db_transaction
from django.db.models import F
from django.utils import timezone

from delivery.models import DeliveryBatch


class NoBatchCapacityError(Exception):
    """Raised when no eligible DeliveryBatch has capacity for this vendor+campus right now. `.detail` is buyer-facing."""
    def __init__(self, detail):
        self.detail = detail
        super().__init__(detail)


def vendor_uses_batched_delivery(vendor):
    from payments.settlement import get_vendor_type
    vendor_type = get_vendor_type(vendor)
    return bool(vendor_type and vendor_type.supports_batched_delivery)


def _eligible_batches_locked(vendor, campus, now):
    """
    Row-locked queryset of every batch this vendor+campus could still take
    an order for: open, cutoff not yet passed, room left. Ordered soonest-
    cutoff-first so auto-selection always picks the next batch a buyer could
    actually still make, not an arbitrary one further out.
    """
    return (
        DeliveryBatch.objects.select_for_update()
        .filter(vendor=vendor, campus=campus, status='open', cutoff_time__gt=now, current_orders__lt=F('max_orders'))
        .order_by('cutoff_time', 'delivery_time', 'id')
    )


def has_eligible_batch(vendor, campus):
    """
    Read-only pre-flight check — no lock, no reservation. Lets checkout fail
    fast (before charging the buyer) when a batching vendor has nothing open
    right now, the same way price_vendor_cart already fails fast on
    availability. Not itself race-safe (nothing is reserved by calling this)
    — the real guarantee comes from reserve_capacity's row lock.
    """
    now = timezone.now()
    return DeliveryBatch.objects.filter(
        vendor=vendor, campus=campus, status='open', cutoff_time__gt=now, current_orders__lt=F('max_orders'),
    ).exists()


def reserve_capacity(vendor, campus, preferred_batch_id=None):
    """
    Reserves one unit of capacity on the earliest eligible DeliveryBatch for
    this vendor+campus, preferring `preferred_batch_id` if it's still open
    and has room — automatically falling back to the next eligible batch
    otherwise (covers both "no preference given" and "preferred one just
    became unavailable"). Returns the reserved DeliveryBatch.

    Must be called inside the same transaction.atomic() block the caller
    uses to create the Order (see payments.cart_checkout), so a failure
    anywhere else in checkout rolls the reservation back with it. Race-safe:
    select_for_update() locks the candidate rows, so two concurrent
    reservations for the last slot on one batch can never both succeed —
    the second re-evaluates the WHERE clause after acquiring the lock and
    sees the row as the first one left it.

    Raises NoBatchCapacityError (buyer-facing detail) if nothing is eligible.
    """
    now = timezone.now()
    candidates = list(_eligible_batches_locked(vendor, campus, now))
    if not candidates:
        raise NoBatchCapacityError(
            "No delivery slots are currently available for this vendor. Please try again later."
        )

    batch = None
    if preferred_batch_id:
        batch = next((b for b in candidates if b.id == int(preferred_batch_id)), None)
    if batch is None:
        batch = candidates[0]

    batch.current_orders += 1
    if batch.current_orders >= batch.max_orders:
        batch.status = 'full'
    batch.save(update_fields=['current_orders', 'status', 'updated_at'])
    return batch


def release_capacity(order):
    """
    Reopens one unit of capacity on order.delivery_batch — but only for an
    "eligible" cancellation: one happening strictly before the batch's
    cutoff_time. After cutoff, the vendor has already committed to prepping
    for the batch's committed order count, so a late cancellation does not
    free a slot for someone else. No-op if the order never reserved batch
    capacity (delivery_batch is None — every non-batching-vendor order, and
    every order type that predates this phase).

    Idempotency note: the one call site (orders.views.OrderViewSet.
    update_status) already guarantees an order can only transition to
    'cancelled' once — its own guard rejects a second cancel attempt before
    this is ever reached — so no additional dedup is needed here.
    """
    if not order.delivery_batch_id:
        return

    now = timezone.now()
    with db_transaction.atomic():
        try:
            batch = DeliveryBatch.objects.select_for_update().get(pk=order.delivery_batch_id)
        except DeliveryBatch.DoesNotExist:
            return
        if now >= batch.cutoff_time:
            return  # too late — the slot stays committed

        batch.current_orders = max(0, batch.current_orders - 1)
        if batch.status == 'full' and batch.current_orders < batch.max_orders:
            batch.status = 'open'
        batch.save(update_fields=['current_orders', 'status', 'updated_at'])
