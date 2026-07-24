# orders/test_batch_cancellation.py
"""
Test suite for the cancellation -> capacity release hook (Phase 1 — Food
Commerce Engine, Step 4). OrderViewSet.update_status is the one place an
Order transitions to 'cancelled' — it invokes delivery.capacity.
release_capacity, never implementing batch logic itself.
"""
from datetime import date, timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User, Vendor, VendorType
from services.models import Category, Listing
from orders.models import Order
from delivery.models import DeliveryBatch


class OrderCancellationReleasesCapacityTests(TestCase):
    def setUp(self):
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

    def _make_batch(self, hours_until_cutoff, max_orders=5, current_orders=3, status='open'):
        now = timezone.now()
        return DeliveryBatch.objects.create(
            vendor=self.vendor, campus='pau', batch_date=date.today(), display_name='Lunch',
            delivery_time=now + timedelta(hours=hours_until_cutoff + 1), cutoff_time=now + timedelta(hours=hours_until_cutoff),
            max_orders=max_orders, current_orders=current_orders, status=status,
        )

    def _make_order(self, batch=None):
        return Order.objects.create(
            buyer=self.buyer, listing=self.listing, amount=Decimal('1500'),
            reference=f'STX-BC-{DeliveryBatch.objects.count()}-{Order.objects.count()}',
            status='paid', delivery_batch=batch,
        )

    def _cancel(self, order):
        return self.client.patch(
            f'/api/orders/orders/{order.id}/update-status/', {'status': 'cancelled'}, format='json',
        )

    def test_cancelling_before_cutoff_reopens_capacity(self):
        batch = self._make_batch(hours_until_cutoff=2, current_orders=3)
        order = self._make_order(batch)

        response = self._cancel(order)

        self.assertEqual(response.status_code, 200)
        batch.refresh_from_db()
        self.assertEqual(batch.current_orders, 2)

    def test_cancelling_after_cutoff_does_not_reopen_capacity(self):
        batch = self._make_batch(hours_until_cutoff=-1, current_orders=3)
        order = self._make_order(batch)

        response = self._cancel(order)

        self.assertEqual(response.status_code, 200)
        batch.refresh_from_db()
        self.assertEqual(batch.current_orders, 3)

    def test_cancelling_flips_full_batch_back_to_open(self):
        batch = self._make_batch(hours_until_cutoff=2, max_orders=3, current_orders=3, status='full')
        order = self._make_order(batch)

        self._cancel(order)

        batch.refresh_from_db()
        self.assertEqual(batch.status, 'open')
        self.assertEqual(batch.current_orders, 2)

    def test_cancelling_order_without_batch_does_not_error(self):
        """Backward compatibility: an order that never reserved batch capacity cancels exactly as before."""
        order = self._make_order(batch=None)

        response = self._cancel(order)

        self.assertEqual(response.status_code, 200)
        order.refresh_from_db()
        self.assertEqual(order.status, 'cancelled')

    def test_cancelling_twice_only_releases_once(self):
        """The pre-existing 'active paid orders only' guard prevents a second release."""
        batch = self._make_batch(hours_until_cutoff=2, current_orders=3)
        order = self._make_order(batch)

        first = self._cancel(order)
        second = self._cancel(order)

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 400)  # "Can only update tracking status of active paid orders."
        batch.refresh_from_db()
        self.assertEqual(batch.current_orders, 2)  # released exactly once, not twice
