# delivery/test_batches.py
"""
Test suite for DeliverySlot schema foundation (Phase 2 simplification —
replaces the earlier BatchTemplate + nightly-generated DeliveryBatch pair
with one standing row). Confirms DeliverySlot is a vendor capability (any
User, not a "restaurant"-specific concept) and that every existing
DeliveryAssignment usage continues to work with delivery_slot=None.
"""
from datetime import time
from decimal import Decimal

from django.test import TestCase

from accounts.models import User
from services.models import Category, Listing
from orders.models import Order
from delivery.models import CampusPickupPoint, DeliveryAssignment, DeliverySlot


class DeliveryAssignmentUnaffectedByDeliverySlotTests(TestCase):
    """Every existing DeliveryAssignment usage must work identically with delivery_slot=None."""

    def setUp(self):
        self.buyer = User.objects.create_user(username='buyer', email='buyer@pau.edu.ng', password='pass123')
        self.vendor = User.objects.create_user(username='vendor', email='vendor@pau.edu.ng', password='pass123')
        self.rider = User.objects.create_user(
            username='rider', email='rider@pau.edu.ng', password='pass123', user_type='rider',
        )
        self.category = Category.objects.create(title='Cat', slug='cat')
        self.listing = Listing.objects.create(
            title='Item', description='x', price=Decimal('1000.00'),
            vendor=self.vendor, category=self.category, is_available=True,
        )
        self.order = Order.objects.create(
            reference='ORD-SLOT-TEST-1', buyer=self.buyer, listing=self.listing, amount=Decimal('1000.00'),
        )
        self.point = CampusPickupPoint.objects.create(name='Gate', campus='pau')

    def test_assignment_created_without_a_slot_exactly_as_before(self):
        assignment = DeliveryAssignment.objects.create(
            order=self.order, rider=self.rider, pickup_point=self.point,
        )
        self.assertIsNone(assignment.delivery_slot)


class DeliverySlotIsVendorAgnosticTests(TestCase):
    """Confirms the model itself has no restaurant-specific naming or constraint."""

    def test_delivery_slot_vendor_is_a_plain_user_fk(self):
        vendor = User.objects.create_user(
            username='any_vendor', email='any_vendor@pau.edu.ng', password='pass123', user_type='vendor',
        )
        slot = DeliverySlot.objects.create(
            vendor=vendor, campus='pau', display_name='Morning Run',
            delivery_time=time(9, 0), max_orders=5,
        )
        self.assertEqual(slot.vendor, vendor)
        self.assertTrue(slot.is_active)

    def test_two_slots_same_vendor_same_day_are_both_allowed(self):
        """A vendor can have Lunch AND Dinner slots — no per-day uniqueness constraint, since a slot is a standing rule, not a per-day row."""
        vendor = User.objects.create_user(username='any_vendor2', email='any_vendor2@pau.edu.ng', password='pass123')
        DeliverySlot.objects.create(vendor=vendor, campus='pau', display_name='Lunch', delivery_time=time(13, 0), max_orders=10)
        DeliverySlot.objects.create(vendor=vendor, campus='pau', display_name='Dinner', delivery_time=time(19, 0), max_orders=8)
        self.assertEqual(DeliverySlot.objects.filter(vendor=vendor).count(), 2)

    def test_editing_a_slot_does_not_require_regeneration(self):
        """The whole point of collapsing to one model: editing a slot's capacity takes effect immediately, no daily job to wait on."""
        vendor = User.objects.create_user(username='any_vendor3', email='any_vendor3@pau.edu.ng', password='pass123')
        slot = DeliverySlot.objects.create(vendor=vendor, campus='pau', display_name='Lunch', delivery_time=time(13, 0), max_orders=10)
        slot.max_orders = 20
        slot.display_name = 'Lunch (Extended)'
        slot.save(update_fields=['max_orders', 'display_name'])
        slot.refresh_from_db()
        self.assertEqual(slot.max_orders, 20)
        self.assertEqual(slot.display_name, 'Lunch (Extended)')


class DeliverySlotDefaultsTests(TestCase):
    def test_is_active_defaults_to_true(self):
        vendor = User.objects.create_user(username='vendor4', email='vendor4@pau.edu.ng', password='pass123')
        slot = DeliverySlot.objects.create(vendor=vendor, campus='pau', display_name='Slot', delivery_time=time(12, 0), max_orders=10)
        self.assertTrue(slot.is_active)

    def test_can_be_deactivated_and_reactivated(self):
        vendor = User.objects.create_user(username='vendor5', email='vendor5@pau.edu.ng', password='pass123')
        slot = DeliverySlot.objects.create(vendor=vendor, campus='pau', display_name='Slot', delivery_time=time(12, 0), max_orders=10)
        for active in (False, True, False):
            slot.is_active = active
            slot.save(update_fields=['is_active'])
            slot.refresh_from_db()
            self.assertEqual(slot.is_active, active)
