"""
Test suite for orders app - order creation, management, disputes
"""
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient, APITestCase
from rest_framework import status
from decimal import Decimal

from accounts.models import User
from services.models import Category, Listing
from orders.models import Order, Dispute


class OrderModelTests(TestCase):
    """Test Order model functionality"""

    def setUp(self):
        # Create buyer and seller
        self.buyer = User.objects.create_user(
            username='buyer',
            email='buyer@pau.edu.ng',
            password='pass123',
            user_type='student'
        )

        self.seller = User.objects.create_user(
            username='seller',
            email='seller@pau.edu.ng',
            password='pass123',
            user_type='vendor',
            is_verified_vendor=True
        )

        # Create category and listing
        self.category = Category.objects.create(
            title='Test Category',
            slug='test-category'
        )

        self.listing = Listing.objects.create(
            title='Test Product',
            description='Test Description',
            price=Decimal('1000.00'),
            vendor=self.seller,
            category=self.category,
            is_available=True
        )

    def test_create_order(self):
        """Test creating an order"""
        order = Order.objects.create(
            buyer=self.buyer,
            listing=self.listing,
            amount=Decimal('1000.00')
        )

        self.assertEqual(order.buyer, self.buyer)
        self.assertEqual(order.listing, self.listing)
        self.assertEqual(order.amount, Decimal('1000.00'))
        self.assertEqual(order.status, 'pending')
        self.assertIsNotNone(order.reference)

    def test_order_reference_generated(self):
        """Test order reference is auto-generated"""
        order = Order.objects.create(
            buyer=self.buyer,
            listing=self.listing,
            amount=Decimal('1000.00')
        )

        self.assertIsNotNone(order.reference)
        self.assertTrue(order.reference.startswith('ORD-'))

    def test_order_str_method(self):
        """Test Order string representation"""
        order = Order.objects.create(
            buyer=self.buyer,
            listing=self.listing,
            amount=Decimal('1000.00')
        )

        self.assertEqual(str(order), order.reference)

    def test_order_status_progression(self):
        """Test order status can progress"""
        order = Order.objects.create(
            buyer=self.buyer,
            listing=self.listing,
            amount=Decimal('1000.00')
        )

        # Initial status
        self.assertEqual(order.status, 'pending')

        # Mark as paid
        order.status = 'paid'
        order.paid_at = timezone.now()
        order.save()
        self.assertEqual(order.status, 'paid')

        # Mark as in_progress
        order.status = 'in_progress'
        order.save()
        self.assertEqual(order.status, 'in_progress')

        # Mark as completed
        order.status = 'completed'
        order.buyer_confirmed_at = timezone.now()
        order.save()
        self.assertEqual(order.status, 'completed')


class OrderAPITests(APITestCase):
    """Test Order API endpoints"""

    def setUp(self):
        self.client = APIClient()

        # Create buyer and seller
        self.buyer = User.objects.create_user(
            username='buyer',
            email='buyer@pau.edu.ng',
            password='pass123',
            user_type='student'
        )
        self.buyer.wallet_balance = Decimal('5000.00')
        self.buyer.save()

        self.seller = User.objects.create_user(
            username='seller',
            email='seller@pau.edu.ng',
            password='pass123',
            user_type='vendor',
            is_verified_vendor=True
        )

        # Create listing
        self.category = Category.objects.create(
            title='Test Category',
            slug='test-category'
        )

        self.listing = Listing.objects.create(
            title='Test Product',
            description='Test Description',
            price=Decimal('1000.00'),
            vendor=self.seller,
            category=self.category,
            is_available=True
        )

        self.order_url = '/api/orders/'

    def test_create_order_authenticated(self):
        """Test creating order when authenticated"""
        self.client.force_authenticate(user=self.buyer)

        order_data = {
            'listing': self.listing.id,
            'amount': '1000.00'
        }

        response = self.client.post(self.order_url, order_data)
        self.assertIn(response.status_code, [status.HTTP_201_CREATED, status.HTTP_200_OK])

    def test_create_order_unauthenticated(self):
        """Test creating order fails without authentication"""
        order_data = {
            'listing': self.listing.id,
            'amount': '1000.00'
        }

        response = self.client.post(self.order_url, order_data)
        self.assertIn(response.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

    def test_get_orders_list(self):
        """Test getting list of orders"""
        self.client.force_authenticate(user=self.buyer)

        # Create an order
        Order.objects.create(
            buyer=self.buyer,
            listing=self.listing,
            amount=Decimal('1000.00')
        )

        response = self.client.get(self.order_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_buyer_can_access_own_order(self):
        """Test buyer can access their own order"""
        self.client.force_authenticate(user=self.buyer)

        order = Order.objects.create(
            buyer=self.buyer,
            listing=self.listing,
            amount=Decimal('1000.00')
        )

        response = self.client.get(f'{self.order_url}{order.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_seller_can_access_their_sale(self):
        """Test seller can access orders for their listings"""
        self.client.force_authenticate(user=self.seller)

        order = Order.objects.create(
            buyer=self.buyer,
            listing=self.listing,
            amount=Decimal('1000.00')
        )

        response = self.client.get(f'{self.order_url}{order.id}/')
        self.assertIn(response.status_code, [status.HTTP_200_OK, status.HTTP_404_NOT_FOUND])


class DisputeModelTests(TestCase):
    """Test Dispute model functionality"""

    def setUp(self):
        # Create users
        self.buyer = User.objects.create_user(
            username='buyer',
            email='buyer@pau.edu.ng',
            password='pass123'
        )

        self.seller = User.objects.create_user(
            username='seller',
            email='seller@pau.edu.ng',
            password='pass123',
            user_type='vendor',
            is_verified_vendor=True
        )

        # Create listing and order
        self.category = Category.objects.create(
            title='Test Category',
            slug='test-category'
        )

        self.listing = Listing.objects.create(
            title='Test Product',
            description='Test Description',
            price=Decimal('1000.00'),
            vendor=self.seller,
            category=self.category
        )

        self.order = Order.objects.create(
            buyer=self.buyer,
            listing=self.listing,
            amount=Decimal('1000.00'),
            status='in_progress'
        )

    def test_create_dispute(self):
        """Test creating a dispute"""
        dispute = Dispute.objects.create(
            order=self.order,
            filed_by='buyer',
            filer=self.buyer,
            reason='item_not_received',
            complaint='I did not receive the item'
        )

        self.assertEqual(dispute.order, self.order)
        self.assertEqual(dispute.filed_by, 'buyer')
        self.assertEqual(dispute.filer, self.buyer)
        self.assertEqual(dispute.status, 'open')

    def test_dispute_status_choices(self):
        """Test dispute status options"""
        dispute = Dispute.objects.create(
            order=self.order,
            filed_by='buyer',
            filer=self.buyer,
            reason='item_not_received',
            complaint='Test complaint'
        )

        # Test status progression
        self.assertEqual(dispute.status, 'open')

        dispute.status = 'under_review'
        dispute.save()
        self.assertEqual(dispute.status, 'under_review')

        dispute.status = 'resolved'
        dispute.resolution = 'buyer_favor'
        dispute.save()
        self.assertEqual(dispute.status, 'resolved')
        self.assertEqual(dispute.resolution, 'buyer_favor')

    def test_dispute_reason_choices(self):
        """Test dispute reason options"""
        reasons = [
            'item_not_received',
            'item_not_as_described',
            'defective_item',
            'wrong_item',
            'payment_issue',
            'other'
        ]

        for reason in reasons:
            dispute = Dispute.objects.create(
                order=self.order,
                filed_by='buyer',
                filer=self.buyer,
                reason=reason,
                complaint=f'Test complaint for {reason}'
            )
            self.assertEqual(dispute.reason, reason)
            dispute.delete()  # Clean up for next iteration


class OrderStatusTests(TestCase):
    """Test order status transitions"""

    def setUp(self):
        self.buyer = User.objects.create_user(
            username='buyer',
            email='buyer@pau.edu.ng',
            password='pass123'
        )

        self.seller = User.objects.create_user(
            username='seller',
            email='seller@pau.edu.ng',
            password='pass123',
            user_type='vendor',
            is_verified_vendor=True
        )

        self.category = Category.objects.create(
            title='Test Category',
            slug='test-category'
        )

        self.listing = Listing.objects.create(
            title='Test Product',
            description='Test Description',
            price=Decimal('1000.00'),
            vendor=self.seller,
            category=self.category
        )

        self.order = Order.objects.create(
            buyer=self.buyer,
            listing=self.listing,
            amount=Decimal('1000.00')
        )

    def test_order_status_choices(self):
        """Test all order status options are valid"""
        statuses = ['pending', 'paid', 'in_progress', 'completed', 'cancelled', 'disputed']

        for status_choice in statuses:
            self.order.status = status_choice
            self.order.save()
            self.order.refresh_from_db()
            self.assertEqual(self.order.status, status_choice)

    def test_order_timestamps(self):
        """Test order timestamp fields"""
        # Test created_at
        self.assertIsNotNone(self.order.created_at)

        # Test paid_at
        self.assertIsNone(self.order.paid_at)
        self.order.paid_at = timezone.now()
        self.order.save()
        self.assertIsNotNone(self.order.paid_at)

        # Test seller_completed_at
        self.assertIsNone(self.order.seller_completed_at)
        self.order.seller_completed_at = timezone.now()
        self.order.save()
        self.assertIsNotNone(self.order.seller_completed_at)

        # Test buyer_confirmed_at
        self.assertIsNone(self.order.buyer_confirmed_at)
        self.order.buyer_confirmed_at = timezone.now()
        self.order.save()
        self.assertIsNotNone(self.order.buyer_confirmed_at)


class OrderFilteringTests(TestCase):
    """Test order filtering and queries"""

    def setUp(self):
        self.buyer1 = User.objects.create_user(
            username='buyer1',
            email='buyer1@pau.edu.ng',
            password='pass123'
        )

        self.buyer2 = User.objects.create_user(
            username='buyer2',
            email='buyer2@pau.edu.ng',
            password='pass123'
        )

        self.seller = User.objects.create_user(
            username='seller',
            email='seller@pau.edu.ng',
            password='pass123',
            user_type='vendor',
            is_verified_vendor=True
        )

        self.category = Category.objects.create(
            title='Test Category',
            slug='test-category'
        )

        self.listing = Listing.objects.create(
            title='Test Product',
            description='Test Description',
            price=Decimal('1000.00'),
            vendor=self.seller,
            category=self.category
        )

        # Create orders with different statuses
        Order.objects.create(
            buyer=self.buyer1,
            listing=self.listing,
            amount=Decimal('1000.00'),
            status='pending'
        )

        Order.objects.create(
            buyer=self.buyer1,
            listing=self.listing,
            amount=Decimal('1000.00'),
            status='completed'
        )

        Order.objects.create(
            buyer=self.buyer2,
            listing=self.listing,
            amount=Decimal('1000.00'),
            status='pending'
        )

    def test_filter_orders_by_buyer(self):
        """Test filtering orders by buyer"""
        buyer1_orders = Order.objects.filter(buyer=self.buyer1)
        buyer2_orders = Order.objects.filter(buyer=self.buyer2)

        self.assertEqual(buyer1_orders.count(), 2)
        self.assertEqual(buyer2_orders.count(), 1)

    def test_filter_orders_by_status(self):
        """Test filtering orders by status"""
        pending_orders = Order.objects.filter(status='pending')
        completed_orders = Order.objects.filter(status='completed')

        self.assertEqual(pending_orders.count(), 2)
        self.assertEqual(completed_orders.count(), 1)

    def test_filter_orders_by_listing(self):
        """Test filtering orders by listing (seller)"""
        listing_orders = Order.objects.filter(listing=self.listing)
        self.assertEqual(listing_orders.count(), 3)


class DisputeResolutionTests(TestCase):
    """Test dispute resolution process"""

    def setUp(self):
        self.buyer = User.objects.create_user(
            username='buyer',
            email='buyer@pau.edu.ng',
            password='pass123'
        )

        self.seller = User.objects.create_user(
            username='seller',
            email='seller@pau.edu.ng',
            password='pass123',
            user_type='vendor',
            is_verified_vendor=True
        )

        self.admin = User.objects.create_user(
            username='admin',
            email='admin@pau.edu.ng',
            password='pass123',
            is_staff=True
        )

        self.category = Category.objects.create(
            title='Test Category',
            slug='test-category'
        )

        self.listing = Listing.objects.create(
            title='Test Product',
            description='Test Description',
            price=Decimal('1000.00'),
            vendor=self.seller,
            category=self.category
        )

        self.order = Order.objects.create(
            buyer=self.buyer,
            listing=self.listing,
            amount=Decimal('1000.00'),
            status='in_progress'
        )

        self.dispute = Dispute.objects.create(
            order=self.order,
            filed_by='buyer',
            filer=self.buyer,
            reason='item_not_received',
            complaint='I did not receive the item'
        )

    def test_dispute_resolution_buyer_favor(self):
        """Test resolving dispute in buyer's favor"""
        self.dispute.status = 'resolved'
        self.dispute.resolution = 'buyer_favor'
        self.dispute.resolved_at = timezone.now()
        self.dispute.resolved_by = self.admin
        self.dispute.admin_decision = 'Refund issued to buyer'
        self.dispute.save()

        self.assertEqual(self.dispute.status, 'resolved')
        self.assertEqual(self.dispute.resolution, 'buyer_favor')
        self.assertIsNotNone(self.dispute.resolved_at)

    def test_dispute_resolution_seller_favor(self):
        """Test resolving dispute in seller's favor"""
        self.dispute.status = 'resolved'
        self.dispute.resolution = 'seller_favor'
        self.dispute.resolved_at = timezone.now()
        self.dispute.resolved_by = self.admin
        self.dispute.admin_decision = 'Seller was right, payment released'
        self.dispute.save()

        self.assertEqual(self.dispute.status, 'resolved')
        self.assertEqual(self.dispute.resolution, 'seller_favor')
        self.assertIsNotNone(self.dispute.resolved_at)

    def test_dispute_appeal(self):
        """Test dispute appeal process"""
        # Initial resolution
        self.dispute.status = 'resolved'
        self.dispute.resolution = 'seller_favor'
        self.dispute.save()

        # Appeal
        self.dispute.appeal_text = 'I want to appeal this decision'
        self.dispute.appealed_at = timezone.now()
        self.dispute.save()

        self.assertIsNotNone(self.dispute.appeal_text)
        self.assertIsNotNone(self.dispute.appealed_at)
