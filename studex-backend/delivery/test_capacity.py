# delivery/test_capacity.py
"""
Test suite for delivery/capacity.py — the DeliverySlot live-counted
capacity service (Phase 2 simplification, replaces the earlier
BatchTemplate + nightly-generated DeliveryBatch pair).

Concurrency is simulated sequentially — the same convention already
established in payments/test_refund_locking.py — since select_for_update()'s
row lock is what serializes real concurrent callers onto exactly this
sequence; a genuinely threaded test would need a locking-capable DB backend
the test suite doesn't run against (SQLite in-memory).

There is no counter to release on cancellation any more — "today's count"
is always computed live from real (non-cancelled) Order rows, so a
cancelled order simply drops out of the count with no explicit release step.
"""
from datetime import datetime, timedelta
from decimal import Decimal
from unittest import mock

from django.test import TestCase
from django.utils import timezone

from accounts.models import User, Vendor, VendorType
from delivery.models import DeliverySlot
from delivery.capacity import (
    reserve_delivery_slot, has_eligible_slot, list_eligible_slots,
    vendor_uses_batched_delivery, NoDeliverySlotCapacityError, LAGOS,
)

# Fixed at noon Lagos — delivery_time is built as "now + N minutes then take
# just the time-of-day", which silently wraps to the wrong side of midnight
# whenever the real wall-clock is late enough that the offset crosses into
# tomorrow (e.g. a test run at 11pm adding 3 hours lands on 2am *today*,
# which reads as already-past-cutoff). Freezing timezone.now() removes any
# dependency on what time it actually is when the suite runs.
FROZEN_NOW = datetime(2026, 6, 15, 12, 0, 0, tzinfo=LAGOS)


def make_slot(vendor, campus='pau', max_orders=5, minutes_until_delivery=180,
              cutoff_offset_minutes=15, is_active=True, display_name='Lunch Slot'):
    """delivery_time/cutoff_offset_minutes are wall-clock-today concepts (no date on the model)."""
    delivery_time = (FROZEN_NOW + timedelta(minutes=minutes_until_delivery)).time()
    return DeliverySlot.objects.create(
        vendor=vendor, campus=campus, display_name=display_name, delivery_time=delivery_time,
        cutoff_offset_minutes=cutoff_offset_minutes, max_orders=max_orders, is_active=is_active,
    )


class CapacityTestBase(TestCase):
    def setUp(self):
        self._time_patcher = mock.patch('django.utils.timezone.now', return_value=FROZEN_NOW)
        self._time_patcher.start()
        self.addCleanup(self._time_patcher.stop)
        self.food = VendorType.objects.get(name='food')
        self.beauty = VendorType.objects.get(name='beauty')
        self.vendor = User.objects.create_user(username='cap_vendor', email='cap_vendor@pau.edu.ng', password='pass123')
        Vendor.objects.create(user=self.vendor, vendor_type=self.food)
        self.other_vendor = User.objects.create_user(username='cap_vendor2', email='cap_vendor2@pau.edu.ng', password='pass123')
        Vendor.objects.create(user=self.other_vendor, vendor_type=self.food)
        self.non_batching_vendor = User.objects.create_user(username='cap_vendor3', email='cap_vendor3@pau.edu.ng', password='pass123')
        Vendor.objects.create(user=self.non_batching_vendor, vendor_type=self.beauty)

    def _place_order(self, slot, status='paid'):
        from services.models import Category, Listing
        from orders.models import Order
        n = Order.objects.count()
        category = Category.objects.create(title=f'FoodCap{n}', slug=f'food-cap-{slot.id}-{n}')
        listing = Listing.objects.create(
            title='Jollof Rice', description='x', price=Decimal('1500'),
            vendor=slot.vendor, category=category, is_available=True,
        )
        buyer = User.objects.create_user(username=f'cap_buyer_{slot.id}_{n}', email=f'cap_buyer_{slot.id}_{n}@pau.edu.ng', password='pass123')
        return Order.objects.create(
            buyer=buyer, listing=listing, amount=Decimal('1500'), reference=f'STX-CAP-{slot.id}-{n}',
            status=status, delivery_slot=slot,
        )


class VendorUsesBatchedDeliveryTests(CapacityTestBase):
    def test_food_vendor_type_alone_is_not_enough(self):
        """
        VendorType.supports_batched_delivery says Food *can* use slots — it
        doesn't mean every Food vendor *does*. Without an active
        DeliverySlot, a vendor of a slot-capable type must behave exactly
        like a non-batching vendor (regular checkout, no forced slot
        reservation) rather than being permanently stuck with "No delivery
        slots are currently available."
        """
        self.assertFalse(vendor_uses_batched_delivery(self.vendor))

    def test_food_vendor_with_active_slot_uses_batching(self):
        """An admin 'sets' a vendor as needing slots by creating their first DeliverySlot."""
        make_slot(self.vendor)
        self.assertTrue(vendor_uses_batched_delivery(self.vendor))

    def test_inactive_slot_does_not_count(self):
        make_slot(self.vendor, is_active=False)
        self.assertFalse(vendor_uses_batched_delivery(self.vendor))

    def test_beauty_vendor_type_does_not_support_batching(self):
        self.assertFalse(vendor_uses_batched_delivery(self.non_batching_vendor))

    def test_vendor_with_no_vendor_row_returns_false(self):
        plain = User.objects.create_user(username='cap_plain', email='cap_plain@pau.edu.ng', password='pass123')
        self.assertFalse(vendor_uses_batched_delivery(plain))


class ReserveDeliverySlotTests(CapacityTestBase):
    def test_reserves_slot_with_room(self):
        slot = make_slot(self.vendor, max_orders=5)
        reserved = reserve_delivery_slot(self.vendor, 'pau')
        self.assertEqual(reserved.id, slot.id)

    def test_no_slot_at_all_raises(self):
        with self.assertRaises(NoDeliverySlotCapacityError):
            reserve_delivery_slot(self.vendor, 'pau')

    def test_full_slot_not_eligible(self):
        slot = make_slot(self.vendor, max_orders=1)
        self._place_order(slot)
        with self.assertRaises(NoDeliverySlotCapacityError):
            reserve_delivery_slot(self.vendor, 'pau')

    def test_cancelled_orders_dont_count_against_capacity(self):
        """Live-counting means a cancelled order frees the slot automatically — no explicit release needed."""
        slot = make_slot(self.vendor, max_orders=1)
        self._place_order(slot, status='cancelled')
        reserved = reserve_delivery_slot(self.vendor, 'pau')
        self.assertEqual(reserved.id, slot.id)

    def test_past_cutoff_slot_not_eligible(self):
        # Delivery time 5 min from now, cutoff 15 min before delivery -> cutoff already passed.
        slot = make_slot(self.vendor, minutes_until_delivery=5, cutoff_offset_minutes=15)
        with self.assertRaises(NoDeliverySlotCapacityError):
            reserve_delivery_slot(self.vendor, 'pau')

    def test_inactive_slot_not_eligible(self):
        make_slot(self.vendor, max_orders=5, is_active=False)
        with self.assertRaises(NoDeliverySlotCapacityError):
            reserve_delivery_slot(self.vendor, 'pau')

    def test_cross_vendor_isolation(self):
        make_slot(self.other_vendor, max_orders=5)
        with self.assertRaises(NoDeliverySlotCapacityError):
            reserve_delivery_slot(self.vendor, 'pau')

    def test_cross_campus_isolation(self):
        make_slot(self.vendor, campus='futo', max_orders=5)
        with self.assertRaises(NoDeliverySlotCapacityError):
            reserve_delivery_slot(self.vendor, 'pau')

    def test_preferred_slot_chosen_when_eligible(self):
        earlier = make_slot(self.vendor, max_orders=5, minutes_until_delivery=60, display_name='Earlier')
        preferred = make_slot(self.vendor, max_orders=5, minutes_until_delivery=180, display_name='Preferred')
        reserved = reserve_delivery_slot(self.vendor, 'pau', preferred_slot_id=preferred.id)
        self.assertEqual(reserved.id, preferred.id)

    def test_falls_back_when_preferred_slot_is_full(self):
        full_preferred = make_slot(self.vendor, max_orders=1, display_name='Full')
        self._place_order(full_preferred)
        fallback = make_slot(self.vendor, max_orders=5, display_name='Fallback')
        reserved = reserve_delivery_slot(self.vendor, 'pau', preferred_slot_id=full_preferred.id)
        self.assertEqual(reserved.id, fallback.id)

    def test_falls_back_when_preferred_slot_id_unknown(self):
        fallback = make_slot(self.vendor, max_orders=5)
        reserved = reserve_delivery_slot(self.vendor, 'pau', preferred_slot_id=999999)
        self.assertEqual(reserved.id, fallback.id)

    def test_no_preference_picks_earliest_cutoff(self):
        later = make_slot(self.vendor, max_orders=5, minutes_until_delivery=300, display_name='Later')
        sooner = make_slot(self.vendor, max_orders=5, minutes_until_delivery=60, display_name='Sooner')
        reserved = reserve_delivery_slot(self.vendor, 'pau')
        self.assertEqual(reserved.id, sooner.id)

    def test_sequential_race_on_last_slot_second_call_fails(self):
        """
        Simulates the race directly (same convention as
        payments/test_refund_locking.py): two sequential calls against the
        real service for a slot with exactly one spot left today — the
        second must see the already-exhausted count and raise, never
        double-book.
        """
        slot = make_slot(self.vendor, max_orders=1)
        first = reserve_delivery_slot(self.vendor, 'pau')
        self.assertEqual(first.id, slot.id)
        self._place_order(slot)  # simulates the first call's order having committed
        with self.assertRaises(NoDeliverySlotCapacityError):
            reserve_delivery_slot(self.vendor, 'pau')


class HasEligibleSlotTests(CapacityTestBase):
    def test_true_when_open_slot_with_room_exists(self):
        make_slot(self.vendor, max_orders=5)
        self.assertTrue(has_eligible_slot(self.vendor, 'pau'))

    def test_false_when_no_slots(self):
        self.assertFalse(has_eligible_slot(self.vendor, 'pau'))

    def test_false_when_only_full_slot_exists(self):
        slot = make_slot(self.vendor, max_orders=1)
        self._place_order(slot)
        self.assertFalse(has_eligible_slot(self.vendor, 'pau'))

    def test_does_not_consume_capacity(self):
        slot = make_slot(self.vendor, max_orders=5)
        has_eligible_slot(self.vendor, 'pau')
        from delivery.capacity import _orders_today_count
        self.assertEqual(_orders_today_count(slot, timezone.now().astimezone(LAGOS).date()), 0)


class ListEligibleSlotsTests(CapacityTestBase):
    """Read-only checkout preview — must never reserve anything."""
    def test_returns_soonest_cutoff_first_with_remaining_count(self):
        later = make_slot(self.vendor, max_orders=5, minutes_until_delivery=300, display_name='5pm')
        sooner = make_slot(self.vendor, max_orders=5, minutes_until_delivery=60, display_name='12pm')
        result = list_eligible_slots(self.vendor, 'pau')
        self.assertEqual([entry['slot'].id for entry in result], [sooner.id, later.id])
        self.assertEqual(result[0]['remaining'], 5)

    def test_excludes_full_slots(self):
        slot = make_slot(self.vendor, max_orders=1)
        self._place_order(slot)
        self.assertEqual(list_eligible_slots(self.vendor, 'pau'), [])

    def test_remaining_reflects_existing_orders(self):
        slot = make_slot(self.vendor, max_orders=5)
        self._place_order(slot)
        self._place_order(slot)
        result = list_eligible_slots(self.vendor, 'pau')
        self.assertEqual(result[0]['remaining'], 3)

    def test_does_not_reserve_anything(self):
        slot = make_slot(self.vendor, max_orders=5)
        list_eligible_slots(self.vendor, 'pau')
        from delivery.capacity import _orders_today_count
        self.assertEqual(_orders_today_count(slot, timezone.now().astimezone(LAGOS).date()), 0)
