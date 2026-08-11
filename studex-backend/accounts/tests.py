"""
Test suite for accounts app - authentication, user management, permissions
"""
from decimal import Decimal
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.utils import timezone
from datetime import timedelta
from rest_framework.test import APIClient, APITestCase
from rest_framework import status
from accounts.models import User, Profile, SellerApplication

User = get_user_model()


class UserModelTests(TestCase):
    """Test User model functionality"""

    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            email='test@pau.edu.ng',
            password='testpass123',
            user_type='student'
        )

    def test_create_user(self):
        """Test creating a user"""
        self.assertEqual(self.user.email, 'test@pau.edu.ng')
        self.assertEqual(self.user.user_type, 'student')
        self.assertTrue(self.user.check_password('testpass123'))

    def test_create_vendor_user(self):
        """Test creating a vendor user"""
        vendor = User.objects.create_user(
            username='vendor1',
            email='vendor@pau.edu.ng',
            password='vendorpass123',
            user_type='vendor',
            business_name='Test Business'
        )
        self.assertEqual(vendor.user_type, 'vendor')
        self.assertEqual(vendor.business_name, 'Test Business')
        self.assertFalse(vendor.is_verified_vendor)

    def test_user_profile_created(self):
        """Test that Profile is auto-created with User"""
        self.assertTrue(hasattr(self.user, 'profile'))
        self.assertIsInstance(self.user.profile, Profile)

    def test_user_str_method(self):
        """Test User string representation"""
        self.assertEqual(str(self.user), 'testuser (test@pau.edu.ng)')

    def test_wallet_balance_default(self):
        """Test wallet balance defaults to 0"""
        self.assertEqual(self.user.wallet_balance, 0)


class ProfileModelTests(TestCase):
    """Test Profile model functionality"""

    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            email='test@pau.edu.ng',
            password='testpass123'
        )
        self.profile = self.user.profile

    def test_profile_fields(self):
        """Test profile fields have correct defaults"""
        self.assertEqual(self.profile.total_orders, 0)
        self.assertEqual(self.profile.total_sales, 0)
        self.assertEqual(self.profile.rating, 0.0)
        self.assertTrue(self.profile.notifications_enabled)
        self.assertTrue(self.profile.email_notifications)

    def test_profile_update(self):
        """Test updating profile fields"""
        self.profile.whatsapp = '+2348012345678'
        self.profile.instagram = '@testuser'
        self.profile.save()

        updated_profile = Profile.objects.get(user=self.user)
        self.assertEqual(updated_profile.whatsapp, '+2348012345678')
        self.assertEqual(updated_profile.instagram, '@testuser')


class AuthenticationAPITests(APITestCase):
    """Test authentication API endpoints"""

    def setUp(self):
        self.client = APIClient()
        self.register_url = '/api/auth/register/'
        self.login_url = '/api/auth/login/'
        self.profile_url = '/api/auth/profile/'
        self.profile_update_url = '/api/auth/profile/update/'

        self.user_data = {
            'username': 'testuser',
            'email': 'test@pau.edu.ng',
            'password': 'testpass123',
            'user_type': 'student'
        }

    def test_register_user_success(self):
        """Test user registration with valid data"""
        cache.set(f"otp_verified:{self.user_data['email']}", True, timeout=300)
        # UserRegistrationSerializer requires password2 (confirm password) and a
        # password with an uppercase letter — self.user_data['password'] is all
        # lowercase and is shared with tests that don't go through this validator.
        registration_data = {
            **self.user_data,
            'password': 'Testpass123',
            'password2': 'Testpass123',
        }
        response = self.client.post(self.register_url, registration_data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('user', response.data)
        self.assertIn('tokens', response.data)
        self.assertEqual(response.data['user']['email'], 'test@pau.edu.ng')

    def test_register_user_stamps_disclaimer_acceptance(self):
        """
        Evidence of consent (NDPA) — src/app/auth/page.tsx sends
        disclaimer_accepted only once the signup checkbox (linking Terms &
        Privacy Policy) is checked; register_user must persist it with a
        timestamp at the moment it happened, not leave it to a later
        profile-update call that might never come.
        """
        cache.set(f"otp_verified:{self.user_data['email']}", True, timeout=300)
        registration_data = {
            **self.user_data,
            'password': 'Testpass123',
            'password2': 'Testpass123',
            'disclaimer_accepted': True,
        }
        response = self.client.post(self.register_url, registration_data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        user = User.objects.get(email='test@pau.edu.ng')
        self.assertTrue(user.profile.disclaimer_accepted)
        self.assertIsNotNone(user.profile.disclaimer_accepted_at)

    def test_register_user_without_disclaimer_flag_leaves_it_unaccepted(self):
        cache.set(f"otp_verified:{self.user_data['email']}", True, timeout=300)
        registration_data = {
            **self.user_data,
            'password': 'Testpass123',
            'password2': 'Testpass123',
        }
        response = self.client.post(self.register_url, registration_data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        user = User.objects.get(email='test@pau.edu.ng')
        self.assertFalse(user.profile.disclaimer_accepted)
        self.assertIsNone(user.profile.disclaimer_accepted_at)

    def test_register_user_missing_fields(self):
        """Test registration fails with missing fields"""
        incomplete_data = {'username': 'testuser'}
        response = self.client.post(self.register_url, incomplete_data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_register_duplicate_email(self):
        """Test registration fails with duplicate email"""
        User.objects.create_user(**self.user_data)
        response = self.client.post(self.register_url, self.user_data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_login_success(self):
        """Test login with correct credentials"""
        User.objects.create_user(**self.user_data)
        login_data = {
            'email': 'test@pau.edu.ng',
            'password': 'testpass123'
        }
        response = self.client.post(self.login_url, login_data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('tokens', response.data)
        self.assertIn('access', response.data['tokens'])
        self.assertIn('refresh', response.data['tokens'])

    def test_login_wrong_password(self):
        """Test login fails with wrong password"""
        User.objects.create_user(**self.user_data)
        login_data = {
            'email': 'test@pau.edu.ng',
            'password': 'wrongpassword'
        }
        response = self.client.post(self.login_url, login_data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_login_nonexistent_user(self):
        """Test login fails for nonexistent user"""
        login_data = {
            'email': 'nonexistent@pau.edu.ng',
            'password': 'somepassword'
        }
        response = self.client.post(self.login_url, login_data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_get_profile_authenticated(self):
        """Test getting profile with authentication"""
        user = User.objects.create_user(**self.user_data)
        self.client.force_authenticate(user=user)

        response = self.client.get(self.profile_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['email'], 'test@pau.edu.ng')

    def test_get_profile_unauthenticated(self):
        """Test getting profile without authentication fails"""
        response = self.client.get(self.profile_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_update_profile(self):
        """Test updating user profile"""
        user = User.objects.create_user(**self.user_data)
        self.client.force_authenticate(user=user)

        # UserProfileSerializer's writable fields don't include first_name/last_name
        # (accounts/serializers.py Meta.fields) — only test fields it actually supports.
        update_data = {
            'phone': '+2348012345678'
        }
        response = self.client.put(self.profile_update_url, update_data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        user.refresh_from_db()
        self.assertEqual(user.phone, '+2348012345678')


class SellerApplicationTests(APITestCase):
    """Test seller application functionality"""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='testuser',
            email='test@pau.edu.ng',
            password='testpass123',
            user_type='vendor'
        )
        self.client.force_authenticate(user=self.user)

    def test_create_seller_application(self):
        """Test creating a seller application"""
        application = SellerApplication.objects.create(
            user=self.user,
            business_age_confirmed=True
        )
        self.assertEqual(application.status, 'pending')
        self.assertEqual(application.user, self.user)

    def test_approve_seller_application(self):
        """Test approving seller application"""
        application = SellerApplication.objects.create(
            user=self.user,
            business_age_confirmed=True
        )
        application.status = 'approved'
        application.save()

        self.user.is_verified_vendor = True
        self.user.save()

        self.user.refresh_from_db()
        self.assertTrue(self.user.is_verified_vendor)
        self.assertEqual(application.status, 'approved')


class PermissionTests(APITestCase):
    """Test permission classes"""

    def setUp(self):
        self.client = APIClient()

        # Create regular user
        self.regular_user = User.objects.create_user(
            username='regular',
            email='regular@pau.edu.ng',
            password='pass123',
            user_type='student'
        )

        # Create verified vendor
        self.vendor_user = User.objects.create_user(
            username='vendor',
            email='vendor@pau.edu.ng',
            password='pass123',
            user_type='vendor',
            is_verified_vendor=True
        )

        # Create staff user
        self.staff_user = User.objects.create_user(
            username='staff',
            email='staff@pau.edu.ng',
            password='pass123',
            is_staff=True
        )

        # Create superuser
        self.superuser = User.objects.create_superuser(
            username='admin',
            email='admin@pau.edu.ng',
            password='pass123'
        )

    def test_admin_endpoint_requires_staff(self):
        """Test admin endpoints require staff permission"""
        admin_url = '/api/admin/dashboard/'

        # Unauthenticated
        response = self.client.get(admin_url)
        self.assertIn(response.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

        # Regular user
        self.client.force_authenticate(user=self.regular_user)
        response = self.client.get(admin_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        # Staff user
        self.client.force_authenticate(user=self.staff_user)
        response = self.client.get(admin_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_vendor_permission(self):
        """Test vendor-only permissions"""
        # Regular user should not have vendor access
        self.assertFalse(self.regular_user.is_verified_vendor)

        # Vendor user should have vendor access
        self.assertTrue(self.vendor_user.is_verified_vendor)
        self.assertEqual(self.vendor_user.user_type, 'vendor')


class UserQueryTests(TestCase):
    """Test user queryset and filtering"""

    def setUp(self):
        # Create multiple users
        User.objects.create_user(
            username='student1',
            email='student1@pau.edu.ng',
            password='pass123',
            user_type='student'
        )
        User.objects.create_user(
            username='student2',
            email='student2@pau.edu.ng',
            password='pass123',
            user_type='student'
        )
        User.objects.create_user(
            username='vendor1',
            email='vendor1@pau.edu.ng',
            password='pass123',
            user_type='vendor',
            is_verified_vendor=True
        )

    def test_filter_by_user_type(self):
        """Test filtering users by type"""
        students = User.objects.filter(user_type='student')
        vendors = User.objects.filter(user_type='vendor')

        self.assertEqual(students.count(), 2)
        self.assertEqual(vendors.count(), 1)

    def test_filter_verified_vendors(self):
        """Test filtering verified vendors"""
        verified_vendors = User.objects.filter(
            user_type='vendor',
            is_verified_vendor=True
        )
        self.assertEqual(verified_vendors.count(), 1)


class WalletBalanceTests(TestCase):
    """Test wallet balance operations on User model"""

    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            email='test@pau.edu.ng',
            password='pass123'
        )

    def test_initial_wallet_balance(self):
        """Test initial wallet balance is 0"""
        self.assertEqual(self.user.wallet_balance, 0)

    def test_update_wallet_balance(self):
        """Test updating wallet balance"""
        self.user.wallet_balance = 1000
        self.user.save()

        self.user.refresh_from_db()
        self.assertEqual(self.user.wallet_balance, 1000)

    def test_wallet_balance_decimal(self):
        """Test wallet balance accepts decimal values"""
        self.user.wallet_balance = 1234.56
        self.user.save()

        self.user.refresh_from_db()
        self.assertEqual(float(self.user.wallet_balance), 1234.56)


class AdminPricingSettingsTests(APITestCase):
    """PATCH /api/admin/pricing-settings/ — retroactively recomputes every listing's price."""

    def setUp(self):
        from decimal import Decimal
        from services.models import Category, Listing
        self.client = APIClient()
        self.admin = User.objects.create_user(
            username='pricing_admin', email='pricing_admin@pau.edu.ng', password='pass123', is_staff=True,
        )
        self.vendor = User.objects.create_user(
            username='pricing_settings_vendor', email='pricing_settings_vendor@pau.edu.ng', password='pass123',
            user_type='vendor', is_verified_vendor=True,
        )
        self.non_admin = User.objects.create_user(
            username='pricing_regular', email='pricing_regular@pau.edu.ng', password='pass123',
        )
        category = Category.objects.create(title='Admin Pricing Cat', slug='admin-pricing-cat')
        self.listing = Listing.objects.create(
            vendor=self.vendor, category=category, title='Item', description='x',
            payout_amount=Decimal('10000'), price=Decimal('10800'), is_available=True,
        )
        self.url = '/api/admin/pricing-settings/'

    def test_non_admin_forbidden(self):
        self.client.force_authenticate(user=self.non_admin)
        response = self.client.patch(self.url, {'service_fee_percent': '10'})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_change_fee_percent_and_it_recomputes_existing_listings(self):
        from decimal import Decimal
        self.client.force_authenticate(user=self.admin)
        response = self.client.patch(self.url, {'service_fee_percent': '10'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(Decimal(response.data['service_fee_percent']), Decimal('10'))
        self.assertEqual(response.data['listings_recomputed'], 1)

        self.listing.refresh_from_db()
        self.assertEqual(self.listing.price, Decimal('11000.00'))  # 10000 + 10%

    def test_get_returns_current_percent(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('service_fee_percent', response.data)

    def test_rejects_out_of_range_percent(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.patch(self.url, {'service_fee_percent': '150'})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class AdminListingDetailFeeCalculationTests(APITestCase):
    """
    PATCH /api/admin/listings/{id}/ (accounts/admin_views.py:AdminListingDetailView)
    — the admin panel's own listing edit page. Bug: this endpoint let admins set
    `price` directly with no `payout_amount` field at all, silently dropping the
    platform fee — same class of bug already fixed on the Django admin form.
    """

    def setUp(self):
        from decimal import Decimal
        from services.models import Category, Listing
        self.client = APIClient()
        self.admin = User.objects.create_user(
            username='listing_admin', email='listing_admin@pau.edu.ng', password='pass123', is_staff=True,
        )
        self.vendor = User.objects.create_user(
            username='admin_edit_vendor', email='admin_edit_vendor@pau.edu.ng', password='pass123',
            user_type='vendor', is_verified_vendor=True,
        )
        category = Category.objects.create(title='Admin Listing Edit Cat', slug='admin-listing-edit-cat')
        self.listing = Listing.objects.create(
            vendor=self.vendor, category=category, title='Item', description='x',
            payout_amount=Decimal('1000.00'), price=Decimal('1100.00'), is_available=True,
        )
        self.url = f'/api/admin/listings/{self.listing.id}/'

    def test_price_is_not_directly_settable(self):
        """Sending a raw `price` must not change price at all — it's ignored,
        not silently accepted and desynced from payout_amount."""
        from decimal import Decimal
        self.client.force_authenticate(user=self.admin)
        response = self.client.patch(self.url, {'price': '999999.00'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.listing.refresh_from_db()
        self.assertEqual(self.listing.price, Decimal('1100.00'))  # unchanged

    def test_editing_payout_amount_recomputes_price(self):
        from decimal import Decimal
        self.client.force_authenticate(user=self.admin)
        response = self.client.patch(self.url, {'payout_amount': '2000.00'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.listing.refresh_from_db()
        self.assertEqual(self.listing.payout_amount, Decimal('2000.00'))
        # 8% of 2000 = 160 (above the ₦100 floor) -> price = 2160.
        self.assertEqual(self.listing.price, Decimal('2160.00'))

    def test_rejects_zero_or_negative_payout_amount(self):
        from decimal import Decimal
        self.client.force_authenticate(user=self.admin)
        response = self.client.patch(self.url, {'payout_amount': '0'})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.listing.refresh_from_db()
        self.assertEqual(self.listing.price, Decimal('1100.00'))  # unchanged

    def test_title_and_availability_still_editable(self):
        """Regression: this fix must not break the other editable fields."""
        self.client.force_authenticate(user=self.admin)
        response = self.client.patch(self.url, {'title': 'Renamed Item', 'is_available': False})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.listing.refresh_from_db()
        self.assertEqual(self.listing.title, 'Renamed Item')
        self.assertFalse(self.listing.is_available)


class AdminAnalyticsProductStatsTests(TestCase):
    """Test the most-searched / most-ordered product admin analytics."""

    def setUp(self):
        from services.models import Category, Listing
        self.vendor = User.objects.create_user(
            username='vendor', email='vendor@pau.edu.ng', password='pass123',
            user_type='vendor', is_verified_vendor=True,
        )
        self.buyer = User.objects.create_user(
            username='buyer', email='buyer@pau.edu.ng', password='pass123',
        )
        self.category = Category.objects.create(title='Food', slug='food')
        self.listing_a = Listing.objects.create(
            vendor=self.vendor, category=self.category, title='Jollof Rice',
            description='desc', price=Decimal('1000.00'), is_available=True,
        )
        self.listing_b = Listing.objects.create(
            vendor=self.vendor, category=self.category, title='Fried Rice',
            description='desc', price=Decimal('1200.00'), is_available=True,
        )

    def test_most_searched_products_counts_by_query_frequency(self):
        from services.models import SearchQuery
        from accounts.analytics import AdminAnalytics

        SearchQuery.objects.create(query='rice')
        SearchQuery.objects.create(query='rice')
        SearchQuery.objects.create(query='chicken')

        results = AdminAnalytics.get_most_searched_products()

        self.assertEqual(results[0]['query'], 'rice')
        self.assertEqual(results[0]['count'], 2)

    def test_most_searched_products_respects_days_window(self):
        from services.models import SearchQuery
        from accounts.analytics import AdminAnalytics

        old = SearchQuery.objects.create(query='old term')
        SearchQuery.objects.filter(id=old.id).update(created_at=timezone.now() - timedelta(days=60))
        SearchQuery.objects.create(query='recent term')

        results = AdminAnalytics.get_most_searched_products(days=30)
        queries = [r['query'] for r in results]

        self.assertIn('recent term', queries)
        self.assertNotIn('old term', queries)

    def test_most_ordered_products_excludes_pending_and_cancelled(self):
        from orders.models import Order
        from accounts.analytics import AdminAnalytics

        Order.objects.create(
            reference='ORD-STAT-01', buyer=self.buyer, listing=self.listing_a,
            amount=Decimal('1000.00'), status='paid',
        )
        Order.objects.create(
            reference='ORD-STAT-02', buyer=self.buyer, listing=self.listing_a,
            amount=Decimal('1000.00'), status='completed',
        )
        Order.objects.create(
            reference='ORD-STAT-03', buyer=self.buyer, listing=self.listing_a,
            amount=Decimal('1000.00'), status='pending',
        )
        Order.objects.create(
            reference='ORD-STAT-04', buyer=self.buyer, listing=self.listing_b,
            amount=Decimal('1200.00'), status='cancelled',
        )

        results = AdminAnalytics.get_most_ordered_products()
        by_listing = {r['listing_id']: r['count'] for r in results}

        self.assertEqual(by_listing.get(self.listing_a.id), 2)
        self.assertNotIn(self.listing_b.id, by_listing)


class ListingSearchLoggingTests(APITestCase):
    """Test that ListingViewSet.list() logs non-empty searches for analytics."""

    def setUp(self):
        from services.models import Category, Listing
        self.client = APIClient()
        self.vendor = User.objects.create_user(
            username='vendor', email='vendor@pau.edu.ng', password='pass123',
            user_type='vendor', is_verified_vendor=True,
        )
        self.category = Category.objects.create(title='Food', slug='food')
        Listing.objects.create(
            vendor=self.vendor, category=self.category, title='Jollof Rice',
            description='desc', price=Decimal('1000.00'), is_available=True,
        )

    def test_search_creates_search_query_row(self):
        from services.models import SearchQuery

        response = self.client.get('/api/services/listings/', {'search': 'Jollof'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(SearchQuery.objects.count(), 1)
        logged = SearchQuery.objects.first()
        self.assertEqual(logged.query, 'jollof')
        self.assertEqual(logged.results_count, 1)

    def test_empty_search_param_does_not_log(self):
        from services.models import SearchQuery

        self.client.get('/api/services/listings/', {'search': ''})

        self.assertEqual(SearchQuery.objects.count(), 0)

    def test_listing_request_without_search_does_not_log(self):
        from services.models import SearchQuery

        self.client.get('/api/services/listings/')

        self.assertEqual(SearchQuery.objects.count(), 0)
