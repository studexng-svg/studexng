# payments/test_cart_checkout.py
"""
Test suite for payments/cart_checkout.py — vendor-scoped cart pricing and
order creation (Phase 1 — Food Commerce Engine, Step 3).

Pricing decision under test: the platform fee applies to the *combined*
per-unit amount (item payout_amount + selected add-on price_deltas), not to
the item and each add-on separately — confirmed explicitly by the product
owner: "a ₦3,000 item costs 3,000 + 8% fee; a ₦4,000 item with add-ons costs
4,000 + 8% fee."
"""
from datetime import datetime, timedelta
from decimal import Decimal
from unittest import mock

from django.test import TestCase
from django.utils import timezone

from accounts.models import User, Vendor, VendorType
from services.models import Category, Listing, MenuItem, AddonGroup, Addon
from cart.models import CartItem, CartItemAddon
from orders.models import Order, OrderItem, OrderItemAddon
from delivery.models import DeliverySlot
from delivery.capacity import NoDeliverySlotCapacityError, LAGOS
from payments.models import PricingSettings
from payments.pricing import calculate_final_price
from payments.cart_checkout import (
    price_cart_item, price_vendor_cart, create_order_from_priced_lines, CartCheckoutError,
)


class PriceCartItemTests(TestCase):
    def setUp(self):
        PricingSettings.objects.update_or_create(pk=1, defaults={'service_fee_percent': Decimal('8.00')})
        self.buyer = User.objects.create_user(username='cc_buyer', email='cc_buyer@pau.edu.ng', password='pass123')
        self.vendor = User.objects.create_user(username='cc_vendor', email='cc_vendor@pau.edu.ng', password='pass123')
        self.category = Category.objects.create(title='FoodCC', slug='food-cc')
        self.listing = Listing.objects.create(
            title='Jollof Rice', description='x', payout_amount=Decimal('3000'), price=Decimal('3240'),
            vendor=self.vendor, category=self.category, is_available=True,
        )
        self.menu_item = MenuItem.objects.create(listing=self.listing)
        self.group = AddonGroup.objects.create(menu_item=self.menu_item, name='Extras', max_selections=2)
        self.chicken = Addon.objects.create(group=self.group, name='Extra Chicken', price_delta=Decimal('1000'))

    def test_item_alone_prices_at_fee_on_base_payout(self):
        """₦3,000 item, no add-ons → price = calculate_final_price(3000)."""
        cart_item = CartItem.objects.create(user=self.buyer, listing=self.listing, quantity=1)
        priced = price_cart_item(cart_item, vendor_type=None)
        self.assertEqual(priced['unit_price'], calculate_final_price(Decimal('3000')))
        self.assertEqual(priced['unit_price'], Decimal('3240.00'))

    def test_item_with_addon_prices_fee_on_combined_amount_not_separately(self):
        """
        ₦3,000 item + ₦1,000 add-on → combined payout is ₦4,000, and the fee
        applies ONCE to that combined amount — calculate_final_price(4000) —
        not calculate_final_price(3000) + calculate_final_price(1000)
        (which would double-apply the minimum-fee floor).
        """
        cart_item = CartItem.objects.create(user=self.buyer, listing=self.listing, quantity=1)
        CartItemAddon.objects.create(cart_item=cart_item, addon=self.chicken, price_delta_at_add_time=self.chicken.price_delta)

        priced = price_cart_item(cart_item, vendor_type=None)

        expected = calculate_final_price(Decimal('4000'))
        self.assertEqual(priced['unit_price'], expected)
        self.assertEqual(priced['unit_price'], Decimal('4320.00'))  # 4000 + 8% = 4320
        self.assertEqual(priced['combined_payout_per_unit'], Decimal('4000'))

    def test_line_total_scales_with_quantity(self):
        cart_item = CartItem.objects.create(user=self.buyer, listing=self.listing, quantity=3)
        priced = price_cart_item(cart_item, vendor_type=None)
        self.assertEqual(priced['line_total'], (priced['unit_price'] * 3).quantize(Decimal('0.01')))

    def test_never_trusts_stale_cart_addon_snapshot(self):
        """Checkout re-derives price_delta from the live Addon, not CartItemAddon's snapshot."""
        cart_item = CartItem.objects.create(user=self.buyer, listing=self.listing, quantity=1)
        CartItemAddon.objects.create(cart_item=cart_item, addon=self.chicken, price_delta_at_add_time=Decimal('1'))  # stale/tampered

        priced = price_cart_item(cart_item, vendor_type=None)

        self.assertEqual(priced['combined_payout_per_unit'], Decimal('4000'))  # uses live Addon.price_delta (1000), not the stale 1

    def test_addon_quantity_multiplies_combined_payout(self):
        """
        2x Extra Chicken (+₦1,000 each) on a ₦3,000 item → combined payout is
        ₦5,000, folded into the per-unit price the same way a single add-on
        is — not a separate per-addon-unit fee application.
        """
        cart_item = CartItem.objects.create(user=self.buyer, listing=self.listing, quantity=1)
        CartItemAddon.objects.create(
            cart_item=cart_item, addon=self.chicken, price_delta_at_add_time=self.chicken.price_delta, quantity=2,
        )

        priced = price_cart_item(cart_item, vendor_type=None)

        self.assertEqual(priced['combined_payout_per_unit'], Decimal('5000'))
        self.assertEqual(priced['unit_price'], calculate_final_price(Decimal('5000')))

    def test_addon_quantity_and_dish_quantity_both_scale_the_total(self):
        """2 dishes, each with 2x Extra Chicken → line_total reflects both multipliers."""
        cart_item = CartItem.objects.create(user=self.buyer, listing=self.listing, quantity=2)
        CartItemAddon.objects.create(
            cart_item=cart_item, addon=self.chicken, price_delta_at_add_time=self.chicken.price_delta, quantity=2,
        )

        priced = price_cart_item(cart_item, vendor_type=None)

        expected_unit = calculate_final_price(Decimal('5000'))
        self.assertEqual(priced['unit_price'], expected_unit)
        self.assertEqual(priced['line_total'], (expected_unit * 2).quantize(Decimal('0.01')))

    def test_unavailable_listing_raises_checkout_error(self):
        self.listing.is_available = False
        self.listing.save(update_fields=['is_available'])
        cart_item = CartItem.objects.create(user=self.buyer, listing=self.listing, quantity=1)
        with self.assertRaises(CartCheckoutError):
            price_cart_item(cart_item, vendor_type=None)

    def test_unavailable_addon_raises_checkout_error(self):
        self.chicken.is_available = False
        self.chicken.save(update_fields=['is_available'])
        cart_item = CartItem.objects.create(user=self.buyer, listing=self.listing, quantity=1)
        CartItemAddon.objects.create(cart_item=cart_item, addon=self.chicken, price_delta_at_add_time=self.chicken.price_delta)
        with self.assertRaises(CartCheckoutError):
            price_cart_item(cart_item, vendor_type=None)

    def test_hidden_menu_item_raises_checkout_error(self):
        self.menu_item.is_hidden = True
        self.menu_item.save(update_fields=['is_hidden'])
        cart_item = CartItem.objects.create(user=self.buyer, listing=self.listing, quantity=1)
        with self.assertRaises(CartCheckoutError):
            price_cart_item(cart_item, vendor_type=None)


class PriceVendorCartTests(TestCase):
    """Multi-vendor cart scoping — checkout for vendor A must never touch vendor B's lines."""

    def setUp(self):
        PricingSettings.objects.update_or_create(pk=1, defaults={'service_fee_percent': Decimal('8.00')})
        self.buyer = User.objects.create_user(username='mv_buyer', email='mv_buyer@pau.edu.ng', password='pass123')
        self.vendor_a = User.objects.create_user(username='mv_vendor_a', email='mv_vendor_a@pau.edu.ng', password='pass123')
        self.vendor_b = User.objects.create_user(username='mv_vendor_b', email='mv_vendor_b@pau.edu.ng', password='pass123')
        self.category = Category.objects.create(title='FoodMV', slug='food-mv')
        self.listing_a = Listing.objects.create(
            title='Jollof Rice', description='x', payout_amount=Decimal('3000'), price=Decimal('3240'),
            vendor=self.vendor_a, category=self.category, is_available=True,
        )
        self.listing_b = Listing.objects.create(
            title='Suya', description='x', payout_amount=Decimal('2000'), price=Decimal('2160'),
            vendor=self.vendor_b, category=self.category, is_available=True,
        )

    def test_prices_only_the_specified_vendors_lines(self):
        CartItem.objects.create(user=self.buyer, listing=self.listing_a, quantity=1)
        CartItem.objects.create(user=self.buyer, listing=self.listing_b, quantity=1)

        priced_lines, total, _ = price_vendor_cart(self.buyer, self.vendor_a.id)

        self.assertEqual(len(priced_lines), 1)
        self.assertEqual(priced_lines[0]['listing'].id, self.listing_a.id)
        self.assertEqual(total, Decimal('3240.00'))

    def test_vendor_with_no_cart_items_raises_error(self):
        CartItem.objects.create(user=self.buyer, listing=self.listing_b, quantity=1)
        with self.assertRaises(CartCheckoutError):
            price_vendor_cart(self.buyer, self.vendor_a.id)

    def test_unavailable_line_from_other_vendor_does_not_block_this_vendors_checkout(self):
        self.listing_b.is_available = False
        self.listing_b.save(update_fields=['is_available'])
        CartItem.objects.create(user=self.buyer, listing=self.listing_a, quantity=1)
        CartItem.objects.create(user=self.buyer, listing=self.listing_b, quantity=1)

        priced_lines, total, _ = price_vendor_cart(self.buyer, self.vendor_a.id)
        self.assertEqual(len(priced_lines), 1)


class CreateOrderFromPricedLinesTests(TestCase):
    def setUp(self):
        PricingSettings.objects.update_or_create(pk=1, defaults={'service_fee_percent': Decimal('8.00')})
        self.buyer = User.objects.create_user(username='co_buyer', email='co_buyer@pau.edu.ng', password='pass123')
        self.vendor_a = User.objects.create_user(username='co_vendor_a', email='co_vendor_a@pau.edu.ng', password='pass123')
        self.vendor_b = User.objects.create_user(username='co_vendor_b', email='co_vendor_b@pau.edu.ng', password='pass123')
        self.category = Category.objects.create(title='FoodCO', slug='food-co')
        self.listing_a = Listing.objects.create(
            title='Jollof Rice', description='x', payout_amount=Decimal('3000'), price=Decimal('3240'),
            vendor=self.vendor_a, category=self.category, is_available=True,
        )
        self.listing_a2 = Listing.objects.create(
            title='Fried Rice', description='x', payout_amount=Decimal('2500'), price=Decimal('2700'),
            vendor=self.vendor_a, category=self.category, is_available=True,
        )
        self.listing_b = Listing.objects.create(
            title='Suya', description='x', payout_amount=Decimal('2000'), price=Decimal('2160'),
            vendor=self.vendor_b, category=self.category, is_available=True,
        )
        self.menu_item = MenuItem.objects.create(listing=self.listing_a)
        self.group = AddonGroup.objects.create(menu_item=self.menu_item, name='Extras', max_selections=2)
        self.chicken = Addon.objects.create(group=self.group, name='Extra Chicken', price_delta=Decimal('1000'))

    def test_creates_order_and_order_items_for_only_the_priced_vendor(self):
        CartItem.objects.create(user=self.buyer, listing=self.listing_a, quantity=2)
        CartItem.objects.create(user=self.buyer, listing=self.listing_a2, quantity=1)
        other_vendor_item = CartItem.objects.create(user=self.buyer, listing=self.listing_b, quantity=1)

        priced_lines, total, _ = price_vendor_cart(self.buyer, self.vendor_a.id)
        order, total_payout = create_order_from_priced_lines(
            buyer=self.buyer, priced_lines=priced_lines, reference='STX-CART-TEST-0001', amount_paid=total,
        )

        self.assertEqual(order.listing_id, self.listing_a.id)  # anchor = first line
        self.assertEqual(order.status, 'paid')
        self.assertEqual(order.items.count(), 2)
        self.assertEqual(total_payout, Decimal('3000') * 2 + Decimal('2500') * 1)

        # Other vendor's cart line is completely untouched.
        self.assertTrue(CartItem.objects.filter(id=other_vendor_item.id).exists())
        # The priced vendor's cart lines are gone.
        self.assertEqual(CartItem.objects.filter(user=self.buyer, listing__vendor=self.vendor_a).count(), 0)

    def test_creates_order_item_addon_snapshots(self):
        cart_item = CartItem.objects.create(user=self.buyer, listing=self.listing_a, quantity=1)
        CartItemAddon.objects.create(cart_item=cart_item, addon=self.chicken, price_delta_at_add_time=self.chicken.price_delta)

        priced_lines, total, _ = price_vendor_cart(self.buyer, self.vendor_a.id)
        order, _ = create_order_from_priced_lines(
            buyer=self.buyer, priced_lines=priced_lines, reference='STX-CART-TEST-0002', amount_paid=total,
        )

        order_item = order.items.get(listing=self.listing_a)
        addon_row = order_item.selected_addons.get()
        self.assertEqual(addon_row.name_snapshot, 'Extra Chicken')
        self.assertEqual(addon_row.price_delta_snapshot, Decimal('1000'))
        self.assertEqual(addon_row.quantity, 1)

    def test_order_item_addon_quantity_snapshot(self):
        cart_item = CartItem.objects.create(user=self.buyer, listing=self.listing_a, quantity=1)
        CartItemAddon.objects.create(
            cart_item=cart_item, addon=self.chicken, price_delta_at_add_time=self.chicken.price_delta, quantity=3,
        )

        priced_lines, total, _ = price_vendor_cart(self.buyer, self.vendor_a.id)
        order, total_payout = create_order_from_priced_lines(
            buyer=self.buyer, priced_lines=priced_lines, reference='STX-CART-TEST-0004', amount_paid=total,
        )

        order_item = order.items.get(listing=self.listing_a)
        addon_row = order_item.selected_addons.get()
        # price_delta_snapshot stays the per-unit delta; quantity is separate
        # so a receipt can render "3x Extra Chicken (+₦1,000 each)" instead
        # of a pre-multiplied, unlabeled blob.
        self.assertEqual(addon_row.price_delta_snapshot, Decimal('1000'))
        self.assertEqual(addon_row.quantity, 3)
        self.assertEqual(total_payout, Decimal('3000') + Decimal('1000') * 3)

    def test_reduces_stock_per_line(self):
        self.listing_a.track_inventory = True
        self.listing_a.stock_quantity = 10
        self.listing_a.save(update_fields=['track_inventory', 'stock_quantity'])
        CartItem.objects.create(user=self.buyer, listing=self.listing_a, quantity=3)

        priced_lines, total, _ = price_vendor_cart(self.buyer, self.vendor_a.id)
        create_order_from_priced_lines(
            buyer=self.buyer, priced_lines=priced_lines, reference='STX-CART-TEST-0003', amount_paid=total,
        )

        self.listing_a.refresh_from_db()
        self.assertEqual(self.listing_a.stock_quantity, 7)


class CreateOrderFromPricedLinesSlotReservationTests(TestCase):
    """
    Phase 2 simplification (Delivery Slot Reservation): create_order_from_priced_lines
    reserves capacity for a slotted vendor, stamps it onto Order.delivery_slot, and
    leaves every non-slotted vendor's order completely unaffected (delivery_slot stays None).
    """

    # Fixed at noon Lagos — see delivery/test_capacity.py for why this needs
    # to be frozen rather than derived from the real "now" the suite runs at.
    FROZEN_NOW = datetime(2026, 6, 15, 12, 0, 0, tzinfo=LAGOS)

    def setUp(self):
        self._time_patcher = mock.patch('django.utils.timezone.now', return_value=self.FROZEN_NOW)
        self._time_patcher.start()
        self.addCleanup(self._time_patcher.stop)
        PricingSettings.objects.update_or_create(pk=1, defaults={'service_fee_percent': Decimal('8.00')})
        self.food = VendorType.objects.get(name='food')
        self.beauty = VendorType.objects.get(name='beauty')
        self.buyer = User.objects.create_user(username='batch_buyer', email='batch_buyer@pau.edu.ng', password='pass123')

        self.batching_vendor = User.objects.create_user(username='batch_vendor', email='batch_vendor@pau.edu.ng', password='pass123')
        Vendor.objects.create(user=self.batching_vendor, vendor_type=self.food)
        # vendor_uses_batched_delivery requires an active DeliverySlot, not
        # just a slot-capable VendorType — this is what an admin setting
        # this specific vendor up for slotted delivery looks like. max_orders=0
        # so this baseline row is never itself a real reservable slot — tests
        # that want an actual open slot create their own via _make_slot.
        DeliverySlot.objects.create(
            vendor=self.batching_vendor, campus='pau', display_name='Lunch',
            delivery_time=(self.FROZEN_NOW + timedelta(hours=3)).time(), max_orders=0,
        )

        self.non_batching_vendor = User.objects.create_user(username='nonbatch_vendor', email='nonbatch_vendor@pau.edu.ng', password='pass123')
        Vendor.objects.create(user=self.non_batching_vendor, vendor_type=self.beauty)

        self.category = Category.objects.create(title='FoodBatch', slug='food-batch')
        self.batching_listing = Listing.objects.create(
            title='Jollof Rice', description='x', payout_amount=Decimal('3000'), price=Decimal('3240'),
            vendor=self.batching_vendor, category=self.category, is_available=True, campus='pau',
        )
        self.non_batching_listing = Listing.objects.create(
            title='Manicure', description='x', payout_amount=Decimal('2000'), price=Decimal('2160'),
            vendor=self.non_batching_vendor, category=self.category, is_available=True, campus='pau',
        )

    def _make_slot(self, vendor, max_orders=5, hours_until_delivery=3, campus='pau', display_name='Lunch'):
        delivery_time = (self.FROZEN_NOW + timedelta(hours=hours_until_delivery)).time()
        return DeliverySlot.objects.create(
            vendor=vendor, campus=campus, display_name=display_name, delivery_time=delivery_time, max_orders=max_orders,
        )

    def test_batching_vendor_order_reserves_and_stamps_slot(self):
        slot = self._make_slot(self.batching_vendor)
        CartItem.objects.create(user=self.buyer, listing=self.batching_listing, quantity=1)

        priced_lines, total, _ = price_vendor_cart(self.buyer, self.batching_vendor.id)
        order, _ = create_order_from_priced_lines(
            buyer=self.buyer, priced_lines=priced_lines, reference='STX-CART-BATCH-0001', amount_paid=total,
        )

        self.assertEqual(order.delivery_slot_id, slot.id)

    def test_non_batching_vendor_order_leaves_delivery_slot_none(self):
        """Backward compatibility: a vendor without supports_batched_delivery is completely unaffected."""
        CartItem.objects.create(user=self.buyer, listing=self.non_batching_listing, quantity=1)

        priced_lines, total, _ = price_vendor_cart(self.buyer, self.non_batching_vendor.id)
        order, _ = create_order_from_priced_lines(
            buyer=self.buyer, priced_lines=priced_lines, reference='STX-CART-BATCH-0002', amount_paid=total,
        )

        self.assertIsNone(order.delivery_slot_id)

    def test_preferred_batch_id_honored(self):
        self._make_slot(self.batching_vendor, hours_until_delivery=3)  # earlier/default
        preferred = self._make_slot(self.batching_vendor, hours_until_delivery=8, display_name='Dinner')
        CartItem.objects.create(user=self.buyer, listing=self.batching_listing, quantity=1)

        priced_lines, total, _ = price_vendor_cart(self.buyer, self.batching_vendor.id)
        order, _ = create_order_from_priced_lines(
            buyer=self.buyer, priced_lines=priced_lines, reference='STX-CART-BATCH-0003',
            amount_paid=total, batch_id=preferred.id,
        )

        self.assertEqual(order.delivery_slot_id, preferred.id)

    def test_no_capacity_raises_and_rolls_back_whole_order(self):
        """
        NoDeliverySlotCapacityError must roll back the entire atomic block —
        no Order, no OrderItem, no stock reduction, and the cart line must
        survive untouched for a retry.
        """
        cart_item = CartItem.objects.create(user=self.buyer, listing=self.batching_listing, quantity=1)
        # Zero out the setUp slot's capacity — the vendor still "uses batched
        # delivery" (an active DeliverySlot exists), but nothing is eligible,
        # which is the actual no-capacity scenario reserve_delivery_slot guards.
        DeliverySlot.objects.filter(vendor=self.batching_vendor).update(max_orders=0)

        priced_lines, total, _ = price_vendor_cart(self.buyer, self.batching_vendor.id)
        with self.assertRaises(NoDeliverySlotCapacityError):
            create_order_from_priced_lines(
                buyer=self.buyer, priced_lines=priced_lines, reference='STX-CART-BATCH-0004', amount_paid=total,
            )

        self.assertFalse(Order.objects.filter(reference='STX-CART-BATCH-0004').exists())
        self.assertTrue(CartItem.objects.filter(id=cart_item.id).exists())
