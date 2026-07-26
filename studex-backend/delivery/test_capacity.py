# delivery/test_capacity.py
"""
Test suite for delivery/capacity.py — the race-safe reservation/release
service for DeliveryBatch (Phase 1 — Food Commerce Engine, Step 4).

Concurrency is simulated sequentially — the same convention already
established in payments/test_refund_locking.py — since select_for_update()'s
row lock is what serializes real concurrent callers onto exactly this
sequence; a genuinely threaded test would need a locking-capable DB backend
the test suite doesn't run against (SQLite in-memory).
"""
from datetime import date, time, timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from accounts.models import User, Vendor, VendorType
from delivery.models import DeliveryBatch
from delivery.capacity import (
    reserve_capacity, release_capacity, has_eligible_batch, vendor_uses_batched_delivery,
    NoBatchCapacityError,
)


def make_batch(vendor, campus='pau', max_orders=5, current_orders=0, status='open',
                hours_until_cutoff=2, hours_until_delivery=3, display_name='Lunch Batch'):
    now = timezone.now()
    return DeliveryBatch.objects.create(
        vendor=vendor, campus=campus, batch_date=date.today(), display_name=display_name,
        delivery_time=now + timedelta(hours=hours_until_delivery),
        cutoff_time=now + timedelta(hours=hours_until_cutoff),
        max_orders=max_orders, current_orders=current_orders, status=status,
    )


class CapacityTestBase(TestCase):
    def setUp(self):
        self.food = VendorType.objects.get(name='food')
        self.beauty = VendorType.objects.get(name='beauty')
        self.vendor = User.objects.create_user(username='cap_vendor', email='cap_vendor@pau.edu.ng', password='pass123')
        Vendor.objects.create(user=self.vendor, vendor_type=self.food)
        self.other_vendor = User.objects.create_user(username='cap_vendor2', email='cap_vendor2@pau.edu.ng', password='pass123')
        Vendor.objects.create(user=self.other_vendor, vendor_type=self.food)
        self.non_batching_vendor = User.objects.create_user(username='cap_vendor3', email='cap_vendor3@pau.edu.ng', password='pass123')
        Vendor.objects.create(user=self.non_batching_vendor, vendor_type=self.beauty)


class VendorUsesBatchedDeliveryTests(CapacityTestBase):
    def test_food_vendor_type_alone_is_not_enough(self):
        """
        VendorType.supports_batched_delivery says Food *can* batch — it
        doesn't mean every Food vendor *does*. Without an active
        BatchTemplate, a vendor of a batching-capable type must behave
        exactly like a non-batching vendor (regular checkout, no forced
        batch reservation) rather than being permanently stuck with "No
        delivery slots are currently available."
        """
        self.assertFalse(vendor_uses_batched_delivery(self.vendor))

    def test_food_vendor_with_active_batch_template_uses_batching(self):
        """An admin 'sets' a vendor as needing batches by creating their first BatchTemplate."""
        from delivery.models import BatchTemplate
        BatchTemplate.objects.create(
            vendor=self.vendor, campus='pau', display_name='Lunch', delivery_time=time(12, 0),
            max_orders=10, days_of_week=[0, 1, 2, 3, 4], is_active=True,
        )
        self.assertTrue(vendor_uses_batched_delivery(self.vendor))

    def test_inactive_batch_template_does_not_count(self):
        from delivery.models import BatchTemplate
        BatchTemplate.objects.create(
            vendor=self.vendor, campus='pau', display_name='Lunch', delivery_time=time(12, 0),
            max_orders=10, days_of_week=[0, 1, 2, 3, 4], is_active=False,
        )
        self.assertFalse(vendor_uses_batched_delivery(self.vendor))

    def test_beauty_vendor_type_does_not_support_batching(self):
        self.assertFalse(vendor_uses_batched_delivery(self.non_batching_vendor))

    def test_vendor_with_no_vendor_row_returns_false(self):
        plain = User.objects.create_user(username='cap_plain', email='cap_plain@pau.edu.ng', password='pass123')
        self.assertFalse(vendor_uses_batched_delivery(plain))


class ReserveCapacityTests(CapacityTestBase):
    def test_reserves_and_increments_current_orders(self):
        batch = make_batch(self.vendor, max_orders=5, current_orders=0)
        reserved = reserve_capacity(self.vendor, 'pau')
        batch.refresh_from_db()
        self.assertEqual(reserved.id, batch.id)
        self.assertEqual(batch.current_orders, 1)
        self.assertEqual(batch.status, 'open')

    def test_flips_to_full_when_last_slot_taken(self):
        batch = make_batch(self.vendor, max_orders=1, current_orders=0)
        reserve_capacity(self.vendor, 'pau')
        batch.refresh_from_db()
        self.assertEqual(batch.current_orders, 1)
        self.assertEqual(batch.status, 'full')

    def test_no_eligible_batch_raises(self):
        with self.assertRaises(NoBatchCapacityError):
            reserve_capacity(self.vendor, 'pau')

    def test_full_batch_not_eligible(self):
        make_batch(self.vendor, max_orders=1, current_orders=1, status='full')
        with self.assertRaises(NoBatchCapacityError):
            reserve_capacity(self.vendor, 'pau')

    def test_past_cutoff_batch_not_eligible(self):
        make_batch(self.vendor, max_orders=5, current_orders=0, hours_until_cutoff=-1, hours_until_delivery=1)
        with self.assertRaises(NoBatchCapacityError):
            reserve_capacity(self.vendor, 'pau')

    def test_closed_or_suspended_batch_not_eligible(self):
        make_batch(self.vendor, max_orders=5, current_orders=0, status='closed')
        with self.assertRaises(NoBatchCapacityError):
            reserve_capacity(self.vendor, 'pau')

    def test_cross_vendor_isolation(self):
        make_batch(self.other_vendor, max_orders=5, current_orders=0)
        with self.assertRaises(NoBatchCapacityError):
            reserve_capacity(self.vendor, 'pau')

    def test_cross_campus_isolation(self):
        make_batch(self.vendor, campus='futo', max_orders=5, current_orders=0)
        with self.assertRaises(NoBatchCapacityError):
            reserve_capacity(self.vendor, 'pau')

    def test_preferred_batch_chosen_when_open_with_room(self):
        earlier = make_batch(self.vendor, max_orders=5, current_orders=0, hours_until_cutoff=1, display_name='Earlier')
        preferred = make_batch(self.vendor, max_orders=5, current_orders=0, hours_until_cutoff=3, display_name='Preferred')
        reserved = reserve_capacity(self.vendor, 'pau', preferred_batch_id=preferred.id)
        self.assertEqual(reserved.id, preferred.id)

    def test_falls_back_when_preferred_batch_is_full(self):
        full_preferred = make_batch(self.vendor, max_orders=1, current_orders=1, status='full', display_name='Full')
        fallback = make_batch(self.vendor, max_orders=5, current_orders=0, display_name='Fallback')
        reserved = reserve_capacity(self.vendor, 'pau', preferred_batch_id=full_preferred.id)
        self.assertEqual(reserved.id, fallback.id)

    def test_falls_back_when_preferred_batch_id_unknown(self):
        fallback = make_batch(self.vendor, max_orders=5, current_orders=0)
        reserved = reserve_capacity(self.vendor, 'pau', preferred_batch_id=999999)
        self.assertEqual(reserved.id, fallback.id)

    def test_no_preference_picks_earliest_cutoff(self):
        later = make_batch(self.vendor, max_orders=5, current_orders=0, hours_until_cutoff=5, display_name='Later')
        sooner = make_batch(self.vendor, max_orders=5, current_orders=0, hours_until_cutoff=1, display_name='Sooner')
        reserved = reserve_capacity(self.vendor, 'pau')
        self.assertEqual(reserved.id, sooner.id)

    def test_sequential_race_on_last_slot_second_call_fails(self):
        """
        Simulates the race directly (same convention as
        payments/test_refund_locking.py): two sequential calls against the
        real service for a batch with exactly one slot left — the second
        must see the already-exhausted state and raise, never double-book.
        """
        make_batch(self.vendor, max_orders=1, current_orders=0)
        first = reserve_capacity(self.vendor, 'pau')
        self.assertEqual(first.current_orders, 1)
        with self.assertRaises(NoBatchCapacityError):
            reserve_capacity(self.vendor, 'pau')


class HasEligibleBatchTests(CapacityTestBase):
    def test_true_when_open_batch_with_room_exists(self):
        make_batch(self.vendor, max_orders=5, current_orders=0)
        self.assertTrue(has_eligible_batch(self.vendor, 'pau'))

    def test_false_when_no_batches(self):
        self.assertFalse(has_eligible_batch(self.vendor, 'pau'))

    def test_false_when_only_full_batch_exists(self):
        make_batch(self.vendor, max_orders=1, current_orders=1, status='full')
        self.assertFalse(has_eligible_batch(self.vendor, 'pau'))


class ListEligibleBatchesTests(CapacityTestBase):
    """Read-only checkout preview — must never reserve anything."""
    def test_returns_soonest_cutoff_first(self):
        from delivery.capacity import list_eligible_batches
        later = make_batch(self.vendor, max_orders=5, current_orders=0, hours_until_cutoff=5, display_name='5pm')
        sooner = make_batch(self.vendor, max_orders=5, current_orders=0, hours_until_cutoff=1, display_name='12pm')
        result = list_eligible_batches(self.vendor, 'pau')
        self.assertEqual([b.id for b in result], [sooner.id, later.id])

    def test_excludes_full_batches(self):
        from delivery.capacity import list_eligible_batches
        make_batch(self.vendor, max_orders=1, current_orders=1, status='full')
        self.assertEqual(list_eligible_batches(self.vendor, 'pau'), [])

    def test_does_not_reserve_anything(self):
        from delivery.capacity import list_eligible_batches
        batch = make_batch(self.vendor, max_orders=5, current_orders=0)
        list_eligible_batches(self.vendor, 'pau')
        batch.refresh_from_db()
        self.assertEqual(batch.current_orders, 0)

    def test_does_not_consume_capacity(self):
        batch = make_batch(self.vendor, max_orders=5, current_orders=0)
        has_eligible_batch(self.vendor, 'pau')
        batch.refresh_from_db()
        self.assertEqual(batch.current_orders, 0)


class ReleaseCapacityTests(CapacityTestBase):
    def _order_with_batch(self, batch):
        from services.models import Category, Listing
        from orders.models import Order
        category = Category.objects.create(title='FoodRel', slug=f'food-rel-{batch.id}')
        listing = Listing.objects.create(
            title='Jollof Rice', description='x', price=Decimal('1500'),
            vendor=self.vendor, category=category, is_available=True,
        )
        buyer = User.objects.create_user(username=f'rel_buyer_{batch.id}', email=f'rel_buyer_{batch.id}@pau.edu.ng', password='pass123')
        return Order.objects.create(
            buyer=buyer, listing=listing, amount=Decimal('1500'), reference=f'STX-REL-{batch.id}',
            status='paid', delivery_batch=batch,
        )

    def test_reopens_capacity_before_cutoff(self):
        batch = make_batch(self.vendor, max_orders=5, current_orders=3, hours_until_cutoff=2)
        order = self._order_with_batch(batch)
        release_capacity(order)
        batch.refresh_from_db()
        self.assertEqual(batch.current_orders, 2)

    def test_flips_full_back_to_open_when_room_reopens(self):
        batch = make_batch(self.vendor, max_orders=3, current_orders=3, status='full', hours_until_cutoff=2)
        order = self._order_with_batch(batch)
        release_capacity(order)
        batch.refresh_from_db()
        self.assertEqual(batch.current_orders, 2)
        self.assertEqual(batch.status, 'open')

    def test_no_op_after_cutoff(self):
        batch = make_batch(self.vendor, max_orders=5, current_orders=3, hours_until_cutoff=-1, hours_until_delivery=1)
        order = self._order_with_batch(batch)
        release_capacity(order)
        batch.refresh_from_db()
        self.assertEqual(batch.current_orders, 3)

    def test_no_op_when_order_has_no_batch(self):
        from services.models import Category, Listing
        from orders.models import Order
        category = Category.objects.create(title='FoodNoBatch', slug='food-no-batch')
        listing = Listing.objects.create(
            title='Plain Item', description='x', price=Decimal('1000'),
            vendor=self.non_batching_vendor, category=category, is_available=True,
        )
        buyer = User.objects.create_user(username='rel_buyer_none', email='rel_buyer_none@pau.edu.ng', password='pass123')
        order = Order.objects.create(
            buyer=buyer, listing=listing, amount=Decimal('1000'), reference='STX-REL-NONE', status='paid',
        )
        release_capacity(order)  # must not raise
        self.assertIsNone(order.delivery_batch_id)

    def test_never_goes_negative(self):
        batch = make_batch(self.vendor, max_orders=5, current_orders=0, hours_until_cutoff=2)
        order = self._order_with_batch(batch)
        release_capacity(order)
        batch.refresh_from_db()
        self.assertEqual(batch.current_orders, 0)
