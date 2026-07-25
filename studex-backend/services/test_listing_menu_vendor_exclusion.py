# services/test_listing_menu_vendor_exclusion.py
"""
Regression test for excluding Store/menu-vendor listings from general
marketplace browsing (ListingViewSet.get_queryset, the "list" branch).

A menu vendor's (Vendor.vendor_type.supports_menu_ordering=True) individual
listings must be reachable ONLY via:
  - their own vendor profile page (?vendor_username=... branch)
  - direct retrieve-by-id (non-list actions)
Never via general browse, category-chip filtering, or search — all three
flow through the same "list action, no vendor_username" branch.
"""
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User, Vendor, VendorType
from services.models import Category, Listing


class ListingMenuVendorExclusionTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.category = Category.objects.create(title='Food', slug='food')

        self.food_type = VendorType.objects.create(
            name='food-excl-test', display_name='Food (excl test)', supports_menu_ordering=True,
        )
        self.retail_type = VendorType.objects.create(
            name='retail-excl-test', display_name='Retail (excl test)', supports_menu_ordering=False,
        )

        self.menu_vendor = User.objects.create_user(
            username='buka_test', email='buka_test@pau.edu.ng', password='pass12345',
            user_type='vendor', is_verified_vendor=True,
        )
        Vendor.objects.create(user=self.menu_vendor, vendor_type=self.food_type)
        self.menu_listing = Listing.objects.create(
            title='Jollof Rice', description='x', price=Decimal('1500.00'),
            vendor=self.menu_vendor, category=self.category, is_available=True, campus='pau',
        )

        self.retail_vendor = User.objects.create_user(
            username='retailer_test', email='retailer_test@pau.edu.ng', password='pass12345',
            user_type='vendor', is_verified_vendor=True,
        )
        Vendor.objects.create(user=self.retail_vendor, vendor_type=self.retail_type)
        self.retail_listing = Listing.objects.create(
            title='Sneakers', description='x', price=Decimal('20000.00'),
            vendor=self.retail_vendor, category=self.category, is_available=True, campus='pau',
        )

    def test_general_browse_excludes_menu_vendor_listing(self):
        res = self.client.get('/api/services/listings/', {'campus': 'pau', 'page_size': '100'})
        ids = [l['id'] for l in res.data['results']]
        self.assertNotIn(self.menu_listing.id, ids)
        self.assertIn(self.retail_listing.id, ids)

    def test_category_filter_excludes_menu_vendor_listing(self):
        res = self.client.get('/api/services/listings/', {'campus': 'pau', 'category': 'food', 'page_size': '100'})
        ids = [l['id'] for l in res.data['results']]
        self.assertNotIn(self.menu_listing.id, ids)
        self.assertIn(self.retail_listing.id, ids)

    def test_search_excludes_menu_vendor_listing(self):
        res = self.client.get('/api/services/listings/', {'search': 'Rice'})
        ids = [l['id'] for l in res.data['results']]
        self.assertNotIn(self.menu_listing.id, ids)

    def test_vendor_own_profile_page_still_shows_menu_vendor_listing(self):
        res = self.client.get('/api/services/listings/', {'vendor_username': 'buka_test'})
        ids = [l['id'] for l in res.data['results']]
        self.assertIn(self.menu_listing.id, ids)

    def test_direct_retrieve_by_id_still_works_for_menu_vendor_listing(self):
        res = self.client.get(f'/api/services/listings/{self.menu_listing.id}/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['id'], self.menu_listing.id)
