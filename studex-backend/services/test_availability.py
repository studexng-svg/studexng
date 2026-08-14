# services/test_availability.py
"""
Test suite for services/availability.py — the single centralized
availability contract (Phase 1 — Food Commerce Engine, Step 3) that every
checkout-time (and cart-time) availability check goes through: moderation
(Listing.is_available), hidden/archived/scheduling (MenuItem), and inventory
(Listing.track_inventory/stock_quantity).
"""
from datetime import time, datetime
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase

from accounts.models import User
from services.models import Category, Listing, MenuItem, AddonGroup, Addon
from services.availability import check_menu_item_availability, check_addon_availability, check_vendor_open


class PlainListingAvailabilityTests(TestCase):
    """A listing with no MenuItem row only ever hits moderation/inventory — unchanged behavior."""

    def setUp(self):
        self.vendor = User.objects.create_user(username='v1', email='v1@pau.edu.ng', password='pass123')
        self.category = Category.objects.create(title='Retail', slug='retail')

    def test_available_plain_listing_passes(self):
        listing = Listing.objects.create(
            title='Shirt', description='x', price=Decimal('2000'),
            vendor=self.vendor, category=self.category, is_available=True,
        )
        result = check_menu_item_availability(listing)
        self.assertTrue(result.available)

    def test_moderation_gate_blocks_plain_listing(self):
        listing = Listing.objects.create(
            title='Shirt', description='x', price=Decimal('2000'),
            vendor=self.vendor, category=self.category, is_available=False,
        )
        result = check_menu_item_availability(listing)
        self.assertFalse(result.available)
        self.assertEqual(result.reason, 'moderation')

    def test_inventory_gate_blocks_plain_listing_out_of_stock(self):
        listing = Listing.objects.create(
            title='Shirt', description='x', price=Decimal('2000'),
            vendor=self.vendor, category=self.category, is_available=True,
            track_inventory=True, stock_quantity=0,
        )
        result = check_menu_item_availability(listing)
        self.assertFalse(result.available)
        self.assertEqual(result.reason, 'inventory')

    def test_inventory_gate_blocks_insufficient_quantity(self):
        listing = Listing.objects.create(
            title='Shirt', description='x', price=Decimal('2000'),
            vendor=self.vendor, category=self.category, is_available=True,
            track_inventory=True, stock_quantity=2,
        )
        result = check_menu_item_availability(listing, quantity=3)
        self.assertFalse(result.available)
        self.assertEqual(result.reason, 'inventory')

    def test_inventory_gate_allows_exact_stock_match(self):
        listing = Listing.objects.create(
            title='Shirt', description='x', price=Decimal('2000'),
            vendor=self.vendor, category=self.category, is_available=True,
            track_inventory=True, stock_quantity=3,
        )
        result = check_menu_item_availability(listing, quantity=3)
        self.assertTrue(result.available)

    def test_non_tracked_inventory_ignored(self):
        listing = Listing.objects.create(
            title='Shirt', description='x', price=Decimal('2000'),
            vendor=self.vendor, category=self.category, is_available=True,
            track_inventory=False, stock_quantity=0,
        )
        result = check_menu_item_availability(listing, quantity=100)
        self.assertTrue(result.available)


class MenuItemAvailabilityTests(TestCase):
    def setUp(self):
        self.vendor = User.objects.create_user(username='v2', email='v2@pau.edu.ng', password='pass123')
        self.category = Category.objects.create(title='Food', slug='food')
        self.listing = Listing.objects.create(
            title='Jollof Rice', description='x', price=Decimal('1500'),
            vendor=self.vendor, category=self.category, is_available=True,
        )

    def test_menu_item_with_no_special_flags_available(self):
        MenuItem.objects.create(listing=self.listing)
        result = check_menu_item_availability(self.listing)
        self.assertTrue(result.available)

    def test_moderation_gate_still_applies_first(self):
        self.listing.is_available = False
        self.listing.save(update_fields=['is_available'])
        MenuItem.objects.create(listing=self.listing, is_hidden=False)
        result = check_menu_item_availability(self.listing)
        self.assertFalse(result.available)
        self.assertEqual(result.reason, 'moderation')

    def test_hidden_menu_item_blocked(self):
        MenuItem.objects.create(listing=self.listing, is_hidden=True)
        result = check_menu_item_availability(self.listing)
        self.assertFalse(result.available)
        self.assertEqual(result.reason, 'hidden')

    def test_archived_menu_item_blocked(self):
        MenuItem.objects.create(listing=self.listing, is_archived=True)
        result = check_menu_item_availability(self.listing)
        self.assertFalse(result.available)
        self.assertEqual(result.reason, 'archived')

    def test_archived_takes_precedence_over_hidden(self):
        MenuItem.objects.create(listing=self.listing, is_archived=True, is_hidden=True)
        result = check_menu_item_availability(self.listing)
        self.assertEqual(result.reason, 'archived')

    @patch('services.availability.timezone.localtime')
    def test_scheduling_window_blocks_outside_hours(self, mock_localtime):
        mock_localtime.return_value.time.return_value = time(6, 0)
        MenuItem.objects.create(
            listing=self.listing,
            availability_window_start=time(11, 0), availability_window_end=time(21, 0),
        )
        result = check_menu_item_availability(self.listing)
        self.assertFalse(result.available)
        self.assertEqual(result.reason, 'scheduling')

    @patch('services.availability.timezone.localtime')
    def test_scheduling_window_allows_inside_hours(self, mock_localtime):
        mock_localtime.return_value.time.return_value = time(14, 0)
        MenuItem.objects.create(
            listing=self.listing,
            availability_window_start=time(11, 0), availability_window_end=time(21, 0),
        )
        result = check_menu_item_availability(self.listing)
        self.assertTrue(result.available)

    @patch('services.availability.timezone.localtime')
    def test_overnight_window_wraps_past_midnight(self, mock_localtime):
        # 22:00-02:00 window; 23:30 and 01:00 are both inside, 12:00 is outside.
        MenuItem.objects.create(
            listing=self.listing,
            availability_window_start=time(22, 0), availability_window_end=time(2, 0),
        )
        mock_localtime.return_value.time.return_value = time(23, 30)
        self.assertTrue(check_menu_item_availability(self.listing).available)

        mock_localtime.return_value.time.return_value = time(1, 0)
        self.assertTrue(check_menu_item_availability(self.listing).available)

        mock_localtime.return_value.time.return_value = time(12, 0)
        self.assertFalse(check_menu_item_availability(self.listing).available)

    def test_no_window_set_means_always_available(self):
        MenuItem.objects.create(listing=self.listing)
        result = check_menu_item_availability(self.listing)
        self.assertTrue(result.available)

    def test_inventory_still_applies_to_menu_items(self):
        MenuItem.objects.create(listing=self.listing)
        self.listing.track_inventory = True
        self.listing.stock_quantity = 0
        self.listing.save(update_fields=['track_inventory', 'stock_quantity'])
        result = check_menu_item_availability(self.listing)
        self.assertFalse(result.available)
        self.assertEqual(result.reason, 'inventory')


class VendorHoursAvailabilityTests(TestCase):
    """
    check_vendor_open — accounts.models.Profile.opening_time/closing_time/
    available_days, the vendor-level (whole-storefront) counterpart to
    MenuItem's per-item availability_window. Ugo's ask: "Buka 9" should show
    closed outside its own active hours.
    """

    def setUp(self):
        self.vendor = User.objects.create_user(username='hours_vendor', email='hours_vendor@pau.edu.ng', password='pass123')
        self.category = Category.objects.create(title='Food Hours', slug='food-hours')
        self.listing = Listing.objects.create(
            title='Jollof Rice', description='x', price=Decimal('1500'),
            vendor=self.vendor, category=self.category, is_available=True,
        )
        MenuItem.objects.create(listing=self.listing)

    def test_no_hours_configured_is_always_open(self):
        """The overwhelming majority of vendors — opt-in, not a new default gate."""
        result = check_vendor_open(self.vendor)
        self.assertTrue(result.available)

    def test_only_opening_time_set_is_still_always_open(self):
        """Both times are required to engage the gate at all — one alone is ambiguous."""
        self.vendor.profile.opening_time = time(9, 0)
        self.vendor.profile.save(update_fields=['opening_time'])
        self.assertTrue(check_vendor_open(self.vendor).available)

    def test_inside_hours_is_open(self):
        self.vendor.profile.opening_time = time(9, 0)
        self.vendor.profile.closing_time = time(21, 0)
        self.vendor.profile.save(update_fields=['opening_time', 'closing_time'])
        result = check_vendor_open(self.vendor, now=datetime(2024, 1, 1, 14, 0))  # Monday
        self.assertTrue(result.available)

    def test_outside_hours_is_closed(self):
        self.vendor.profile.opening_time = time(9, 0)
        self.vendor.profile.closing_time = time(21, 0)
        self.vendor.profile.save(update_fields=['opening_time', 'closing_time'])
        result = check_vendor_open(self.vendor, now=datetime(2024, 1, 1, 23, 0))  # Monday
        self.assertFalse(result.available)
        self.assertEqual(result.reason, 'vendor_hours')
        self.assertIn('closed', result.message.lower())

    def test_overnight_window_wraps_past_midnight(self):
        self.vendor.profile.opening_time = time(22, 0)
        self.vendor.profile.closing_time = time(2, 0)
        self.vendor.profile.save(update_fields=['opening_time', 'closing_time'])
        self.assertTrue(check_vendor_open(self.vendor, now=datetime(2024, 1, 1, 23, 30)).available)
        self.assertTrue(check_vendor_open(self.vendor, now=datetime(2024, 1, 2, 1, 0)).available)
        self.assertFalse(check_vendor_open(self.vendor, now=datetime(2024, 1, 1, 12, 0)).available)

    def test_available_days_blocks_a_day_not_listed(self):
        self.vendor.profile.opening_time = time(9, 0)
        self.vendor.profile.closing_time = time(21, 0)
        self.vendor.profile.available_days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
        self.vendor.profile.save(update_fields=['opening_time', 'closing_time', 'available_days'])
        saturday_afternoon = datetime(2024, 1, 6, 14, 0)  # a Saturday
        result = check_vendor_open(self.vendor, now=saturday_afternoon)
        self.assertFalse(result.available)
        self.assertEqual(result.reason, 'vendor_hours')

    def test_available_days_allows_a_listed_day(self):
        self.vendor.profile.opening_time = time(9, 0)
        self.vendor.profile.closing_time = time(21, 0)
        self.vendor.profile.available_days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
        self.vendor.profile.save(update_fields=['opening_time', 'closing_time', 'available_days'])
        monday_afternoon = datetime(2024, 1, 1, 14, 0)  # a Monday
        result = check_vendor_open(self.vendor, now=monday_afternoon)
        self.assertTrue(result.available)

    def test_empty_available_days_is_not_gated_by_day(self):
        """Hours configured but available_days left untouched (default []) — every day, not zero days."""
        self.vendor.profile.opening_time = time(9, 0)
        self.vendor.profile.closing_time = time(21, 0)
        self.vendor.profile.save(update_fields=['opening_time', 'closing_time'])
        result = check_vendor_open(self.vendor, now=datetime(2024, 1, 6, 14, 0))  # a Saturday
        self.assertTrue(result.available)

    @patch('services.availability.timezone.localtime')
    def test_integrates_with_check_menu_item_availability(self, mock_localtime):
        mock_localtime.return_value = datetime(2024, 1, 1, 23, 0)  # Monday, outside hours
        self.vendor.profile.opening_time = time(9, 0)
        self.vendor.profile.closing_time = time(21, 0)
        self.vendor.profile.save(update_fields=['opening_time', 'closing_time'])
        result = check_menu_item_availability(self.listing)
        self.assertFalse(result.available)
        self.assertEqual(result.reason, 'vendor_hours')

    def test_moderation_still_takes_priority_over_vendor_hours(self):
        self.listing.is_available = False
        self.listing.save(update_fields=['is_available'])
        self.vendor.profile.opening_time = time(9, 0)
        self.vendor.profile.closing_time = time(21, 0)
        self.vendor.profile.save(update_fields=['opening_time', 'closing_time'])
        result = check_menu_item_availability(self.listing)
        self.assertFalse(result.available)
        self.assertEqual(result.reason, 'moderation')

    @patch('services.availability.timezone.localtime')
    def test_vendor_hours_takes_priority_over_hidden_item(self, mock_localtime):
        mock_localtime.return_value = datetime(2024, 1, 1, 23, 0)  # outside hours
        self.listing.menu_item.is_hidden = True
        self.listing.menu_item.save(update_fields=['is_hidden'])
        self.vendor.profile.opening_time = time(9, 0)
        self.vendor.profile.closing_time = time(21, 0)
        self.vendor.profile.save(update_fields=['opening_time', 'closing_time'])
        result = check_menu_item_availability(self.listing)
        self.assertEqual(result.reason, 'vendor_hours')


class AddonAvailabilityTests(TestCase):
    def setUp(self):
        self.vendor = User.objects.create_user(username='v3', email='v3@pau.edu.ng', password='pass123')
        self.category = Category.objects.create(title='Food3', slug='food3')
        self.listing = Listing.objects.create(
            title='Jollof Rice', description='x', price=Decimal('1500'),
            vendor=self.vendor, category=self.category, is_available=True,
        )
        self.menu_item = MenuItem.objects.create(listing=self.listing)
        self.group = AddonGroup.objects.create(menu_item=self.menu_item, name='Protein')

    def test_available_addon_passes(self):
        addon = Addon.objects.create(group=self.group, name='Chicken', price_delta=Decimal('300'), is_available=True)
        self.assertTrue(check_addon_availability(addon).available)

    def test_unavailable_addon_blocked(self):
        addon = Addon.objects.create(group=self.group, name='Chicken', price_delta=Decimal('300'), is_available=False)
        result = check_addon_availability(addon)
        self.assertFalse(result.available)
        self.assertEqual(result.reason, 'unavailable')
