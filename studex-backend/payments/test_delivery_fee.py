# payments/test_delivery_fee.py
"""
Per-vendor delivery fee (admin-set on accounts.models.Vendor) with an
optional "first N deliveries free" promo quota. Covers:
  - fee added to the buyer's charge and excluded from the vendor's payout
    basis (lands entirely in platform_amount)
  - waived under an open quota, charged once the quota is exhausted
  - live-counted from real Order rows, not a denormalized counter
  - never applies to a vendor that isn't using batched delivery at all
"""
from datetime import datetime, timedelta
from decimal import Decimal
from unittest import mock

from django.core.cache import cache
from django.test import TestCase

from accounts.models import User, Vendor, VendorType
from services.models import Category, Listing
from cart.models import CartItem
from orders.models import Order
from payments.models import PricingSettings, PaymentTransaction
from delivery.models import DeliverySlot
from delivery.capacity import LAGOS
from delivery.fees import get_delivery_fee_quote, get_free_delivery_remaining


class DeliveryFeeTestBase(TestCase):
    def setUp(self):
        PricingSettings.objects.update_or_create(pk=1, defaults={'service_fee_percent': Decimal('8.00')})
        cache.clear()
        self.buyer = User.objects.create_user(username='df_buyer', email='df_buyer@pau.edu.ng', password='pass123')
        self.vendor = User.objects.create_user(username='df_vendor', email='df_vendor@pau.edu.ng', password='pass123')
        self.category = Category.objects.create(title='FoodDF', slug='food-df')
        self.listing = Listing.objects.create(
            title='Jollof Rice', description='x', payout_amount=Decimal('3000'), price=Decimal('3240'),
            vendor=self.vendor, category=self.category, is_available=True,
        )

        self.FROZEN_NOW = datetime(2026, 6, 15, 12, 0, 0, tzinfo=LAGOS)
        self._time_patcher = mock.patch('django.utils.timezone.now', return_value=self.FROZEN_NOW)
        self._time_patcher.start()
        self.addCleanup(self._time_patcher.stop)

        food = VendorType.objects.get(name='food')
        self.vendor_record = Vendor.objects.create(user=self.vendor, vendor_type=food)
        self.slot = DeliverySlot.objects.create(
            vendor=self.vendor, campus='pau', display_name='Lunch',
            delivery_time=(self.FROZEN_NOW + timedelta(hours=3)).time(), max_orders=100,
        )


class GetDeliveryFeeQuoteTests(DeliveryFeeTestBase):
    def test_zero_fee_by_default(self):
        fee, waived = get_delivery_fee_quote(self.vendor)
        self.assertEqual(fee, Decimal("0"))
        self.assertFalse(waived)

    def test_fee_charged_with_no_quota_set(self):
        self.vendor_record.delivery_fee = Decimal("300.00")
        self.vendor_record.save(update_fields=['delivery_fee'])
        fee, waived = get_delivery_fee_quote(self.vendor)
        self.assertEqual(fee, Decimal("300.00"))
        self.assertFalse(waived)

    def test_waived_under_open_quota(self):
        self.vendor_record.delivery_fee = Decimal("300.00")
        self.vendor_record.free_delivery_quota = 50
        self.vendor_record.save(update_fields=['delivery_fee', 'free_delivery_quota'])
        fee, waived = get_delivery_fee_quote(self.vendor)
        self.assertEqual(fee, Decimal("0"))
        self.assertTrue(waived)

    def test_charged_once_quota_exhausted(self):
        self.vendor_record.delivery_fee = Decimal("300.00")
        self.vendor_record.free_delivery_quota = 2
        self.vendor_record.save(update_fields=['delivery_fee', 'free_delivery_quota'])
        for i in range(2):
            Order.objects.create(
                buyer=self.buyer, listing=self.listing, amount=Decimal("3240"),
                reference=f"DF-ORD-{i}", status="paid", delivery_slot=self.slot,
            )
        fee, waived = get_delivery_fee_quote(self.vendor)
        self.assertEqual(fee, Decimal("300.00"))
        self.assertFalse(waived)

    def test_cancelled_orders_dont_count_against_quota(self):
        """Live-counted, not a denormalized counter — a cancelled early order doesn't burn a promo slot."""
        self.vendor_record.delivery_fee = Decimal("300.00")
        self.vendor_record.free_delivery_quota = 2
        self.vendor_record.save(update_fields=['delivery_fee', 'free_delivery_quota'])
        Order.objects.create(
            buyer=self.buyer, listing=self.listing, amount=Decimal("3240"),
            reference="DF-ORD-CANCELLED", status="cancelled", delivery_slot=self.slot,
        )
        fee, waived = get_delivery_fee_quote(self.vendor)
        self.assertEqual(fee, Decimal("0"))
        self.assertTrue(waived)

    def test_never_applies_to_non_batching_vendor(self):
        """delivery_fee set but no active DeliverySlot — no delivery fee concept applies at all."""
        self.slot.is_active = False
        self.slot.save(update_fields=['is_active'])
        self.vendor_record.delivery_fee = Decimal("300.00")
        self.vendor_record.save(update_fields=['delivery_fee'])
        fee, waived = get_delivery_fee_quote(self.vendor)
        self.assertEqual(fee, Decimal("0"))
        self.assertFalse(waived)

    def test_no_vendor_record_returns_free(self):
        plain_vendor = User.objects.create_user(username='df_plain', email='df_plain@pau.edu.ng', password='pass123')
        fee, waived = get_delivery_fee_quote(plain_vendor)
        self.assertEqual(fee, Decimal("0"))
        self.assertFalse(waived)


class GetFreeDeliveryRemainingTests(DeliveryFeeTestBase):
    """
    checkout's "Free (Promo) — 12 left" counter (src/app/checkout/page.tsx,
    delivery.VendorEligibleBatchesView) — distinct from get_delivery_fee_quote
    itself (which only needs true/false, not a count).
    """

    def test_none_with_no_quota_set(self):
        self.vendor_record.delivery_fee = Decimal("300.00")
        self.vendor_record.save(update_fields=['delivery_fee'])
        self.assertIsNone(get_free_delivery_remaining(self.vendor))

    def test_none_with_no_delivery_fee_configured(self):
        """₦0 fee (default) means there's nothing to run a promo against."""
        self.vendor_record.free_delivery_quota = 15
        self.vendor_record.save(update_fields=['free_delivery_quota'])
        self.assertIsNone(get_free_delivery_remaining(self.vendor))

    def test_none_for_non_batching_vendor(self):
        self.slot.is_active = False
        self.slot.save(update_fields=['is_active'])
        self.vendor_record.delivery_fee = Decimal("300.00")
        self.vendor_record.free_delivery_quota = 15
        self.vendor_record.save(update_fields=['delivery_fee', 'free_delivery_quota'])
        self.assertIsNone(get_free_delivery_remaining(self.vendor))

    def test_none_with_no_vendor_record(self):
        plain_vendor = User.objects.create_user(username='df_plain2', email='df_plain2@pau.edu.ng', password='pass123')
        self.assertIsNone(get_free_delivery_remaining(plain_vendor))

    def test_counts_down_as_slot_orders_land(self):
        self.vendor_record.delivery_fee = Decimal("300.00")
        self.vendor_record.free_delivery_quota = 15
        self.vendor_record.save(update_fields=['delivery_fee', 'free_delivery_quota'])
        for i in range(3):
            Order.objects.create(
                buyer=self.buyer, listing=self.listing, amount=Decimal("3240"),
                reference=f"DF-REM-{i}", status="paid", delivery_slot=self.slot,
            )
        self.assertEqual(get_free_delivery_remaining(self.vendor), 12)

    def test_cancelled_orders_dont_count_against_remaining(self):
        self.vendor_record.delivery_fee = Decimal("300.00")
        self.vendor_record.free_delivery_quota = 15
        self.vendor_record.save(update_fields=['delivery_fee', 'free_delivery_quota'])
        Order.objects.create(
            buyer=self.buyer, listing=self.listing, amount=Decimal("3240"),
            reference="DF-REM-CANCELLED", status="cancelled", delivery_slot=self.slot,
        )
        self.assertEqual(get_free_delivery_remaining(self.vendor), 15)

    def test_zero_not_none_once_exhausted(self):
        self.vendor_record.delivery_fee = Decimal("300.00")
        self.vendor_record.free_delivery_quota = 2
        self.vendor_record.save(update_fields=['delivery_fee', 'free_delivery_quota'])
        for i in range(2):
            Order.objects.create(
                buyer=self.buyer, listing=self.listing, amount=Decimal("3240"),
                reference=f"DF-REM-EX-{i}", status="paid", delivery_slot=self.slot,
            )
        self.assertEqual(get_free_delivery_remaining(self.vendor), 0)


class DeliveryFeeCartCheckoutTests(DeliveryFeeTestBase):
    def _mock_init_response(self, reference='STX-CART-DF-MOCK'):
        mock_res = mock.MagicMock()
        mock_res.status_code = 200
        mock_res.json.return_value = {
            'status': True,
            'data': {'access_code': 'test_code', 'authorization_url': 'https://paystack.test/pay', 'reference': reference},
        }
        return mock_res

    def _mock_verify_response(self, amount_kobo, reference):
        mock_res = mock.MagicMock()
        mock_res.status_code = 200
        mock_res.json.return_value = {
            'status': True,
            'data': {
                'status': 'success', 'amount': amount_kobo, 'reference': reference, 'id': 987654,
                'customer': {'email': self.buyer.email},
                'metadata': {'vendor_id': str(self.vendor.id)},
            },
        }
        return mock_res

    @mock.patch('payments.views.requests.post')
    def test_initialize_charges_base_amount_plus_delivery_fee(self, mock_post):
        self.vendor_record.delivery_fee = Decimal("300.00")
        self.vendor_record.save(update_fields=['delivery_fee'])
        mock_post.return_value = self._mock_init_response()
        from rest_framework.test import APIClient
        client = APIClient()
        client.force_authenticate(user=self.buyer)
        CartItem.objects.create(user=self.buyer, listing=self.listing, quantity=1)

        response = client.post('/api/payments/initialize-cart/', {'vendor_id': self.vendor.id}, format='json')

        self.assertEqual(response.status_code, 200)
        sent_payload = mock_post.call_args.kwargs['json']
        self.assertEqual(sent_payload['amount'], 354000)  # (3240 + 300) * 100
        self.assertEqual(response.data['delivery_fee'], 300.0)
        self.assertFalse(response.data['delivery_fee_waived'])

    @mock.patch('payments.views.requests.post')
    def test_initialize_charges_base_amount_only_when_waived(self, mock_post):
        self.vendor_record.delivery_fee = Decimal("300.00")
        self.vendor_record.free_delivery_quota = 50
        self.vendor_record.save(update_fields=['delivery_fee', 'free_delivery_quota'])
        mock_post.return_value = self._mock_init_response()
        from rest_framework.test import APIClient
        client = APIClient()
        client.force_authenticate(user=self.buyer)
        CartItem.objects.create(user=self.buyer, listing=self.listing, quantity=1)

        response = client.post('/api/payments/initialize-cart/', {'vendor_id': self.vendor.id}, format='json')

        self.assertEqual(response.status_code, 200)
        sent_payload = mock_post.call_args.kwargs['json']
        self.assertEqual(sent_payload['amount'], 324000)
        self.assertEqual(response.data['delivery_fee'], 0.0)
        self.assertTrue(response.data['delivery_fee_waived'])

    @mock.patch('payments.views.requests.get')
    def test_verify_stamps_order_and_excludes_fee_from_vendor_payout(self, mock_get):
        self.vendor_record.delivery_fee = Decimal("300.00")
        self.vendor_record.save(update_fields=['delivery_fee'])
        reference = 'STX-CART-DF-VERIFY-0001'
        cache.set(f'pay_init:{reference}', {
            'min_kobo': 354000, 'max_kobo': 400000,
            'delivery_fee': '300.00', 'delivery_fee_waived': False,
        }, 3600)
        CartItem.objects.create(user=self.buyer, listing=self.listing, quantity=1)
        mock_get.return_value = self._mock_verify_response(354000, reference)

        from rest_framework.test import APIClient
        client = APIClient()
        client.force_authenticate(user=self.buyer)
        response = client.post(
            '/api/payments/verify-cart/', {'reference': reference, 'vendor_id': self.vendor.id}, format='json',
        )

        self.assertEqual(response.status_code, 200)
        order = Order.objects.get(id=response.data['order_id'])
        self.assertEqual(order.delivery_fee, Decimal("300.00"))
        self.assertFalse(order.delivery_fee_waived)
        self.assertEqual(order.amount, Decimal("3540.00"))

        txn = PaymentTransaction.objects.get(reference=reference)
        # Vendor's payout basis is unaffected by the fee — still exactly the
        # item's own payout_amount, fee lands entirely in platform_amount.
        self.assertEqual(txn.seller_amount, Decimal("3000.00"))
        self.assertEqual(txn.platform_amount, Decimal("540.00"))  # 240 platform fee + 300 delivery fee

    @mock.patch('payments.views.requests.get')
    def test_verify_marks_order_waived_when_promo_covers_it(self, mock_get):
        self.vendor_record.delivery_fee = Decimal("300.00")
        self.vendor_record.free_delivery_quota = 50
        self.vendor_record.save(update_fields=['delivery_fee', 'free_delivery_quota'])
        reference = 'STX-CART-DF-VERIFY-0002'
        cache.set(f'pay_init:{reference}', {
            'min_kobo': 324000, 'max_kobo': 400000,
            'delivery_fee': '0', 'delivery_fee_waived': True,
        }, 3600)
        CartItem.objects.create(user=self.buyer, listing=self.listing, quantity=1)
        mock_get.return_value = self._mock_verify_response(324000, reference)

        from rest_framework.test import APIClient
        client = APIClient()
        client.force_authenticate(user=self.buyer)
        response = client.post(
            '/api/payments/verify-cart/', {'reference': reference, 'vendor_id': self.vendor.id}, format='json',
        )

        self.assertEqual(response.status_code, 200)
        order = Order.objects.get(id=response.data['order_id'])
        self.assertEqual(order.delivery_fee, Decimal("0"))
        self.assertTrue(order.delivery_fee_waived)

    @mock.patch('payments.views.requests.get')
    def test_verify_falls_back_to_fresh_quote_when_cache_missing(self, mock_get):
        """Cache expiry (>1h, server restart) — same fallback convention as min_kobo/max_kobo."""
        self.vendor_record.delivery_fee = Decimal("300.00")
        self.vendor_record.save(update_fields=['delivery_fee'])
        reference = 'STX-CART-DF-VERIFY-0003'
        # No cache entry at all for this reference.
        CartItem.objects.create(user=self.buyer, listing=self.listing, quantity=1)
        mock_get.return_value = self._mock_verify_response(354000, reference)

        from rest_framework.test import APIClient
        client = APIClient()
        client.force_authenticate(user=self.buyer)
        response = client.post(
            '/api/payments/verify-cart/', {'reference': reference, 'vendor_id': self.vendor.id}, format='json',
        )

        self.assertEqual(response.status_code, 200)
        order = Order.objects.get(id=response.data['order_id'])
        self.assertEqual(order.delivery_fee, Decimal("300.00"))
