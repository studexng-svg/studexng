# delivery/test_vendor_eligible_batches_view.py
"""
Test suite for GET /api/delivery/vendor-batches/<vendor_id>/ — the
buyer-facing checkout preview of which delivery slot (Phase 2
simplification — was DeliveryBatch) and how many spots are left an order
will land in, before paying. Must never reserve anything (read-only), and
must clearly distinguish "this vendor doesn't use slots at all" from "uses
slots but nothing is open right now" so the frontend doesn't show a
misleading empty state for every non-slotted vendor's checkout.
"""
from datetime import datetime, timedelta
from decimal import Decimal
from unittest import mock

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User, Vendor, VendorType
from delivery.models import DeliverySlot
from delivery.capacity import LAGOS

# Fixed at noon Lagos — see delivery/test_capacity.py for why this needs to
# be frozen rather than derived from the real "now" the suite happens to run at.
FROZEN_NOW = datetime(2026, 6, 15, 12, 0, 0, tzinfo=LAGOS)


class VendorEligibleBatchesViewTests(TestCase):
    def setUp(self):
        self._time_patcher = mock.patch('django.utils.timezone.now', return_value=FROZEN_NOW)
        self._time_patcher.start()
        self.addCleanup(self._time_patcher.stop)
        self.client = APIClient()
        self.buyer = User.objects.create_user(username='veb_buyer', email='veb_buyer@pau.edu.ng', password='pass123')
        self.client.force_authenticate(user=self.buyer)

        self.food = VendorType.objects.get(name='food')
        self.beauty = VendorType.objects.get(name='beauty')

        self.batching_vendor = User.objects.create_user(
            username='veb_batch_vendor', email='veb_batch_vendor@pau.edu.ng', password='pass123', school='pau',
        )
        Vendor.objects.create(user=self.batching_vendor, vendor_type=self.food)
        # max_orders=0: signals "this vendor uses slotted delivery" (what
        # vendor_uses_batched_delivery checks) without itself being a real
        # reservable slot — tests that want an actual open slot create their
        # own via _make_slot, so this baseline row never competes with it.
        DeliverySlot.objects.create(
            vendor=self.batching_vendor, campus='pau', display_name='Lunch',
            delivery_time=(FROZEN_NOW + timedelta(hours=3)).time(),
            max_orders=0,
        )

        self.non_opted_in_vendor = User.objects.create_user(
            username='veb_food_no_slot', email='veb_food_no_slot@pau.edu.ng', password='pass123', school='pau',
        )
        Vendor.objects.create(user=self.non_opted_in_vendor, vendor_type=self.food)

        self.beauty_vendor = User.objects.create_user(
            username='veb_beauty_vendor', email='veb_beauty_vendor@pau.edu.ng', password='pass123', school='pau',
        )
        Vendor.objects.create(user=self.beauty_vendor, vendor_type=self.beauty)

    def _make_slot(self, vendor, max_orders=5, minutes_until_delivery=180, display_name='Lunch'):
        delivery_time = (FROZEN_NOW + timedelta(minutes=minutes_until_delivery)).time()
        return DeliverySlot.objects.create(
            vendor=vendor, campus='pau', display_name=display_name, delivery_time=delivery_time, max_orders=max_orders,
        )

    def _place_order(self, slot, status='paid'):
        from services.models import Category, Listing
        from orders.models import Order
        n = Order.objects.count()
        category = Category.objects.create(title=f'VebCat{n}', slug=f'veb-cat-{slot.id}-{n}')
        listing = Listing.objects.create(
            title='Jollof Rice', description='x', price=Decimal('1500'),
            vendor=slot.vendor, category=category, is_available=True,
        )
        buyer = User.objects.create_user(username=f'veb_o_buyer_{slot.id}_{n}', email=f'veb_o_buyer_{slot.id}_{n}@pau.edu.ng', password='pass123')
        return Order.objects.create(
            buyer=buyer, listing=listing, amount=Decimal('1500'), reference=f'STX-VEB-{slot.id}-{n}',
            status=status, delivery_slot=slot,
        )

    def test_batching_vendor_with_open_slots_returns_them_with_remaining_count(self):
        slot = self._make_slot(self.batching_vendor, max_orders=10, display_name='Lunch')
        self._place_order(slot)
        self._place_order(slot)
        self._place_order(slot)
        response = self.client.get(f'/api/delivery/vendor-batches/{self.batching_vendor.id}/')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['uses_batched_delivery'])
        self.assertEqual(len(response.data['batches']), 1)
        self.assertEqual(response.data['batches'][0]['display_name'], 'Lunch')
        self.assertEqual(response.data['batches'][0]['remaining_slots'], 7)
        # delivery_time = FROZEN_NOW (noon) + 180min = 15:00; cutoff = 15
        # min before that (DeliverySlot's default cutoff_offset_minutes) = 14:45.
        self.assertEqual(response.data['batches'][0]['cutoff_time'], '2026-06-15T14:45:00+01:00')

    def test_free_deliveries_remaining_is_none_with_no_quota_set(self):
        response = self.client.get(f'/api/delivery/vendor-batches/{self.batching_vendor.id}/')
        self.assertIsNone(response.data['free_deliveries_remaining'])

    def test_free_deliveries_remaining_counts_down_as_slot_orders_land(self):
        vendor_record = Vendor.objects.get(user=self.batching_vendor)
        vendor_record.delivery_fee = Decimal('300.00')
        vendor_record.free_delivery_quota = 15
        vendor_record.save(update_fields=['delivery_fee', 'free_delivery_quota'])

        slot = self._make_slot(self.batching_vendor, max_orders=100)
        self._place_order(slot)
        self._place_order(slot)
        self._place_order(slot, status='cancelled')  # doesn't burn a promo slot

        response = self.client.get(f'/api/delivery/vendor-batches/{self.batching_vendor.id}/')
        self.assertEqual(response.data['free_deliveries_remaining'], 13)
        self.assertTrue(response.data['delivery_fee_waived'])
        self.assertEqual(response.data['delivery_fee'], 0.0)

    def test_free_deliveries_remaining_is_zero_not_none_once_exhausted(self):
        vendor_record = Vendor.objects.get(user=self.batching_vendor)
        vendor_record.delivery_fee = Decimal('300.00')
        vendor_record.free_delivery_quota = 2
        vendor_record.save(update_fields=['delivery_fee', 'free_delivery_quota'])

        slot = self._make_slot(self.batching_vendor, max_orders=100)
        self._place_order(slot)
        self._place_order(slot)

        response = self.client.get(f'/api/delivery/vendor-batches/{self.batching_vendor.id}/')
        self.assertEqual(response.data['free_deliveries_remaining'], 0)
        self.assertFalse(response.data['delivery_fee_waived'])
        self.assertEqual(response.data['delivery_fee'], 300.0)

    def test_non_batching_vendor_type_returns_uses_batched_delivery_false(self):
        response = self.client.get(f'/api/delivery/vendor-batches/{self.beauty_vendor.id}/')
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['uses_batched_delivery'])
        self.assertEqual(response.data['batches'], [])

    def test_food_vendor_without_delivery_slot_returns_uses_batched_delivery_false(self):
        """Distinguishes 'doesn't use slots' from 'uses them but nothing open' — no misleading empty warning."""
        response = self.client.get(f'/api/delivery/vendor-batches/{self.non_opted_in_vendor.id}/')
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['uses_batched_delivery'])
        self.assertEqual(response.data['batches'], [])

    def test_batching_vendor_with_no_open_slots_returns_empty_list_but_true_flag(self):
        response = self.client.get(f'/api/delivery/vendor-batches/{self.batching_vendor.id}/')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['uses_batched_delivery'])
        self.assertEqual(response.data['batches'], [])

    def test_full_slot_excluded(self):
        slot = self._make_slot(self.batching_vendor, max_orders=1)
        self._place_order(slot)
        response = self.client.get(f'/api/delivery/vendor-batches/{self.batching_vendor.id}/')
        self.assertEqual(response.data['batches'], [])

    def test_does_not_reserve_anything(self):
        slot = self._make_slot(self.batching_vendor, max_orders=5)
        self.client.get(f'/api/delivery/vendor-batches/{self.batching_vendor.id}/')
        from delivery.capacity import _orders_today_count
        self.assertEqual(_orders_today_count(slot, timezone.now().astimezone(LAGOS).date()), 0)

    def test_unknown_vendor_returns_404(self):
        response = self.client.get('/api/delivery/vendor-batches/999999/')
        self.assertEqual(response.status_code, 404)

    def test_requires_authentication(self):
        self.client.force_authenticate(user=None)
        response = self.client.get(f'/api/delivery/vendor-batches/{self.batching_vendor.id}/')
        self.assertIn(response.status_code, (401, 403))
