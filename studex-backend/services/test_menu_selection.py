# services/test_menu_selection.py
"""
Test suite for services/menu_selection.py — validates a buyer's add-on
selection against a menu item's AddonGroup rules at cart-construction time
(Phase 1 — Food Commerce Engine, Step 3).
"""
from decimal import Decimal

from django.test import TestCase

from accounts.models import User
from services.models import Category, Listing, MenuItem, AddonGroup, Addon
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
            menu_item=self.menu_item, name='Protein', is_required=True, min_selections=1, max_selections=1,
        )
        self.chicken = Addon.objects.create(group=self.protein, name='Chicken', price_delta=Decimal('300'))
        self.beef = Addon.objects.create(group=self.protein, name='Beef', price_delta=Decimal('400'))
        self.extras = AddonGroup.objects.create(
            menu_item=self.menu_item, name='Extras', is_required=False, min_selections=0, max_selections=2,
        )
        self.plantain = Addon.objects.create(group=self.extras, name='Plantain', price_delta=Decimal('200'))
        self.egg = Addon.objects.create(group=self.extras, name='Egg', price_delta=Decimal('150'))

    def test_valid_selection_passes(self):
        selected = validate_addon_selection(self.listing, [self.chicken.id, self.plantain.id])
        self.assertEqual({a.id for a in selected}, {self.chicken.id, self.plantain.id})

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
            menu_item=self.menu_item, name='Toppings', is_required=False, min_selections=2, max_selections=3,
        )
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
        other_group = AddonGroup.objects.create(menu_item=other_menu_item, name='Spice')
        foreign_addon = Addon.objects.create(group=other_group, name='Extra Spicy', price_delta=Decimal('0'))

        with self.assertRaises(AddonSelectionError):
            validate_addon_selection(self.listing, [self.chicken.id, foreign_addon.id])

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
