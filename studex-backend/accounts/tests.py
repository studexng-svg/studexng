"""
Test suite for accounts app - authentication, user management, permissions
"""
from django.test import TestCase
from django.contrib.auth import get_user_model
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
        self.assertEqual(str(self.user), 'testuser')

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
        self.profile_url = '/api/user/profile/'

        self.user_data = {
            'username': 'testuser',
            'email': 'test@pau.edu.ng',
            'password': 'testpass123',
            'user_type': 'student'
        }

    def test_register_user_success(self):
        """Test user registration with valid data"""
        response = self.client.post(self.register_url, self.user_data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('user', response.data)
        self.assertIn('tokens', response.data)
        self.assertEqual(response.data['user']['email'], 'test@pau.edu.ng')

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
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_login_nonexistent_user(self):
        """Test login fails for nonexistent user"""
        login_data = {
            'email': 'nonexistent@pau.edu.ng',
            'password': 'somepassword'
        }
        response = self.client.post(self.login_url, login_data)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

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

        update_data = {
            'first_name': 'Test',
            'last_name': 'User',
            'phone': '+2348012345678'
        }
        response = self.client.put(self.profile_url, update_data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        user.refresh_from_db()
        self.assertEqual(user.first_name, 'Test')
        self.assertEqual(user.last_name, 'User')


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
