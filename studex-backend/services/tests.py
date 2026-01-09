"""
Test suite for services app - categories, listings, transactions
"""
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient, APITestCase
from rest_framework import status
from decimal import Decimal
from django.core.files.uploadedfile import SimpleUploadedFile

from accounts.models import User
from services.models import Category, Listing, Transaction
from orders.models import Order


class CategoryModelTests(TestCase):
    """Test Category model functionality"""

    def test_create_category(self):
        """Test creating a category"""
        category = Category.objects.create(
            title='Food',
            slug='food'
        )

        self.assertEqual(category.title, 'Food')
        self.assertEqual(category.slug, 'food')
        self.assertIsNone(category.image)

    def test_category_str_method(self):
        """Test Category string representation"""
        category = Category.objects.create(
            title='Food',
            slug='food'
        )

        self.assertEqual(str(category), 'Food')

    def test_category_unique_title(self):
        """Test category title must be unique"""
        Category.objects.create(title='Food', slug='food')

        with self.assertRaises(Exception):
            Category.objects.create(title='Food', slug='food-2')

    def test_category_unique_slug(self):
        """Test category slug must be unique"""
        Category.objects.create(title='Food', slug='food')

        with self.assertRaises(Exception):
            Category.objects.create(title='Food Items', slug='food')

    def test_category_ordering(self):
        """Test categories are ordered by title"""
        Category.objects.create(title='Nails', slug='nails')
        Category.objects.create(title='Food', slug='food')
        Category.objects.create(title='Accessories', slug='accessories')

        categories = Category.objects.all()
        self.assertEqual(categories[0].title, 'Accessories')
        self.assertEqual(categories[1].title, 'Food')
        self.assertEqual(categories[2].title, 'Nails')


class ListingModelTests(TestCase):
    """Test Listing model functionality"""

    def setUp(self):
        # Create vendor
        self.vendor = User.objects.create_user(
            username='vendor',
            email='vendor@pau.edu.ng',
            password='pass123',
            user_type='vendor',
            is_verified_vendor=True,
            business_name='Test Business'
        )

        # Create category
        self.category = Category.objects.create(
            title='Food',
            slug='food'
        )

    def test_create_listing(self):
        """Test creating a listing"""
        listing = Listing.objects.create(
            vendor=self.vendor,
            category=self.category,
            title='Jollof Rice',
            description='Delicious jollof rice with chicken',
            price=Decimal('1000.00')
        )

        self.assertEqual(listing.vendor, self.vendor)
        self.assertEqual(listing.category, self.category)
        self.assertEqual(listing.title, 'Jollof Rice')
        self.assertEqual(listing.price, Decimal('1000.00'))
        self.assertTrue(listing.is_available)

    def test_listing_str_method(self):
        """Test Listing string representation"""
        listing = Listing.objects.create(
            vendor=self.vendor,
            category=self.category,
            title='Jollof Rice',
            description='Delicious jollof rice',
            price=Decimal('1000.00')
        )

        self.assertEqual(str(listing), f'Jollof Rice by {self.vendor.username}')

    def test_listing_default_available(self):
        """Test listing is available by default"""
        listing = Listing.objects.create(
            vendor=self.vendor,
            category=self.category,
            title='Jollof Rice',
            description='Delicious jollof rice',
            price=Decimal('1000.00')
        )

        self.assertTrue(listing.is_available)

    def test_listing_can_be_unavailable(self):
        """Test listing can be marked as unavailable"""
        listing = Listing.objects.create(
            vendor=self.vendor,
            category=self.category,
            title='Jollof Rice',
            description='Delicious jollof rice',
            price=Decimal('1000.00'),
            is_available=False
        )

        self.assertFalse(listing.is_available)

    def test_listing_timestamps(self):
        """Test listing has created_at and updated_at"""
        listing = Listing.objects.create(
            vendor=self.vendor,
            category=self.category,
            title='Jollof Rice',
            description='Delicious jollof rice',
            price=Decimal('1000.00')
        )

        self.assertIsNotNone(listing.created_at)
        self.assertIsNotNone(listing.updated_at)

    def test_listing_ordering(self):
        """Test listings ordered by created_at descending"""
        listing1 = Listing.objects.create(
            vendor=self.vendor,
            category=self.category,
            title='Jollof Rice',
            description='Delicious jollof rice',
            price=Decimal('1000.00')
        )

        listing2 = Listing.objects.create(
            vendor=self.vendor,
            category=self.category,
            title='Fried Rice',
            description='Delicious fried rice',
            price=Decimal('1200.00')
        )

        listings = Listing.objects.all()
        self.assertEqual(listings[0], listing2)  # Newest first
        self.assertEqual(listings[1], listing1)


class TransactionModelTests(TestCase):
    """Test Transaction model functionality"""

    def setUp(self):
        # Create buyer and vendor
        self.buyer = User.objects.create_user(
            username='buyer',
            email='buyer@pau.edu.ng',
            password='pass123'
        )

        self.vendor = User.objects.create_user(
            username='vendor',
            email='vendor@pau.edu.ng',
            password='pass123',
            user_type='vendor',
            is_verified_vendor=True
        )

        # Create category and listing
        self.category = Category.objects.create(
            title='Food',
            slug='food'
        )

        self.listing = Listing.objects.create(
            vendor=self.vendor,
            category=self.category,
            title='Jollof Rice',
            description='Delicious jollof rice',
            price=Decimal('1000.00')
        )

        # Create order
        self.order = Order.objects.create(
            buyer=self.buyer,
            listing=self.listing,
            amount=Decimal('1000.00')
        )

    def test_create_transaction(self):
        """Test creating a transaction"""
        transaction = Transaction.objects.create(
            vendor=self.vendor,
            order=self.order,
            amount=Decimal('950.00'),
            status='in_escrow'
        )

        self.assertEqual(transaction.vendor, self.vendor)
        self.assertEqual(transaction.order, self.order)
        self.assertEqual(transaction.amount, Decimal('950.00'))
        self.assertEqual(transaction.status, 'in_escrow')

    def test_transaction_status_choices(self):
        """Test transaction status options"""
        statuses = ['in_escrow', 'released', 'withdrawn']

        for status_choice in statuses:
            transaction = Transaction.objects.create(
                vendor=self.vendor,
                order=self.order,
                amount=Decimal('950.00'),
                status=status_choice
            )
            self.assertEqual(transaction.status, status_choice)
            transaction.delete()

    def test_transaction_default_status(self):
        """Test transaction default status is in_escrow"""
        transaction = Transaction.objects.create(
            vendor=self.vendor,
            order=self.order,
            amount=Decimal('950.00')
        )

        self.assertEqual(transaction.status, 'in_escrow')

    def test_transaction_str_method(self):
        """Test Transaction string representation"""
        transaction = Transaction.objects.create(
            vendor=self.vendor,
            order=self.order,
            amount=Decimal('950.00'),
            status='released'
        )

        self.assertIn('950', str(transaction))
        self.assertIn(self.vendor.username, str(transaction))

    def test_transaction_timestamps(self):
        """Test transaction timestamp fields"""
        transaction = Transaction.objects.create(
            vendor=self.vendor,
            order=self.order,
            amount=Decimal('950.00'),
            status='in_escrow'
        )

        self.assertIsNotNone(transaction.created_at)
        self.assertIsNone(transaction.released_at)
        self.assertIsNone(transaction.withdrawn_at)

        # Release transaction
        transaction.status = 'released'
        transaction.released_at = timezone.now()
        transaction.save()

        self.assertIsNotNone(transaction.released_at)


class CategoryAPITests(APITestCase):
    """Test Category API endpoints"""

    def setUp(self):
        self.client = APIClient()

        # Create categories
        Category.objects.create(title='Food', slug='food')
        Category.objects.create(title='Nails', slug='nails')

        self.category_url = '/api/services/categories/'

    def test_list_categories_unauthenticated(self):
        """Test listing categories without authentication"""
        response = self.client.get(self.category_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)

    def test_list_categories_authenticated(self):
        """Test listing categories with authentication"""
        user = User.objects.create_user(
            username='testuser',
            email='test@pau.edu.ng',
            password='pass123'
        )
        self.client.force_authenticate(user=user)

        response = self.client.get(self.category_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)

    def test_retrieve_category(self):
        """Test retrieving a single category"""
        category = Category.objects.first()
        response = self.client.get(f'{self.category_url}{category.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['title'], category.title)


class ListingAPITests(APITestCase):
    """Test Listing API endpoints"""

    def setUp(self):
        self.client = APIClient()

        # Create buyer and vendor
        self.buyer = User.objects.create_user(
            username='buyer',
            email='buyer@pau.edu.ng',
            password='pass123',
            user_type='student'
        )

        self.vendor = User.objects.create_user(
            username='vendor',
            email='vendor@pau.edu.ng',
            password='pass123',
            user_type='vendor',
            is_verified_vendor=True,
            business_name='Test Business'
        )

        self.unverified_vendor = User.objects.create_user(
            username='unverified',
            email='unverified@pau.edu.ng',
            password='pass123',
            user_type='vendor',
            is_verified_vendor=False
        )

        # Create category
        self.category = Category.objects.create(
            title='Food',
            slug='food'
        )

        # Create listings
        self.listing = Listing.objects.create(
            vendor=self.vendor,
            category=self.category,
            title='Jollof Rice',
            description='Delicious jollof rice',
            price=Decimal('1000.00'),
            is_available=True
        )

        self.listing_url = '/api/services/listings/'

    def test_list_listings_unauthenticated(self):
        """Test listing products without authentication"""
        response = self.client.get(self.listing_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(response.data), 1)

    def test_list_listings_shows_only_available(self):
        """Test unauthenticated users see only available listings"""
        # Create unavailable listing
        Listing.objects.create(
            vendor=self.vendor,
            category=self.category,
            title='Unavailable Item',
            description='Not available',
            price=Decimal('500.00'),
            is_available=False
        )

        response = self.client.get(self.listing_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Should only show available listings
        for listing in response.data:
            self.assertTrue(listing['is_available'])

    def test_retrieve_listing(self):
        """Test retrieving a single listing"""
        response = self.client.get(f'{self.listing_url}{self.listing.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['title'], 'Jollof Rice')

    def test_create_listing_unauthenticated(self):
        """Test creating listing fails without authentication"""
        listing_data = {
            'category': 'food',
            'title': 'Fried Rice',
            'description': 'Delicious fried rice',
            'price': '1200.00'
        }

        response = self.client.post(self.listing_url, listing_data)
        self.assertIn(response.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

    def test_create_listing_as_student(self):
        """Test students cannot create listings"""
        self.client.force_authenticate(user=self.buyer)

        listing_data = {
            'category': 'food',
            'title': 'Fried Rice',
            'description': 'Delicious fried rice',
            'price': '1200.00'
        }

        response = self.client.post(self.listing_url, listing_data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_listing_as_unverified_vendor(self):
        """Test unverified vendors cannot create listings"""
        self.client.force_authenticate(user=self.unverified_vendor)

        listing_data = {
            'category': 'food',
            'title': 'Fried Rice',
            'description': 'Delicious fried rice',
            'price': '1200.00'
        }

        response = self.client.post(self.listing_url, listing_data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_listing_as_verified_vendor(self):
        """Test verified vendors can create listings"""
        self.client.force_authenticate(user=self.vendor)

        listing_data = {
            'category': 'food',
            'title': 'Fried Rice',
            'description': 'Delicious fried rice',
            'price': '1200.00'
        }

        response = self.client.post(self.listing_url, listing_data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['title'], 'Fried Rice')
        self.assertEqual(response.data['vendor'], self.vendor.username)

    def test_update_listing_as_vendor(self):
        """Test vendor can update their own listing"""
        self.client.force_authenticate(user=self.vendor)

        update_data = {
            'category': 'food',
            'title': 'Jollof Rice Special',
            'description': 'Extra special jollof rice',
            'price': '1500.00'
        }

        response = self.client.put(f'{self.listing_url}{self.listing.id}/', update_data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['title'], 'Jollof Rice Special')

    def test_filter_listings_by_category(self):
        """Test filtering listings by category"""
        response = self.client.get(f'{self.listing_url}?category=food')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(response.data), 1)

    def test_search_listings(self):
        """Test searching listings by title"""
        response = self.client.get(f'{self.listing_url}?search=Jollof')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(response.data), 1)

    def test_vendor_sees_own_listings(self):
        """Test vendor sees only their own listings"""
        self.client.force_authenticate(user=self.vendor)

        # Create unavailable listing
        Listing.objects.create(
            vendor=self.vendor,
            category=self.category,
            title='Unavailable Item',
            description='Not available',
            price=Decimal('500.00'),
            is_available=False
        )

        response = self.client.get(self.listing_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Vendor should see all their listings including unavailable
        self.assertEqual(len(response.data), 2)


class TransactionAPITests(APITestCase):
    """Test Transaction API endpoints"""

    def setUp(self):
        self.client = APIClient()

        # Create buyer and vendor
        self.buyer = User.objects.create_user(
            username='buyer',
            email='buyer@pau.edu.ng',
            password='pass123'
        )

        self.vendor = User.objects.create_user(
            username='vendor',
            email='vendor@pau.edu.ng',
            password='pass123',
            user_type='vendor',
            is_verified_vendor=True
        )

        # Create category and listing
        self.category = Category.objects.create(
            title='Food',
            slug='food'
        )

        self.listing = Listing.objects.create(
            vendor=self.vendor,
            category=self.category,
            title='Jollof Rice',
            description='Delicious jollof rice',
            price=Decimal('1000.00')
        )

        # Create order
        self.order = Order.objects.create(
            buyer=self.buyer,
            listing=self.listing,
            amount=Decimal('1000.00')
        )

        # Create transaction
        self.transaction = Transaction.objects.create(
            vendor=self.vendor,
            order=self.order,
            amount=Decimal('950.00'),
            status='in_escrow'
        )

        self.transaction_url = '/api/services/transactions/'

    def test_list_transactions_unauthenticated(self):
        """Test listing transactions fails without authentication"""
        response = self.client.get(self.transaction_url)
        self.assertIn(response.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

    def test_list_transactions_as_student(self):
        """Test students cannot see transactions"""
        self.client.force_authenticate(user=self.buyer)

        response = self.client.get(self.transaction_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 0)  # Empty queryset

    def test_list_transactions_as_vendor(self):
        """Test vendors see only their own transactions"""
        self.client.force_authenticate(user=self.vendor)

        response = self.client.get(self.transaction_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(response.data), 1)


class ListingAvailabilityTests(TestCase):
    """Test listing availability functionality"""

    def setUp(self):
        self.vendor = User.objects.create_user(
            username='vendor',
            email='vendor@pau.edu.ng',
            password='pass123',
            user_type='vendor',
            is_verified_vendor=True
        )

        self.category = Category.objects.create(
            title='Food',
            slug='food'
        )

        self.listing = Listing.objects.create(
            vendor=self.vendor,
            category=self.category,
            title='Jollof Rice',
            description='Delicious jollof rice',
            price=Decimal('1000.00'),
            is_available=True
        )

    def test_toggle_availability(self):
        """Test toggling listing availability"""
        self.assertTrue(self.listing.is_available)

        # Mark as unavailable
        self.listing.is_available = False
        self.listing.save()

        self.listing.refresh_from_db()
        self.assertFalse(self.listing.is_available)

        # Mark as available again
        self.listing.is_available = True
        self.listing.save()

        self.listing.refresh_from_db()
        self.assertTrue(self.listing.is_available)


class VendorListingTests(TestCase):
    """Test vendor-specific listing operations"""

    def setUp(self):
        self.vendor1 = User.objects.create_user(
            username='vendor1',
            email='vendor1@pau.edu.ng',
            password='pass123',
            user_type='vendor',
            is_verified_vendor=True
        )

        self.vendor2 = User.objects.create_user(
            username='vendor2',
            email='vendor2@pau.edu.ng',
            password='pass123',
            user_type='vendor',
            is_verified_vendor=True
        )

        self.category = Category.objects.create(
            title='Food',
            slug='food'
        )

        # Create listings for vendor1
        Listing.objects.create(
            vendor=self.vendor1,
            category=self.category,
            title='Listing 1',
            description='Description 1',
            price=Decimal('1000.00')
        )

        Listing.objects.create(
            vendor=self.vendor1,
            category=self.category,
            title='Listing 2',
            description='Description 2',
            price=Decimal('1500.00')
        )

        # Create listing for vendor2
        Listing.objects.create(
            vendor=self.vendor2,
            category=self.category,
            title='Listing 3',
            description='Description 3',
            price=Decimal('2000.00')
        )

    def test_filter_listings_by_vendor(self):
        """Test filtering listings by vendor"""
        vendor1_listings = Listing.objects.filter(vendor=self.vendor1)
        vendor2_listings = Listing.objects.filter(vendor=self.vendor2)

        self.assertEqual(vendor1_listings.count(), 2)
        self.assertEqual(vendor2_listings.count(), 1)

    def test_vendor_total_listings(self):
        """Test counting total listings per vendor"""
        self.assertEqual(self.vendor1.listings.count(), 2)
        self.assertEqual(self.vendor2.listings.count(), 1)


class ListingQueryTests(TestCase):
    """Test listing filtering and queries"""

    def setUp(self):
        self.vendor = User.objects.create_user(
            username='vendor',
            email='vendor@pau.edu.ng',
            password='pass123',
            user_type='vendor',
            is_verified_vendor=True
        )

        self.category1 = Category.objects.create(
            title='Food',
            slug='food'
        )

        self.category2 = Category.objects.create(
            title='Nails',
            slug='nails'
        )

        # Create listings
        Listing.objects.create(
            vendor=self.vendor,
            category=self.category1,
            title='Jollof Rice',
            description='Delicious jollof rice',
            price=Decimal('1000.00'),
            is_available=True
        )

        Listing.objects.create(
            vendor=self.vendor,
            category=self.category1,
            title='Fried Rice',
            description='Delicious fried rice',
            price=Decimal('1200.00'),
            is_available=False
        )

        Listing.objects.create(
            vendor=self.vendor,
            category=self.category2,
            title='Gel Nails',
            description='Beautiful gel nails',
            price=Decimal('3000.00'),
            is_available=True
        )

    def test_filter_available_listings(self):
        """Test filtering available listings"""
        available = Listing.objects.filter(is_available=True)
        self.assertEqual(available.count(), 2)

    def test_filter_by_category(self):
        """Test filtering listings by category"""
        food_listings = Listing.objects.filter(category=self.category1)
        nails_listings = Listing.objects.filter(category=self.category2)

        self.assertEqual(food_listings.count(), 2)
        self.assertEqual(nails_listings.count(), 1)

    def test_filter_by_price_range(self):
        """Test filtering listings by price range"""
        affordable = Listing.objects.filter(price__lte=Decimal('1500.00'))
        expensive = Listing.objects.filter(price__gt=Decimal('1500.00'))

        self.assertEqual(affordable.count(), 2)
        self.assertEqual(expensive.count(), 1)
