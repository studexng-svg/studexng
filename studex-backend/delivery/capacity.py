# delivery/capacity.py
"""
Delivery slot capacity (Phase 2 simplification — replaces the earlier
BatchTemplate + nightly-generated DeliveryBatch design). A DeliverySlot is
a standing recurring rule (vendor, delivery_time, cutoff_offset_minutes,
max_orders) that just keeps applying every day forever — there is no
generation job and no per-day row to create, reset, or go stale.

"Today's capacity" is never a denormalized counter — it's counted live
from real Order rows placed against the slot today. Cancelling an order
frees capacity automatically, since a cancelled order is excluded from the
count; there is nothing to explicitly "release" the way the old
DeliveryBatch.current_orders counter needed.

Race-safety: reserve_delivery_slot() locks the candidate DeliverySlot rows
(select_for_update) for the duration of the check, so two concurrent
checkouts against the same slot serialize instead of both slipping through
when only one spot remains — the second transaction blocks until the first
commits, then re-counts and sees the first's Order already there. Must be
called inside the same transaction.atomic() block that creates the Order.
"""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from django.utils import timezone

from delivery.models import DeliverySlot

LAGOS = ZoneInfo("Africa/Lagos")


class NoDeliverySlotCapacityError(Exception):
    """Raised when no eligible DeliverySlot has capacity for this vendor+campus right now. `.detail` is buyer-facing."""
    def __init__(self, detail):
        self.detail = detail
        super().__init__(detail)


def vendor_uses_batched_delivery(vendor):
    """
    Two-level gate: VendorType.supports_batched_delivery says a *category*
    of vendor (e.g. Food) is capable of using delivery slots at all; an
    active DeliverySlot says *this specific vendor* actually uses one.
    Without the second check, every vendor of a slot-capable type would be
    forced through slot-reservation checkout the moment they're onboarded,
    even if no admin ever set one up — checkout would fail for them
    permanently with "No delivery slots are currently available" instead
    of falling back to normal (non-slotted) checkout. An admin "sets" a
    vendor as needing slots simply by creating their first DeliverySlot —
    no separate toggle.
    """
    from payments.settlement import get_vendor_type
    vendor_type = get_vendor_type(vendor)
    if not (vendor_type and vendor_type.supports_batched_delivery):
        return False
    return DeliverySlot.objects.filter(vendor=vendor, is_active=True).exists()


def _cutoff_datetime(slot, day):
    delivery_dt = datetime.combine(day, slot.delivery_time, tzinfo=LAGOS)
    return delivery_dt - timedelta(minutes=slot.cutoff_offset_minutes)


def _orders_today_count(slot, day):
    """Real orders placed against this slot today (Lagos-local calendar day) — never cancelled ones."""
    from orders.models import Order
    day_start = datetime.combine(day, datetime.min.time(), tzinfo=LAGOS)
    day_end = day_start + timedelta(days=1)
    return (
        Order.objects.filter(delivery_slot=slot, created_at__gte=day_start, created_at__lt=day_end)
        .exclude(status='cancelled')
        .count()
    )


def _eligible_slots(vendor, campus, now_lagos, lock=False):
    """
    Every slot this vendor+campus could still take an order for right now:
    active, cutoff not yet passed today, room left today. Soonest-cutoff-
    first so auto-selection always picks the next slot a buyer could
    actually still make.
    """
    today = now_lagos.date()
    qs = DeliverySlot.objects.filter(vendor=vendor, campus=campus, is_active=True)
    if lock:
        qs = qs.select_for_update()
    eligible = []
    for slot in qs:
        if now_lagos >= _cutoff_datetime(slot, today):
            continue
        if _orders_today_count(slot, today) >= slot.max_orders:
            continue
        eligible.append(slot)
    eligible.sort(key=lambda s: _cutoff_datetime(s, today))
    return eligible


def has_eligible_slot(vendor, campus):
    """
    Read-only pre-flight check — no lock, nothing reserved. Lets checkout
    fail fast (before charging the buyer) when a slotted vendor has nothing
    open right now. Not itself race-safe — the real guarantee comes from
    reserve_delivery_slot's row lock.
    """
    now_lagos = timezone.now().astimezone(LAGOS)
    return len(_eligible_slots(vendor, campus, now_lagos, lock=False)) > 0


def list_eligible_slots(vendor, campus):
    """
    Read-only preview of every slot a buyer could currently order into,
    soonest-cutoff-first, with remaining capacity for today — lets
    checkout show "This order is part of the 12pm slot, 4 left" before the
    buyer pays, instead of finding out only after a failed/refunded payment.
    """
    now_lagos = timezone.now().astimezone(LAGOS)
    today = now_lagos.date()
    return [
        {'slot': slot, 'remaining': slot.max_orders - _orders_today_count(slot, today)}
        for slot in _eligible_slots(vendor, campus, now_lagos, lock=False)
    ]


def reserve_delivery_slot(vendor, campus, preferred_slot_id=None):
    """
    Picks the earliest eligible DeliverySlot for this vendor+campus right
    now, preferring preferred_slot_id if it's still eligible, falling back
    otherwise (covers both "no preference given" and "preferred one just
    filled up"). Returns the DeliverySlot to stamp onto the Order — there's
    no counter to increment; the Order itself, once created inside this
    same transaction, is what the next caller's count will include.

    Must be called inside the same transaction.atomic() block the caller
    uses to create the Order (see payments.cart_checkout) — the row lock
    only serializes concurrent reservations if the Order that "fills" the
    slot is committed (or rolled back) together with releasing this lock.

    Raises NoDeliverySlotCapacityError (buyer-facing detail) if nothing is eligible.
    """
    now_lagos = timezone.now().astimezone(LAGOS)
    eligible = _eligible_slots(vendor, campus, now_lagos, lock=True)
    if not eligible:
        raise NoDeliverySlotCapacityError(
            "No delivery slots are currently available for this vendor. Please try again later."
        )
    if preferred_slot_id:
        slot = next((s for s in eligible if s.id == int(preferred_slot_id)), eligible[0])
    else:
        slot = eligible[0]
    return slot
