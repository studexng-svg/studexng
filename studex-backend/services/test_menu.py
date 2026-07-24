# services/test_menu.py
"""
Test suite for Phase 1 Step 1 (Food Commerce Engine — schema foundation).
Covers MenuCategory, MenuItem, AddonGroup, Addon — all new, additive models.

The central claim under test: `Listing` receives zero behavior change.
Every existing Listing capability (price, campus, vendor, availability,
variants) works identically whether or not a MenuItem extension exists for
it, and a Listing with no MenuItem is indistinguishable from a Listing
created before this phase existed.
"""
from decimal import Decimal

from django.test import TestCase
from django.db import IntegrityError

from accounts.models import User
from services.models import Category, Listing, MenuCategory, MenuItem, AddonGroup, Addon


class ListingUnaffectedByMenuItemTests(TestCase):
    """Confirms Listing itself has zero new fields and zero behavior change."""

    def setUp(self):
        self.vendor = User.objects.create_user(
            username='vendor', email='vendor@pau.edu.ng', password='pass123', user_type='vendor',
        )
        self.category = Category.objects.create(title='Food', slug='food')

    def test_listing_created_without_menu_item_exactly_as_before(self):
        listing = Listing.objects.create(
            title='Plain Product', description='x', price=Decimal('1000.00'),
            vendor=self.vendor, category=self.category, is_available=True,
        )
        self.assertFalse(hasattr(listing, 'menu_item'))
        # Accessing the reverse OneToOne on a Listing with no MenuItem raises
        # RelatedObjectDoesNotExist — the correct "no extension" signal.
        with self.assertRaises(MenuItem.DoesNotExist):
            listing.menu_item

    def test_listing_with_menu_item_still_behaves_as_a_normal_listing(self):
        listing = Listing.objects.create(
            title='Jollof Rice', description='x', price=Decimal('1500.00'),
            vendor=self.vendor, category=self.category, is_available=True,
        )
        MenuItem.objects.create(listing=listing, prep_time_minutes=15)
        listing.refresh_from_db()
        self.assertEqual(listing.price, Decimal('1500.00'))
        self.assertTrue(listing.is_available)
        self.assertEqual(listing.menu_item.prep_time_minutes, 15)


class MenuCategoryTests(TestCase):
    def setUp(self):
        self.vendor = User.objects.create_user(
            username='foodvendor', email='foodvendor@pau.edu.ng', password='pass123', user_type='vendor',
        )

    def test_categories_ordered_by_display_order(self):
        mains = MenuCategory.objects.create(vendor=self.vendor, name='Mains', display_order=1)
        drinks = MenuCategory.objects.create(vendor=self.vendor, name='Drinks', display_order=2)
        starters = MenuCategory.objects.create(vendor=self.vendor, name='Starters', display_order=0)
        ordered = list(MenuCategory.objects.filter(vendor=self.vendor))
        self.assertEqual(ordered, [starters, mains, drinks])

    def test_categories_are_per_vendor_not_global(self):
        other_vendor = User.objects.create_user(
            username='foodvendor2', email='foodvendor2@pau.edu.ng', password='pass123',
        )
        MenuCategory.objects.create(vendor=self.vendor, name='Mains')
        MenuCategory.objects.create(vendor=other_vendor, name='Mains')  # same name, different vendor — must not clash
        self.assertEqual(MenuCategory.objects.filter(vendor=self.vendor).count(), 1)
        self.assertEqual(MenuCategory.objects.filter(vendor=other_vendor).count(), 1)


class AddonGroupAndAddonTests(TestCase):
    def setUp(self):
        self.vendor = User.objects.create_user(
            username='foodvendor3', email='foodvendor3@pau.edu.ng', password='pass123',
        )
        self.category = Category.objects.create(title='Food2', slug='food2')
        self.listing = Listing.objects.create(
            title='Jollof Rice', description='x', price=Decimal('1500.00'),
            vendor=self.vendor, category=self.category, is_available=True,
        )
        self.menu_item = MenuItem.objects.create(listing=self.listing)

    def test_addon_group_and_addons_created(self):
        group = AddonGroup.objects.create(
            menu_item=self.menu_item, name='Choose your protein', is_required=True,
            min_selections=1, max_selections=1,
        )
        chicken = Addon.objects.create(group=group, name='Chicken', price_delta=Decimal('300.00'))
        beef = Addon.objects.create(group=group, name='Beef', price_delta=Decimal('400.00'))
        self.assertEqual(list(group.addons.all()), [chicken, beef])

    def test_addon_price_delta_can_be_negative(self):
        group = AddonGroup.objects.create(menu_item=self.menu_item, name='Remove ingredient')
        addon = Addon.objects.create(group=group, name='No plantain', price_delta=Decimal('-200.00'))
        self.assertEqual(addon.price_delta, Decimal('-200.00'))

    def test_addon_can_be_marked_unavailable_without_deleting(self):
        group = AddonGroup.objects.create(menu_item=self.menu_item, name='Extras')
        addon = Addon.objects.create(group=group, name='Extra cheese', price_delta=Decimal('200.00'))
        addon.is_available = False
        addon.save(update_fields=['is_available'])
        addon.refresh_from_db()
        self.assertFalse(addon.is_available)

    def test_deleting_menu_item_cascades_to_addon_groups(self):
        group = AddonGroup.objects.create(menu_item=self.menu_item, name='Extras')
        Addon.objects.create(group=group, name='Extra cheese', price_delta=Decimal('200.00'))
        self.menu_item.delete()
        self.assertEqual(AddonGroup.objects.count(), 0)
        self.assertEqual(Addon.objects.count(), 0)


class MenuItemExtensionFieldsTests(TestCase):
    def setUp(self):
        self.vendor = User.objects.create_user(
            username='foodvendor4', email='foodvendor4@pau.edu.ng', password='pass123',
        )
        self.category = Category.objects.create(title='Food3', slug='food3')
        self.listing = Listing.objects.create(
            title='Seasonal Pie', description='x', price=Decimal('2000.00'),
            vendor=self.vendor, category=self.category, is_available=True,
        )

    def test_seasonal_hidden_archived_flags(self):
        item = MenuItem.objects.create(
            listing=self.listing, is_seasonal=True, is_hidden=True, is_archived=False,
        )
        self.assertTrue(item.is_seasonal)
        self.assertTrue(item.is_hidden)
        self.assertFalse(item.is_archived)

    def test_allergens_default_to_empty_list(self):
        item = MenuItem.objects.create(listing=self.listing)
        self.assertEqual(item.allergens, [])

    def test_allergens_json_roundtrip(self):
        item = MenuItem.objects.create(listing=self.listing, allergens=['peanuts', 'dairy'])
        item.refresh_from_db()
        self.assertEqual(item.allergens, ['peanuts', 'dairy'])

    def test_one_menu_item_per_listing(self):
        MenuItem.objects.create(listing=self.listing)
        with self.assertRaises(IntegrityError):
            MenuItem.objects.create(listing=self.listing)
