# delivery/fees.py
"""
Per-vendor delivery fee, with an optional "first N deliveries free" promo
quota (both admin-set on accounts.models.Vendor). Only ever relevant for a
vendor using batched delivery (delivery.capacity.vendor_uses_batched_delivery)
— a non-batching vendor has no concept of a delivery fee regardless of these
fields' values, since there is no delivery slot for the fee to attach to.

Deliberately no denormalized "free deliveries used" counter on Vendor —
get_delivery_fee_quote counts live from real Order rows, the same convention
delivery.capacity uses for slot capacity ("Today's capacity is never a
denormalized counter — it's counted live from real Order rows"). A
cancelled/refunded early order doesn't permanently burn a promo slot, and
there's nothing to keep in sync on a manual data fix.
"""
from decimal import Decimal


def get_delivery_fee_quote(vendor):
    """
    Read-only preview of what a new order for this vendor would be charged
    for delivery right now. Returns (fee: Decimal, waived: bool) — waived is
    True only when the fee is ₦0 because the free-delivery quota is still
    open, distinct from a vendor simply having no fee configured at all.

    Not lock-safe by itself — mirrors delivery.capacity.has_eligible_slot's
    read-only pre-flight role, not delivery.capacity.reserve_delivery_slot's
    race-safe reservation. The actual charge is frozen into the pay_init
    cache at initialize_cart_payment time (same pattern already used for
    min_kobo/max_kobo there) and re-used as-is at verify time, so a rare
    race against a concurrent checkout for this same vendor can at worst
    grant one extra free delivery — it can never overcharge or double-charge
    a buyer who was already quoted a price.
    """
    from accounts.models import Vendor
    from delivery.capacity import vendor_uses_batched_delivery

    # Enforced here, not just left to callers to remember: a vendor with
    # delivery_fee set but no active DeliverySlot has no delivery to charge
    # for at all — checkout for them never goes through slot reservation.
    if not vendor_uses_batched_delivery(vendor):
        return Decimal("0"), False

    try:
        v = vendor.vendor
    except Vendor.DoesNotExist:
        return Decimal("0"), False

    fee = v.delivery_fee or Decimal("0")
    if fee <= 0:
        return Decimal("0"), False

    if v.free_delivery_quota is not None:
        from orders.models import Order
        used = Order.objects.filter(
            listing__vendor=vendor, delivery_slot__isnull=False,
        ).exclude(status='cancelled').count()
        if used < v.free_delivery_quota:
            return Decimal("0"), True

    return fee, False
