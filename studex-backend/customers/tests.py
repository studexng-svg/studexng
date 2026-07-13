from decimal import Decimal
from django.test import TestCase
from django.core.management import call_command
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient
from rest_framework import status

from accounts.models import User
from services.models import Category, Listing
from orders.models import Order, Booking
from customers.models import VendorCustomer
from customers.services import recompute_vendor_customer


def _make_completed_order(reference, buyer, listing, amount, confirmed_at):
    order = Order.objects.create(
        reference=reference, buyer=buyer, listing=listing, amount=Decimal(str(amount)),
        status='completed', paid_at=confirmed_at, buyer_confirmed_at=confirmed_at,
    )
    # created_at has auto_now_add=True — .create() ignores any value passed for it,
    # so backdate it via .update() (which bypasses auto_now_add) to simulate a
    # historical order for tests that check first_purchase_at.
    Order.objects.filter(id=order.id).update(created_at=confirmed_at)
    order.refresh_from_db()
    return order


class RecomputeVendorCustomerTests(TestCase):
    def setUp(self):
        self.vendor = User.objects.create_user(username='vendor', email='vendor@pau.edu.ng', password='pass123', user_type='vendor', is_verified_vendor=True)
        self.buyer = User.objects.create_user(username='buyer', email='buyer@pau.edu.ng', password='pass123')
        self.category_a = Category.objects.create(title='Beauty', slug='beauty')
        self.category_b = Category.objects.create(title='Food', slug='food')
        self.listing_a = Listing.objects.create(title='Lashes', description='x', price=Decimal('1000.00'), vendor=self.vendor, category=self.category_a, is_available=True)
        self.listing_b = Listing.objects.create(title='Jollof', description='x', price=Decimal('2000.00'), vendor=self.vendor, category=self.category_b, is_available=True)

    def test_creates_row_from_completed_orders(self):
        from django.utils import timezone
        from datetime import timedelta
        t1 = timezone.now() - timedelta(days=5)
        t2 = timezone.now() - timedelta(days=1)
        _make_completed_order('ORD-1', self.buyer, self.listing_a, '1000.00', t1)
        _make_completed_order('ORD-2', self.buyer, self.listing_a, '1000.00', t2)

        vc = recompute_vendor_customer(self.vendor.id, self.buyer.id)
        self.assertIsNotNone(vc)
        self.assertEqual(vc.total_completed_orders, 2)
        self.assertEqual(vc.total_amount_spent, Decimal('2000.00'))
        self.assertEqual(vc.average_order_value, Decimal('1000.00'))
        self.assertEqual(vc.first_purchase_at, t1)
        self.assertEqual(vc.last_purchase_at, t2)
        self.assertEqual(vc.favorite_listing_id, self.listing_a.id)
        self.assertEqual(vc.favorite_category_id, self.category_a.id)

    def test_favorite_listing_tie_break_is_deterministic(self):
        from django.utils import timezone
        _make_completed_order('ORD-1', self.buyer, self.listing_a, '1000.00', timezone.now())
        _make_completed_order('ORD-2', self.buyer, self.listing_b, '2000.00', timezone.now())

        vc = recompute_vendor_customer(self.vendor.id, self.buyer.id)
        # One purchase each — tie broken by lowest listing id (listing_a created first).
        self.assertEqual(vc.favorite_listing_id, self.listing_a.id)

    def test_total_successful_bookings_counts_paid_and_completed_only(self):
        Booking.objects.create(buyer=self.buyer, listing=self.listing_a, scheduled_date='2099-01-01', scheduled_time='2:30 PM', status='paid')
        Booking.objects.create(buyer=self.buyer, listing=self.listing_a, scheduled_date='2099-01-02', scheduled_time='3:00 PM', status='completed')
        Booking.objects.create(buyer=self.buyer, listing=self.listing_a, scheduled_date='2099-01-03', scheduled_time='4:00 PM', status='cancelled')
        Booking.objects.create(buyer=self.buyer, listing=self.listing_a, scheduled_date='2099-01-04', scheduled_time='5:00 PM', status='pending')
        from django.utils import timezone
        _make_completed_order('ORD-1', self.buyer, self.listing_a, '1000.00', timezone.now())

        vc = recompute_vendor_customer(self.vendor.id, self.buyer.id)
        self.assertEqual(vc.total_successful_bookings, 2)

    def test_deletes_row_when_no_completed_orders(self):
        from django.utils import timezone
        order = _make_completed_order('ORD-1', self.buyer, self.listing_a, '1000.00', timezone.now())
        recompute_vendor_customer(self.vendor.id, self.buyer.id)
        self.assertTrue(VendorCustomer.objects.filter(vendor=self.vendor, customer=self.buyer).exists())

        order.status = 'disputed'
        order.save()
        recompute_vendor_customer(self.vendor.id, self.buyer.id)
        self.assertFalse(VendorCustomer.objects.filter(vendor=self.vendor, customer=self.buyer).exists())

    def test_no_completed_orders_returns_none_without_creating_row(self):
        result = recompute_vendor_customer(self.vendor.id, self.buyer.id)
        self.assertIsNone(result)
        self.assertFalse(VendorCustomer.objects.filter(vendor=self.vendor, customer=self.buyer).exists())

    def test_idempotent_rerun_produces_identical_stats(self):
        from django.utils import timezone
        _make_completed_order('ORD-1', self.buyer, self.listing_a, '1000.00', timezone.now())
        _make_completed_order('ORD-2', self.buyer, self.listing_b, '2000.00', timezone.now())

        recompute_vendor_customer(self.vendor.id, self.buyer.id)
        first_count = VendorCustomer.objects.count()
        vc1 = VendorCustomer.objects.get(vendor=self.vendor, customer=self.buyer)

        recompute_vendor_customer(self.vendor.id, self.buyer.id)
        recompute_vendor_customer(self.vendor.id, self.buyer.id)
        second_count = VendorCustomer.objects.count()
        vc2 = VendorCustomer.objects.get(vendor=self.vendor, customer=self.buyer)

        self.assertEqual(first_count, second_count)
        self.assertEqual(vc1.total_amount_spent, vc2.total_amount_spent)
        self.assertEqual(vc1.total_completed_orders, vc2.total_completed_orders)


class SignalTests(TestCase):
    def setUp(self):
        self.vendor = User.objects.create_user(username='vendor', email='vendor@pau.edu.ng', password='pass123', user_type='vendor', is_verified_vendor=True)
        self.buyer = User.objects.create_user(username='buyer', email='buyer@pau.edu.ng', password='pass123')
        self.category = Category.objects.create(title='Beauty', slug='beauty')
        self.listing = Listing.objects.create(title='Lashes', description='x', price=Decimal('1000.00'), vendor=self.vendor, category=self.category, is_available=True)

    def test_order_completion_via_confirm_creates_vendor_customer(self):
        order = Order.objects.create(
            reference='ORD-SIGNAL-1', buyer=self.buyer, listing=self.listing,
            amount=Decimal('1000.00'), status='seller_completed',
        )
        self.assertFalse(VendorCustomer.objects.filter(vendor=self.vendor, customer=self.buyer).exists())

        client = APIClient()
        client.force_authenticate(user=self.buyer)
        from unittest.mock import patch
        with patch('payments.views._transfer_to_vendor'):
            res = client.post(f'/api/orders/orders/{order.id}/confirm/')
        self.assertEqual(res.status_code, 200)

        vc = VendorCustomer.objects.get(vendor=self.vendor, customer=self.buyer)
        self.assertEqual(vc.total_completed_orders, 1)
        self.assertEqual(vc.total_amount_spent, Decimal('1000.00'))


class BackfillCommandTests(TestCase):
    def setUp(self):
        self.vendor1 = User.objects.create_user(username='vendor1', email='vendor1@pau.edu.ng', password='pass123', user_type='vendor', is_verified_vendor=True)
        self.vendor2 = User.objects.create_user(username='vendor2', email='vendor2@pau.edu.ng', password='pass123', user_type='vendor', is_verified_vendor=True)
        self.buyer1 = User.objects.create_user(username='buyer1', email='buyer1@pau.edu.ng', password='pass123')
        self.buyer2 = User.objects.create_user(username='buyer2', email='buyer2@pau.edu.ng', password='pass123')
        self.category = Category.objects.create(title='Beauty', slug='beauty')
        self.listing1 = Listing.objects.create(title='Lashes', description='x', price=Decimal('1000.00'), vendor=self.vendor1, category=self.category, is_available=True)
        self.listing2 = Listing.objects.create(title='Nails', description='x', price=Decimal('1500.00'), vendor=self.vendor2, category=self.category, is_available=True)

        from django.utils import timezone
        now = timezone.now()
        # bulk_create bypasses post_save signals — proves the backfill command itself
        # (not the live signal) is what populates these rows.
        Order.objects.bulk_create([
            Order(reference='BULK-1', buyer=self.buyer1, listing=self.listing1, amount=Decimal('1000.00'), status='completed', paid_at=now, buyer_confirmed_at=now),
            Order(reference='BULK-2', buyer=self.buyer2, listing=self.listing1, amount=Decimal('1000.00'), status='completed', paid_at=now, buyer_confirmed_at=now),
            Order(reference='BULK-3', buyer=self.buyer1, listing=self.listing2, amount=Decimal('1500.00'), status='completed', paid_at=now, buyer_confirmed_at=now),
            Order(reference='BULK-4', buyer=self.buyer1, listing=self.listing1, amount=Decimal('1000.00'), status='pending'),  # should be ignored
        ])

    def test_backfill_creates_correct_pairs(self):
        self.assertEqual(VendorCustomer.objects.count(), 0)
        call_command('backfill_vendor_customers')

        self.assertEqual(VendorCustomer.objects.count(), 3)
        vc = VendorCustomer.objects.get(vendor=self.vendor1, customer=self.buyer1)
        self.assertEqual(vc.total_completed_orders, 1)
        self.assertEqual(vc.total_amount_spent, Decimal('1000.00'))

    def test_backfill_is_idempotent(self):
        call_command('backfill_vendor_customers')
        first_snapshot = list(VendorCustomer.objects.values('vendor_id', 'customer_id', 'total_amount_spent', 'total_completed_orders').order_by('vendor_id', 'customer_id'))

        call_command('backfill_vendor_customers')
        call_command('backfill_vendor_customers')
        second_snapshot = list(VendorCustomer.objects.values('vendor_id', 'customer_id', 'total_amount_spent', 'total_completed_orders').order_by('vendor_id', 'customer_id'))

        self.assertEqual(VendorCustomer.objects.count(), 3)
        self.assertEqual(first_snapshot, second_snapshot)


class VendorCustomerAPITests(TestCase):
    def setUp(self):
        self.vendor_a = User.objects.create_user(username='vendor_a', email='vendor_a@pau.edu.ng', password='pass123', user_type='vendor', is_verified_vendor=True)
        self.vendor_b = User.objects.create_user(username='vendor_b', email='vendor_b@pau.edu.ng', password='pass123', user_type='vendor', is_verified_vendor=True)
        self.buyer = User.objects.create_user(username='buyer', email='buyer@pau.edu.ng', password='pass123')
        self.category = Category.objects.create(title='Beauty', slug='beauty')
        self.listing_a = Listing.objects.create(title='Lashes A', description='x', price=Decimal('1000.00'), vendor=self.vendor_a, category=self.category, is_available=True)
        self.listing_b = Listing.objects.create(title='Lashes B', description='x', price=Decimal('1200.00'), vendor=self.vendor_b, category=self.category, is_available=True)

        from django.utils import timezone
        now = timezone.now()
        _make_completed_order('ORD-A1', self.buyer, self.listing_a, '1000.00', now)
        _make_completed_order('ORD-B1', self.buyer, self.listing_b, '1200.00', now)
        recompute_vendor_customer(self.vendor_a.id, self.buyer.id)
        recompute_vendor_customer(self.vendor_b.id, self.buyer.id)

        self.client = APIClient()

    def test_vendor_sees_only_their_own_customers(self):
        self.client.force_authenticate(user=self.vendor_a)
        res = self.client.get('/api/vendor/customers/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data['results'] if isinstance(res.data, dict) and 'results' in res.data else res.data
        customer_ids = [c['customer'] for c in results]
        self.assertIn(self.buyer.id, customer_ids)
        self.assertEqual(len(results), 1)

    def test_order_history_scoped_to_requesting_vendor_only(self):
        self.client.force_authenticate(user=self.vendor_a)
        res = self.client.get(f'/api/vendor/customers/{self.buyer.id}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data['order_history']), 1)
        self.assertEqual(res.data['order_history'][0]['reference'], 'ORD-A1')

    def test_vendor_cannot_view_another_vendors_customer_detail(self):
        # vendor_b has no VendorCustomer row scoped under vendor_a's queryset — 404.
        self.client.force_authenticate(user=self.vendor_a)
        other_buyer = User.objects.create_user(username='other_buyer', email='other_buyer@pau.edu.ng', password='pass123')
        res = self.client.get(f'/api/vendor/customers/{other_buyer.id}/')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_customer_lifetime_value_matches_total_amount_spent(self):
        self.client.force_authenticate(user=self.vendor_a)
        res = self.client.get(f'/api/vendor/customers/{self.buyer.id}/')
        self.assertEqual(str(res.data['customer_lifetime_value']), str(res.data['total_amount_spent']))

    def test_list_query_count_does_not_grow_with_customer_count(self):
        self.client.force_authenticate(user=self.vendor_a)

        with CaptureQueriesContext(connection) as ctx_one:
            self.client.get('/api/vendor/customers/')
        baseline = len(ctx_one)

        from django.utils import timezone
        for i in range(5):
            buyer = User.objects.create_user(username=f'extra_buyer_{i}', email=f'extra_buyer_{i}@pau.edu.ng', password='pass123')
            _make_completed_order(f'ORD-EXTRA-{i}', buyer, self.listing_a, '1000.00', timezone.now())
            recompute_vendor_customer(self.vendor_a.id, buyer.id)

        with CaptureQueriesContext(connection) as ctx_many:
            self.client.get('/api/vendor/customers/')
        with_more_customers = len(ctx_many)

        self.assertEqual(baseline, with_more_customers)
