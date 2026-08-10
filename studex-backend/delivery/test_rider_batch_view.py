# delivery/test_rider_batch_view.py
"""
Test suite for GET /api/delivery/my-batches/ (Phase 2 simplification —
RiderBatchListView now groups by DeliverySlot instead of the old
DeliveryBatch). Read-only grouping layer over existing DeliveryAssignment
data — pickup/completion verification mechanics (RiderUpdateStatusView) are
untouched and not exercised here. Field names on the wire (batch_id,
batches, unbatched) are kept as-is for frontend compatibility even though
they're now backed by DeliverySlot.
"""
from datetime import time
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User, Vendor, VendorType
from services.models import Category, Listing, MenuItem, AddonGroup, Addon
from orders.models import Order, OrderItem, OrderItemAddon
from delivery.models import DeliverySlot, DeliveryAssignment, CampusPickupPoint


class RiderBatchListViewTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.food = VendorType.objects.get(name='food')
        self.vendor = User.objects.create_user(username='rb_vendor', email='rb_vendor@pau.edu.ng', password='pass123')
        Vendor.objects.create(user=self.vendor, vendor_type=self.food)
        self.rider = User.objects.create_user(username='rb_rider', email='rb_rider@pau.edu.ng', password='pass123', user_type='rider')
        self.other_rider = User.objects.create_user(username='rb_rider2', email='rb_rider2@pau.edu.ng', password='pass123', user_type='rider')
        self.buyer = User.objects.create_user(
            username='rb_buyer', email='rb_buyer@pau.edu.ng', password='pass123', phone='08012345678',
        )
        self.category = Category.objects.create(title='FoodRB', slug='food-rb')
        self.point = CampusPickupPoint.objects.create(name='Hostel A', campus='pau')
        self.listing = Listing.objects.create(
            title='Jollof Rice', description='x', price=Decimal('1500'), image='https://cdn.example.com/jollof.jpg',
            vendor=self.vendor, category=self.category, is_available=True,
        )

        self.slot = DeliverySlot.objects.create(
            vendor=self.vendor, campus='pau', display_name='Lunch Batch',
            delivery_time=time(13, 0), cutoff_offset_minutes=15, max_orders=10,
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

    def test_assignment_with_slot_grouped_under_batches(self):
        order = self._make_order('STX-RB-0001')
        DeliveryAssignment.objects.create(order=order, rider=self.rider, pickup_point=self.point, delivery_slot=self.slot)

        self.client.force_authenticate(user=self.rider)
        response = self.client.get('/api/delivery/my-batches/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data['batches']), 1)
        group = response.data['batches'][0]
        self.assertEqual(group['batch_id'], self.slot.id)
        self.assertEqual(group['display_name'], 'Lunch Batch')
        self.assertEqual(len(group['assignments']), 1)
        self.assertEqual(group['assignments'][0]['buyer_phone'], '08012345678')
        self.assertEqual(response.data['unbatched'], [])

    def test_buyer_phone_null_when_not_on_file(self):
        """Regression: a buyer with no phone set must serialize as null, not crash the endpoint."""
        no_phone_buyer = User.objects.create_user(
            username='rb_buyer_nophone', email='rb_buyer_nophone@pau.edu.ng', password='pass123',
        )
        order = Order.objects.create(
            buyer=no_phone_buyer, listing=self.listing, amount=Decimal('1500'),
            reference='STX-RB-NOPHONE', status='paid', quantity=1,
        )
        DeliveryAssignment.objects.create(order=order, rider=self.rider, pickup_point=self.point, delivery_slot=self.slot)

        self.client.force_authenticate(user=self.rider)
        response = self.client.get('/api/delivery/my-batches/')

        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data['batches'][0]['assignments'][0]['buyer_phone'])

    def test_multiple_assignments_same_slot_grouped_together(self):
        order1 = self._make_order('STX-RB-0002')
        order2 = self._make_order('STX-RB-0003')
        DeliveryAssignment.objects.create(order=order1, rider=self.rider, pickup_point=self.point, delivery_slot=self.slot)
        DeliveryAssignment.objects.create(order=order2, rider=self.rider, pickup_point=self.point, delivery_slot=self.slot)

        self.client.force_authenticate(user=self.rider)
        response = self.client.get('/api/delivery/my-batches/')

        self.assertEqual(len(response.data['batches']), 1)
        self.assertEqual(len(response.data['batches'][0]['assignments']), 2)

    def test_assignment_without_slot_goes_to_unbatched(self):
        order = self._make_order('STX-RB-0004')
        DeliveryAssignment.objects.create(order=order, rider=self.rider, pickup_point=self.point, delivery_slot=None)

        self.client.force_authenticate(user=self.rider)
        response = self.client.get('/api/delivery/my-batches/')

        self.assertEqual(response.data['batches'], [])
        self.assertEqual(len(response.data['unbatched']), 1)

    def test_completed_assignment_excluded(self):
        order = self._make_order('STX-RB-0005')
        DeliveryAssignment.objects.create(
            order=order, rider=self.rider, pickup_point=self.point, delivery_slot=self.slot, status='completed',
        )

        self.client.force_authenticate(user=self.rider)
        response = self.client.get('/api/delivery/my-batches/')

        self.assertEqual(response.data['batches'], [])
        self.assertEqual(response.data['unbatched'], [])

    def test_other_riders_assignments_not_visible(self):
        order = self._make_order('STX-RB-0006')
        DeliveryAssignment.objects.create(order=order, rider=self.other_rider, pickup_point=self.point, delivery_slot=self.slot)

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
        OrderItemAddon.objects.create(
            order_item=order_item, addon=addon, name_snapshot='Extra Chicken',
            price_delta_snapshot=Decimal('300'), quantity=2,
        )
        DeliveryAssignment.objects.create(order=order, rider=self.rider, pickup_point=self.point, delivery_slot=self.slot)

        self.client.force_authenticate(user=self.rider)
        response = self.client.get('/api/delivery/my-batches/')

        assignment = response.data['batches'][0]['assignments'][0]
        items = assignment['items']
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]['id'], order_item.id)
        self.assertEqual(items[0]['listing_title'], 'Jollof Rice')
        self.assertEqual(items[0]['image'], 'https://cdn.example.com/jollof.jpg')
        self.assertEqual(items[0]['quantity'], 2)
        self.assertEqual(items[0]['addons'], [{'name': 'Extra Chicken', 'price_delta': '300.00', 'quantity': 2}])
        # Full receipt total — what the rider previously had to check in Django
        # admin. _make_order stamps Order.amount independently of any OrderItem
        # rows added afterward (it's frozen at checkout, not re-derived), so
        # this reflects that field directly rather than the items' own total.
        self.assertEqual(assignment['order_amount'], '1500.00')
        self.assertEqual(assignment['order_delivery_fee'], '0.00')

    def test_order_amount_includes_delivery_fee_paid(self):
        """Regression: the rider-facing total reflects the actual amount charged (delivery fee folded in), not just item cost."""
        order = self._make_order('STX-RB-0011')
        order.amount = Decimal('1800')
        order.delivery_fee = Decimal('300')
        order.save(update_fields=['amount', 'delivery_fee'])
        DeliveryAssignment.objects.create(order=order, rider=self.rider, pickup_point=self.point, delivery_slot=self.slot)

        self.client.force_authenticate(user=self.rider)
        response = self.client.get('/api/delivery/my-batches/')

        assignment = response.data['batches'][0]['assignments'][0]
        self.assertEqual(assignment['order_amount'], '1800.00')
        self.assertEqual(assignment['order_delivery_fee'], '300.00')

    def test_legacy_single_item_order_falls_back_to_anchor_listing(self):
        order = self._make_order('STX-RB-0008')  # no OrderItem rows
        DeliveryAssignment.objects.create(order=order, rider=self.rider, pickup_point=self.point, delivery_slot=self.slot)

        self.client.force_authenticate(user=self.rider)
        response = self.client.get('/api/delivery/my-batches/')

        items = response.data['batches'][0]['assignments'][0]['items']
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]['listing_title'], 'Jollof Rice')
        self.assertEqual(items[0]['image'], 'https://cdn.example.com/jollof.jpg')

    def test_existing_my_assignments_endpoint_unaffected(self):
        """Regression: RiderAssignmentListView (flat list) keeps working with the serializer's new fields present but harmless."""
        order = self._make_order('STX-RB-0009')
        DeliveryAssignment.objects.create(order=order, rider=self.rider, pickup_point=self.point, delivery_slot=self.slot)

        self.client.force_authenticate(user=self.rider)
        response = self.client.get('/api/delivery/my-assignments/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['batch_id'], self.slot.id)

    def test_fully_refunded_order_excluded_from_active_batches(self):
        """
        A fully-refunded order (payments.item_refund.mark_order_item_unavailable
        flips Order.status to 'cancelled' once every item is unavailable)
        never touches DeliveryAssignment.status — it must not keep sitting in
        the rider's active list, obstructing real deliveries.
        """
        order = self._make_order('STX-RB-0012')
        order.status = 'cancelled'
        order.save(update_fields=['status'])
        DeliveryAssignment.objects.create(order=order, rider=self.rider, pickup_point=self.point, delivery_slot=self.slot)

        self.client.force_authenticate(user=self.rider)
        response = self.client.get('/api/delivery/my-batches/')

        self.assertEqual(response.data['batches'], [])
        self.assertEqual(response.data['unbatched'], [])

    def test_fully_refunded_order_excluded_from_unbatched_active_too(self):
        order = self._make_order('STX-RB-0013')
        order.status = 'cancelled'
        order.save(update_fields=['status'])
        DeliveryAssignment.objects.create(order=order, rider=self.rider, pickup_point=self.point, delivery_slot=None)

        self.client.force_authenticate(user=self.rider)
        response = self.client.get('/api/delivery/my-batches/')

        self.assertEqual(response.data['unbatched'], [])

    def test_auto_assigned_order_with_no_pickup_point_shows_delivery_location(self):
        """Auto-assignment never sets a pickup_point — the rider must still see where to drop off, from the buyer's own typed location."""
        order = self._make_order('STX-RB-0010')
        order.delivery_location = '3rd floor, Block C, Room 12'
        order.save(update_fields=['delivery_location'])
        DeliveryAssignment.objects.create(order=order, rider=self.rider, pickup_point=None, delivery_slot=self.slot)

        self.client.force_authenticate(user=self.rider)
        response = self.client.get('/api/delivery/my-batches/')

        assignment_data = response.data['batches'][0]['assignments'][0]
        self.assertIsNone(assignment_data.get('pickup_point_name'))
        self.assertEqual(assignment_data['delivery_location'], '3rd floor, Block C, Room 12')
