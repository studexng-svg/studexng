# orders/test_batch_cancellation.py
"""
Test suite for cancellation's effect on delivery slot capacity (Phase 2
simplification). OrderViewSet.update_status implements no batch/release
logic itself any more — capacity is counted live from real (non-cancelled)
Order rows (delivery.capacity._orders_today_count), so a cancellation frees
a spot automatically just by changing the order's own status; there is no
explicit "release" call and no denormalized counter to reopen.
"""
from datetime import datetime, timedelta
from decimal import Decimal
from unittest import mock

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User, Vendor, VendorType
from services.models import Category, Listing
from orders.models import Order
from delivery.models import DeliverySlot
from delivery.capacity import LAGOS, _orders_today_count

# Fixed at noon Lagos — see delivery/test_capacity.py for why this needs to
# be frozen rather than derived from the real "now" the suite happens to run at.
FROZEN_NOW = datetime(2026, 6, 15, 12, 0, 0, tzinfo=LAGOS)


class OrderCancellationFreesLiveCapacityTests(TestCase):
    def setUp(self):
        self._time_patcher = mock.patch('django.utils.timezone.now', return_value=FROZEN_NOW)
        self._time_patcher.start()
        self.addCleanup(self._time_patcher.stop)
        self.client = APIClient()
        self.food = VendorType.objects.get(name='food')
        self.vendor = User.objects.create_user(username='bc_vendor', email='bc_vendor@pau.edu.ng', password='pass123')
        Vendor.objects.create(user=self.vendor, vendor_type=self.food)
        self.buyer = User.objects.create_user(username='bc_buyer', email='bc_buyer@pau.edu.ng', password='pass123')
        self.category = Category.objects.create(title='FoodBC', slug='food-bc')
        self.listing = Listing.objects.create(
            title='Jollof Rice', description='x', price=Decimal('1500'),
            vendor=self.vendor, category=self.category, is_available=True,
        )
        self.client.force_authenticate(user=self.vendor)
        self.slot = DeliverySlot.objects.create(
            vendor=self.vendor, campus='pau', display_name='Lunch',
            delivery_time=(FROZEN_NOW + timedelta(hours=2)).time(), max_orders=5,
        )

    def _make_order(self, slot=None):
        return Order.objects.create(
            buyer=self.buyer, listing=self.listing, amount=Decimal('1500'),
            reference=f'STX-BC-{Order.objects.count()}',
            status='paid', delivery_slot=slot,
        )

    def _cancel(self, order):
        return self.client.patch(
            f'/api/orders/orders/{order.id}/update-status/', {'status': 'cancelled'}, format='json',
        )

    def _today_count(self):
        return _orders_today_count(self.slot, timezone.now().astimezone(LAGOS).date())

    def test_cancelling_drops_order_from_live_capacity_count(self):
        self._make_order(self.slot)  # spot 1, stays paid
        order = self._make_order(self.slot)  # spot 2, will be cancelled
        self.assertEqual(self._today_count(), 2)

        response = self._cancel(order)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self._today_count(), 1)

    def test_cancelling_order_without_slot_does_not_error(self):
        """Backward compatibility: an order that never reserved slot capacity cancels exactly as before."""
        order = self._make_order(slot=None)

        response = self._cancel(order)

        self.assertEqual(response.status_code, 200)
        order.refresh_from_db()
        self.assertEqual(order.status, 'cancelled')

    def test_cancelling_twice_returns_400_on_second_attempt(self):
        """The pre-existing 'active paid orders only' guard prevents a second transition — no double effect to worry about."""
        order = self._make_order(self.slot)

        first = self._cancel(order)
        second = self._cancel(order)

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 400)  # "Can only update tracking status of active paid orders."
        self.assertEqual(self._today_count(), 0)

    def test_cancelled_order_frees_slot_for_a_new_reservation(self):
        """End-to-end: after cancelling the only order in a max_orders=1 slot, a new reservation succeeds."""
        from delivery.capacity import reserve_delivery_slot
        self.slot.max_orders = 1
        self.slot.save(update_fields=['max_orders'])
        order = self._make_order(self.slot)

        self._cancel(order)

        reserved = reserve_delivery_slot(self.vendor, 'pau')
        self.assertEqual(reserved.id, self.slot.id)
