# accounts/test_vendor_list_is_menu_vendor.py
"""
Regression test for VendorListSerializer.is_menu_vendor (StudEx frontend
Food/Marketplace separation). This field is what src/app/home/HomePageClient.tsx
uses to split vendors into the "Restaurants" strip vs the general Vendors tab,
so a wrong value here silently breaks that whole UI split.
"""
from django.test import TestCase

from accounts.models import User, Vendor, VendorType
from accounts.serializers import VendorListSerializer


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
