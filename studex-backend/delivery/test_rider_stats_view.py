# delivery/test_rider_stats_view.py
"""
Test suite for GET /api/delivery/my-stats/ — specifically active_count, which
must agree with what RiderBatchListView (my-batches/) actually shows as
active. Added alongside RiderBatchListView's order__status='cancelled'
exclusion: without the matching exclusion here, the "Active Deliveries" stat
card would keep counting a fully-refunded order the Active tab no longer
lists.
"""
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User, Vendor, VendorType
from services.models import Category, Listing
from orders.models import Order
from delivery.models import DeliveryAssignment, CampusPickupPoint


class RiderStatsActiveCountTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.food = VendorType.objects.get(name='food')
        self.vendor = User.objects.create_user(username='rs_vendor', email='rs_vendor@pau.edu.ng', password='pass123')
        Vendor.objects.create(user=self.vendor, vendor_type=self.food)
        self.rider = User.objects.create_user(username='rs_rider', email='rs_rider@pau.edu.ng', password='pass123', user_type='rider')
        self.buyer = User.objects.create_user(username='rs_buyer', email='rs_buyer@pau.edu.ng', password='pass123')
        self.category = Category.objects.create(title='FoodRS', slug='food-rs')
        self.point = CampusPickupPoint.objects.create(name='Hostel C', campus='pau')
        self.listing = Listing.objects.create(
            title='Rice', description='x', price=Decimal('1500'),
            vendor=self.vendor, category=self.category, is_available=True,
        )

    def _make_order(self, ref, order_status='paid'):
        return Order.objects.create(
            buyer=self.buyer, listing=self.listing, amount=Decimal('1500'),
            reference=ref, status=order_status, quantity=1,
        )

    def test_refunded_order_not_counted_active(self):
        active_order = self._make_order('STX-RS-0001', order_status='paid')
        DeliveryAssignment.objects.create(order=active_order, rider=self.rider, pickup_point=self.point)
        refunded_order = self._make_order('STX-RS-0002', order_status='cancelled')
        DeliveryAssignment.objects.create(order=refunded_order, rider=self.rider, pickup_point=self.point)

        self.client.force_authenticate(user=self.rider)
        response = self.client.get('/api/delivery/my-stats/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['active_count'], 1)
