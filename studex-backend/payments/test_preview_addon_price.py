# payments/test_preview_addon_price.py
"""
Test suite for the /api/payments/preview-addon-price/ endpoint.

This is the fix for a real discrepancy: the buyer-facing "Estimated total" in
AddonPickerModal.tsx was adding a raw add-on price_delta on top of the
already fee-inclusive listing price, while payments/cart_checkout.py applies
the platform fee to the *combined* payout (base + add-ons together) at
actual checkout. Every case here asserts the preview endpoint returns
exactly what price_cart_item() would charge for the same inputs, so the
number shown before checkout can never drift from the number charged at
checkout again.
"""
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User
from services.models import Category, Listing, MenuItem, AddonGroup, Addon
from cart.models import CartItem, CartItemAddon
from payments.models import PricingSettings
from payments.pricing import calculate_final_price
from payments.cart_checkout import price_cart_item


class PreviewAddonPriceTests(TestCase):
    def setUp(self):
        PricingSettings.objects.update_or_create(pk=1, defaults={'service_fee_percent': Decimal('8.00')})
        self.client = APIClient()
        self.buyer = User.objects.create_user(username='pap_buyer', email='pap_buyer@pau.edu.ng', password='pass123')
        self.vendor = User.objects.create_user(username='pap_vendor', email='pap_vendor@pau.edu.ng', password='pass123')
        self.category = Category.objects.create(title='FoodPAP', slug='food-pap')
        self.listing = Listing.objects.create(
            title='Jollof Rice', description='x', payout_amount=Decimal('1500'), price=Decimal('1620'),
            vendor=self.vendor, category=self.category, is_available=True,
        )
        self.menu_item = MenuItem.objects.create(listing=self.listing)
        self.group = AddonGroup.objects.create(menu_item=self.menu_item, name='Protein', max_selections=2)
        self.chicken = Addon.objects.create(group=self.group, name='Chicken', price_delta=Decimal('500'))

    def test_item_alone_matches_listing_price(self):
        """No add-ons selected -> preview equals the listing's own fee-inclusive price."""
        response = self.client.post(
            '/api/payments/preview-addon-price/', {'listing_id': self.listing.id, 'addons': []}, format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Decimal(response.data['unit_price']), Decimal('1620.00'))

    def test_item_with_addon_applies_fee_to_combined_amount(self):
        """
        ₦1,500 item + ₦500 add-on -> combined payout ₦2,000, fee applied ONCE
        to that combined amount (2000 * 8% = 160) -> ₦2,160. Not
        1620 (listing price) + 500 (raw add-on) = 2120, which is the bug
        this endpoint exists to fix.
        """
        response = self.client.post(
            '/api/payments/preview-addon-price/',
            {'listing_id': self.listing.id, 'addons': [{'id': self.chicken.id, 'quantity': 1}]},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Decimal(response.data['unit_price']), Decimal('2160.00'))
        self.assertEqual(Decimal(response.data['combined_payout_per_unit']), Decimal('2000'))

    def test_matches_real_cart_checkout_price_for_same_inputs(self):
        """The preview must never drift from what price_cart_item() actually charges."""
        cart_item = CartItem.objects.create(user=self.buyer, listing=self.listing, quantity=2)
        CartItemAddon.objects.create(cart_item=cart_item, addon=self.chicken, price_delta_at_add_time=self.chicken.price_delta, quantity=2)
        real = price_cart_item(cart_item, vendor_type=None)

        response = self.client.post(
            '/api/payments/preview-addon-price/',
            {'listing_id': self.listing.id, 'quantity': 2, 'addons': [{'id': self.chicken.id, 'quantity': 2}]},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Decimal(response.data['unit_price']), real['unit_price'])
        self.assertEqual(Decimal(response.data['line_total']), real['line_total'])

    def test_addon_quantity_multiplies_delta_before_fee(self):
        """2x Chicken (₦500 each) -> combined payout 1500 + 1000 = 2500 -> fee 200 -> ₦2,700."""
        response = self.client.post(
            '/api/payments/preview-addon-price/',
            {'listing_id': self.listing.id, 'addons': [{'id': self.chicken.id, 'quantity': 2}]},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Decimal(response.data['unit_price']), Decimal('2700.00'))

    def test_line_total_scales_with_item_quantity(self):
        response = self.client.post(
            '/api/payments/preview-addon-price/',
            {'listing_id': self.listing.id, 'quantity': 3, 'addons': [{'id': self.chicken.id, 'quantity': 1}]},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Decimal(response.data['unit_price']), Decimal('2160.00'))
        self.assertEqual(Decimal(response.data['line_total']), Decimal('6480.00'))

    def test_addon_not_belonging_to_listing_is_rejected(self):
        """An addon id from a different listing's menu can't be smuggled in to under/over-price this one."""
        other_listing = Listing.objects.create(
            title='Fried Rice', description='x', payout_amount=Decimal('1500'), price=Decimal('1620'),
            vendor=self.vendor, category=self.category, is_available=True,
        )
        other_menu_item = MenuItem.objects.create(listing=other_listing)
        other_group = AddonGroup.objects.create(menu_item=other_menu_item, name='Protein', max_selections=1)
        other_addon = Addon.objects.create(group=other_group, name='Beef', price_delta=Decimal('300'))

        response = self.client.post(
            '/api/payments/preview-addon-price/',
            {'listing_id': self.listing.id, 'addons': [{'id': other_addon.id, 'quantity': 1}]},
            format='json',
        )
        self.assertEqual(response.status_code, 400)

    def test_missing_listing_id_returns_400(self):
        response = self.client.post('/api/payments/preview-addon-price/', {'addons': []}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_unknown_listing_returns_404(self):
        response = self.client.post(
            '/api/payments/preview-addon-price/', {'listing_id': 999999, 'addons': []}, format='json',
        )
        self.assertEqual(response.status_code, 404)

    def test_works_for_anonymous_buyer(self):
        """Anonymous visitors can open the addon picker without logging in, so the preview must too."""
        response = self.client.post(
            '/api/payments/preview-addon-price/', {'listing_id': self.listing.id, 'addons': []}, format='json',
        )
        self.assertEqual(response.status_code, 200)
