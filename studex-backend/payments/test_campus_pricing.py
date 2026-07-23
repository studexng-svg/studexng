# payments/test_campus_pricing.py
"""
Test suite for Blocker 6 (Campus Pricing). A single global PricingSettings
fee doesn't generalize once StudEx operates across multiple universities
with different delivery-logistics costs — this adds an opt-in per-campus
override (CampusPricingSettings) that every existing pricing.py function and
caller falls back to the exact same global fee for when no campus is given
or no override exists for one.

Covers: the resolver's fallback chain, every wired call site still producing
identical output with no campus passed (backward compatibility), the
AdminPricingSettingsView campus-scoped GET/PATCH/clear_override endpoints,
and one end-to-end listing-creation test proving the override actually
reaches a real buyer-facing price.
"""
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status

from accounts.models import User
from services.models import Category, Listing
from payments.models import PricingSettings, CampusPricingSettings
from payments.pricing import (
    get_service_fee_percent, calculate_platform_fee, calculate_final_price,
    recompute_all_listing_prices,
)


class CampusPricingResolverTests(TestCase):
    def setUp(self):
        PricingSettings.objects.update_or_create(pk=1, defaults={'service_fee_percent': Decimal('8.00')})

    def test_no_campus_arg_is_byte_for_byte_unchanged(self):
        """The exact pre-Blocker-6 call signature must resolve identically."""
        self.assertEqual(get_service_fee_percent(), Decimal('8.00'))
        self.assertEqual(calculate_platform_fee(Decimal('10000')), Decimal('800.00'))
        self.assertEqual(calculate_final_price(Decimal('10000')), Decimal('10800.00'))

    def test_campus_with_no_override_falls_back_to_global(self):
        self.assertEqual(get_service_fee_percent(campus='pau'), Decimal('8.00'))

    def test_unknown_campus_falls_back_to_global(self):
        self.assertEqual(get_service_fee_percent(campus='unknown-campus'), Decimal('8.00'))

    def test_campus_override_is_used_when_present(self):
        CampusPricingSettings.objects.create(campus='futo', service_fee_percent=Decimal('15.00'))
        self.assertEqual(get_service_fee_percent(campus='futo'), Decimal('15.00'))
        # Untouched campuses still inherit the global fee
        self.assertEqual(get_service_fee_percent(campus='pau'), Decimal('8.00'))

    def test_override_row_with_null_percent_still_falls_back_to_global(self):
        """A row exists (e.g. created via get_or_create) but has no explicit override set."""
        CampusPricingSettings.objects.create(campus='imsu', service_fee_percent=None)
        self.assertEqual(get_service_fee_percent(campus='imsu'), Decimal('8.00'))

    def test_calculate_final_price_respects_campus_override(self):
        CampusPricingSettings.objects.create(campus='futo', service_fee_percent=Decimal('20.00'))
        # 20% of 10,000 = 2000 (within min/max bounds)
        self.assertEqual(calculate_final_price(Decimal('10000'), campus='futo'), Decimal('12000.00'))
        self.assertEqual(calculate_final_price(Decimal('10000'), campus='pau'), Decimal('10800.00'))

    def test_explicit_fee_percent_wins_over_campus_override(self):
        """An explicit fee_percent argument still short-circuits everything, as before."""
        CampusPricingSettings.objects.create(campus='futo', service_fee_percent=Decimal('20.00'))
        self.assertEqual(
            calculate_platform_fee(Decimal('10000'), fee_percent=Decimal('5'), campus='futo'),
            Decimal('500.00'),
        )


class RecomputeScopedByCampusTests(TestCase):
    def setUp(self):
        PricingSettings.objects.update_or_create(pk=1, defaults={'service_fee_percent': Decimal('8.00')})
        self.vendor = User.objects.create_user(
            username='pricing_vendor2', email='pricing_vendor2@pau.edu.ng', password='pass123',
            user_type='vendor', is_verified_vendor=True,
        )
        self.category = Category.objects.create(title='Campus Pricing Cat', slug='campus-pricing-cat')

    def test_recompute_with_campus_only_touches_that_campus(self):
        pau_listing = Listing.objects.create(
            title='PAU Item', description='x', vendor=self.vendor, category=self.category,
            payout_amount=Decimal('10000'), price=Decimal('10800'), campus='pau', is_available=True,
        )
        futo_listing = Listing.objects.create(
            title='FUTO Item', description='x', vendor=self.vendor, category=self.category,
            payout_amount=Decimal('10000'), price=Decimal('10800'), campus='futo', is_available=True,
        )

        count = recompute_all_listing_prices(Decimal('20.00'), campus='futo')

        self.assertEqual(count, 1)
        futo_listing.refresh_from_db()
        pau_listing.refresh_from_db()
        self.assertEqual(futo_listing.price, Decimal('12000.00'))
        self.assertEqual(pau_listing.price, Decimal('10800.00'))  # untouched

    def test_recompute_without_campus_still_touches_every_listing(self):
        """Global recompute (no campus arg) must remain completely unscoped, as before."""
        pau_listing = Listing.objects.create(
            title='PAU Item 2', description='x', vendor=self.vendor, category=self.category,
            payout_amount=Decimal('10000'), price=Decimal('10800'), campus='pau', is_available=True,
        )
        futo_listing = Listing.objects.create(
            title='FUTO Item 2', description='x', vendor=self.vendor, category=self.category,
            payout_amount=Decimal('10000'), price=Decimal('10800'), campus='futo', is_available=True,
        )

        count = recompute_all_listing_prices(Decimal('10.00'))

        self.assertEqual(count, 2)
        pau_listing.refresh_from_db()
        futo_listing.refresh_from_db()
        self.assertEqual(pau_listing.price, Decimal('11000.00'))
        self.assertEqual(futo_listing.price, Decimal('11000.00'))


class AdminPricingSettingsCampusEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser(
            username='admin', email='admin@pau.edu.ng', password='pass12345',
        )
        self.client.force_authenticate(user=self.admin)
        PricingSettings.objects.update_or_create(pk=1, defaults={'service_fee_percent': Decimal('8.00')})

    def test_get_without_campus_is_unchanged(self):
        response = self.client.get('/api/admin/pricing-settings/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {'service_fee_percent': '8.00'})

    def test_get_with_campus_and_no_override_shows_inherited_global(self):
        response = self.client.get('/api/admin/pricing-settings/?campus=pau')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['service_fee_percent'], '8.00')
        self.assertFalse(response.data['is_override'])
        self.assertEqual(response.data['global_service_fee_percent'], '8.00')

    def test_patch_without_campus_is_unchanged_and_recomputes_everything(self):
        response = self.client.patch('/api/admin/pricing-settings/', {'service_fee_percent': '9.50'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['service_fee_percent'], '9.50')
        self.assertIn('listings_recomputed', response.data)
        self.assertNotIn('campus', response.data)
        self.assertEqual(PricingSettings.get().service_fee_percent, Decimal('9.50'))

    def test_patch_with_campus_creates_override(self):
        response = self.client.patch(
            '/api/admin/pricing-settings/', {'campus': 'futo', 'service_fee_percent': '15.00'},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['campus'], 'futo')
        self.assertEqual(response.data['service_fee_percent'], '15.00')
        self.assertTrue(response.data['is_override'])

        override = CampusPricingSettings.objects.get(campus='futo')
        self.assertEqual(override.service_fee_percent, Decimal('15.00'))
        # Global fee must be completely untouched by a campus-scoped PATCH.
        self.assertEqual(PricingSettings.get().service_fee_percent, Decimal('8.00'))

    def test_patch_with_campus_recomputes_only_that_campus(self):
        vendor = User.objects.create_user(
            username='futo_vendor', email='futo_vendor@futo.edu.ng', password='pass123', user_type='vendor',
        )
        category = Category.objects.create(title='Endpoint Cat', slug='endpoint-cat')
        futo_listing = Listing.objects.create(
            title='FUTO Endpoint Item', description='x', vendor=vendor, category=category,
            payout_amount=Decimal('10000'), price=Decimal('10800'), campus='futo', is_available=True,
        )
        pau_listing = Listing.objects.create(
            title='PAU Endpoint Item', description='x', vendor=vendor, category=category,
            payout_amount=Decimal('10000'), price=Decimal('10800'), campus='pau', is_available=True,
        )

        response = self.client.patch(
            '/api/admin/pricing-settings/', {'campus': 'futo', 'service_fee_percent': '20.00'},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['listings_recomputed'], 1)

        futo_listing.refresh_from_db()
        pau_listing.refresh_from_db()
        self.assertEqual(futo_listing.price, Decimal('12000.00'))
        self.assertEqual(pau_listing.price, Decimal('10800.00'))

    def test_clear_override_reverts_to_global(self):
        CampusPricingSettings.objects.create(campus='imsu', service_fee_percent=Decimal('25.00'))

        response = self.client.patch(
            '/api/admin/pricing-settings/', {'campus': 'imsu', 'clear_override': True},
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['is_override'])
        self.assertEqual(response.data['service_fee_percent'], '8.00')

        override = CampusPricingSettings.objects.get(campus='imsu')
        self.assertIsNone(override.service_fee_percent)

    def test_unknown_campus_rejected(self):
        response = self.client.patch(
            '/api/admin/pricing-settings/', {'campus': 'unizik', 'service_fee_percent': '10.00'},
        )
        self.assertEqual(response.status_code, 400)

    def test_non_admin_cannot_access(self):
        student = User.objects.create_user(username='student', email='student@pau.edu.ng', password='pass12345')
        self.client.force_authenticate(user=student)
        response = self.client.get('/api/admin/pricing-settings/?campus=pau')
        self.assertIn(response.status_code, (401, 403))


class ListingCreationEndToEndCampusPricingTests(TestCase):
    """Proves the override actually reaches a real buyer-facing listing price."""

    def setUp(self):
        self.client = APIClient()
        PricingSettings.objects.update_or_create(pk=1, defaults={'service_fee_percent': Decimal('8.00')})
        Category.objects.get_or_create(slug='food', defaults={'title': 'Food'})

    def test_vendor_on_overridden_campus_gets_campus_specific_price(self):
        CampusPricingSettings.objects.create(campus='futo', service_fee_percent=Decimal('20.00'))
        vendor = User.objects.create_user(
            username='futo_creator', email='futo_creator@futo.edu.ng', password='pass123',
            user_type='vendor', is_verified_vendor=True, school='futo',
        )
        self.client.force_authenticate(user=vendor)

        response = self.client.post('/api/services/listings/', {
            'category': 'food', 'title': 'FUTO Special', 'description': 'desc',
            'payout_amount': '10000.00',
        })

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        # 20% of 10,000 = 2000 -> price 12,000, not the global 8% (10,800)
        self.assertEqual(Decimal(str(response.data['price'])), Decimal('12000.00'))

    def test_vendor_on_non_overridden_campus_gets_global_price(self):
        CampusPricingSettings.objects.create(campus='futo', service_fee_percent=Decimal('20.00'))
        vendor = User.objects.create_user(
            username='pau_creator', email='pau_creator@pau.edu.ng', password='pass123',
            user_type='vendor', is_verified_vendor=True, school='pau',
        )
        self.client.force_authenticate(user=vendor)

        response = self.client.post('/api/services/listings/', {
            'category': 'food', 'title': 'PAU Regular', 'description': 'desc',
            'payout_amount': '10000.00',
        })

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(Decimal(str(response.data['price'])), Decimal('10800.00'))
