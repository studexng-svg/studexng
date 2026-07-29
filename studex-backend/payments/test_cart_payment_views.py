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

    @patch('payments.views.requests.post')
    def test_stale_cart_amount_rejected(self, mock_post):
        """FR-16: a price change since the buyer last saw their cart total is rejected, not silently charged."""
        CartItem.objects.create(user=self.buyer, listing=self.listing_a, quantity=1)
        response = self.client.post(
            '/api/payments/initialize-cart/',
            {'vendor_id': self.vendor_a.id, 'cart_amount': '1.00'}, format='json',
        )
        self.assertEqual(response.status_code, 400)
        mock_post.assert_not_called()

    @patch('payments.views.requests.post')
    def test_matching_cart_amount_accepted(self, mock_post):
        mock_post.return_value = self._mock_init_response()
        CartItem.objects.create(user=self.buyer, listing=self.listing_a, quantity=1)
        response = self.client.post(
            '/api/payments/initialize-cart/',
            {'vendor_id': self.vendor_a.id, 'cart_amount': '3240.00'}, format='json',
        )
        self.assertEqual(response.status_code, 200)

    @patch('payments.views.requests.post')
    def test_cart_amount_omitted_still_works(self, mock_post):
        mock_post.return_value = self._mock_init_response()
        CartItem.objects.create(user=self.buyer, listing=self.listing_a, quantity=1)
        response = self.client.post('/api/payments/initialize-cart/', {'vendor_id': self.vendor_a.id}, format='json')
        self.assertEqual(response.status_code, 200)


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
    def test_verify_notifies_every_admin_of_the_paid_order(self, mock_get):
        """Admin must see every paid order (food/store or otherwise), not just buyer+vendor."""
        from notifications.models import Notification
        admin = User.objects.create_user(
            username='cpv_admin', email='cpv_admin@pau.edu.ng', password='pass123', is_staff=True,
        )
        reference = 'STX-CART-VERIFYTEST-ADMIN'
        cache.set(f'pay_init:{reference}', {'min_kobo': 324000, 'max_kobo': 400000}, 3600)
        CartItem.objects.create(user=self.buyer, listing=self.listing_a, quantity=1)
        mock_get.return_value = self._mock_verify_response(324000, reference, vendor_id=self.vendor_a.id)

        response = self.client.post(
            '/api/payments/verify-cart/', {'reference': reference, 'vendor_id': self.vendor_a.id}, format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        notif = Notification.objects.get(recipient=admin, notification_type='admin_new_order')
        self.assertIn(self.buyer.username, notif.message)
        self.assertIn(self.vendor_a.username, notif.message)
        self.assertEqual(notif.action_url, f"/admin/orders/{response.data['order_id']}")

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
    def test_webhook_bare_record_race_does_not_500(self, mock_get):
        """
        Regression: the Paystack webhook has no listing_id for a cart/menu
        payment (vendor-scoped, not single-listing), so its charge.success
        handler's fallback branch writes a bare PaymentTransaction for this
        reference (status=success, order_id=None) as an audit record, often
        moments before this endpoint even runs. The old .create() call at
        the end of this view crashed with a reference-unique-constraint
        IntegrityError the instant that race happened — the Order still
        got created (this test also confirms that), but the request 500'd
        and the PaymentTransaction (and therefore the vendor's payout
        record) was never filled in. update_or_create must fill in that
        same bare row instead of colliding with it.
        """
        reference = 'STX-CART-VERIFYTEST-RACE'
        CartItem.objects.create(user=self.buyer, listing=self.listing_a, quantity=1)
        mock_get.return_value = self._mock_verify_response(324000, reference, vendor_id=self.vendor_a.id)
        # Simulates the webhook's fallback branch having already run.
        PaymentTransaction.objects.create(
            reference=reference, status='success', amount=Decimal('3240'),
            seller_amount=Decimal('3000'), platform_amount=Decimal('240'),
            buyer_email=self.buyer.email, order_id=None,
        )

        response = self.client.post(
            '/api/payments/verify-cart/', {'reference': reference, 'vendor_id': self.vendor_a.id}, format='json',
        )

        self.assertEqual(response.status_code, 200)
        order = Order.objects.get(id=response.data['order_id'])
        self.assertEqual(order.listing_id, self.listing_a.id)

        txn = PaymentTransaction.objects.get(reference=reference)
        self.assertEqual(txn.order_id, order.id)
        self.assertEqual(txn.seller_id, self.vendor_a.id)
        self.assertEqual(PaymentTransaction.objects.filter(reference=reference).count(), 1)

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
    Phase 2 simplification (Delivery Slot Reservation) — full
    initialize/verify flow for a vendor with an active DeliverySlot,
    including the fail-fast pre-flight check at initialize and the
    auto-refund-on-exhaustion path at verify.
    """

    def setUp(self):
        super().setUp()
        from accounts.models import Vendor, VendorType
        from delivery.models import DeliverySlot
        from delivery.capacity import LAGOS
        from datetime import datetime, timedelta
        from unittest import mock

        # Fixed at noon Lagos — see delivery/test_capacity.py for why this
        # needs to be frozen rather than derived from the real "now" the
        # suite happens to run at.
        self.FROZEN_NOW = datetime(2026, 6, 15, 12, 0, 0, tzinfo=LAGOS)
        self._time_patcher = mock.patch('django.utils.timezone.now', return_value=self.FROZEN_NOW)
        self._time_patcher.start()
        self.addCleanup(self._time_patcher.stop)

        self.food = VendorType.objects.get(name='food')
        Vendor.objects.create(user=self.vendor_a, vendor_type=self.food)
        # vendor_uses_batched_delivery requires an active DeliverySlot, not
        # just a slot-capable VendorType.
        self.batch = DeliverySlot.objects.create(
            vendor=self.vendor_a, campus='pau', display_name='Lunch',
            delivery_time=(self.FROZEN_NOW + timedelta(hours=3)).time(), max_orders=5,
        )

    @patch('payments.views.requests.post')
    def test_initialize_rejects_when_no_eligible_batch(self, mock_post):
        # Slot stays active (vendor still "uses batched delivery") but has
        # zero room today — the actual no-capacity scenario, distinct from
        # "doesn't use slots at all".
        self.batch.max_orders = 0
        self.batch.save(update_fields=['max_orders'])
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
        self.assertEqual(order.delivery_slot_id, self.batch.id)

    @patch('payments.views.requests.get')
    def test_verify_sends_batch_aware_notification_to_buyer(self, mock_get):
        """
        The buyer's "Order Confirmed" notification must mention the slot's
        delivery time — a generic "vendor has been notified" message left
        the buyer with no idea their food was part of a scheduled slot at
        all, let alone when to expect it.
        """
        from notifications.models import Notification

        reference = 'STX-CART-BATCHVERIFY-NOTIF'
        cache.set(f'pay_init:{reference}', {'min_kobo': 324000, 'max_kobo': 400000}, 3600)
        CartItem.objects.create(user=self.buyer, listing=self.listing_a, quantity=1)
        mock_get.return_value = self._mock_verify_response(324000, reference, vendor_id=self.vendor_a.id)

        response = self.client.post(
            '/api/payments/verify-cart/', {'reference': reference, 'vendor_id': self.vendor_a.id}, format='json',
        )
        self.assertEqual(response.status_code, 200)

        order = Order.objects.get(id=response.data['order_id'])
        slot_time = order.delivery_slot.delivery_time
        hour12 = slot_time.hour % 12 or 12
        expected_time = f"{hour12}:{slot_time.minute:02d} {'AM' if slot_time.hour < 12 else 'PM'}"

        notif = Notification.objects.filter(recipient=self.buyer, notification_type='order_placed').latest('id')
        self.assertIn(expected_time, notif.message)
        self.assertIn('batch', notif.message.lower())

    @patch('payments.views.refund_paystack_transaction')
    @patch('payments.views.requests.get')
    def test_verify_refunds_and_rejects_when_capacity_exhausted(self, mock_get, mock_refund):
        self.batch.max_orders = 0
        self.batch.save(update_fields=['max_orders'])

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
        """vendor_b has no Vendor row at all — completely unaffected by slotted delivery."""
        reference = 'STX-CART-BATCHVERIFY-0003'
        cache.set(f'pay_init:{reference}', {'min_kobo': 216000, 'max_kobo': 300000}, 3600)
        CartItem.objects.create(user=self.buyer, listing=self.listing_b, quantity=1)
        mock_get.return_value = self._mock_verify_response(216000, reference, vendor_id=self.vendor_b.id)

        response = self.client.post(
            '/api/payments/verify-cart/', {'reference': reference, 'vendor_id': self.vendor_b.id}, format='json',
        )

        self.assertEqual(response.status_code, 200)
        order = Order.objects.get(id=response.data['order_id'])
        self.assertIsNone(order.delivery_slot_id)
