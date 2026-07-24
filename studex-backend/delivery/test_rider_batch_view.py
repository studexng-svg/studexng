# delivery/test_rider_batch_view.py
"""
Test suite for GET /api/delivery/my-batches/ (Phase 1 — Food Commerce
Engine, Step 5 — Rider Batch Workflow). Read-only grouping layer over
existing DeliveryAssignment data — pickup/completion verification mechanics
(RiderUpdateStatusView) are untouched and not exercised here.
"""
from datetime import date, timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User, Vendor, VendorType
from services.models import Category, Listing, MenuItem, AddonGroup, Addon
from orders.models import Order, OrderItem, OrderItemAddon
from delivery.models import DeliveryBatch, DeliveryAssignment, CampusPickupPoint


class RiderBatchListViewTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.food = VendorType.objects.get(name='food')
        self.vendor = User.objects.create_user(username='rb_vendor', email='rb_vendor@pau.edu.ng', password='pass123')
        Vendor.objects.create(user=self.vendor, vendor_type=self.food)
        self.rider = User.objects.create_user(username='rb_rider', email='rb_rider@pau.edu.ng', password='pass123', user_type='rider')
        self.other_rider = User.objects.create_user(username='rb_rider2', email='rb_rider2@pau.edu.ng', password='pass123', user_type='rider')
        self.buyer = User.objects.create_user(username='rb_buyer', email='rb_buyer@pau.edu.ng', password='pass123')
        self.category = Category.objects.create(title='FoodRB', slug='food-rb')
        self.point = CampusPickupPoint.objects.create(name='Hostel A', campus='pau')
        self.listing = Listing.objects.create(
            title='Jollof Rice', description='x', price=Decimal('1500'),
            vendor=self.vendor, category=self.category, is_available=True,
        )

        now = timezone.now()
        self.batch = DeliveryBatch.objects.create(
            vendor=self.vendor, campus='pau', batch_date=date.today(), display_name='Lunch Batch',
            delivery_time=now + timedelta(hours=1), cutoff_time=now + timedelta(minutes=45),
            max_orders=10, current_orders=2, status='open',
        )

    def _make_order(self, ref):
        return Order.objects.create(
            buyer=self.buyer, listing=self.listing, amount=Decimal('1500'),
            reference=ref, status='paid', quantity=1,
        )

    def test_non_rider_forbidden(self):
        self.client.force_authenticate(user=self.buyer)
        response = self.client.get('/api/delivery/my-batches/')
        self.assertEqual(response.status_code, 403)

    def test_assignment_with_batch_grouped_under_batches(self):
        order = self._make_order('STX-RB-0001')
        DeliveryAssignment.objects.create(order=order, rider=self.rider, pickup_point=self.point, batch=self.batch)

        self.client.force_authenticate(user=self.rider)
        response = self.client.get('/api/delivery/my-batches/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data['batches']), 1)
        group = response.data['batches'][0]
        self.assertEqual(group['batch_id'], self.batch.id)
        self.assertEqual(group['display_name'], 'Lunch Batch')
        self.assertEqual(len(group['assignments']), 1)
        self.assertEqual(response.data['unbatched'], [])

    def test_multiple_assignments_same_batch_grouped_together(self):
        order1 = self._make_order('STX-RB-0002')
        order2 = self._make_order('STX-RB-0003')
        DeliveryAssignment.objects.create(order=order1, rider=self.rider, pickup_point=self.point, batch=self.batch)
        DeliveryAssignment.objects.create(order=order2, rider=self.rider, pickup_point=self.point, batch=self.batch)

        self.client.force_authenticate(user=self.rider)
        response = self.client.get('/api/delivery/my-batches/')

        self.assertEqual(len(response.data['batches']), 1)
        self.assertEqual(len(response.data['batches'][0]['assignments']), 2)

    def test_assignment_without_batch_goes_to_unbatched(self):
        order = self._make_order('STX-RB-0004')
        DeliveryAssignment.objects.create(order=order, rider=self.rider, pickup_point=self.point, batch=None)

        self.client.force_authenticate(user=self.rider)
        response = self.client.get('/api/delivery/my-batches/')

        self.assertEqual(response.data['batches'], [])
        self.assertEqual(len(response.data['unbatched']), 1)

    def test_completed_assignment_excluded(self):
        order = self._make_order('STX-RB-0005')
        DeliveryAssignment.objects.create(
            order=order, rider=self.rider, pickup_point=self.point, batch=self.batch, status='completed',
        )

        self.client.force_authenticate(user=self.rider)
        response = self.client.get('/api/delivery/my-batches/')

        self.assertEqual(response.data['batches'], [])
        self.assertEqual(response.data['unbatched'], [])

    def test_other_riders_assignments_not_visible(self):
        order = self._make_order('STX-RB-0006')
        DeliveryAssignment.objects.create(order=order, rider=self.other_rider, pickup_point=self.point, batch=self.batch)

        self.client.force_authenticate(user=self.rider)
        response = self.client.get('/api/delivery/my-batches/')

        self.assertEqual(response.data['batches'], [])
        self.assertEqual(response.data['unbatched'], [])

    def test_itemized_contents_from_order_items(self):
        menu_item = MenuItem.objects.create(listing=self.listing)
        group = AddonGroup.objects.create(menu_item=menu_item, name='Extras')
        addon = Addon.objects.create(group=group, name='Extra Chicken', price_delta=Decimal('300'))

        order = self._make_order('STX-RB-0007')
        order_item = OrderItem.objects.create(
            order=order, listing=self.listing, quantity=2,
            unit_price_at_order_time=Decimal('1620'), line_total=Decimal('3240'),
        )
        OrderItemAddon.objects.create(order_item=order_item, addon=addon, name_snapshot='Extra Chicken', price_delta_snapshot=Decimal('300'))
        DeliveryAssignment.objects.create(order=order, rider=self.rider, pickup_point=self.point, batch=self.batch)

        self.client.force_authenticate(user=self.rider)
        response = self.client.get('/api/delivery/my-batches/')

        items = response.data['batches'][0]['assignments'][0]['items']
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]['listing_title'], 'Jollof Rice')
        self.assertEqual(items[0]['quantity'], 2)
        self.assertEqual(items[0]['addons'], [{'name': 'Extra Chicken', 'price_delta': '300.00'}])

    def test_legacy_single_item_order_falls_back_to_anchor_listing(self):
        order = self._make_order('STX-RB-0008')  # no OrderItem rows
        DeliveryAssignment.objects.create(order=order, rider=self.rider, pickup_point=self.point, batch=self.batch)

        self.client.force_authenticate(user=self.rider)
        response = self.client.get('/api/delivery/my-batches/')

        items = response.data['batches'][0]['assignments'][0]['items']
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]['listing_title'], 'Jollof Rice')

    def test_existing_my_assignments_endpoint_unaffected(self):
        """Regression: RiderAssignmentListView (flat list) keeps working with the serializer's new fields present but harmless."""
        order = self._make_order('STX-RB-0009')
        DeliveryAssignment.objects.create(order=order, rider=self.rider, pickup_point=self.point, batch=self.batch)

        self.client.force_authenticate(user=self.rider)
        response = self.client.get('/api/delivery/my-assignments/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['batch_id'], self.batch.id)
