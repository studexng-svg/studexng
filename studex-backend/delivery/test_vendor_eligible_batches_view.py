# delivery/test_vendor_eligible_batches_view.py
"""
Test suite for GET /api/delivery/vendor-batches/<vendor_id>/ — the
buyer-facing checkout preview of which delivery batch (and how many slots
are left) an order will land in, before paying. Must never reserve
anything (read-only), and must clearly distinguish "this vendor doesn't
use batching at all" from "uses batching but nothing is open right now" so
the frontend doesn't show a misleading empty state for every non-batching
vendor's checkout.
"""
from datetime import date, timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User, Vendor, VendorType
from delivery.models import DeliveryBatch, BatchTemplate


class VendorEligibleBatchesViewTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.buyer = User.objects.create_user(username='veb_buyer', email='veb_buyer@pau.edu.ng', password='pass123')
        self.client.force_authenticate(user=self.buyer)

        self.food = VendorType.objects.get(name='food')
        self.beauty = VendorType.objects.get(name='beauty')

        self.batching_vendor = User.objects.create_user(
            username='veb_batch_vendor', email='veb_batch_vendor@pau.edu.ng', password='pass123', school='pau',
        )
        Vendor.objects.create(user=self.batching_vendor, vendor_type=self.food)
        BatchTemplate.objects.create(
            vendor=self.batching_vendor, campus='pau', display_name='Lunch', delivery_time=timezone.now().time(),
            max_orders=10, days_of_week=list(range(7)),
        )

        self.non_opted_in_vendor = User.objects.create_user(
            username='veb_food_no_template', email='veb_food_no_template@pau.edu.ng', password='pass123', school='pau',
        )
        Vendor.objects.create(user=self.non_opted_in_vendor, vendor_type=self.food)

        self.beauty_vendor = User.objects.create_user(
            username='veb_beauty_vendor', email='veb_beauty_vendor@pau.edu.ng', password='pass123', school='pau',
        )
        Vendor.objects.create(user=self.beauty_vendor, vendor_type=self.beauty)

    def _make_batch(self, vendor, max_orders=5, current_orders=0, hours_until_cutoff=2, display_name='Lunch'):
        now = timezone.now()
        return DeliveryBatch.objects.create(
            vendor=vendor, campus='pau', batch_date=date.today(), display_name=display_name,
            delivery_time=now + timedelta(hours=hours_until_cutoff + 1), cutoff_time=now + timedelta(hours=hours_until_cutoff),
            max_orders=max_orders, current_orders=current_orders, status='open',
        )

    def test_batching_vendor_with_open_batches_returns_them_with_remaining_slots(self):
        self._make_batch(self.batching_vendor, max_orders=10, current_orders=3, display_name='Lunch')
        response = self.client.get(f'/api/delivery/vendor-batches/{self.batching_vendor.id}/')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['uses_batched_delivery'])
        self.assertEqual(len(response.data['batches']), 1)
        self.assertEqual(response.data['batches'][0]['display_name'], 'Lunch')
        self.assertEqual(response.data['batches'][0]['remaining_slots'], 7)

    def test_non_batching_vendor_type_returns_uses_batched_delivery_false(self):
        response = self.client.get(f'/api/delivery/vendor-batches/{self.beauty_vendor.id}/')
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['uses_batched_delivery'])
        self.assertEqual(response.data['batches'], [])

    def test_food_vendor_without_batch_template_returns_uses_batched_delivery_false(self):
        """Distinguishes 'doesn't use batching' from 'uses it but nothing open' — no misleading empty warning."""
        response = self.client.get(f'/api/delivery/vendor-batches/{self.non_opted_in_vendor.id}/')
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['uses_batched_delivery'])
        self.assertEqual(response.data['batches'], [])

    def test_batching_vendor_with_no_open_batches_returns_empty_list_but_true_flag(self):
        response = self.client.get(f'/api/delivery/vendor-batches/{self.batching_vendor.id}/')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['uses_batched_delivery'])
        self.assertEqual(response.data['batches'], [])

    def test_full_batch_excluded(self):
        self._make_batch(self.batching_vendor, max_orders=1, current_orders=1)
        response = self.client.get(f'/api/delivery/vendor-batches/{self.batching_vendor.id}/')
        self.assertEqual(response.data['batches'], [])

    def test_does_not_reserve_anything(self):
        batch = self._make_batch(self.batching_vendor, max_orders=5, current_orders=0)
        self.client.get(f'/api/delivery/vendor-batches/{self.batching_vendor.id}/')
        batch.refresh_from_db()
        self.assertEqual(batch.current_orders, 0)

    def test_unknown_vendor_returns_404(self):
        response = self.client.get('/api/delivery/vendor-batches/999999/')
        self.assertEqual(response.status_code, 404)

    def test_requires_authentication(self):
        self.client.force_authenticate(user=None)
        response = self.client.get(f'/api/delivery/vendor-batches/{self.batching_vendor.id}/')
        self.assertIn(response.status_code, (401, 403))
