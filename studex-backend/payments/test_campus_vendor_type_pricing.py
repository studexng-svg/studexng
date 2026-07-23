# payments/test_campus_vendor_type_pricing.py
"""
Test suite for the Campus+VendorType pricing hierarchy (extends Blocker 6).
Adds Level 1 (campus + VendorType) on top of Blocker 6's Level 2 (campus
default) and Level 3 (global) — resolved entirely via the VendorType FK/
instance, never a name string, matching how Settlement Policy already
resolves VendorType (payments/settlement.py get_vendor_type).

Covers: the 3-level fallback chain, that every existing (pre-this-change)
call remains byte-for-byte unchanged, recompute scoping by vendor_type, the
admin endpoint's vendor_type dimension (set/clear at Level 1, and clearing
Level 1 correctly falls through to Level 2 then Level 3), and one end-to-end
listing-creation test proving a Level-1 override reaches the buyer-facing
price for a vendor with a VendorType assigned.
"""
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status

from accounts.models import User, Vendor, VendorType
from services.models import Category, Listing
from payments.models import PricingSettings, CampusPricingSettings
from payments.pricing import get_service_fee_percent, calculate_final_price, recompute_all_listing_prices
from payments.settlement import get_vendor_type


class ThreeLevelResolutionTests(TestCase):
    def setUp(self):
        PricingSettings.objects.update_or_create(pk=1, defaults={'service_fee_percent': Decimal('8.00')})
        self.food = VendorType.objects.get(name='food')
        self.beauty = VendorType.objects.get(name='beauty')

    def test_no_campus_no_vendor_type_unchanged(self):
        self.assertEqual(get_service_fee_percent(), Decimal('8.00'))

    def test_campus_only_still_works_exactly_as_blocker_6(self):
        CampusPricingSettings.objects.create(campus='futo', vendor_type=None, service_fee_percent=Decimal('10.00'))
        self.assertEqual(get_service_fee_percent(campus='futo'), Decimal('10.00'))

    def test_level1_override_wins_over_level2_and_level3(self):
        CampusPricingSettings.objects.create(campus='futo', vendor_type=None, service_fee_percent=Decimal('10.00'))
        CampusPricingSettings.objects.create(campus='futo', vendor_type=self.food, service_fee_percent=Decimal('15.00'))
        self.assertEqual(get_service_fee_percent(campus='futo', vendor_type=self.food), Decimal('15.00'))
        # A different vendor type on the same campus still falls to Level 2
        self.assertEqual(get_service_fee_percent(campus='futo', vendor_type=self.beauty), Decimal('10.00'))

    def test_level1_falls_back_to_level3_when_no_level2_exists_either(self):
        CampusPricingSettings.objects.create(campus='imsu', vendor_type=self.food, service_fee_percent=Decimal('9.00'))
        self.assertEqual(get_service_fee_percent(campus='imsu', vendor_type=self.food), Decimal('9.00'))
        self.assertEqual(get_service_fee_percent(campus='imsu', vendor_type=self.beauty), Decimal('8.00'))  # global

    def test_matches_the_worked_example_from_the_spec(self):
        matrix = {
            ('futo', 'food'): '10.00', ('futo', 'beauty'): '6.00', ('futo', 'laundry'): '7.00', ('futo', 'retail'): '8.00',
            ('pau', 'food'): '12.00', ('pau', 'beauty'): '8.00', ('pau', 'laundry'): '8.00', ('pau', 'retail'): '10.00',
            ('imsu', 'food'): '9.00', ('imsu', 'beauty'): '6.00', ('imsu', 'laundry'): '7.00', ('imsu', 'retail'): '8.00',
        }
        for (campus, vt_name), pct in matrix.items():
            vt = VendorType.objects.get(name=vt_name)
            CampusPricingSettings.objects.create(campus=campus, vendor_type=vt, service_fee_percent=Decimal(pct))

        for (campus, vt_name), pct in matrix.items():
            vt = VendorType.objects.get(name=vt_name)
            self.assertEqual(get_service_fee_percent(campus=campus, vendor_type=vt), Decimal(pct))

    def test_calculate_final_price_respects_level1_override(self):
        CampusPricingSettings.objects.create(campus='pau', vendor_type=self.food, service_fee_percent=Decimal('12.00'))
        # 12% of 10,000 = 1200
        self.assertEqual(
            calculate_final_price(Decimal('10000'), campus='pau', vendor_type=self.food), Decimal('11200.00'),
        )

    def test_explicit_fee_percent_still_wins_over_everything(self):
        CampusPricingSettings.objects.create(campus='pau', vendor_type=self.food, service_fee_percent=Decimal('12.00'))
        self.assertEqual(
            calculate_final_price(Decimal('10000'), fee_percent=Decimal('5'), campus='pau', vendor_type=self.food),
            Decimal('10500.00'),
        )


class GetVendorTypeHelperReuseTests(TestCase):
    """The exact lookup Settlement Policy already used, now shared with pricing."""

    def test_vendor_with_no_vendor_row_returns_none(self):
        seller = User.objects.create_user(username='v1', email='v1@pau.edu.ng', password='pass12345')
        self.assertIsNone(get_vendor_type(seller))

    def test_vendor_with_assigned_type_returns_it(self):
        seller = User.objects.create_user(username='v2', email='v2@pau.edu.ng', password='pass12345')
        food = VendorType.objects.get(name='food')
        Vendor.objects.create(user=seller, vendor_type=food)
        self.assertEqual(get_vendor_type(seller), food)

    def test_none_seller_returns_none(self):
        self.assertIsNone(get_vendor_type(None))


class RecomputeScopedByVendorTypeTests(TestCase):
    def setUp(self):
        PricingSettings.objects.update_or_create(pk=1, defaults={'service_fee_percent': Decimal('8.00')})
        self.category = Category.objects.create(title='VT Recompute Cat', slug='vt-recompute-cat')
        self.food = VendorType.objects.get(name='food')
        self.beauty = VendorType.objects.get(name='beauty')

        self.food_vendor = User.objects.create_user(
            username='food_v', email='food_v@futo.edu.ng', password='pass123', user_type='vendor',
        )
        Vendor.objects.create(user=self.food_vendor, vendor_type=self.food)

        self.beauty_vendor = User.objects.create_user(
            username='beauty_v', email='beauty_v@futo.edu.ng', password='pass123', user_type='vendor',
        )
        Vendor.objects.create(user=self.beauty_vendor, vendor_type=self.beauty)

    def test_recompute_with_vendor_type_only_touches_that_vendor_types_listings(self):
        food_listing = Listing.objects.create(
            title='Food Item', description='x', vendor=self.food_vendor, category=self.category,
            payout_amount=Decimal('10000'), price=Decimal('10800'), campus='futo', is_available=True,
        )
        beauty_listing = Listing.objects.create(
            title='Beauty Item', description='x', vendor=self.beauty_vendor, category=self.category,
            payout_amount=Decimal('10000'), price=Decimal('10800'), campus='futo', is_available=True,
        )

        count = recompute_all_listing_prices(Decimal('10.00'), campus='futo', vendor_type=self.food)

        self.assertEqual(count, 1)
        food_listing.refresh_from_db()
        beauty_listing.refresh_from_db()
        self.assertEqual(food_listing.price, Decimal('11000.00'))
        self.assertEqual(beauty_listing.price, Decimal('10800.00'))  # untouched


class AdminPricingSettingsVendorTypeEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser(
            username='admin2', email='admin2@pau.edu.ng', password='pass12345',
        )
        self.client.force_authenticate(user=self.admin)
        PricingSettings.objects.update_or_create(pk=1, defaults={'service_fee_percent': Decimal('8.00')})

    def test_get_level1_with_no_overrides_shows_global(self):
        response = self.client.get('/api/admin/pricing-settings/?campus=futo&vendor_type=food')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['service_fee_percent'], '8.00')
        self.assertFalse(response.data['is_override'])
        self.assertIsNone(response.data['campus_default_service_fee_percent'])

    def test_get_level1_falls_back_to_campus_default_when_shown(self):
        CampusPricingSettings.objects.create(campus='futo', vendor_type=None, service_fee_percent=Decimal('10.00'))
        response = self.client.get('/api/admin/pricing-settings/?campus=futo&vendor_type=food')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['service_fee_percent'], '10.00')
        self.assertFalse(response.data['is_override'])
        self.assertEqual(response.data['campus_default_service_fee_percent'], '10.00')

    def test_vendor_type_without_campus_rejected(self):
        response = self.client.get('/api/admin/pricing-settings/?vendor_type=food')
        self.assertEqual(response.status_code, 400)

    def test_unknown_vendor_type_rejected(self):
        response = self.client.get('/api/admin/pricing-settings/?campus=futo&vendor_type=not-a-real-type')
        self.assertEqual(response.status_code, 400)

    def test_patch_sets_level1_override(self):
        response = self.client.patch('/api/admin/pricing-settings/', {
            'campus': 'futo', 'vendor_type': 'food', 'service_fee_percent': '10.00',
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['vendor_type'], 'food')
        self.assertEqual(response.data['service_fee_percent'], '10.00')

        food = VendorType.objects.get(name='food')
        override = CampusPricingSettings.objects.get(campus='futo', vendor_type=food)
        self.assertEqual(override.service_fee_percent, Decimal('10.00'))

    def test_patch_level1_recomputes_only_that_campus_and_vendor_type(self):
        category = Category.objects.create(title='Endpoint VT Cat', slug='endpoint-vt-cat')
        food = VendorType.objects.get(name='food')
        beauty = VendorType.objects.get(name='beauty')
        food_vendor = User.objects.create_user(username='fv', email='fv@futo.edu.ng', password='pass123')
        Vendor.objects.create(user=food_vendor, vendor_type=food)
        beauty_vendor = User.objects.create_user(username='bv', email='bv@futo.edu.ng', password='pass123')
        Vendor.objects.create(user=beauty_vendor, vendor_type=beauty)

        food_listing = Listing.objects.create(
            title='Food X', description='x', vendor=food_vendor, category=category,
            payout_amount=Decimal('10000'), price=Decimal('10800'), campus='futo', is_available=True,
        )
        beauty_listing = Listing.objects.create(
            title='Beauty X', description='x', vendor=beauty_vendor, category=category,
            payout_amount=Decimal('10000'), price=Decimal('10800'), campus='futo', is_available=True,
        )

        response = self.client.patch('/api/admin/pricing-settings/', {
            'campus': 'futo', 'vendor_type': 'food', 'service_fee_percent': '15.00',
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['listings_recomputed'], 1)

        food_listing.refresh_from_db()
        beauty_listing.refresh_from_db()
        self.assertEqual(food_listing.price, Decimal('11500.00'))
        self.assertEqual(beauty_listing.price, Decimal('10800.00'))

    def test_clear_level1_falls_back_to_level2(self):
        food = VendorType.objects.get(name='food')
        CampusPricingSettings.objects.create(campus='futo', vendor_type=None, service_fee_percent=Decimal('10.00'))
        CampusPricingSettings.objects.create(campus='futo', vendor_type=food, service_fee_percent=Decimal('15.00'))

        response = self.client.patch('/api/admin/pricing-settings/', {
            'campus': 'futo', 'vendor_type': 'food', 'clear_override': True,
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['service_fee_percent'], '10.00')
        self.assertFalse(response.data['is_override'])

    def test_clear_level1_falls_back_to_global_when_no_level2(self):
        food = VendorType.objects.get(name='food')
        CampusPricingSettings.objects.create(campus='imsu', vendor_type=food, service_fee_percent=Decimal('9.00'))

        response = self.client.patch('/api/admin/pricing-settings/', {
            'campus': 'imsu', 'vendor_type': 'food', 'clear_override': True,
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['service_fee_percent'], '8.00')

    def test_patch_vendor_type_without_campus_rejected(self):
        response = self.client.patch('/api/admin/pricing-settings/', {
            'vendor_type': 'food', 'service_fee_percent': '10.00',
        })
        self.assertEqual(response.status_code, 400)

    def test_patch_unknown_vendor_type_rejected(self):
        response = self.client.patch('/api/admin/pricing-settings/', {
            'campus': 'futo', 'vendor_type': 'nonexistent', 'service_fee_percent': '10.00',
        })
        self.assertEqual(response.status_code, 400)

    def test_campus_only_patch_still_unaffected_by_vendor_type_changes(self):
        """A Level 2 (campus-only) PATCH must behave exactly as it did in Blocker 6."""
        response = self.client.patch('/api/admin/pricing-settings/', {'campus': 'futo', 'service_fee_percent': '11.00'})
        self.assertEqual(response.status_code, 200)
        self.assertNotIn('vendor_type', response.data)
        self.assertEqual(CampusPricingSettings.objects.get(campus='futo', vendor_type=None).service_fee_percent, Decimal('11.00'))


class ListingCreationEndToEndVendorTypePricingTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        PricingSettings.objects.update_or_create(pk=1, defaults={'service_fee_percent': Decimal('8.00')})
        Category.objects.get_or_create(slug='food', defaults={'title': 'Food'})

    def test_food_vendor_on_futo_gets_level1_override_price(self):
        food = VendorType.objects.get(name='food')
        CampusPricingSettings.objects.create(campus='futo', vendor_type=None, service_fee_percent=Decimal('10.00'))
        CampusPricingSettings.objects.create(campus='futo', vendor_type=food, service_fee_percent=Decimal('15.00'))

        vendor = User.objects.create_user(
            username='futo_food_creator', email='futo_food_creator@futo.edu.ng', password='pass123',
            user_type='vendor', is_verified_vendor=True, school='futo',
        )
        Vendor.objects.create(user=vendor, vendor_type=food)
        self.client.force_authenticate(user=vendor)

        response = self.client.post('/api/services/listings/', {
            'category': 'food', 'title': 'FUTO Jollof', 'description': 'desc', 'payout_amount': '10000.00',
        })

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        # 15% (Level 1), not 10% (Level 2) or 8% (Level 3)
        self.assertEqual(Decimal(str(response.data['price'])), Decimal('11500.00'))

    def test_beauty_vendor_on_futo_falls_back_to_campus_default(self):
        food = VendorType.objects.get(name='food')
        beauty = VendorType.objects.get(name='beauty')
        CampusPricingSettings.objects.create(campus='futo', vendor_type=None, service_fee_percent=Decimal('10.00'))
        CampusPricingSettings.objects.create(campus='futo', vendor_type=food, service_fee_percent=Decimal('15.00'))

        vendor = User.objects.create_user(
            username='futo_beauty_creator', email='futo_beauty_creator@futo.edu.ng', password='pass123',
            user_type='vendor', is_verified_vendor=True, school='futo',
        )
        Vendor.objects.create(user=vendor, vendor_type=beauty)
        self.client.force_authenticate(user=vendor)

        response = self.client.post('/api/services/listings/', {
            'category': 'food', 'title': 'FUTO Braids', 'description': 'desc', 'payout_amount': '10000.00',
        })

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        # No Food-specific override applies to a Beauty vendor -> Level 2 (10%)
        self.assertEqual(Decimal(str(response.data['price'])), Decimal('11000.00'))
