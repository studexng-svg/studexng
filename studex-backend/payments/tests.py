"""
Test suite for payments app - the glue between a successful Paystack charge and
Booking/Order/Conversation state (see payments/views.py _create_order_from_paystack_data).
"""
from decimal import Decimal
from django.test import TestCase

from accounts.models import User
from services.models import Category, Listing
from orders.models import Order, Booking
from chat.models import Conversation
from payments.views import _create_order_from_paystack_data


class CreateOrderFromPaystackDataTests(TestCase):
    """
    Tests the shared helper both verify_payment and the webhook call on a successful
    charge — bypasses the actual Paystack HTTP calls entirely by calling the helper
    directly with a synthetic payload, the same shape Paystack's API returns.
    """

    def setUp(self):
        self.buyer = User.objects.create_user(
            username='buyer', email='buyer@pau.edu.ng', password='pass123'
        )
        self.seller = User.objects.create_user(
            username='seller', email='seller@pau.edu.ng', password='pass123',
            user_type='vendor', is_verified_vendor=True
        )
        self.category = Category.objects.create(title='Beauty', slug='beauty')
        self.listing = Listing.objects.create(
            title='Lash Extensions', description='Full set', price=Decimal('5000.00'),
            vendor=self.seller, category=self.category, is_available=True
        )

    def _fake_paystack_data(self, reference):
        return {
            'amount': 500000,  # kobo
            'reference': reference,
            'id': 123456,
            'customer': {'email': self.buyer.email},
            'metadata': {},
        }

    def test_creates_paid_order(self):
        order_id, error = _create_order_from_paystack_data(
            self._fake_paystack_data('ORD-PAYTEST-0001'), self.buyer, self.listing.id, 'service',
        )
        self.assertIsNone(error)
        order = Order.objects.get(id=order_id)
        self.assertEqual(order.status, 'paid')
        self.assertIsNotNone(order.paid_at)

    def test_flips_pending_booking_to_paid(self):
        """
        Under the payment-first flow, a Booking may still be 'pending' (no
        pre-payment vendor approval) at the moment payment clears — the fix in
        _create_order_from_paystack_data must catch 'pending', not just 'confirmed'.
        """
        booking = Booking.objects.create(
            buyer=self.buyer, listing=self.listing, scheduled_date='2099-01-01',
            scheduled_time='2:30 PM', status='pending',
        )
        _create_order_from_paystack_data(
            self._fake_paystack_data('ORD-PAYTEST-0002'), self.buyer, self.listing.id, 'service',
        )
        booking.refresh_from_db()
        self.assertEqual(booking.status, 'paid')

    def test_flips_confirmed_booking_to_paid(self):
        """Legacy path: a booking that went through the old pre-payment vendor-confirm step."""
        booking = Booking.objects.create(
            buyer=self.buyer, listing=self.listing, scheduled_date='2099-01-01',
            scheduled_time='2:30 PM', status='confirmed',
        )
        _create_order_from_paystack_data(
            self._fake_paystack_data('ORD-PAYTEST-0003'), self.buyer, self.listing.id, 'service',
        )
        booking.refresh_from_db()
        self.assertEqual(booking.status, 'paid')

    def test_creates_and_unlocks_conversation(self):
        order_id, _ = _create_order_from_paystack_data(
            self._fake_paystack_data('ORD-PAYTEST-0004'), self.buyer, self.listing.id, 'service',
        )
        conversation = Conversation.objects.get(buyer=self.buyer, seller=self.seller, listing=self.listing)
        self.assertEqual(conversation.order_id, order_id)
        self.assertEqual(conversation.order.status, 'paid')

    def test_reuses_existing_conversation_if_one_already_exists(self):
        """Buyer messaged this vendor before (e.g. on a prior order) — don't create a duplicate."""
        existing = Conversation.objects.create(buyer=self.buyer, seller=self.seller, listing=self.listing)
        order_id, _ = _create_order_from_paystack_data(
            self._fake_paystack_data('ORD-PAYTEST-0005'), self.buyer, self.listing.id, 'service',
        )
        self.assertEqual(Conversation.objects.filter(buyer=self.buyer, seller=self.seller, listing=self.listing).count(), 1)
        existing.refresh_from_db()
        self.assertEqual(existing.order_id, order_id)
