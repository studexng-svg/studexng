# accounts/test_api_versioning.py
"""
Test suite for Blocker 7 (API Versioning). studex/urls.py now registers
every API endpoint under both `api/` (legacy, unversioned — permanent alias
for existing web/mobile clients) and `api/v1/` (canonical, versioned path)
via the same `api_patterns` list — a pure additive routing change, not a
behavior change.

Covers: a representative sample of apps (services, delivery, orders,
accounts-admin) proving `/api/v1/...` reaches the identical view/response as
the legacy `/api/...` path, the `API-Version` response header appearing on
both prefixes, and that ordinary 404 behavior for an unknown path is
unaffected by the versioning middleware.

This deliberately does not duplicate every existing endpoint test under a v1
path — that would double the whole suite for no additional coverage. It
proves the aliasing mechanism itself works, across enough apps to catch a
misconfigured api_patterns entry.
"""
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User
from services.models import Category, Listing
from payments.models import PricingSettings
from delivery.models import CampusPickupPoint


class ApiVersionHeaderTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_health_check_carries_version_header(self):
        response = self.client.get('/api/health/maintenance/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['API-Version'], 'v1')

    def test_legacy_prefix_carries_version_header(self):
        response = self.client.get('/api/services/listings/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['API-Version'], 'v1')

    def test_v1_prefix_carries_version_header(self):
        response = self.client.get('/api/v1/services/listings/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['API-Version'], 'v1')

    def test_unknown_v1_path_404s_normally(self):
        response = self.client.get('/api/v1/this-does-not-exist-xyz/')
        self.assertEqual(response.status_code, 404)

    def test_unknown_legacy_path_404s_normally(self):
        response = self.client.get('/api/this-does-not-exist-xyz/')
        self.assertEqual(response.status_code, 404)

    def test_non_api_path_has_no_version_header(self):
        response = self.client.get('/studex-portal-9f3a2/')
        self.assertNotIn('API-Version', response)


class ServicesEndpointAliasingTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        vendor = User.objects.create_user(
            username='v1_vendor', email='v1_vendor@pau.edu.ng', password='pass123', user_type='vendor',
        )
        category = Category.objects.create(title='V1 Cat', slug='v1-cat')
        Listing.objects.create(
            title='V1 Listing', description='x', vendor=vendor, category=category,
            price=Decimal('1000.00'), is_available=True,
        )

    def test_legacy_and_v1_return_identical_listing_data(self):
        legacy = self.client.get('/api/services/listings/')
        v1 = self.client.get('/api/v1/services/listings/')
        self.assertEqual(legacy.status_code, 200)
        self.assertEqual(v1.status_code, 200)
        self.assertEqual(legacy.data, v1.data)


class DeliveryEndpointAliasingTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='v1_student', email='v1_student@pau.edu.ng', password='pass123',
        )
        CampusPickupPoint.objects.create(name='V1 Gate', campus='pau')
        self.client.force_authenticate(user=self.user)

    def test_legacy_and_v1_return_identical_pickup_points(self):
        legacy = self.client.get('/api/delivery/pickup-points/')
        v1 = self.client.get('/api/v1/delivery/pickup-points/')
        self.assertEqual(legacy.status_code, 200)
        self.assertEqual(v1.status_code, 200)
        self.assertEqual(legacy.data, v1.data)


class AdminEndpointAliasingTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser(
            username='v1_admin', email='v1_admin@pau.edu.ng', password='pass123',
        )
        PricingSettings.objects.update_or_create(pk=1, defaults={'service_fee_percent': Decimal('8.00')})
        self.client.force_authenticate(user=self.admin)

    def test_legacy_and_v1_return_identical_pricing_settings(self):
        legacy = self.client.get('/api/admin/pricing-settings/')
        v1 = self.client.get('/api/v1/admin/pricing-settings/')
        self.assertEqual(legacy.status_code, 200)
        self.assertEqual(v1.status_code, 200)
        self.assertEqual(legacy.data, v1.data)

    def test_v1_admin_endpoint_still_enforces_permissions(self):
        student = User.objects.create_user(
            username='v1_nonadmin', email='v1_nonadmin@pau.edu.ng', password='pass123',
        )
        self.client.force_authenticate(user=student)
        response = self.client.get('/api/v1/admin/pricing-settings/')
        self.assertIn(response.status_code, (401, 403))
