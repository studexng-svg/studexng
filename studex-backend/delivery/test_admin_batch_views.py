# delivery/test_admin_batch_views.py
"""
Test suite for the admin Delivery Slot CRUD API (Phase 2 simplification —
one CRUD surface replacing the earlier batch-templates + delivery-batches
pair). Capacity ("used_today") is computed live from real Order rows, not
stored — there's no force-close/override action any more, since a slot has
no per-day state to override; toggling is_active is the only lever.
"""
from datetime import time

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User
from delivery.models import DeliverySlot


class AdminDeliverySlotViewsTestBase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            username='abv_admin', email='abv_admin@pau.edu.ng', password='pass123', is_staff=True,
        )
        self.non_admin = User.objects.create_user(
            username='abv_user', email='abv_user@pau.edu.ng', password='pass123',
        )
        self.vendor = User.objects.create_user(
            username='abv_vendor', email='abv_vendor@pau.edu.ng', password='pass123',
        )


class AdminDeliverySlotListViewTests(AdminDeliverySlotViewsTestBase):
    def test_non_admin_forbidden(self):
        self.client.force_authenticate(user=self.non_admin)
        response = self.client.get('/api/admin/delivery-slots/')
        self.assertEqual(response.status_code, 403)

    def test_admin_can_create_slot(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post('/api/admin/delivery-slots/', {
            'vendor': self.vendor.id, 'campus': 'pau', 'display_name': 'Lunch Run',
            'delivery_time': '13:00:00', 'cutoff_offset_minutes': 15, 'max_orders': 10,
        }, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(DeliverySlot.objects.count(), 1)
        self.assertTrue(DeliverySlot.objects.get().is_active)

    def test_admin_can_list_slots_filtered_by_vendor(self):
        DeliverySlot.objects.create(
            vendor=self.vendor, campus='pau', display_name='Lunch', delivery_time=time(13, 0),
            cutoff_offset_minutes=15, max_orders=10,
        )
        other_vendor = User.objects.create_user(username='abv_vendor2', email='abv_vendor2@pau.edu.ng', password='pass123')
        DeliverySlot.objects.create(
            vendor=other_vendor, campus='pau', display_name='Dinner', delivery_time=time(19, 0),
            cutoff_offset_minutes=15, max_orders=5,
        )

        self.client.force_authenticate(user=self.admin)
        response = self.client.get(f'/api/admin/delivery-slots/?vendor_id={self.vendor.id}')

        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['display_name'], 'Lunch')

    def test_used_today_visible_in_list(self):
        from decimal import Decimal
        from services.models import Category, Listing
        from orders.models import Order
        slot = DeliverySlot.objects.create(
            vendor=self.vendor, campus='pau', display_name='Lunch', delivery_time=time(13, 0),
            cutoff_offset_minutes=15, max_orders=10,
        )
        category = Category.objects.create(title='FoodAdmin', slug='food-admin')
        listing = Listing.objects.create(title='Rice', description='x', price=Decimal('1500'), vendor=self.vendor, category=category, is_available=True)
        buyer = User.objects.create_user(username='abv_buyer', email='abv_buyer@pau.edu.ng', password='pass123')
        Order.objects.create(buyer=buyer, listing=listing, amount=Decimal('1500'), reference='STX-ADMIN-1', status='paid', delivery_slot=slot)

        self.client.force_authenticate(user=self.admin)
        response = self.client.get('/api/admin/delivery-slots/')

        self.assertEqual(response.status_code, 200)
        row = response.data[0]
        self.assertEqual(row['used_today'], 1)
        self.assertEqual(row['max_orders'], 10)
        self.assertEqual(row['vendor_username'], 'abv_vendor')


class AdminDeliverySlotDetailViewTests(AdminDeliverySlotViewsTestBase):
    def setUp(self):
        super().setUp()
        self.slot = DeliverySlot.objects.create(
            vendor=self.vendor, campus='pau', display_name='Lunch', delivery_time=time(13, 0),
            cutoff_offset_minutes=15, max_orders=10,
        )

    def test_non_admin_forbidden(self):
        self.client.force_authenticate(user=self.non_admin)
        response = self.client.patch(f'/api/admin/delivery-slots/{self.slot.id}/', {'max_orders': 20}, format='json')
        self.assertEqual(response.status_code, 403)

    def test_admin_can_edit_slot(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.patch(f'/api/admin/delivery-slots/{self.slot.id}/', {
            'max_orders': 25, 'display_name': 'Special Lunch Run',
        }, format='json')

        self.assertEqual(response.status_code, 200)
        self.slot.refresh_from_db()
        self.assertEqual(self.slot.max_orders, 25)
        self.assertEqual(self.slot.display_name, 'Special Lunch Run')

    def test_admin_can_deactivate_slot(self):
        """Deactivating stops it applying immediately — no daily job to wait on for the change to take effect."""
        self.client.force_authenticate(user=self.admin)
        response = self.client.patch(f'/api/admin/delivery-slots/{self.slot.id}/', {'is_active': False}, format='json')
        self.assertEqual(response.status_code, 200)
        self.slot.refresh_from_db()
        self.assertFalse(self.slot.is_active)

    def test_admin_can_delete_slot(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.delete(f'/api/admin/delivery-slots/{self.slot.id}/')

        self.assertEqual(response.status_code, 204)
        self.assertFalse(DeliverySlot.objects.filter(id=self.slot.id).exists())

    def test_edit_nonexistent_slot_404(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.patch('/api/admin/delivery-slots/999999/', {'max_orders': 5}, format='json')
        self.assertEqual(response.status_code, 404)
