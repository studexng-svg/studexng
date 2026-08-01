# accounts/test_vendor_list_is_menu_vendor.py
"""
Regression test for VendorListSerializer.is_menu_vendor (StudEx frontend
Food/Marketplace separation). This field is what src/app/home/HomePageClient.tsx
uses to split vendors into the "Restaurants" strip vs the general Vendors tab,
so a wrong value here silently breaks that whole UI split.
"""
from decimal import Decimal

from django.test import TestCase

from accounts.models import User, Vendor, VendorType
from accounts.serializers import VendorListSerializer
from services.models import Category, Listing, MenuItem


class IsMenuVendorFieldTests(TestCase):
    def setUp(self):
        self.food_type = VendorType.objects.create(
            name='food-test', display_name='Food (test)', supports_menu_ordering=True,
        )
        self.retail_type = VendorType.objects.create(
            name='retail-test', display_name='Retail (test)', supports_menu_ordering=False,
        )

    def _make_vendor_user(self, username, vendor_type=None):
        user = User.objects.create_user(
            username=username, email=f'{username}@pau.edu.ng', password='pass12345',
            user_type='vendor', business_name=username, is_verified_vendor=True,
        )
        Vendor.objects.create(user=user, vendor_type=vendor_type)
        return user

    def test_menu_ordering_vendor_type_is_true(self):
        user = self._make_vendor_user('foodvendor', self.food_type)
        data = VendorListSerializer(user).data
        self.assertTrue(data['is_menu_vendor'])

    def test_non_menu_ordering_vendor_type_is_false(self):
        user = self._make_vendor_user('retailvendor', self.retail_type)
        data = VendorListSerializer(user).data
        self.assertFalse(data['is_menu_vendor'])

    def test_no_vendor_type_assigned_is_false(self):
        user = self._make_vendor_user('novendortype', vendor_type=None)
        data = VendorListSerializer(user).data
        self.assertFalse(data['is_menu_vendor'])

    def test_no_vendor_row_at_all_is_false(self):
        """A User with no Vendor row (e.g. a student, never a vendor) must not 500."""
        user = User.objects.create_user(
            username='juststudent', email='juststudent@pau.edu.ng', password='pass12345',
            user_type='student',
        )
        data = VendorListSerializer(user).data
        self.assertFalse(data['is_menu_vendor'])


class HasVendorTypeFieldTests(TestCase):
    """
    Regression for VendorListSerializer.has_vendor_type — the field the
    home page's Stores strip uses. Distinct from is_menu_vendor: a retail
    vendor (supports_menu_ordering=False) must still show has_vendor_type
    True, since Stores is a showcase of every categorized vendor, not just
    menu-ordering ones.
    """
    def setUp(self):
        self.food_type = VendorType.objects.create(
            name='food-test2', display_name='Food (test)', supports_menu_ordering=True,
        )
        self.retail_type = VendorType.objects.create(
            name='retail-test2', display_name='Retail (test)', supports_menu_ordering=False,
        )

    def _make_vendor_user(self, username, vendor_type=None):
        user = User.objects.create_user(
            username=username, email=f'{username}@pau.edu.ng', password='pass12345',
            user_type='vendor', business_name=username, is_verified_vendor=True,
        )
        Vendor.objects.create(user=user, vendor_type=vendor_type)
        return user

    def test_menu_ordering_vendor_type_has_vendor_type_true(self):
        user = self._make_vendor_user('foodvendor2', self.food_type)
        data = VendorListSerializer(user).data
        self.assertTrue(data['has_vendor_type'])

    def test_retail_vendor_type_has_vendor_type_true(self):
        """The exact case the Stores strip was missing: a typed but non-menu vendor."""
        user = self._make_vendor_user('retailvendor2', self.retail_type)
        data = VendorListSerializer(user).data
        self.assertTrue(data['has_vendor_type'])
        self.assertFalse(data['is_menu_vendor'])

    def test_no_vendor_type_assigned_has_vendor_type_false(self):
        user = self._make_vendor_user('novendortype2', vendor_type=None)
        data = VendorListSerializer(user).data
        self.assertFalse(data['has_vendor_type'])

    def test_no_vendor_row_at_all_has_vendor_type_false(self):
        user = User.objects.create_user(
            username='juststudent2', email='juststudent2@pau.edu.ng', password='pass12345',
            user_type='student',
        )
        data = VendorListSerializer(user).data
        self.assertFalse(data['has_vendor_type'])


class TotalListingsFieldTests(TestCase):
    """
    Regression: VendorListSerializer.total_listings only checked
    Listing.is_available — a menu vendor's "Hide from buyers"/"Archive"
    toggle on the Kitchen page sets MenuItem.is_hidden/is_archived instead,
    never touching is_available. A vendor who hid every dish still showed
    their old listing count on the home page (both the Stores strip and
    the marketplace Vendors tab, which share this same field) while the
    actual store page correctly showed zero items.
    """
    def setUp(self):
        self.food_type = VendorType.objects.create(
            name='food-total-listings', display_name='Food (test)', supports_menu_ordering=True,
        )
        self.category = Category.objects.create(title='FoodTL', slug='food-tl')

    def _make_menu_vendor(self, username):
        user = User.objects.create_user(
            username=username, email=f'{username}@pau.edu.ng', password='pass12345',
            user_type='vendor', business_name=username, is_verified_vendor=True,
        )
        Vendor.objects.create(user=user, vendor_type=self.food_type)
        return user

    def _make_dish(self, vendor, title, is_hidden=False, is_archived=False):
        listing = Listing.objects.create(
            title=title, description='x', price=Decimal('1500.00'),
            vendor=vendor, category=self.category, is_available=True,
        )
        MenuItem.objects.create(listing=listing, is_hidden=is_hidden, is_archived=is_archived)
        return listing

    def test_hidden_menu_items_excluded_from_count(self):
        vendor = self._make_menu_vendor('tl_hidden')
        self._make_dish(vendor, 'Visible Dish')
        self._make_dish(vendor, 'Hidden Dish', is_hidden=True)
        data = VendorListSerializer(vendor).data
        self.assertEqual(data['total_listings'], 1)

    def test_archived_menu_items_excluded_from_count(self):
        vendor = self._make_menu_vendor('tl_archived')
        self._make_dish(vendor, 'Visible Dish')
        self._make_dish(vendor, 'Archived Dish', is_archived=True)
        data = VendorListSerializer(vendor).data
        self.assertEqual(data['total_listings'], 1)

    def test_all_items_hidden_shows_zero_not_stale_count(self):
        """The exact bug report: vendor hides everything, count must read 0, not the old total."""
        vendor = self._make_menu_vendor('tl_allhidden')
        for i in range(6):
            self._make_dish(vendor, f'Dish {i}', is_hidden=True)
        data = VendorListSerializer(vendor).data
        self.assertEqual(data['total_listings'], 0)

    def test_plain_marketplace_listing_with_no_menu_item_still_counted(self):
        """A non-menu-vendor listing (no MenuItem row at all) is unaffected."""
        retail_type = VendorType.objects.create(
            name='retail-total-listings', display_name='Retail (test)', supports_menu_ordering=False,
        )
        vendor = User.objects.create_user(
            username='tl_retail', email='tl_retail@pau.edu.ng', password='pass12345',
            user_type='vendor', business_name='tl_retail', is_verified_vendor=True,
        )
        Vendor.objects.create(user=vendor, vendor_type=retail_type)
        Listing.objects.create(
            title='Shoes', description='x', price=Decimal('5000.00'),
            vendor=vendor, category=self.category, is_available=True,
        )
        data = VendorListSerializer(vendor).data
        self.assertEqual(data['total_listings'], 1)
