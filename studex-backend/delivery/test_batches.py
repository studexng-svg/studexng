# delivery/test_batches.py
"""
Test suite for Phase 1 Step 1 (Food Commerce Engine — schema foundation).
Covers BatchTemplate, DeliveryBatch, and the new DeliveryAssignment.batch
field. Confirms batching is a vendor capability (any User, not a
"restaurant"-specific concept) and that every existing DeliveryAssignment
usage (Blocker 4/5, unchanged) continues to work with batch=None.
"""
from datetime import date, time, datetime, timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from accounts.models import User
from services.models import Category, Listing
from orders.models import Order
from delivery.models import CampusPickupPoint, DeliveryAssignment, BatchTemplate, DeliveryBatch


class DeliveryAssignmentUnaffectedByBatchTests(TestCase):
    """Every existing DeliveryAssignment usage must work identically with batch=None."""

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
            reference='ORD-BATCH-TEST-1', buyer=self.buyer, listing=self.listing, amount=Decimal('1000.00'),
        )
        self.point = CampusPickupPoint.objects.create(name='Gate', campus='pau')

    def test_assignment_created_without_a_batch_exactly_as_before(self):
        assignment = DeliveryAssignment.objects.create(
            order=self.order, rider=self.rider, pickup_point=self.point,
        )
        self.assertIsNone(assignment.batch)


class BatchCapabilityIsVendorAgnosticTests(TestCase):
    """Confirms the model itself has no restaurant-specific naming or constraint."""

    def test_batch_template_vendor_is_a_plain_user_fk(self):
        vendor = User.objects.create_user(
            username='any_vendor', email='any_vendor@pau.edu.ng', password='pass123', user_type='vendor',
        )
        template = BatchTemplate.objects.create(
            vendor=vendor, campus='pau', display_name='Morning Run',
            delivery_time=time(9, 0), max_orders=5, days_of_week=[0, 1, 2, 3, 4],
        )
        self.assertEqual(template.vendor, vendor)
        self.assertEqual(template.days_of_week, [0, 1, 2, 3, 4])

    def test_delivery_batch_vendor_is_a_plain_user_fk(self):
        vendor = User.objects.create_user(
            username='any_vendor2', email='any_vendor2@pau.edu.ng', password='pass123',
        )
        batch = DeliveryBatch.objects.create(
            vendor=vendor, campus='pau', batch_date=date.today(), display_name='Lunch Rush',
            delivery_time=timezone.now(), cutoff_time=timezone.now(), max_orders=10,
        )
        self.assertEqual(batch.vendor, vendor)
        self.assertEqual(batch.status, 'open')
        self.assertEqual(batch.current_orders, 0)


class DeliveryBatchUniquenessTests(TestCase):
    def setUp(self):
        self.vendor = User.objects.create_user(
            username='vendor3', email='vendor3@pau.edu.ng', password='pass123',
        )
        self.template = BatchTemplate.objects.create(
            vendor=self.vendor, campus='pau', display_name='Lunch Rush',
            delivery_time=time(13, 0), max_orders=10, days_of_week=[0, 1, 2, 3, 4],
        )

    def test_same_template_same_day_cannot_duplicate(self):
        DeliveryBatch.objects.create(
            vendor=self.vendor, template=self.template, campus='pau', batch_date=date(2026, 8, 3),
            display_name='Lunch Rush', delivery_time=timezone.now(), cutoff_time=timezone.now(), max_orders=10,
        )
        from django.db import IntegrityError
        with self.assertRaises(IntegrityError):
            DeliveryBatch.objects.create(
                vendor=self.vendor, template=self.template, campus='pau', batch_date=date(2026, 8, 3),
                display_name='Lunch Rush', delivery_time=timezone.now(), cutoff_time=timezone.now(), max_orders=10,
            )

    def test_two_different_templates_same_day_are_both_allowed(self):
        """A vendor can have Lunch Rush AND Dinner Rush the same day."""
        dinner_template = BatchTemplate.objects.create(
            vendor=self.vendor, campus='pau', display_name='Dinner Rush',
            delivery_time=time(19, 0), max_orders=8, days_of_week=[0, 1, 2, 3, 4],
        )
        DeliveryBatch.objects.create(
            vendor=self.vendor, template=self.template, campus='pau', batch_date=date(2026, 8, 3),
            display_name='Lunch Rush', delivery_time=timezone.now(), cutoff_time=timezone.now(), max_orders=10,
        )
        DeliveryBatch.objects.create(
            vendor=self.vendor, template=dinner_template, campus='pau', batch_date=date(2026, 8, 3),
            display_name='Dinner Rush', delivery_time=timezone.now(), cutoff_time=timezone.now(), max_orders=8,
        )
        self.assertEqual(DeliveryBatch.objects.filter(vendor=self.vendor, batch_date=date(2026, 8, 3)).count(), 2)

    def test_admin_created_batches_with_no_template_have_no_uniqueness_conflict(self):
        """template=None batches are ad hoc — no uniqueness constraint applies to them."""
        DeliveryBatch.objects.create(
            vendor=self.vendor, template=None, campus='pau', batch_date=date(2026, 8, 4),
            display_name='Special Event Batch A', delivery_time=timezone.now(), cutoff_time=timezone.now(),
            max_orders=5,
        )
        DeliveryBatch.objects.create(
            vendor=self.vendor, template=None, campus='pau', batch_date=date(2026, 8, 4),
            display_name='Special Event Batch B', delivery_time=timezone.now(), cutoff_time=timezone.now(),
            max_orders=5,
        )
        self.assertEqual(
            DeliveryBatch.objects.filter(vendor=self.vendor, template__isnull=True, batch_date=date(2026, 8, 4)).count(),
            2,
        )

    def test_editing_a_generated_batch_does_not_affect_the_template(self):
        batch = DeliveryBatch.objects.create(
            vendor=self.vendor, template=self.template, campus='pau', batch_date=date(2026, 8, 5),
            display_name='Lunch Rush', delivery_time=timezone.now(), cutoff_time=timezone.now(), max_orders=10,
        )
        batch.max_orders = 20
        batch.display_name = 'Lunch Rush (Extended)'
        batch.save(update_fields=['max_orders', 'display_name'])
        self.template.refresh_from_db()
        self.assertEqual(self.template.max_orders, 10)
        self.assertEqual(self.template.display_name, 'Lunch Rush')


class DeliveryBatchStatusTests(TestCase):
    def test_status_defaults_to_open(self):
        vendor = User.objects.create_user(username='vendor4', email='vendor4@pau.edu.ng', password='pass123')
        batch = DeliveryBatch.objects.create(
            vendor=vendor, campus='pau', batch_date=date.today(),
            display_name='Batch', delivery_time=timezone.now(), cutoff_time=timezone.now(), max_orders=10,
        )
        self.assertEqual(batch.status, 'open')

    def test_status_can_transition_through_the_full_lifecycle(self):
        vendor = User.objects.create_user(username='vendor5', email='vendor5@pau.edu.ng', password='pass123')
        batch = DeliveryBatch.objects.create(
            vendor=vendor, campus='pau', batch_date=date.today(),
            display_name='Batch', delivery_time=timezone.now(), cutoff_time=timezone.now(), max_orders=10,
        )
        for status in ('full', 'open', 'suspended', 'open', 'closed'):
            batch.status = status
            batch.save(update_fields=['status'])
            batch.refresh_from_db()
            self.assertEqual(batch.status, status)
