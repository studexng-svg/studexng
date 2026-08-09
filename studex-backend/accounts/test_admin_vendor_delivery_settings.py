# accounts/test_admin_vendor_delivery_settings.py
"""
Admin dashboard surface for accounts.models.Vendor.delivery_fee /
free_delivery_quota (AdminUserDetailView.get/patch, accounts/admin_views.py).
Before this, the only way to set these fields was raw Django admin — this
covers the /api/admin/users/{id}/ GET+PATCH path the Next.js admin dashboard
actually uses.
"""
from decimal import Decimal

from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework import status

from accounts.models import User, Vendor, VendorType
from delivery.models import DeliverySlot
from orders.models import Order
from services.models import Category, Listing


class AdminVendorDeliverySettingsTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            username='dfs_admin', email='dfs_admin@pau.edu.ng', password='pass123', is_staff=True,
        )
        self.vendor_user = User.objects.create_user(
            username='dfs_vendor', email='dfs_vendor@pau.edu.ng', password='pass123', user_type='vendor',
        )
        self.plain_user = User.objects.create_user(
            username='dfs_plain', email='dfs_plain@pau.edu.ng', password='pass123',
        )
        food = VendorType.objects.get(name='food')
        self.vendor_record = Vendor.objects.create(user=self.vendor_user, vendor_type=food)
        self.client.force_authenticate(user=self.admin)

    def _url(self, user):
        return f'/api/admin/users/{user.id}/'

    # ── GET ──────────────────────────────────────────────────────────────

    def test_get_includes_vendor_block_with_defaults(self):
        res = self.client.get(self._url(self.vendor_user))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['vendor'], {
            'delivery_fee': '0.00',
            'free_delivery_quota': None,
            'free_deliveries_used': None,
            'free_deliveries_remaining': None,
        })

    def test_get_vendor_block_is_none_when_no_vendor_row(self):
        """user_type='vendor' alone doesn't guarantee a Vendor row exists."""
        no_record = User.objects.create_user(
            username='dfs_norecord', email='dfs_norecord@pau.edu.ng', password='pass123', user_type='vendor',
        )
        res = self.client.get(self._url(no_record))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIsNone(res.data['vendor'])

    def test_get_vendor_block_is_none_for_non_vendor(self):
        res = self.client.get(self._url(self.plain_user))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIsNone(res.data['vendor'])

    def test_get_reports_live_usage_against_quota(self):
        self.vendor_record.free_delivery_quota = 15
        self.vendor_record.delivery_fee = Decimal('300.00')
        self.vendor_record.save(update_fields=['free_delivery_quota', 'delivery_fee'])

        category = Category.objects.create(title='FoodDFS', slug='food-dfs')
        listing = Listing.objects.create(
            title='Jollof', description='x', payout_amount=Decimal('1000'), price=Decimal('1080'),
            vendor=self.vendor_user, category=category, is_available=True,
        )
        slot = DeliverySlot.objects.create(
            vendor=self.vendor_user, campus='pau', display_name='Lunch',
            delivery_time='13:00', max_orders=100,
        )
        # 2 delivered-via-slot orders count against the quota...
        for i in range(2):
            Order.objects.create(
                reference=f'dfs-slot-{i}', listing=listing, buyer=self.plain_user, amount=Decimal('1080'),
                status='paid', delivery_slot=slot,
            )
        # ...a cancelled slot order doesn't burn a promo slot...
        Order.objects.create(
            reference='dfs-slot-cancelled', listing=listing, buyer=self.plain_user, amount=Decimal('1080'),
            status='cancelled', delivery_slot=slot,
        )
        # ...and a non-slot order (pickup, no batching) doesn't count either.
        Order.objects.create(
            reference='dfs-no-slot', listing=listing, buyer=self.plain_user, amount=Decimal('1080'),
            status='paid', delivery_slot=None,
        )

        res = self.client.get(self._url(self.vendor_user))
        self.assertEqual(res.data['vendor']['free_delivery_quota'], 15)
        self.assertEqual(res.data['vendor']['free_deliveries_used'], 2)
        self.assertEqual(res.data['vendor']['free_deliveries_remaining'], 13)

    # ── PATCH ────────────────────────────────────────────────────────────

    def test_patch_sets_delivery_fee_and_quota(self):
        res = self.client.patch(
            self._url(self.vendor_user), {'vendor': {'delivery_fee': '300.00', 'free_delivery_quota': 15}},
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.vendor_record.refresh_from_db()
        self.assertEqual(self.vendor_record.delivery_fee, Decimal('300.00'))
        self.assertEqual(self.vendor_record.free_delivery_quota, 15)
        self.assertEqual(res.data['vendor']['free_delivery_quota'], 15)
        self.assertEqual(res.data['vendor']['free_deliveries_used'], 0)
        self.assertEqual(res.data['vendor']['free_deliveries_remaining'], 15)

    def test_patch_clears_quota_with_null(self):
        self.vendor_record.free_delivery_quota = 15
        self.vendor_record.save(update_fields=['free_delivery_quota'])

        res = self.client.patch(
            self._url(self.vendor_user), {'vendor': {'free_delivery_quota': None}}, format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.vendor_record.refresh_from_db()
        self.assertIsNone(self.vendor_record.free_delivery_quota)

    def test_patch_rejects_negative_delivery_fee(self):
        res = self.client.patch(
            self._url(self.vendor_user), {'vendor': {'delivery_fee': '-50'}}, format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.vendor_record.refresh_from_db()
        self.assertEqual(self.vendor_record.delivery_fee, Decimal('0.00'))

    def test_patch_rejects_negative_quota(self):
        res = self.client.patch(
            self._url(self.vendor_user), {'vendor': {'free_delivery_quota': -5}}, format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_patch_rejects_non_numeric_delivery_fee(self):
        res = self.client.patch(
            self._url(self.vendor_user), {'vendor': {'delivery_fee': 'free'}}, format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_patch_creates_vendor_row_if_missing(self):
        """Admin can set delivery settings even before a Vendor row exists —
        get_or_create mirrors the pattern already used in accounts/views.py
        and accounts/admin.py's backfill_vendor_records."""
        no_record = User.objects.create_user(
            username='dfs_backfill', email='dfs_backfill@pau.edu.ng', password='pass123', user_type='vendor',
        )
        res = self.client.patch(
            self._url(no_record), {'vendor': {'delivery_fee': '200.00', 'free_delivery_quota': 5}}, format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        v = Vendor.objects.get(user=no_record)
        self.assertEqual(v.delivery_fee, Decimal('200.00'))
        self.assertEqual(v.free_delivery_quota, 5)

    def test_patch_requires_admin(self):
        self.client.force_authenticate(user=self.plain_user)
        res = self.client.patch(
            self._url(self.vendor_user), {'vendor': {'delivery_fee': '300.00'}}, format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
