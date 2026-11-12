# services/test_menu_management.py
"""
Test suite for Phase 1 Step 2 (Food Commerce Engine — vendor-facing menu
management). Covers the four new ViewSets (MenuCategory, MenuItem,
AddonGroup, Addon) exposed under /api/v1/services/ — capability gating via
VendorType.supports_menu_ordering (never a hardcoded vendor-type check),
per-vendor ownership scoping, cross-vendor isolation, field validation, and
bulk reordering.

None of this touches Listing/Order/payment/delivery code — those are
confirmed unaffected by the full regression suite, not re-tested here.
"""
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User, Vendor, VendorType
from services.models import Category, Listing, MenuCategory, MenuItem, AddonGroup, Addon, MenuItemAddonGroup


class MenuManagementTestBase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.food = VendorType.objects.get(name='food')
        self.beauty = VendorType.objects.get(name='beauty')

        self.vendor = User.objects.create_user(
            username='food_vendor', email='food_vendor@pau.edu.ng', password='pass123', user_type='vendor',
            is_verified_vendor=True,
        )
        Vendor.objects.create(user=self.vendor, vendor_type=self.food)

        self.other_vendor = User.objects.create_user(
            username='food_vendor2', email='food_vendor2@pau.edu.ng', password='pass123', user_type='vendor',
            is_verified_vendor=True,
        )
        Vendor.objects.create(user=self.other_vendor, vendor_type=self.food)

        self.non_menu_vendor = User.objects.create_user(
            username='beauty_vendor', email='beauty_vendor@pau.edu.ng', password='pass123', user_type='vendor',
        )
        Vendor.objects.create(user=self.non_menu_vendor, vendor_type=self.beauty)

        self.no_vendor_type_vendor = User.objects.create_user(
            username='plain_vendor', email='plain_vendor@pau.edu.ng', password='pass123', user_type='vendor',
        )
        Vendor.objects.create(user=self.no_vendor_type_vendor)  # vendor_type left unset

        self.student = User.objects.create_user(
            username='student', email='student@pau.edu.ng', password='pass123',
        )

        self.category = Category.objects.create(title='Food', slug='food')
        self.listing = Listing.objects.create(
            title='Jollof Rice', description='x', price=Decimal('1500.00'),
            vendor=self.vendor, category=self.category, is_available=True,
        )
        self.other_listing = Listing.objects.create(
            title='Suya', description='x', price=Decimal('2000.00'),
            vendor=self.other_vendor, category=self.category, is_available=True,
        )


class CapabilityGatingTests(MenuManagementTestBase):
    def test_food_vendor_can_access_menu_categories(self):
        self.client.force_authenticate(user=self.vendor)
        response = self.client.get('/api/v1/services/menu-categories/')
        self.assertEqual(response.status_code, 200)

    def test_beauty_vendor_cannot_access_menu_categories(self):
        self.client.force_authenticate(user=self.non_menu_vendor)
        response = self.client.get('/api/v1/services/menu-categories/')
        self.assertEqual(response.status_code, 403)

    def test_vendor_with_no_vendor_type_cannot_access_menu_categories(self):
        self.client.force_authenticate(user=self.no_vendor_type_vendor)
        response = self.client.get('/api/v1/services/menu-categories/')
        self.assertEqual(response.status_code, 403)

    def test_student_cannot_access_menu_categories(self):
        self.client.force_authenticate(user=self.student)
        response = self.client.get('/api/v1/services/menu-categories/')
        self.assertEqual(response.status_code, 403)

    def test_unauthenticated_request_rejected(self):
        response = self.client.get('/api/v1/services/menu-categories/')
        self.assertIn(response.status_code, (401, 403))

    def test_gating_applies_identically_to_menu_items_addon_groups_addons(self):
        self.client.force_authenticate(user=self.non_menu_vendor)
        for path in ('menu-items', 'addon-groups', 'addons', 'addon-group-links'):
            response = self.client.get(f'/api/v1/services/{path}/')
            self.assertEqual(response.status_code, 403, f'{path} should be gated too')


class MenuCategoryCRUDTests(MenuManagementTestBase):
    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.vendor)

    def test_create_category(self):
        response = self.client.post('/api/v1/services/menu-categories/', {'name': 'Mains', 'display_order': 0})
        self.assertEqual(response.status_code, 201, response.data)
        category = MenuCategory.objects.get(id=response.data['id'])
        self.assertEqual(category.vendor, self.vendor)

    def test_list_only_shows_own_categories(self):
        MenuCategory.objects.create(vendor=self.vendor, name='Mains')
        MenuCategory.objects.create(vendor=self.other_vendor, name='Drinks')
        response = self.client.get('/api/v1/services/menu-categories/')
        self.assertEqual(response.status_code, 200)
        # Not paginated (pagination_class = None) — a plain list, not {results: [...]}.
        names = [c['name'] for c in response.data]
        self.assertEqual(names, ['Mains'])

    def test_cannot_retrieve_another_vendors_category(self):
        other_category = MenuCategory.objects.create(vendor=self.other_vendor, name='Drinks')
        response = self.client.get(f'/api/v1/services/menu-categories/{other_category.id}/')
        self.assertEqual(response.status_code, 404)

    def test_cannot_update_another_vendors_category(self):
        other_category = MenuCategory.objects.create(vendor=self.other_vendor, name='Drinks')
        response = self.client.patch(f'/api/v1/services/menu-categories/{other_category.id}/', {'name': 'Hacked'})
        self.assertEqual(response.status_code, 404)
        other_category.refresh_from_db()
        self.assertEqual(other_category.name, 'Drinks')

    def test_cannot_delete_another_vendors_category(self):
        other_category = MenuCategory.objects.create(vendor=self.other_vendor, name='Drinks')
        response = self.client.delete(f'/api/v1/services/menu-categories/{other_category.id}/')
        self.assertEqual(response.status_code, 404)
        self.assertTrue(MenuCategory.objects.filter(id=other_category.id).exists())

    def test_update_own_category(self):
        category = MenuCategory.objects.create(vendor=self.vendor, name='Mains')
        response = self.client.patch(f'/api/v1/services/menu-categories/{category.id}/', {'name': 'Main Dishes'})
        self.assertEqual(response.status_code, 200)
        category.refresh_from_db()
        self.assertEqual(category.name, 'Main Dishes')

    def test_delete_own_category(self):
        category = MenuCategory.objects.create(vendor=self.vendor, name='Mains')
        response = self.client.delete(f'/api/v1/services/menu-categories/{category.id}/')
        self.assertEqual(response.status_code, 204)
        self.assertFalse(MenuCategory.objects.filter(id=category.id).exists())


class MenuCategoryReorderTests(MenuManagementTestBase):
    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.vendor)
        self.starters = MenuCategory.objects.create(vendor=self.vendor, name='Starters', display_order=0)
        self.mains = MenuCategory.objects.create(vendor=self.vendor, name='Mains', display_order=1)
        self.other_category = MenuCategory.objects.create(vendor=self.other_vendor, name='Drinks', display_order=0)

    def test_reorder_updates_display_order(self):
        response = self.client.post('/api/v1/services/menu-categories/reorder/', {
            'items': [
                {'id': self.starters.id, 'display_order': 2},
                {'id': self.mains.id, 'display_order': 0},
            ],
        }, format='json')
        self.assertEqual(response.status_code, 200)
        self.starters.refresh_from_db()
        self.mains.refresh_from_db()
        self.assertEqual(self.starters.display_order, 2)
        self.assertEqual(self.mains.display_order, 0)

    def test_reorder_cannot_touch_another_vendors_category(self):
        response = self.client.post('/api/v1/services/menu-categories/reorder/', {
            'items': [{'id': self.other_category.id, 'display_order': 99}],
        }, format='json')
        self.assertEqual(response.status_code, 200)  # request succeeds, but silently ignores the foreign id
        self.other_category.refresh_from_db()
        self.assertEqual(self.other_category.display_order, 0)

    def test_reorder_rejects_empty_items(self):
        response = self.client.post('/api/v1/services/menu-categories/reorder/', {'items': []}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_reorder_rejects_duplicate_ids(self):
        response = self.client.post('/api/v1/services/menu-categories/reorder/', {
            'items': [
                {'id': self.starters.id, 'display_order': 0},
                {'id': self.starters.id, 'display_order': 1},
            ],
        }, format='json')
        self.assertEqual(response.status_code, 400)


class MenuItemCRUDTests(MenuManagementTestBase):
    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.vendor)
        self.category = MenuCategory.objects.create(vendor=self.vendor, name='Mains')

    def test_create_menu_item_for_own_listing(self):
        response = self.client.post('/api/v1/services/menu-items/', {
            'listing': self.listing.id, 'menu_category': self.category.id,
            'prep_time_minutes': 15, 'allergens': ['peanuts'],
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        item = MenuItem.objects.get(listing=self.listing)
        self.assertEqual(item.prep_time_minutes, 15)
        self.assertEqual(item.allergens, ['peanuts'])

    def test_cannot_create_menu_item_for_another_vendors_listing(self):
        response = self.client.post('/api/v1/services/menu-items/', {'listing': self.other_listing.id}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertFalse(MenuItem.objects.filter(listing=self.other_listing).exists())

    def test_cannot_create_duplicate_menu_item_for_same_listing(self):
        MenuItem.objects.create(listing=self.listing)
        response = self.client.post('/api/v1/services/menu-items/', {'listing': self.listing.id}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_cannot_assign_another_vendors_menu_category(self):
        other_category = MenuCategory.objects.create(vendor=self.other_vendor, name='Drinks')
        response = self.client.post('/api/v1/services/menu-items/', {
            'listing': self.listing.id, 'menu_category': other_category.id,
        }, format='json')
        self.assertEqual(response.status_code, 400)

    def test_retrieve_includes_nested_addon_groups(self):
        item = MenuItem.objects.create(listing=self.listing)
        group = AddonGroup.objects.create(vendor=self.vendor, name='Protein')
        Addon.objects.create(group=group, name='Chicken', price_delta=Decimal('300.00'))
        MenuItemAddonGroup.objects.create(menu_item=item, addon_group=group)

        response = self.client.get(f'/api/v1/services/menu-items/{item.id}/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data['addon_groups']), 1)
        self.assertEqual(response.data['addon_groups'][0]['name'], 'Protein')
        self.assertEqual(len(response.data['addon_groups'][0]['addons']), 1)
        self.assertEqual(response.data['listing_title'], 'Jollof Rice')

    def test_retrieve_shows_effective_rule_not_group_default(self):
        item = MenuItem.objects.create(listing=self.listing)
        group = AddonGroup.objects.create(vendor=self.vendor, name='Spice Level', is_required=False, max_selections=2)
        MenuItemAddonGroup.objects.create(
            menu_item=item, addon_group=group, is_required_override=True, min_selections_override=1, max_selections_override=1,
        )
        response = self.client.get(f'/api/v1/services/menu-items/{item.id}/')
        [link] = response.data['addon_groups']
        self.assertTrue(link['is_required'])
        self.assertEqual(link['min_selections'], 1)
        self.assertEqual(link['max_selections'], 1)

    def test_cannot_retrieve_another_vendors_menu_item(self):
        other_item = MenuItem.objects.create(listing=self.other_listing)
        response = self.client.get(f'/api/v1/services/menu-items/{other_item.id}/')
        self.assertEqual(response.status_code, 404)

    def test_update_menu_item_flags(self):
        item = MenuItem.objects.create(listing=self.listing)
        response = self.client.patch(f'/api/v1/services/menu-items/{item.id}/', {'is_seasonal': True, 'is_hidden': True})
        self.assertEqual(response.status_code, 200)
        item.refresh_from_db()
        self.assertTrue(item.is_seasonal)
        self.assertTrue(item.is_hidden)

    def test_instant_unavailability_uses_menu_item_is_hidden_not_listing_is_available(self):
        """
        FR-15 ("mark a menu item unavailable instantly without deleting it")
        is satisfied via MenuItem.is_hidden, not Listing.is_available —
        ListingViewSet.update() has a pre-existing, cross-vendor-type rule
        that strips is_available from any non-staff PATCH ("only admin can
        [approve/reject a listing] via Django Admin"), which this phase does
        not touch. is_hidden already exists for exactly this — hiding from
        buyer browsing without deactivating the underlying listing.
        """
        item = MenuItem.objects.create(listing=self.listing)

        # Confirms the pre-existing rule is untouched: a vendor still cannot
        # flip is_available themselves, for a menu item or any other listing.
        response = self.client.patch(f'/api/v1/services/listings/{self.listing.id}/', {'is_available': False})
        self.assertEqual(response.status_code, 200)
        self.listing.refresh_from_db()
        self.assertTrue(self.listing.is_available)  # unchanged — silently stripped, as it always has been

        # The actual FR-15 mechanism: MenuItem.is_hidden, vendor-toggleable.
        response = self.client.patch(f'/api/v1/services/menu-items/{item.id}/', {'is_hidden': True})
        self.assertEqual(response.status_code, 200)
        item.refresh_from_db()
        self.assertTrue(item.is_hidden)


class AddonGroupCRUDAndValidationTests(MenuManagementTestBase):
    """
    AddonGroup is a vendor-level library template (Phase 2 — Add-on
    Library) — created and owned directly by the vendor, with no menu_item
    involved at all. Linking one to a dish is covered separately below in
    AddonGroupLinkCRUDTests.
    """
    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.vendor)

    def test_create_addon_group(self):
        response = self.client.post('/api/v1/services/addon-groups/', {
            'name': 'Choose your protein', 'is_required': True, 'min_selections': 1, 'max_selections': 1,
        })
        self.assertEqual(response.status_code, 201, response.data)
        group = AddonGroup.objects.get(id=response.data['id'])
        self.assertEqual(group.vendor, self.vendor)

    def test_list_only_shows_own_groups(self):
        AddonGroup.objects.create(vendor=self.vendor, name='Protein')
        AddonGroup.objects.create(vendor=self.other_vendor, name='Spice')
        response = self.client.get('/api/v1/services/addon-groups/')
        self.assertEqual(response.status_code, 200)
        # Not paginated (pagination_class = None) — a plain list, not {results: [...]}.
        names = [g['name'] for g in response.data]
        self.assertEqual(names, ['Protein'])

    def test_cannot_retrieve_another_vendors_group(self):
        other_group = AddonGroup.objects.create(vendor=self.other_vendor, name='Spice')
        response = self.client.get(f'/api/v1/services/addon-groups/{other_group.id}/')
        self.assertEqual(response.status_code, 404)

    def test_cannot_update_another_vendors_group(self):
        other_group = AddonGroup.objects.create(vendor=self.other_vendor, name='Spice')
        response = self.client.patch(f'/api/v1/services/addon-groups/{other_group.id}/', {'name': 'Hacked'})
        self.assertEqual(response.status_code, 404)

    def test_min_selections_cannot_exceed_max_selections(self):
        response = self.client.post('/api/v1/services/addon-groups/', {
            'name': 'Extras', 'min_selections': 3, 'max_selections': 1,
        })
        self.assertEqual(response.status_code, 400)

    def test_required_group_must_have_min_selections_at_least_one(self):
        response = self.client.post('/api/v1/services/addon-groups/', {
            'name': 'Protein', 'is_required': True, 'min_selections': 0,
        })
        self.assertEqual(response.status_code, 400)

    def test_max_selections_must_be_at_least_one(self):
        response = self.client.post('/api/v1/services/addon-groups/', {
            'name': 'Extras', 'max_selections': 0,
        })
        self.assertEqual(response.status_code, 400)

    def test_optional_group_with_zero_min_selections_is_valid(self):
        response = self.client.post('/api/v1/services/addon-groups/', {
            'name': 'Extras', 'is_required': False, 'min_selections': 0, 'max_selections': 3,
        })
        self.assertEqual(response.status_code, 201, response.data)

    def test_linked_menu_item_ids_reflects_links(self):
        item = MenuItem.objects.create(listing=self.listing)
        group = AddonGroup.objects.create(vendor=self.vendor, name='Protein')
        MenuItemAddonGroup.objects.create(menu_item=item, addon_group=group)
        response = self.client.get(f'/api/v1/services/addon-groups/{group.id}/')
        self.assertEqual(response.data['linked_menu_item_ids'], [item.id])

    def test_deleting_group_cascades_its_links(self):
        item = MenuItem.objects.create(listing=self.listing)
        group = AddonGroup.objects.create(vendor=self.vendor, name='Protein')
        MenuItemAddonGroup.objects.create(menu_item=item, addon_group=group)
        response = self.client.delete(f'/api/v1/services/addon-groups/{group.id}/')
        self.assertEqual(response.status_code, 204)
        self.assertEqual(MenuItemAddonGroup.objects.count(), 0)


class AddonGroupLinkCRUDTests(MenuManagementTestBase):
    """Covers /api/v1/services/addon-group-links/ — linking a vendor's library AddonGroup to one of their dishes."""
    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.vendor)
        self.menu_item = MenuItem.objects.create(listing=self.listing)
        self.other_menu_item = MenuItem.objects.create(listing=self.other_listing)
        self.group = AddonGroup.objects.create(vendor=self.vendor, name='Spice Level', min_selections=0, max_selections=2)
        self.other_group = AddonGroup.objects.create(vendor=self.other_vendor, name='Extras')

    def test_link_group_to_own_menu_item(self):
        response = self.client.post('/api/v1/services/addon-group-links/', {
            'menu_item': self.menu_item.id, 'addon_group': self.group.id,
        })
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['name'], 'Spice Level')
        self.assertEqual(response.data['min_selections'], 0)
        self.assertEqual(response.data['max_selections'], 2)

    def test_cannot_link_to_another_vendors_menu_item(self):
        response = self.client.post('/api/v1/services/addon-group-links/', {
            'menu_item': self.other_menu_item.id, 'addon_group': self.group.id,
        })
        self.assertEqual(response.status_code, 400)

    def test_cannot_link_another_vendors_group(self):
        response = self.client.post('/api/v1/services/addon-group-links/', {
            'menu_item': self.menu_item.id, 'addon_group': self.other_group.id,
        })
        self.assertEqual(response.status_code, 400)

    def test_cannot_link_same_group_to_same_item_twice(self):
        MenuItemAddonGroup.objects.create(menu_item=self.menu_item, addon_group=self.group)
        response = self.client.post('/api/v1/services/addon-group-links/', {
            'menu_item': self.menu_item.id, 'addon_group': self.group.id,
        })
        self.assertEqual(response.status_code, 400)

    def test_same_group_can_be_linked_to_a_second_menu_item(self):
        own_second_listing = Listing.objects.create(
            title='Fried Rice', description='x', price=Decimal('1600.00'),
            vendor=self.vendor, category=self.category, is_available=True,
        )
        second_item = MenuItem.objects.create(listing=own_second_listing)
        MenuItemAddonGroup.objects.create(menu_item=self.menu_item, addon_group=self.group)
        response = self.client.post('/api/v1/services/addon-group-links/', {
            'menu_item': second_item.id, 'addon_group': self.group.id,
        })
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(self.group.menu_items.count(), 2)

    def test_override_rejected_when_effective_min_exceeds_effective_max(self):
        response = self.client.post('/api/v1/services/addon-group-links/', {
            'menu_item': self.menu_item.id, 'addon_group': self.group.id,
            'min_selections_override': 3,
        })
        self.assertEqual(response.status_code, 400)

    def test_override_rejected_when_required_without_effective_min(self):
        response = self.client.post('/api/v1/services/addon-group-links/', {
            'menu_item': self.menu_item.id, 'addon_group': self.group.id,
            'is_required_override': True, 'min_selections_override': 0,
        })
        self.assertEqual(response.status_code, 400)

    def test_update_override_on_existing_link(self):
        link = MenuItemAddonGroup.objects.create(menu_item=self.menu_item, addon_group=self.group)
        response = self.client.patch(f'/api/v1/services/addon-group-links/{link.id}/', {
            'is_required_override': True, 'min_selections_override': 1,
        })
        self.assertEqual(response.status_code, 200, response.data)
        link.refresh_from_db()
        self.assertTrue(link.effective_is_required)
        self.assertEqual(link.effective_min_selections, 1)

    def test_unlinking_removes_link_but_keeps_group_and_other_links(self):
        own_second_listing = Listing.objects.create(
            title='Fried Rice', description='x', price=Decimal('1600.00'),
            vendor=self.vendor, category=self.category, is_available=True,
        )
        second_item = MenuItem.objects.create(listing=own_second_listing)
        link = MenuItemAddonGroup.objects.create(menu_item=self.menu_item, addon_group=self.group)
        MenuItemAddonGroup.objects.create(menu_item=second_item, addon_group=self.group)

        response = self.client.delete(f'/api/v1/services/addon-group-links/{link.id}/')
        self.assertEqual(response.status_code, 204)
        self.assertTrue(AddonGroup.objects.filter(id=self.group.id).exists())
        self.assertEqual(self.group.menu_items.count(), 1)

    def test_cannot_delete_another_vendors_link(self):
        link = MenuItemAddonGroup.objects.create(menu_item=self.other_menu_item, addon_group=self.other_group)
        response = self.client.delete(f'/api/v1/services/addon-group-links/{link.id}/')
        self.assertEqual(response.status_code, 404)
        self.assertTrue(MenuItemAddonGroup.objects.filter(id=link.id).exists())


class AddonCRUDTests(MenuManagementTestBase):
    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.vendor)
        self.group = AddonGroup.objects.create(vendor=self.vendor, name='Protein')
        self.other_group = AddonGroup.objects.create(vendor=self.other_vendor, name='Extras')

    def test_create_addon(self):
        response = self.client.post('/api/v1/services/addons/', {
            'group': self.group.id, 'name': 'Chicken', 'price_delta': '300.00',
        })
        self.assertEqual(response.status_code, 201, response.data)

    def test_price_delta_can_be_negative(self):
        response = self.client.post('/api/v1/services/addons/', {
            'group': self.group.id, 'name': 'No plantain', 'price_delta': '-200.00',
        })
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Decimal(response.data['price_delta']), Decimal('-200.00'))

    def test_cannot_create_addon_on_another_vendors_group(self):
        response = self.client.post('/api/v1/services/addons/', {
            'group': self.other_group.id, 'name': 'Chicken', 'price_delta': '300.00',
        })
        self.assertEqual(response.status_code, 400)

    def test_toggle_availability(self):
        addon = Addon.objects.create(group=self.group, name='Chicken', price_delta=Decimal('300.00'))
        response = self.client.patch(f'/api/v1/services/addons/{addon.id}/', {'is_available': False})
        self.assertEqual(response.status_code, 200)
        addon.refresh_from_db()
        self.assertFalse(addon.is_available)

    def test_reorder_addons(self):
        first = Addon.objects.create(group=self.group, name='Chicken', price_delta=Decimal('300.00'), display_order=0)
        second = Addon.objects.create(group=self.group, name='Beef', price_delta=Decimal('400.00'), display_order=1)
        response = self.client.post('/api/v1/services/addons/reorder/', {
            'items': [{'id': first.id, 'display_order': 1}, {'id': second.id, 'display_order': 0}],
        }, format='json')
        self.assertEqual(response.status_code, 200)
        first.refresh_from_db()
        second.refresh_from_db()
        self.assertEqual(first.display_order, 1)
        self.assertEqual(second.display_order, 0)


class NoPaginationTests(MenuManagementTestBase):
    """
    Regression test: these five list endpoints must return every one of the
    vendor's own rows in a single response, never DRF's default 20-per-page
    slice (REST_FRAMEWORK['PAGE_SIZE'] = 20 in settings.py) — a vendor with
    more than 20 menu items had their dashboard silently truncated to the
    first 20 before pagination_class = None was added to each ViewSet.
    `toArray()` on the frontend accepts either a plain list or a paginated
    {results: [...]} envelope, so asserting a plain list here is itself part
    of the regression check — a paginated response would also carry a
    'results' key, which `isinstance(response.data, list)` rules out.
    """
    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.vendor)

    def test_menu_items_not_paginated_past_default_page_size(self):
        for i in range(25):
            listing = Listing.objects.create(
                title=f'Dish {i}', description='x', price=Decimal('1000.00'),
                vendor=self.vendor, category=self.category, is_available=True,
            )
            MenuItem.objects.create(listing=listing)
        response = self.client.get('/api/v1/services/menu-items/')
        self.assertEqual(response.status_code, 200)
        self.assertIsInstance(response.data, list)
        self.assertEqual(len(response.data), 25)

    def test_menu_categories_not_paginated_past_default_page_size(self):
        for i in range(25):
            MenuCategory.objects.create(vendor=self.vendor, name=f'Category {i}')
        response = self.client.get('/api/v1/services/menu-categories/')
        self.assertEqual(response.status_code, 200)
        self.assertIsInstance(response.data, list)
        self.assertEqual(len(response.data), 25)

    def test_addon_groups_not_paginated_past_default_page_size(self):
        for i in range(25):
            AddonGroup.objects.create(vendor=self.vendor, name=f'Group {i}')
        response = self.client.get('/api/v1/services/addon-groups/')
        self.assertEqual(response.status_code, 200)
        self.assertIsInstance(response.data, list)
        self.assertEqual(len(response.data), 25)

    def test_addons_not_paginated_past_default_page_size(self):
        group = AddonGroup.objects.create(vendor=self.vendor, name='Extras')
        for i in range(25):
            Addon.objects.create(group=group, name=f'Option {i}', price_delta=Decimal('0'))
        response = self.client.get('/api/v1/services/addons/')
        self.assertEqual(response.status_code, 200)
        self.assertIsInstance(response.data, list)
        self.assertEqual(len(response.data), 25)

    def test_addon_group_links_not_paginated_past_default_page_size(self):
        for i in range(25):
            listing = Listing.objects.create(
                title=f'Dish {i}', description='x', price=Decimal('1000.00'),
                vendor=self.vendor, category=self.category, is_available=True,
            )
            item = MenuItem.objects.create(listing=listing)
            group = AddonGroup.objects.create(vendor=self.vendor, name=f'Group {i}')
            MenuItemAddonGroup.objects.create(menu_item=item, addon_group=group)
        response = self.client.get('/api/v1/services/addon-group-links/')
        self.assertEqual(response.status_code, 200)
        self.assertIsInstance(response.data, list)
        self.assertEqual(len(response.data), 25)
