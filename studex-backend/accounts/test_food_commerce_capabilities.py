# accounts/test_food_commerce_capabilities.py
"""
Test suite for Phase 1 Step 1 (Food Commerce Engine — schema foundation).
Covers VendorType's two new capability flags: supports_menu_ordering and
supports_batched_delivery. Both default False — assigning a capability is a
strict per-vendor-type opt-in, never a retroactive change to any existing
VendorType's behavior. Confirms the seeded 'food' row got both flipped True
by the accompanying data migration, and every other seeded row did not.
"""
from django.test import TestCase

from accounts.models import VendorType


class VendorTypeCapabilityFlagsTests(TestCase):
    def test_new_vendor_type_defaults_to_no_capabilities(self):
        vt = VendorType.objects.create(name='bakery', display_name='Bakery')
        self.assertFalse(vt.supports_menu_ordering)
        self.assertFalse(vt.supports_batched_delivery)

    def test_food_seeded_with_both_capabilities(self):
        food = VendorType.objects.get(name='food')
        self.assertTrue(food.supports_menu_ordering)
        self.assertTrue(food.supports_batched_delivery)

    def test_beauty_laundry_retail_unaffected_by_the_data_migration(self):
        for name in ('beauty', 'laundry', 'retail'):
            vt = VendorType.objects.get(name=name)
            self.assertFalse(vt.supports_menu_ordering, f'{name} should not support menu ordering')
            self.assertFalse(vt.supports_batched_delivery, f'{name} should not support batched delivery')

    def test_capabilities_are_independent_flags(self):
        """A future vendor type could have one capability without the other."""
        vt = VendorType.objects.create(
            name='pharmacy', display_name='Pharmacy', supports_menu_ordering=False, supports_batched_delivery=True,
        )
        self.assertFalse(vt.supports_menu_ordering)
        self.assertTrue(vt.supports_batched_delivery)

    def test_settlement_trigger_unaffected_by_new_fields(self):
        """The pre-existing Settlement Policy field must be completely independent of the new flags."""
        food = VendorType.objects.get(name='food')
        self.assertEqual(food.settlement_trigger, 'pickup_verification')
