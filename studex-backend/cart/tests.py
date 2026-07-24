# cart/tests.py
"""
Test suite for the cart app. CartItemAddon (Phase 1 — Food Commerce Engine)
is the first test coverage this app has had.

CartItemUniquenessTests covers the follow-up architectural fix: CartItem's
uniqueness widened from (user, listing) to (user, listing, addon_signature)
so a menu item can hold several cart lines with different add-on
selections. Every non-menu listing (and any menu item with no add-ons
selected) always has addon_signature='', so the widened constraint is a
strict superset of the original one for them — confirmed below by testing
that repeat add-to-cart calls on a plain listing still merge into one row.
"""
from decimal import Decimal

from django.test import TestCase
from django.db import IntegrityError
from rest_framework.test import APIClient

from accounts.models import User
from services.models import Category, Listing, MenuItem, AddonGroup, Addon
from cart.models import CartItem, CartItemAddon, compute_addon_signature


class CartItemUnaffectedTests(TestCase):
    """CartItem's pre-existing fields and dedup behavior are unchanged for plain listings."""

    def setUp(self):
        self.buyer = User.objects.create_user(username='buyer', email='buyer@pau.edu.ng', password='pass123')
        self.vendor = User.objects.create_user(username='vendor', email='vendor@pau.edu.ng', password='pass123')
        self.category = Category.objects.create(title='Food', slug='food')
        self.listing = Listing.objects.create(
            title='Jollof Rice', description='x', price=Decimal('1500.00'),
            vendor=self.vendor, category=self.category, is_available=True,
        )

    def test_cart_item_created_exactly_as_before(self):
        item = CartItem.objects.create(user=self.buyer, listing=self.listing, quantity=2)
        self.assertEqual(item.quantity, 2)
        self.assertEqual(item.addon_signature, '')
        self.assertEqual(list(item.selected_addons.all()), [])


class CartItemAddonTests(TestCase):
    def setUp(self):
        self.buyer = User.objects.create_user(username='buyer2', email='buyer2@pau.edu.ng', password='pass123')
        self.vendor = User.objects.create_user(username='vendor2', email='vendor2@pau.edu.ng', password='pass123')
        self.category = Category.objects.create(title='Food2', slug='food2')
        self.listing = Listing.objects.create(
            title='Jollof Rice', description='x', price=Decimal('1500.00'),
            vendor=self.vendor, category=self.category, is_available=True,
        )
        self.menu_item = MenuItem.objects.create(listing=self.listing)
        self.group = AddonGroup.objects.create(menu_item=self.menu_item, name='Protein')
        self.addon = Addon.objects.create(group=self.group, name='Chicken', price_delta=Decimal('300.00'))

    def test_cart_item_addon_selection(self):
        cart_item = CartItem.objects.create(user=self.buyer, listing=self.listing, quantity=1)
        CartItemAddon.objects.create(
            cart_item=cart_item, addon=self.addon, price_delta_at_add_time=self.addon.price_delta,
        )
        self.assertEqual(cart_item.selected_addons.count(), 1)
        self.assertEqual(cart_item.selected_addons.first().price_delta_at_add_time, Decimal('300.00'))

    def test_addon_price_change_does_not_retroactively_alter_cart_snapshot(self):
        cart_item = CartItem.objects.create(user=self.buyer, listing=self.listing, quantity=1)
        selection = CartItemAddon.objects.create(
            cart_item=cart_item, addon=self.addon, price_delta_at_add_time=self.addon.price_delta,
        )
        self.addon.price_delta = Decimal('500.00')
        self.addon.save(update_fields=['price_delta'])
        selection.refresh_from_db()
        self.assertEqual(selection.price_delta_at_add_time, Decimal('300.00'))

    def test_deleting_cart_item_cascades_to_its_addon_selections(self):
        cart_item = CartItem.objects.create(user=self.buyer, listing=self.listing, quantity=1)
        CartItemAddon.objects.create(
            cart_item=cart_item, addon=self.addon, price_delta_at_add_time=self.addon.price_delta,
        )
        cart_item.delete()
        self.assertEqual(CartItemAddon.objects.count(), 0)


class ComputeAddonSignatureTests(TestCase):
    def test_empty_selection_is_empty_string(self):
        self.assertEqual(compute_addon_signature([]), '')
        self.assertEqual(compute_addon_signature(None), '')

    def test_signature_is_order_independent(self):
        self.assertEqual(compute_addon_signature([3, 1, 2]), compute_addon_signature([1, 2, 3]))
        self.assertEqual(compute_addon_signature([2, 1]), compute_addon_signature([1, 2]))

    def test_different_selections_produce_different_signatures(self):
        self.assertNotEqual(compute_addon_signature([1, 2]), compute_addon_signature([1, 3]))

    def test_duplicate_ids_are_deduplicated(self):
        self.assertEqual(compute_addon_signature([1, 1, 2]), compute_addon_signature([1, 2]))


class CartItemUniquenessTests(TestCase):
    """
    The core architectural fix: (user, listing, addon_signature) replaces
    (user, listing). Backward compatible for every listing that never has
    add-ons (addon_signature is always ''); genuinely new capability only
    for a menu item with two or more distinct add-on selections in cart.
    """

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
        self.chicken = Addon.objects.create(group=self.group, name='Chicken', price_delta=Decimal('300.00'))
        self.beef = Addon.objects.create(group=self.group, name='Beef', price_delta=Decimal('400.00'))

    def test_plain_listing_still_enforces_one_row_per_user_per_listing(self):
        CartItem.objects.create(user=self.buyer, listing=self.listing, quantity=1)
        with self.assertRaises(IntegrityError):
            CartItem.objects.create(user=self.buyer, listing=self.listing, quantity=1)

    def test_same_addon_selection_twice_still_conflicts(self):
        sig = compute_addon_signature([self.chicken.id])
        CartItem.objects.create(user=self.buyer, listing=self.listing, quantity=1, addon_signature=sig)
        with self.assertRaises(IntegrityError):
            CartItem.objects.create(user=self.buyer, listing=self.listing, quantity=1, addon_signature=sig)

    def test_different_addon_selections_coexist_as_separate_lines(self):
        """The actual capability being added: two lines, one listing, different add-ons."""
        chicken_line = CartItem.objects.create(
            user=self.buyer, listing=self.listing, quantity=1,
            addon_signature=compute_addon_signature([self.chicken.id]),
        )
        beef_line = CartItem.objects.create(
            user=self.buyer, listing=self.listing, quantity=1,
            addon_signature=compute_addon_signature([self.beef.id]),
        )
        self.assertNotEqual(chicken_line.id, beef_line.id)
        self.assertEqual(CartItem.objects.filter(user=self.buyer, listing=self.listing).count(), 2)

    def test_plain_line_and_customized_line_can_coexist(self):
        """A buyer can order the plain item AND a customized one as separate lines."""
        plain_line = CartItem.objects.create(user=self.buyer, listing=self.listing, quantity=1)
        customized_line = CartItem.objects.create(
            user=self.buyer, listing=self.listing, quantity=1,
            addon_signature=compute_addon_signature([self.chicken.id]),
        )
        self.assertNotEqual(plain_line.id, customized_line.id)
        self.assertEqual(CartItem.objects.filter(user=self.buyer, listing=self.listing).count(), 2)

    def test_cross_user_uniqueness_still_isolated_per_buyer(self):
        other_buyer = User.objects.create_user(username='buyer4', email='buyer4@pau.edu.ng', password='pass123')
        CartItem.objects.create(user=self.buyer, listing=self.listing, quantity=1)
        # Same listing, same (empty) signature, different user — must not conflict.
        CartItem.objects.create(user=other_buyer, listing=self.listing, quantity=1)
        self.assertEqual(CartItem.objects.filter(listing=self.listing).count(), 2)


class AddToCartBackwardCompatibilityTests(TestCase):
    """
    Exercises the actual add_to_cart endpoint — not just the model layer —
    to confirm repeat calls on a plain listing still merge into one row and
    increment quantity, exactly as before this phase.
    """

    def setUp(self):
        self.client = APIClient()
        self.buyer = User.objects.create_user(username='buyer5', email='buyer5@pau.edu.ng', password='pass123')
        self.vendor = User.objects.create_user(username='vendor4', email='vendor4@pau.edu.ng', password='pass123')
        self.category = Category.objects.create(title='Food4', slug='food4')
        self.listing = Listing.objects.create(
            title='Plain Product', description='x', price=Decimal('1000.00'),
            vendor=self.vendor, category=self.category, is_available=True,
        )
        self.client.force_authenticate(user=self.buyer)

    def test_repeat_add_to_cart_merges_into_one_row(self):
        first = self.client.post('/api/cart/add/', {'listing_id': self.listing.id, 'quantity': 1})
        second = self.client.post('/api/cart/add/', {'listing_id': self.listing.id, 'quantity': 2})

        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200)  # not created — merged
        self.assertEqual(CartItem.objects.filter(user=self.buyer, listing=self.listing).count(), 1)
        item = CartItem.objects.get(user=self.buyer, listing=self.listing)
        self.assertEqual(item.quantity, 3)
        self.assertEqual(item.addon_signature, '')


class AddToCartWithAddonsTests(TestCase):
    """
    Phase 1 — Food Commerce Engine, Step 3: add_to_cart accepts addon_ids,
    validated via services.menu_selection before the CartItem/CartItemAddon
    rows are created.
    """

    def setUp(self):
        self.client = APIClient()
        self.buyer = User.objects.create_user(username='addon_buyer', email='addon_buyer@pau.edu.ng', password='pass123')
        self.vendor = User.objects.create_user(username='addon_vendor', email='addon_vendor@pau.edu.ng', password='pass123')
        self.category = Category.objects.create(title='FoodAddons', slug='food-addons')
        self.listing = Listing.objects.create(
            title='Jollof Rice', description='x', price=Decimal('1500.00'),
            vendor=self.vendor, category=self.category, is_available=True,
        )
        self.menu_item = MenuItem.objects.create(listing=self.listing)
        self.group = AddonGroup.objects.create(menu_item=self.menu_item, name='Protein', max_selections=1)
        self.chicken = Addon.objects.create(group=self.group, name='Chicken', price_delta=Decimal('300.00'))
        self.beef = Addon.objects.create(group=self.group, name='Beef', price_delta=Decimal('400.00'))
        self.client.force_authenticate(user=self.buyer)

    def test_add_with_valid_addons_creates_line_and_selections(self):
        response = self.client.post(
            '/api/cart/add/',
            {'listing_id': self.listing.id, 'quantity': 1, 'addon_ids': [self.chicken.id]},
            format='json',
        )
        self.assertEqual(response.status_code, 201)
        item = CartItem.objects.get(user=self.buyer, listing=self.listing)
        self.assertEqual(item.addon_signature, compute_addon_signature([self.chicken.id]))
        self.assertEqual(item.selected_addons.count(), 1)
        self.assertEqual(item.selected_addons.first().price_delta_at_add_time, Decimal('300.00'))

    def test_different_addon_selections_create_separate_lines(self):
        r1 = self.client.post(
            '/api/cart/add/', {'listing_id': self.listing.id, 'quantity': 1, 'addon_ids': [self.chicken.id]},
            format='json',
        )
        r2 = self.client.post(
            '/api/cart/add/', {'listing_id': self.listing.id, 'quantity': 1, 'addon_ids': [self.beef.id]},
            format='json',
        )
        self.assertEqual(r1.status_code, 201)
        self.assertEqual(r2.status_code, 201)
        self.assertEqual(CartItem.objects.filter(user=self.buyer, listing=self.listing).count(), 2)

    def test_invalid_addon_selection_rejected_with_400(self):
        response = self.client.post(
            '/api/cart/add/',
            {'listing_id': self.listing.id, 'quantity': 1, 'addon_ids': [self.chicken.id, self.beef.id]},
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(CartItem.objects.filter(user=self.buyer, listing=self.listing).count(), 0)

    def test_addon_from_another_listing_rejected(self):
        other_listing = Listing.objects.create(
            title='Suya', description='x', price=Decimal('1000.00'),
            vendor=self.vendor, category=self.category, is_available=True,
        )
        other_menu_item = MenuItem.objects.create(listing=other_listing)
        other_group = AddonGroup.objects.create(menu_item=other_menu_item, name='Spice')
        foreign_addon = Addon.objects.create(group=other_group, name='Extra Spicy', price_delta=Decimal('0'))

        response = self.client.post(
            '/api/cart/add/',
            {'listing_id': self.listing.id, 'quantity': 1, 'addon_ids': [foreign_addon.id]},
            format='json',
        )
        self.assertEqual(response.status_code, 400)

    def test_repeat_add_with_same_addon_selection_merges_and_does_not_duplicate_addon_rows(self):
        self.client.post(
            '/api/cart/add/', {'listing_id': self.listing.id, 'quantity': 1, 'addon_ids': [self.chicken.id]},
            format='json',
        )
        second = self.client.post(
            '/api/cart/add/', {'listing_id': self.listing.id, 'quantity': 2, 'addon_ids': [self.chicken.id]},
            format='json',
        )
        self.assertEqual(second.status_code, 200)
        item = CartItem.objects.get(user=self.buyer, listing=self.listing, addon_signature=compute_addon_signature([self.chicken.id]))
        self.assertEqual(item.quantity, 3)
        self.assertEqual(item.selected_addons.count(), 1)


class CartItemByIdEndpointsTests(TestCase):
    """
    Phase 1 — Food Commerce Engine, Step 3: update_cart_item_by_id /
    remove_cart_item_by_id target a specific CartItem by its own id — needed
    once a listing can have several add-on-distinct lines, where the
    listing_id-only endpoints are ambiguous.
    """

    def setUp(self):
        self.client = APIClient()
        self.buyer = User.objects.create_user(username='byid_buyer', email='byid_buyer@pau.edu.ng', password='pass123')
        self.other_buyer = User.objects.create_user(username='byid_buyer2', email='byid_buyer2@pau.edu.ng', password='pass123')
        self.vendor = User.objects.create_user(username='byid_vendor', email='byid_vendor@pau.edu.ng', password='pass123')
        self.category = Category.objects.create(title='FoodById', slug='food-by-id')
        self.listing = Listing.objects.create(
            title='Jollof Rice', description='x', price=Decimal('1500.00'),
            vendor=self.vendor, category=self.category, is_available=True,
        )
        self.menu_item = MenuItem.objects.create(listing=self.listing)
        self.group = AddonGroup.objects.create(menu_item=self.menu_item, name='Protein', max_selections=1)
        self.chicken = Addon.objects.create(group=self.group, name='Chicken', price_delta=Decimal('300.00'))
        self.beef = Addon.objects.create(group=self.group, name='Beef', price_delta=Decimal('400.00'))
        self.client.force_authenticate(user=self.buyer)

    def _add(self, addon_id):
        return self.client.post(
            '/api/cart/add/', {'listing_id': self.listing.id, 'quantity': 1, 'addon_ids': [addon_id]},
            format='json',
        ).data

    def test_update_targets_only_the_specified_line(self):
        chicken_item = self._add(self.chicken.id)
        beef_item = self._add(self.beef.id)

        response = self.client.patch(f"/api/cart/items/{chicken_item['id']}/update/", {'quantity': 5}, format='json')
        self.assertEqual(response.status_code, 200)

        chicken_row = CartItem.objects.get(id=chicken_item['id'])
        beef_row = CartItem.objects.get(id=beef_item['id'])
        self.assertEqual(chicken_row.quantity, 5)
        self.assertEqual(beef_row.quantity, 1)

    def test_remove_targets_only_the_specified_line(self):
        chicken_item = self._add(self.chicken.id)
        beef_item = self._add(self.beef.id)

        response = self.client.delete(f"/api/cart/items/{chicken_item['id']}/remove/")
        self.assertEqual(response.status_code, 204)

        self.assertFalse(CartItem.objects.filter(id=chicken_item['id']).exists())
        self.assertTrue(CartItem.objects.filter(id=beef_item['id']).exists())

    def test_cannot_update_another_buyers_cart_item(self):
        chicken_item = self._add(self.chicken.id)
        self.client.force_authenticate(user=self.other_buyer)
        response = self.client.patch(f"/api/cart/items/{chicken_item['id']}/update/", {'quantity': 9}, format='json')
        self.assertEqual(response.status_code, 404)

    def test_cannot_remove_another_buyers_cart_item(self):
        chicken_item = self._add(self.chicken.id)
        self.client.force_authenticate(user=self.other_buyer)
        response = self.client.delete(f"/api/cart/items/{chicken_item['id']}/remove/")
        self.assertEqual(response.status_code, 404)


class CartItemSerializerVendorFieldsTests(TestCase):
    """CartItemSerializer exposes vendor_id/vendor_username/selected_addons so the
    frontend can group a multi-vendor cart by vendor for checkout (Step 3)."""

    def setUp(self):
        self.client = APIClient()
        self.buyer = User.objects.create_user(username='ser_buyer', email='ser_buyer@pau.edu.ng', password='pass123')
        self.vendor_a = User.objects.create_user(username='ser_vendor_a', email='ser_vendor_a@pau.edu.ng', password='pass123')
        self.vendor_b = User.objects.create_user(username='ser_vendor_b', email='ser_vendor_b@pau.edu.ng', password='pass123')
        self.category = Category.objects.create(title='FoodSer', slug='food-ser')
        self.listing_a = Listing.objects.create(
            title='Jollof Rice', description='x', price=Decimal('1500.00'),
            vendor=self.vendor_a, category=self.category, is_available=True,
        )
        self.listing_b = Listing.objects.create(
            title='Suya', description='x', price=Decimal('1000.00'),
            vendor=self.vendor_b, category=self.category, is_available=True,
        )
        self.client.force_authenticate(user=self.buyer)

    def test_cart_spans_multiple_vendors_with_vendor_fields_exposed(self):
        self.client.post('/api/cart/add/', {'listing_id': self.listing_a.id, 'quantity': 1})
        self.client.post('/api/cart/add/', {'listing_id': self.listing_b.id, 'quantity': 1})

        response = self.client.get('/api/cart/')
        self.assertEqual(response.status_code, 200)
        vendor_ids = {row['vendor_id'] for row in response.data}
        self.assertEqual(vendor_ids, {self.vendor_a.id, self.vendor_b.id})
        usernames = {row['vendor_username'] for row in response.data}
        self.assertEqual(usernames, {'ser_vendor_a', 'ser_vendor_b'})
