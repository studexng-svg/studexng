# payments/test_cart_payment_views.py
"""
Test suite for the initialize-cart / verify-cart API endpoints (Phase 1 —
Food Commerce Engine, Step 3) — the vendor-scoped multi-item checkout path.
Paystack HTTP calls are mocked exactly the way payments/tests.py already
mocks initialize_payment (@patch('payments.views.requests.post'/'.get')).
"""
from decimal import Decimal
from unittest.mock import patch, MagicMock

from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status

from accounts.models import User
from services.models import Category, Listing, MenuItem, AddonGroup, Addon
from cart.models import CartItem, CartItemAddon
from orders.models import Order
from payments.models import PricingSettings, PaymentTransaction


class CartPaymentViewsTestBase(TestCase):
    def setUp(self):
        PricingSettings.objects.update_or_create(pk=1, defaults={'service_fee_percent': Decimal('8.00')})
        cache.clear()
        self.client = APIClient()
        self.buyer = User.objects.create_user(username='cpv_buyer', email='cpv_buyer@pau.edu.ng', password='pass123')
        self.vendor_a = User.objects.create_user(username='cpv_vendor_a', email='cpv_vendor_a@pau.edu.ng', password='pass123')
        self.vendor_b = User.objects.create_user(username='cpv_vendor_b', email='cpv_vendor_b@pau.edu.ng', password='pass123')
        self.category = Category.objects.create(title='FoodCPV', slug='food-cpv')
        self.listing_a = Listing.objects.create(
            title='Jollof Rice', description='x', payout_amount=Decimal('3000'), price=Decimal('3240'),
            vendor=self.vendor_a, category=self.category, is_available=True,
        )
        self.listing_b = Listing.objects.create(
            title='Suya', description='x', payout_amount=Decimal('2000'), price=Decimal('2160'),
            vendor=self.vendor_b, category=self.category, is_available=True,
        )
        self.client.force_authenticate(user=self.buyer)

    def _mock_init_response(self, reference='STX-CART-MOCK'):
        mock_res = MagicMock()
        mock_res.status_code = 200
        mock_res.json.return_value = {
            'status': True,
            'data': {'access_code': 'test_code', 'authorization_url': 'https://paystack.test/pay', 'reference': reference},
        }
        return mock_res

    def _mock_verify_response(self, amount_kobo, reference, email=None, vendor_id=None):
        mock_res = MagicMock()
        mock_res.status_code = 200
        mock_res.json.return_value = {
            'status': True,
            'data': {
                'status': 'success',
                'amount': amount_kobo,
                'reference': reference,
                'id': 987654,
                'customer': {'email': email or self.buyer.email},
                'metadata': {'vendor_id': str(vendor_id) if vendor_id is not None else ''},
            },
        }
        return mock_res


class InitializeCartPaymentTests(CartPaymentViewsTestBase):
    @patch('payments.views.requests.post')
    def test_charges_combined_fee_inclusive_total_for_vendor_only(self, mock_post):
        mock_post.return_value = self._mock_init_response()
        CartItem.objects.create(user=self.buyer, listing=self.listing_a, quantity=1)
        CartItem.objects.create(user=self.buyer, listing=self.listing_b, quantity=1)

        response = self.client.post('/api/payments/initialize-cart/', {'vendor_id': self.vendor_a.id}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        sent_payload = mock_post.call_args.kwargs['json']
        self.assertEqual(sent_payload['amount'], 324000)  # 3240 * 100, vendor A only
        self.assertEqual(sent_payload['metadata']['vendor_id'], str(self.vendor_a.id))
        self.assertEqual(response.data['item_count'], 1)

    @patch('payments.views.requests.post')
    def test_empty_vendor_cart_rejected(self, mock_post):
        response = self.client.post('/api/payments/initialize-cart/', {'vendor_id': self.vendor_a.id}, format='json')
        self.assertEqual(response.status_code, 400)
        mock_post.assert_not_called()

    @patch('payments.views.requests.post')
    def test_unavailable_item_rejected(self, mock_post):
        self.listing_a.is_available = False
        self.listing_a.save(update_fields=['is_available'])
        CartItem.objects.create(user=self.buyer, listing=self.listing_a, quantity=1)

        response = self.client.post('/api/payments/initialize-cart/', {'vendor_id': self.vendor_a.id}, format='json')
        self.assertEqual(response.status_code, 400)
        mock_post.assert_not_called()

    def test_vendor_id_required(self):
        response = self.client.post('/api/payments/initialize-cart/', {}, format='json')
        self.assertEqual(response.status_code, 400)


class VerifyCartPaymentTests(CartPaymentViewsTestBase):
    @patch('payments.views.requests.get')
    def test_creates_order_and_clears_only_that_vendors_cart_lines(self, mock_get):
        reference = 'STX-CART-VERIFYTEST-0001'
        cache.set(f'pay_init:{reference}', {'min_kobo': 324000, 'max_kobo': 400000}, 3600)
        item_a = CartItem.objects.create(user=self.buyer, listing=self.listing_a, quantity=1)
        item_b = CartItem.objects.create(user=self.buyer, listing=self.listing_b, quantity=1)
        mock_get.return_value = self._mock_verify_response(324000, reference, vendor_id=self.vendor_a.id)

        response = self.client.post(
            '/api/payments/verify-cart/', {'reference': reference, 'vendor_id': self.vendor_a.id}, format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        order = Order.objects.get(id=response.data['order_id'])
        self.assertEqual(order.listing_id, self.listing_a.id)
        self.assertEqual(order.items.count(), 1)
        self.assertFalse(CartItem.objects.filter(id=item_a.id).exists())
        self.assertTrue(CartItem.objects.filter(id=item_b.id).exists())  # vendor B's line untouched

        txn = PaymentTransaction.objects.get(reference=reference)
        self.assertEqual(txn.status, 'success')
        self.assertEqual(txn.seller_amount, Decimal('3000.00'))
        self.assertEqual(txn.platform_amount, Decimal('240.00'))

    @patch('payments.views.requests.get')
    def test_already_processed_is_idempotent(self, mock_get):
        reference = 'STX-CART-VERIFYTEST-0002'
        CartItem.objects.create(user=self.buyer, listing=self.listing_a, quantity=1)
        order = Order.objects.create(
            buyer=self.buyer, listing=self.listing_a, amount=Decimal('3240'), reference=reference, status='paid',
        )
        PaymentTransaction.objects.create(
            buyer=self.buyer, seller=self.vendor_a, reference=reference, amount=Decimal('3240'),
            seller_amount=Decimal('3000'), platform_amount=Decimal('240'), status='success',
            buyer_email=self.buyer.email, order_id=order.id,
        )

        response = self.client.post(
            '/api/payments/verify-cart/', {'reference': reference, 'vendor_id': self.vendor_a.id}, format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['order_id'], order.id)
        mock_get.assert_not_called()

    @patch('payments.views.requests.get')
    def test_email_mismatch_rejected(self, mock_get):
        reference = 'STX-CART-VERIFYTEST-0003'
        CartItem.objects.create(user=self.buyer, listing=self.listing_a, quantity=1)
        mock_get.return_value = self._mock_verify_response(
            324000, reference, email='someone-else@pau.edu.ng', vendor_id=self.vendor_a.id,
        )

        response = self.client.post(
            '/api/payments/verify-cart/', {'reference': reference, 'vendor_id': self.vendor_a.id}, format='json',
        )
        self.assertEqual(response.status_code, 403)
        self.assertTrue(CartItem.objects.filter(user=self.buyer, listing=self.listing_a).exists())

    @patch('payments.views.requests.get')
    def test_vendor_metadata_mismatch_rejected(self, mock_get):
        reference = 'STX-CART-VERIFYTEST-0004'
        CartItem.objects.create(user=self.buyer, listing=self.listing_a, quantity=1)
        mock_get.return_value = self._mock_verify_response(324000, reference, vendor_id=self.vendor_b.id)

        response = self.client.post(
            '/api/payments/verify-cart/', {'reference': reference, 'vendor_id': self.vendor_a.id}, format='json',
        )
        self.assertEqual(response.status_code, 400)

    @patch('payments.views.refund_paystack_transaction')
    @patch('payments.views.requests.get')
    def test_underpayment_triggers_refund_and_rejects(self, mock_get, mock_refund):
        reference = 'STX-CART-VERIFYTEST-0005'
        cache.set(f'pay_init:{reference}', {'min_kobo': 324000, 'max_kobo': 400000}, 3600)
        CartItem.objects.create(user=self.buyer, listing=self.listing_a, quantity=1)
        mock_get.return_value = self._mock_verify_response(100000, reference, vendor_id=self.vendor_a.id)  # underpaid

        response = self.client.post(
            '/api/payments/verify-cart/', {'reference': reference, 'vendor_id': self.vendor_a.id}, format='json',
        )
        self.assertEqual(response.status_code, 400)
        mock_refund.assert_called_once()
        self.assertFalse(Order.objects.filter(reference=reference).exists())

    def test_reference_and_vendor_id_required(self):
        response = self.client.post('/api/payments/verify-cart/', {}, format='json')
        self.assertEqual(response.status_code, 400)


class CartPaymentViewsBatchReservationTests(CartPaymentViewsTestBase):
    """
    Phase 1 — Food Commerce Engine, Step 4 (Delivery Batch Reservation) —
    full initialize/verify flow for a vendor with
    VendorType.supports_batched_delivery, including the fail-fast pre-flight
    check at initialize and the auto-refund-on-exhaustion path at verify.
    """

    def setUp(self):
        super().setUp()
        from accounts.models import Vendor, VendorType
        from delivery.models import DeliveryBatch
        from datetime import date, timedelta
        from django.utils import timezone

        self.food = VendorType.objects.get(name='food')
        Vendor.objects.create(user=self.vendor_a, vendor_type=self.food)

        now = timezone.now()
        self.batch = DeliveryBatch.objects.create(
            vendor=self.vendor_a, campus='pau', batch_date=date.today(), display_name='Lunch',
            delivery_time=now + timedelta(hours=3), cutoff_time=now + timedelta(hours=2),
            max_orders=5, current_orders=0, status='open',
        )

    @patch('payments.views.requests.post')
    def test_initialize_rejects_when_no_eligible_batch(self, mock_post):
        self.batch.status = 'closed'
        self.batch.save(update_fields=['status'])
        CartItem.objects.create(user=self.buyer, listing=self.listing_a, quantity=1)

        response = self.client.post('/api/payments/initialize-cart/', {'vendor_id': self.vendor_a.id}, format='json')
        self.assertEqual(response.status_code, 400)
        mock_post.assert_not_called()

    @patch('payments.views.requests.post')
    def test_initialize_passes_batch_id_through_metadata(self, mock_post):
        mock_post.return_value = self._mock_init_response()
        CartItem.objects.create(user=self.buyer, listing=self.listing_a, quantity=1)

        response = self.client.post(
            '/api/payments/initialize-cart/', {'vendor_id': self.vendor_a.id, 'batch_id': self.batch.id}, format='json',
        )
        self.assertEqual(response.status_code, 200)
        sent_payload = mock_post.call_args.kwargs['json']
        self.assertEqual(sent_payload['metadata']['batch_id'], str(self.batch.id))

    @patch('payments.views.requests.get')
    def test_verify_reserves_capacity_and_stamps_order(self, mock_get):
        reference = 'STX-CART-BATCHVERIFY-0001'
        cache.set(f'pay_init:{reference}', {'min_kobo': 324000, 'max_kobo': 400000}, 3600)
        CartItem.objects.create(user=self.buyer, listing=self.listing_a, quantity=1)
        mock_get.return_value = self._mock_verify_response(324000, reference, vendor_id=self.vendor_a.id)

        response = self.client.post(
            '/api/payments/verify-cart/', {'reference': reference, 'vendor_id': self.vendor_a.id}, format='json',
        )

        self.assertEqual(response.status_code, 200)
        order = Order.objects.get(id=response.data['order_id'])
        self.assertEqual(order.delivery_batch_id, self.batch.id)
        self.batch.refresh_from_db()
        self.assertEqual(self.batch.current_orders, 1)

    @patch('payments.views.refund_paystack_transaction')
    @patch('payments.views.requests.get')
    def test_verify_refunds_and_rejects_when_capacity_exhausted(self, mock_get, mock_refund):
        self.batch.max_orders = 1
        self.batch.current_orders = 1
        self.batch.status = 'full'
        self.batch.save(update_fields=['max_orders', 'current_orders', 'status'])

        reference = 'STX-CART-BATCHVERIFY-0002'
        cache.set(f'pay_init:{reference}', {'min_kobo': 324000, 'max_kobo': 400000}, 3600)
        CartItem.objects.create(user=self.buyer, listing=self.listing_a, quantity=1)
        mock_get.return_value = self._mock_verify_response(324000, reference, vendor_id=self.vendor_a.id)

        response = self.client.post(
            '/api/payments/verify-cart/', {'reference': reference, 'vendor_id': self.vendor_a.id}, format='json',
        )

        self.assertEqual(response.status_code, 400)
        mock_refund.assert_called_once()
        self.assertFalse(Order.objects.filter(reference=reference).exists())
        # Cart line survives untouched for a retry.
        self.assertTrue(CartItem.objects.filter(user=self.buyer, listing=self.listing_a).exists())

    @patch('payments.views.requests.get')
    def test_non_batching_vendor_checkout_unaffected(self, mock_get):
        """vendor_b has no Vendor row at all — completely unaffected by batching."""
        reference = 'STX-CART-BATCHVERIFY-0003'
        cache.set(f'pay_init:{reference}', {'min_kobo': 216000, 'max_kobo': 300000}, 3600)
        CartItem.objects.create(user=self.buyer, listing=self.listing_b, quantity=1)
        mock_get.return_value = self._mock_verify_response(216000, reference, vendor_id=self.vendor_b.id)

        response = self.client.post(
            '/api/payments/verify-cart/', {'reference': reference, 'vendor_id': self.vendor_b.id}, format='json',
        )

        self.assertEqual(response.status_code, 200)
        order = Order.objects.get(id=response.data['order_id'])
        self.assertIsNone(order.delivery_batch_id)
