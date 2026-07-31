# payments/test_bank_transfer_cart.py
"""
Temporary manual-settlement path (payments.models.BankTransferSettings) —
menu-vendor checkout while Paystack Payout on Demand isn't approved yet.
Covers: the feature-flag gate, order creation with no Paystack round-trip
(pending_bank_transfer status, no rider assigned, vendor not yet notified),
and both admin outcomes (confirm -> paid triggers the same post-payment side
effects the Paystack path runs; reject -> cancelled restocks and notifies
the buyer only).
"""
from datetime import datetime, timedelta
from decimal import Decimal
from unittest import mock

from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User, Vendor, VendorType
from services.models import Category, Listing
from cart.models import CartItem
from orders.models import Order, OrderItem
from payments.models import PricingSettings, PaymentTransaction, BankTransferSettings
from delivery.models import DeliverySlot
from delivery.capacity import LAGOS
from notifications.models import Notification


class BankTransferTestBase(TestCase):
    def setUp(self):
        PricingSettings.objects.update_or_create(pk=1, defaults={'service_fee_percent': Decimal('8.00')})
        cache.clear()
        self.client = APIClient()
        self.buyer = User.objects.create_user(username='bt_buyer', email='bt_buyer@pau.edu.ng', password='pass123')
        self.vendor = User.objects.create_user(username='bt_vendor', email='bt_vendor@pau.edu.ng', password='pass123')
        self.admin = User.objects.create_user(
            username='bt_admin', email='bt_admin@pau.edu.ng', password='pass123', is_staff=True,
        )
        self.category = Category.objects.create(title='FoodBT', slug='food-bt')
        self.listing = Listing.objects.create(
            title='Jollof Rice', description='x', payout_amount=Decimal('3000'), price=Decimal('3240'),
            vendor=self.vendor, category=self.category, is_available=True,
            track_inventory=True, stock_quantity=10,
        )

        self.FROZEN_NOW = datetime(2026, 6, 15, 12, 0, 0, tzinfo=LAGOS)
        self._time_patcher = mock.patch('django.utils.timezone.now', return_value=self.FROZEN_NOW)
        self._time_patcher.start()
        self.addCleanup(self._time_patcher.stop)

        self.food = VendorType.objects.get(name='food')
        self.vendor_record = Vendor.objects.create(user=self.vendor, vendor_type=self.food)
        self.slot = DeliverySlot.objects.create(
            vendor=self.vendor, campus='pau', display_name='Lunch',
            delivery_time=(self.FROZEN_NOW + timedelta(hours=3)).time(), max_orders=100,
        )
        self.client.force_authenticate(user=self.buyer)


class BankTransferDetailsTests(BankTransferTestBase):
    def test_disabled_by_default(self):
        res = self.client.get('/api/payments/bank-transfer-details/')
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.data['enabled'])

    def test_reflects_enabled_settings(self):
        BankTransferSettings.objects.create(
            is_enabled=True, account_name='StudEx Ops', account_number='1234567890', bank_name='Kuda',
        )
        res = self.client.get('/api/payments/bank-transfer-details/')
        self.assertTrue(res.data['enabled'])
        self.assertEqual(res.data['account_number'], '1234567890')
        self.assertEqual(res.data['bank_name'], 'Kuda')


class InitiateBankTransferCartTests(BankTransferTestBase):
    def test_rejected_when_disabled(self):
        CartItem.objects.create(user=self.buyer, listing=self.listing, quantity=1)
        res = self.client.post('/api/payments/bank-transfer-cart/', {'vendor_id': self.vendor.id}, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertFalse(Order.objects.filter(buyer=self.buyer).exists())

    def test_rejected_for_non_menu_vendor(self):
        BankTransferSettings.objects.create(is_enabled=True, account_name='X', account_number='1', bank_name='Y')
        retail_type = VendorType.objects.create(name='retail-bt-test', display_name='Retail', supports_menu_ordering=False)
        retail_vendor = User.objects.create_user(username='bt_retail', email='bt_retail@pau.edu.ng', password='pass123')
        Vendor.objects.create(user=retail_vendor, vendor_type=retail_type)
        listing = Listing.objects.create(
            title='Shoes', description='x', payout_amount=Decimal('5000'), price=Decimal('5400'),
            vendor=retail_vendor, category=self.category, is_available=True,
        )
        CartItem.objects.create(user=self.buyer, listing=listing, quantity=1)

        res = self.client.post('/api/payments/bank-transfer-cart/', {'vendor_id': retail_vendor.id}, format='json')
        self.assertEqual(res.status_code, 400)

    def test_creates_order_pending_no_rider_no_vendor_notification(self):
        BankTransferSettings.objects.create(is_enabled=True, account_name='StudEx Ops', account_number='1234567890', bank_name='Kuda')
        CartItem.objects.create(user=self.buyer, listing=self.listing, quantity=1)

        res = self.client.post('/api/payments/bank-transfer-cart/', {
            'vendor_id': self.vendor.id, 'delivery_location': 'Hostel A',
        }, format='json')

        self.assertEqual(res.status_code, 200)
        order = Order.objects.get(id=res.data['order_id'])
        self.assertEqual(order.status, 'pending_bank_transfer')
        self.assertIsNone(order.paid_at)
        self.assertFalse(hasattr(order, 'delivery'))  # no DeliveryAssignment created yet

        txn = PaymentTransaction.objects.get(reference__startswith='STX-BANKXFER-')
        self.assertEqual(txn.status, 'pending')
        self.assertEqual(txn.order_id, order.id)
        self.assertEqual(txn.seller_amount, Decimal('3000.00'))

        # Vendor not notified yet — only the buyer and admin should be.
        self.assertFalse(Notification.objects.filter(recipient=self.vendor).exists())
        self.assertTrue(Notification.objects.filter(recipient=self.buyer).exists())
        self.assertTrue(Notification.objects.filter(recipient=self.admin, notification_type='admin_new_order').exists())

        # Cart line consumed, stock reduced — same as the normal checkout path.
        self.assertFalse(CartItem.objects.filter(user=self.buyer, listing=self.listing).exists())
        self.listing.refresh_from_db()
        self.assertEqual(self.listing.stock_quantity, 9)

    def test_delivery_fee_still_applies(self):
        BankTransferSettings.objects.create(is_enabled=True, account_name='X', account_number='1', bank_name='Y')
        self.vendor_record.delivery_fee = Decimal('300.00')
        self.vendor_record.save(update_fields=['delivery_fee'])
        CartItem.objects.create(user=self.buyer, listing=self.listing, quantity=1)

        res = self.client.post('/api/payments/bank-transfer-cart/', {'vendor_id': self.vendor.id}, format='json')

        self.assertEqual(res.status_code, 200)
        order = Order.objects.get(id=res.data['order_id'])
        self.assertEqual(order.delivery_fee, Decimal('300.00'))
        self.assertEqual(order.amount, Decimal('3540.00'))  # 3240 item + 300 delivery fee


class AdminBankTransferConfirmRejectTests(BankTransferTestBase):
    def setUp(self):
        super().setUp()
        BankTransferSettings.objects.create(is_enabled=True, account_name='StudEx Ops', account_number='1234567890', bank_name='Kuda')
        CartItem.objects.create(user=self.buyer, listing=self.listing, quantity=1)
        res = self.client.post('/api/payments/bank-transfer-cart/', {
            'vendor_id': self.vendor.id, 'delivery_location': 'Hostel A',
        }, format='json')
        self.order = Order.objects.get(id=res.data['order_id'])
        self.client.force_authenticate(user=self.admin)

    def test_confirm_marks_paid_assigns_rider_and_notifies_vendor(self):
        rider = User.objects.create_user(
            username='bt_rider', email='bt_rider@pau.edu.ng', password='pass123', user_type='rider',
        )
        res = self.client.patch(f'/api/admin/orders/{self.order.id}/', {'status': 'paid'}, format='json')
        self.assertEqual(res.status_code, 200)

        self.order.refresh_from_db()
        self.assertEqual(self.order.status, 'paid')
        self.assertIsNotNone(self.order.paid_at)

        txn = PaymentTransaction.objects.get(order_id=self.order.id)
        self.assertEqual(txn.status, 'success')

        self.order.refresh_from_db()
        self.assertTrue(hasattr(self.order, 'delivery'))
        self.assertEqual(self.order.delivery.rider_id, rider.id)

        self.assertTrue(Notification.objects.filter(recipient=self.vendor, notification_type='new_order').exists())
        self.assertTrue(Notification.objects.filter(recipient=self.buyer, title__icontains='Payment Confirmed').exists())

    def test_reject_cancels_restocks_and_notifies_buyer_only(self):
        self.listing.refresh_from_db()
        stock_before = self.listing.stock_quantity

        res = self.client.patch(f'/api/admin/orders/{self.order.id}/', {'status': 'cancelled'}, format='json')
        self.assertEqual(res.status_code, 200)

        self.order.refresh_from_db()
        self.assertEqual(self.order.status, 'cancelled')

        self.listing.refresh_from_db()
        self.assertEqual(self.listing.stock_quantity, stock_before + 1)

        txn = PaymentTransaction.objects.get(order_id=self.order.id)
        self.assertEqual(txn.status, 'failed')

        self.assertTrue(Notification.objects.filter(recipient=self.buyer, title__icontains='Cancelled').exists())
        self.assertFalse(Notification.objects.filter(recipient=self.vendor, notification_type='new_order').exists())
