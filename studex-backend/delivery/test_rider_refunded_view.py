# delivery/test_rider_refunded_view.py
"""
Test suite for GET /api/delivery/my-refunded/ — the other half of keeping
fully-refunded orders out of the rider's active list (see
RiderBatchListView's order__status='cancelled' exclusion, added alongside
this view). Without this endpoint a refunded order's assignment would just
vanish from the rider's dashboard with no explanation.
"""
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User, Vendor, VendorType
from services.models import Category, Listing
from orders.models import Order
from delivery.models import DeliveryAssignment, CampusPickupPoint


class RiderRefundedListViewTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.food = VendorType.objects.get(name='food')
        self.vendor = User.objects.create_user(username='rr_vendor', email='rr_vendor@pau.edu.ng', password='pass123')
        Vendor.objects.create(user=self.vendor, vendor_type=self.food)
        self.rider = User.objects.create_user(username='rr_rider', email='rr_rider@pau.edu.ng', password='pass123', user_type='rider')
        self.other_rider = User.objects.create_user(username='rr_rider2', email='rr_rider2@pau.edu.ng', password='pass123', user_type='rider')
        self.buyer = User.objects.create_user(username='rr_buyer', email='rr_buyer@pau.edu.ng', password='pass123')
        self.category = Category.objects.create(title='FoodRR', slug='food-rr')
        self.point = CampusPickupPoint.objects.create(name='Hostel B', campus='pau')
        self.listing = Listing.objects.create(
            title='Spaghetti', description='x', price=Decimal('1500'),
            vendor=self.vendor, category=self.category, is_available=True,
        )

    def _make_order(self, ref, order_status='paid'):
        return Order.objects.create(
            buyer=self.buyer, listing=self.listing, amount=Decimal('1500'),
            reference=ref, status=order_status, quantity=1,
        )

    def test_non_rider_forbidden(self):
        self.client.force_authenticate(user=self.buyer)
        response = self.client.get('/api/delivery/my-refunded/')
        self.assertEqual(response.status_code, 403)

    def test_fully_refunded_order_appears(self):
        order = self._make_order('STX-RR-0001', order_status='cancelled')
        assignment = DeliveryAssignment.objects.create(order=order, rider=self.rider, pickup_point=self.point)

        self.client.force_authenticate(user=self.rider)
        response = self.client.get('/api/delivery/my-refunded/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['id'], assignment.id)
        self.assertEqual(response.data[0]['order_status'], 'cancelled')

    def test_active_order_absent(self):
        order = self._make_order('STX-RR-0002', order_status='paid')
        DeliveryAssignment.objects.create(order=order, rider=self.rider, pickup_point=self.point)

        self.client.force_authenticate(user=self.rider)
        response = self.client.get('/api/delivery/my-refunded/')

        self.assertEqual(response.data, [])

    def test_other_riders_refunded_orders_not_visible(self):
        order = self._make_order('STX-RR-0003', order_status='cancelled')
        DeliveryAssignment.objects.create(order=order, rider=self.other_rider, pickup_point=self.point)

        self.client.force_authenticate(user=self.rider)
        response = self.client.get('/api/delivery/my-refunded/')

        self.assertEqual(response.data, [])

    def test_delivery_code_never_leaks_to_rider(self):
        order = self._make_order('STX-RR-0004', order_status='cancelled')
        DeliveryAssignment.objects.create(order=order, rider=self.rider, pickup_point=self.point)

        self.client.force_authenticate(user=self.rider)
        response = self.client.get('/api/delivery/my-refunded/')

        self.assertNotIn('delivery_code', response.data[0])
