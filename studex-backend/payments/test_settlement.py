# payments/test_settlement.py
"""
Test suite for Blocker 5 (Vendor Type + Settlement Policy). Covers the
settlement-trigger resolver in payments/settlement.py: the strict opt-in
guarantee that any vendor without an assigned VendorType, or a VendorType
with no explicit override, always resolves to buyer_confirmation — the
global default every vendor used before this blocker existed.
"""
from django.test import TestCase
from django.contrib.auth import get_user_model

from accounts.models import Vendor, VendorType
from payments.settlement import (
    get_settlement_trigger, should_settle_on_pickup,
    SETTLEMENT_TRIGGER_BUYER_CONFIRMATION, SETTLEMENT_TRIGGER_PICKUP_VERIFICATION,
)

User = get_user_model()


class SettlementTriggerResolverTests(TestCase):
    def setUp(self):
        self.seller = User.objects.create_user(
            username="seller", email="seller@pau.edu.ng", password="pass12345", user_type="vendor",
        )

    def test_none_seller_defaults_to_buyer_confirmation(self):
        self.assertEqual(get_settlement_trigger(None), SETTLEMENT_TRIGGER_BUYER_CONFIRMATION)
        self.assertFalse(should_settle_on_pickup(None))

    def test_seller_with_no_vendor_record_defaults_to_buyer_confirmation(self):
        # No Vendor row at all for this user
        self.assertEqual(get_settlement_trigger(self.seller), SETTLEMENT_TRIGGER_BUYER_CONFIRMATION)
        self.assertFalse(should_settle_on_pickup(self.seller))

    def test_vendor_with_no_vendor_type_defaults_to_buyer_confirmation(self):
        Vendor.objects.create(user=self.seller)
        self.assertEqual(get_settlement_trigger(self.seller), SETTLEMENT_TRIGGER_BUYER_CONFIRMATION)
        self.assertFalse(should_settle_on_pickup(self.seller))

    def test_food_vendor_type_resolves_to_pickup_verification(self):
        food = VendorType.objects.get(name="food")
        Vendor.objects.create(user=self.seller, vendor_type=food)
        self.assertEqual(get_settlement_trigger(self.seller), SETTLEMENT_TRIGGER_PICKUP_VERIFICATION)
        self.assertTrue(should_settle_on_pickup(self.seller))

    def test_beauty_vendor_type_still_resolves_to_buyer_confirmation(self):
        beauty = VendorType.objects.get(name="beauty")
        Vendor.objects.create(user=self.seller, vendor_type=beauty)
        self.assertEqual(get_settlement_trigger(self.seller), SETTLEMENT_TRIGGER_BUYER_CONFIRMATION)
        self.assertFalse(should_settle_on_pickup(self.seller))

    def test_laundry_and_retail_also_resolve_to_buyer_confirmation(self):
        for name in ("laundry", "retail"):
            vendor_type = VendorType.objects.get(name=name)
            seller = User.objects.create_user(
                username=f"seller_{name}", email=f"{name}@pau.edu.ng", password="pass12345",
            )
            Vendor.objects.create(user=seller, vendor_type=vendor_type)
            self.assertFalse(should_settle_on_pickup(seller), f"{name} vendor should not settle on pickup")

    def test_custom_vendor_type_with_explicit_override_is_respected(self):
        """Confirms the resolver is generic, not hardcoded to the name 'food'."""
        custom = VendorType.objects.create(
            name="custom-type", display_name="Custom", settlement_trigger="pickup_verification",
        )
        Vendor.objects.create(user=self.seller, vendor_type=custom)
        self.assertTrue(should_settle_on_pickup(self.seller))


class SeededVendorTypesTests(TestCase):
    """The data migration must have seeded exactly these four, with Food alone opted in."""

    def test_four_vendor_types_seeded(self):
        names = set(VendorType.objects.values_list("name", flat=True))
        self.assertEqual(names, {"food", "beauty", "laundry", "retail"})

    def test_only_food_uses_pickup_verification(self):
        pickup_triggered = set(
            VendorType.objects.filter(settlement_trigger="pickup_verification").values_list("name", flat=True)
        )
        self.assertEqual(pickup_triggered, {"food"})
