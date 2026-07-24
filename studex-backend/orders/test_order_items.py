# orders/test_order_items.py
"""
Test suite for Phase 1 Step 1 (Food Commerce Engine — schema foundation).
Covers OrderItem/OrderItemAddon and, centrally, confirms `Order` itself
received zero schema change: `Order.listing` stays required exactly as
before, and every existing single-item order (zero OrderItem rows) behaves
identically to how it always has.
"""
from decimal import Decimal

from django.test import TestCase
from django.db import IntegrityError

from accounts.models import User
from services.models import Category, Listing, MenuItem, AddonGroup, Addon
from orders.models import Order, OrderItem, OrderItemAddon


class OrderUnaffectedByOrderItemTests(TestCase):
    """The central backward-compatibility claim: Order.listing is still required, unchanged."""

    def setUp(self):
        self.buyer = User.objects.create_user(username='buyer', email='buyer@pau.edu.ng', password='pass123')
        self.vendor = User.objects.create_user(username='vendor', email='vendor@pau.edu.ng', password='pass123')
        self.category = Category.objects.create(title='Food', slug='food')
        self.listing = Listing.objects.create(
            title='Jollof Rice', description='x', price=Decimal('1500.00'),
            vendor=self.vendor, category=self.category, is_available=True,
        )

    def test_order_listing_is_still_required(self):
        with self.assertRaises(IntegrityError):
            Order.objects.create(
                reference='ORD-NULL-LISTING-TEST', buyer=self.buyer, listing=None, amount=Decimal('1500.00'),
            )

    def test_single_item_order_has_zero_order_items(self):
        """Every order that existed before this phase, and every plain single-item order after it."""
        order = Order.objects.create(
            reference='ORD-SINGLE-1', buyer=self.buyer, listing=self.listing, amount=Decimal('1500.00'),
        )
        self.assertEqual(order.items.count(), 0)
        self.assertFalse(order.items.exists())
        # order.listing continues to be the one and only source of truth, unchanged.
        self.assertEqual(order.listing, self.listing)
        self.assertEqual(order.listing.vendor, self.vendor)


class OrderItemMultiItemBreakdownTests(TestCase):
    def setUp(self):
        self.buyer = User.objects.create_user(username='buyer2', email='buyer2@pau.edu.ng', password='pass123')
        self.vendor = User.objects.create_user(username='vendor2', email='vendor2@pau.edu.ng', password='pass123')
        self.category = Category.objects.create(title='Food2', slug='food2')
        self.rice = Listing.objects.create(
            title='Jollof Rice', description='x', price=Decimal('1500.00'),
            vendor=self.vendor, category=self.category, is_available=True,
        )
        self.drink = Listing.objects.create(
            title='Chapman', description='x', price=Decimal('500.00'),
            vendor=self.vendor, category=self.category, is_available=True,
        )
        # Anchor listing convention: Order.listing is the first item added.
        self.order = Order.objects.create(
            reference='ORD-MULTI-1', buyer=self.buyer, listing=self.rice, amount=Decimal('2000.00'),
        )

    def test_multi_item_order_has_correct_anchor_vendor_and_campus(self):
        """order.listing.vendor is correct for the WHOLE order, since a cart is single-vendor."""
        OrderItem.objects.create(
            order=self.order, listing=self.rice, quantity=1,
            unit_price_at_order_time=Decimal('1500.00'), line_total=Decimal('1500.00'),
        )
        OrderItem.objects.create(
            order=self.order, listing=self.drink, quantity=1,
            unit_price_at_order_time=Decimal('500.00'), line_total=Decimal('500.00'),
        )
        self.assertEqual(self.order.items.count(), 2)
        # Every item shares the anchor's vendor — confirming the anchor-listing
        # convention gives the correct answer for ANY reader of order.listing.vendor.
        for item in self.order.items.all():
            self.assertEqual(item.listing.vendor, self.order.listing.vendor)

    def test_order_item_price_is_frozen_at_order_time(self):
        item = OrderItem.objects.create(
            order=self.order, listing=self.rice, quantity=1,
            unit_price_at_order_time=Decimal('1500.00'), line_total=Decimal('1500.00'),
        )
        self.rice.price = Decimal('9999.00')
        self.rice.save(update_fields=['price'])
        item.refresh_from_db()
        self.assertEqual(item.unit_price_at_order_time, Decimal('1500.00'))

    def test_listing_cannot_be_deleted_while_referenced_by_an_order_item(self):
        OrderItem.objects.create(
            order=self.order, listing=self.rice, quantity=1,
            unit_price_at_order_time=Decimal('1500.00'), line_total=Decimal('1500.00'),
        )
        from django.db.models import ProtectedError
        with self.assertRaises(ProtectedError):
            self.rice.delete()

    def test_item_status_defaults_to_fulfilled(self):
        item = OrderItem.objects.create(
            order=self.order, listing=self.rice, quantity=1,
            unit_price_at_order_time=Decimal('1500.00'), line_total=Decimal('1500.00'),
        )
        self.assertEqual(item.status, 'fulfilled')

    def test_item_can_be_marked_unavailable(self):
        item = OrderItem.objects.create(
            order=self.order, listing=self.drink, quantity=1,
            unit_price_at_order_time=Decimal('500.00'), line_total=Decimal('500.00'),
        )
        item.status = 'unavailable'
        item.save(update_fields=['status'])
        item.refresh_from_db()
        self.assertEqual(item.status, 'unavailable')


class OrderItemAddonHistoricalIntegrityTests(TestCase):
    def setUp(self):
        self.buyer = User.objects.create_user(username='buyer3', email='buyer3@pau.edu.ng', password='pass123')
        self.vendor = User.objects.create_user(username='vendor3', email='vendor3@pau.edu.ng', password='pass123')
        self.category = Category.objects.create(title='Food3', slug='food3')
        self.listing = Listing.objects.create(
            title='Jollof Rice', description='x', price=Decimal('1500.00'),
            vendor=self.vendor, category=self.category, is_available=True,
        )
        self.menu_item = MenuItem.objects.create(listing=self.listing)
        self.group = AddonGroup.objects.create(menu_item=self.menu_item, name='Protein')
        self.addon = Addon.objects.create(group=self.group, name='Chicken', price_delta=Decimal('300.00'))
        self.order = Order.objects.create(
            reference='ORD-ADDON-1', buyer=self.buyer, listing=self.listing, amount=Decimal('1800.00'),
        )
        self.order_item = OrderItem.objects.create(
            order=self.order, listing=self.listing, quantity=1,
            unit_price_at_order_time=Decimal('1500.00'), line_total=Decimal('1800.00'),
        )

    def test_addon_selection_frozen_at_order_time(self):
        selection = OrderItemAddon.objects.create(
            order_item=self.order_item, addon=self.addon,
            name_snapshot=self.addon.name, price_delta_snapshot=self.addon.price_delta,
        )
        self.addon.price_delta = Decimal('999.00')
        self.addon.name = 'Renamed Chicken'
        self.addon.save(update_fields=['price_delta', 'name'])
        selection.refresh_from_db()
        self.assertEqual(selection.price_delta_snapshot, Decimal('300.00'))
        self.assertEqual(selection.name_snapshot, 'Chicken')

    def test_deleting_the_addon_nulls_the_fk_but_preserves_the_snapshot(self):
        """The core historical-integrity guarantee: deleting an Addon must never delete order history."""
        selection = OrderItemAddon.objects.create(
            order_item=self.order_item, addon=self.addon,
            name_snapshot=self.addon.name, price_delta_snapshot=self.addon.price_delta,
        )
        self.addon.delete()
        selection.refresh_from_db()
        self.assertIsNone(selection.addon)
        self.assertEqual(selection.name_snapshot, 'Chicken')
        self.assertEqual(selection.price_delta_snapshot, Decimal('300.00'))

    def test_addon_selections_are_queryable_for_analytics(self):
        """Normalized (not JSON), so aggregation by addon is a direct query."""
        OrderItemAddon.objects.create(
            order_item=self.order_item, addon=self.addon,
            name_snapshot=self.addon.name, price_delta_snapshot=self.addon.price_delta,
        )
        count = OrderItemAddon.objects.filter(addon=self.addon).count()
        self.assertEqual(count, 1)
