# services/test_menu_selection.py
"""
Test suite for services/menu_selection.py — validates a buyer's add-on
selection against a menu item's effective add-on rules at cart-construction
time (Phase 1 — Food Commerce Engine, Step 3; Phase 2 — Add-on Library).

AddonGroups are vendor-level templates linked to a MenuItem via
MenuItemAddonGroup (optionally overriding is_required/min_selections/
max_selections for that one dish) — validation must use the *effective*
rule for this dish, not the group's bare defaults.
"""
from decimal import Decimal

from django.test import TestCase

from accounts.models import User
from services.models import Category, Listing, MenuItem, AddonGroup, Addon, MenuItemAddonGroup
from services.menu_selection import validate_addon_selection, AddonSelectionError


class ValidateAddonSelectionTests(TestCase):
    def setUp(self):
        self.vendor = User.objects.create_user(username='msv', email='msv@pau.edu.ng', password='pass123')
        self.category = Category.objects.create(title='Food', slug='food')
        self.listing = Listing.objects.create(
            title='Jollof Rice', description='x', price=Decimal('1500'),
            vendor=self.vendor, category=self.category, is_available=True,
        )
        self.menu_item = MenuItem.objects.create(listing=self.listing)

        self.protein = AddonGroup.objects.create(
            vendor=self.vendor, name='Protein', is_required=True, min_selections=1, max_selections=1,
        )
        MenuItemAddonGroup.objects.create(menu_item=self.menu_item, addon_group=self.protein)
        self.chicken = Addon.objects.create(group=self.protein, name='Chicken', price_delta=Decimal('300'))
        self.beef = Addon.objects.create(group=self.protein, name='Beef', price_delta=Decimal('400'))

        self.extras = AddonGroup.objects.create(
            vendor=self.vendor, name='Extras', is_required=False, min_selections=0, max_selections=2,
        )
        MenuItemAddonGroup.objects.create(menu_item=self.menu_item, addon_group=self.extras)
        self.plantain = Addon.objects.create(group=self.extras, name='Plantain', price_delta=Decimal('200'))
        self.egg = Addon.objects.create(group=self.extras, name='Egg', price_delta=Decimal('150'))

    def test_valid_selection_passes(self):
        selected = validate_addon_selection(self.listing, [self.chicken.id, self.plantain.id])
        self.assertEqual({a.id for a, qty in selected}, {self.chicken.id, self.plantain.id})
        self.assertTrue(all(qty == 1 for a, qty in selected))

    def test_addon_quantity_defaults_to_one(self):
        selected = validate_addon_selection(self.listing, [self.chicken.id])
        [(addon, qty)] = selected
        self.assertEqual(qty, 1)

    def test_addon_quantity_honored(self):
        selected = validate_addon_selection(
            self.listing, [self.chicken.id], addon_quantities={self.chicken.id: 3}
        )
        [(addon, qty)] = selected
        self.assertEqual(qty, 3)

    def test_addon_quantity_zero_rejected(self):
        with self.assertRaises(AddonSelectionError):
            validate_addon_selection(self.listing, [self.chicken.id], addon_quantities={self.chicken.id: 0})

    def test_addon_quantity_over_max_rejected(self):
        with self.assertRaises(AddonSelectionError):
            validate_addon_selection(self.listing, [self.chicken.id], addon_quantities={self.chicken.id: 21})

    def test_addon_quantity_does_not_affect_group_max_selections(self):
        # "Extras: up to 2" counts distinct add-ons, not total quantity —
        # picking 2 distinct extras at any quantity each is still allowed.
        selected = validate_addon_selection(
            self.listing, [self.chicken.id, self.plantain.id, self.egg.id],
            addon_quantities={self.plantain.id: 5, self.egg.id: 5},
        )
        self.assertEqual(len(selected), 3)

    def test_empty_selection_on_plain_listing_passes(self):
        plain_listing = Listing.objects.create(
            title='Shirt', description='x', price=Decimal('2000'),
            vendor=self.vendor, category=self.category, is_available=True,
        )
        self.assertEqual(validate_addon_selection(plain_listing, []), [])
        self.assertEqual(validate_addon_selection(plain_listing, None), [])

    def test_required_group_with_no_selection_rejected(self):
        with self.assertRaises(AddonSelectionError) as ctx:
            validate_addon_selection(self.listing, [self.plantain.id])
        self.assertIn('Protein', str(ctx.exception.detail))

    def test_max_selections_exceeded_rejected(self):
        with self.assertRaises(AddonSelectionError) as ctx:
            validate_addon_selection(self.listing, [self.chicken.id, self.beef.id])
        self.assertIn('Protein', str(ctx.exception.detail))

    def test_min_selections_not_met_rejected(self):
        strict_group = AddonGroup.objects.create(
            vendor=self.vendor, name='Toppings', is_required=False, min_selections=2, max_selections=3,
        )
        MenuItemAddonGroup.objects.create(menu_item=self.menu_item, addon_group=strict_group)
        topping = Addon.objects.create(group=strict_group, name='Sesame', price_delta=Decimal('50'))
        with self.assertRaises(AddonSelectionError) as ctx:
            validate_addon_selection(self.listing, [self.chicken.id, topping.id])
        self.assertIn('Toppings', str(ctx.exception.detail))

    def test_addon_from_a_different_listing_rejected(self):
        other_listing = Listing.objects.create(
            title='Suya', description='x', price=Decimal('1000'),
            vendor=self.vendor, category=self.category, is_available=True,
        )
        other_menu_item = MenuItem.objects.create(listing=other_listing)
        other_group = AddonGroup.objects.create(vendor=self.vendor, name='Spice')
        MenuItemAddonGroup.objects.create(menu_item=other_menu_item, addon_group=other_group)
        foreign_addon = Addon.objects.create(group=other_group, name='Extra Spicy', price_delta=Decimal('0'))

        with self.assertRaises(AddonSelectionError):
            validate_addon_selection(self.listing, [self.chicken.id, foreign_addon.id])

    def test_addon_from_an_unlinked_group_rejected_even_if_same_vendor(self):
        # The group exists in this vendor's library but isn't linked to
        # *this* dish — selecting one of its options must still fail, the
        # same as a group that belongs to a different vendor entirely.
        unlinked_group = AddonGroup.objects.create(vendor=self.vendor, name='Drink Size')
        unlinked_addon = Addon.objects.create(group=unlinked_group, name='Large', price_delta=Decimal('100'))
        with self.assertRaises(AddonSelectionError):
            validate_addon_selection(self.listing, [self.chicken.id, unlinked_addon.id])

    def test_unavailable_addon_rejected(self):
        self.chicken.is_available = False
        self.chicken.save(update_fields=['is_available'])
        with self.assertRaises(AddonSelectionError) as ctx:
            validate_addon_selection(self.listing, [self.chicken.id])
        self.assertIn('Chicken', str(ctx.exception.detail))

    def test_addon_ids_on_listing_with_no_menu_item_rejected(self):
        plain_listing = Listing.objects.create(
            title='Shirt', description='x', price=Decimal('2000'),
            vendor=self.vendor, category=self.category, is_available=True,
        )
        with self.assertRaises(AddonSelectionError):
            validate_addon_selection(plain_listing, [self.chicken.id])

    def test_nonexistent_addon_id_rejected(self):
        with self.assertRaises(AddonSelectionError):
            validate_addon_selection(self.listing, [self.chicken.id, 999999])


class ValidateAddonSelectionWithOverridesTests(TestCase):
    """
    Covers the Phase 2 per-dish override behavior: a shared library group's
    rule can be loosened or tightened on one specific dish's link without
    touching the group (or any other dish linked to it).
    """
    def setUp(self):
        self.vendor = User.objects.create_user(username='msv2', email='msv2@pau.edu.ng', password='pass123')
        self.category = Category.objects.create(title='Food', slug='food')
        self.listing = Listing.objects.create(
            title='Suya Platter', description='x', price=Decimal('2000'),
            vendor=self.vendor, category=self.category, is_available=True,
        )
        self.menu_item = MenuItem.objects.create(listing=self.listing)

        # Shared library default: optional, 0-2.
        self.spice = AddonGroup.objects.create(
            vendor=self.vendor, name='Spice Level', is_required=False, min_selections=0, max_selections=2,
        )
        self.mild = Addon.objects.create(group=self.spice, name='Mild', price_delta=Decimal('0'))
        self.hot = Addon.objects.create(group=self.spice, name='Hot', price_delta=Decimal('0'))

    def test_override_makes_optional_group_required_for_this_dish(self):
        MenuItemAddonGroup.objects.create(
            menu_item=self.menu_item, addon_group=self.spice,
            is_required_override=True, min_selections_override=1,
        )
        with self.assertRaises(AddonSelectionError) as ctx:
            validate_addon_selection(self.listing, [])
        self.assertIn('Spice Level', str(ctx.exception.detail))

    def test_override_tightens_max_selections_for_this_dish(self):
        MenuItemAddonGroup.objects.create(
            menu_item=self.menu_item, addon_group=self.spice, max_selections_override=1,
        )
        with self.assertRaises(AddonSelectionError) as ctx:
            validate_addon_selection(self.listing, [self.mild.id, self.hot.id])
        self.assertIn('Spice Level', str(ctx.exception.detail))

    def test_other_dish_linked_to_same_group_keeps_library_defaults(self):
        other_listing = Listing.objects.create(
            title='Grilled Fish', description='x', price=Decimal('2500'),
            vendor=self.vendor, category=self.category, is_available=True,
        )
        other_menu_item = MenuItem.objects.create(listing=other_listing)
        # This dish overrides to required; the other dish links the same
        # group with no override at all.
        MenuItemAddonGroup.objects.create(
            menu_item=self.menu_item, addon_group=self.spice, is_required_override=True, min_selections_override=1,
        )
        MenuItemAddonGroup.objects.create(menu_item=other_menu_item, addon_group=self.spice)

        with self.assertRaises(AddonSelectionError):
            validate_addon_selection(self.listing, [])
        # Unchanged library default (optional) still applies to the other dish.
        self.assertEqual(validate_addon_selection(other_listing, []), [])

    def test_no_override_uses_library_group_defaults(self):
        MenuItemAddonGroup.objects.create(menu_item=self.menu_item, addon_group=self.spice)
        self.assertEqual(validate_addon_selection(self.listing, []), [])
