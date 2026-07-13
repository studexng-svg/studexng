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


class PricingTests(TestCase):
    """
    payments/pricing.py — the single pricing service. Vendors enter payout_amount;
    everything else (buyer-facing price, settlement split, admin-triggered
    platform-wide recompute) flows through these functions.
    """

    def setUp(self):
        from payments.models import PricingSettings
        # Explicit, not relying on the model default, so this test suite doesn't
        # silently drift if the default ever changes.
        PricingSettings.objects.update_or_create(pk=1, defaults={'service_fee_percent': Decimal('8.00')})

    def test_platform_fee_normal_rate(self):
        from payments.pricing import calculate_platform_fee
        # 8% of 10,000 = 800 — between floor and cap, rate applies as-is.
        self.assertEqual(calculate_platform_fee(Decimal('10000')), Decimal('800.00'))

    def test_platform_fee_floors_at_min(self):
        from payments.pricing import calculate_platform_fee, MIN_FEE
        # 8% of 500 = 40, below the ₦100 floor.
        self.assertEqual(calculate_platform_fee(Decimal('500')), MIN_FEE)

    def test_platform_fee_caps_at_max(self):
        from payments.pricing import calculate_platform_fee, MAX_FEE
        # 8% of 100,000 = 8,000, above the ₦3,500 cap.
        self.assertEqual(calculate_platform_fee(Decimal('100000')), MAX_FEE)

    def test_final_price_is_payout_plus_fee(self):
        from payments.pricing import calculate_final_price
        self.assertEqual(calculate_final_price(Decimal('10000')), Decimal('10800.00'))

    def test_explicit_fee_percent_overrides_settings(self):
        from payments.pricing import calculate_platform_fee
        self.assertEqual(calculate_platform_fee(Decimal('10000'), fee_percent=Decimal('10')), Decimal('1000.00'))

    def test_get_service_fee_percent_reflects_settings_changes(self):
        from payments.pricing import get_service_fee_percent
        from payments.models import PricingSettings
        self.assertEqual(get_service_fee_percent(), Decimal('8.00'))
        PricingSettings.objects.filter(pk=1).update(service_fee_percent=Decimal('12.50'))
        self.assertEqual(get_service_fee_percent(), Decimal('12.50'))

    def test_split_settlement_no_discount(self):
        from payments.pricing import split_settlement
        payout = Decimal('10000')
        price = payout + Decimal('800')  # calculate_final_price(payout)
        vendor_amount, platform_amount = split_settlement(price, payout)
        self.assertEqual(vendor_amount, payout)
        self.assertEqual(platform_amount, Decimal('800'))

    def test_split_settlement_deal_absorbed_by_platform(self):
        """Admin Deal discount — vendor still gets their full payout, platform eats the gap."""
        from payments.pricing import split_settlement
        payout = Decimal('10000')
        # A modest Deal discount that still leaves enough for the platform to take
        # a (smaller than usual) cut, rather than wiping it out entirely.
        amount_paid = Decimal('10200')  # normally price=10800, Deal knocks off 600
        vendor_amount, platform_amount = split_settlement(
            amount_paid, payout, deal_absorbed_by_platform=True,
        )
        self.assertEqual(vendor_amount, payout)  # untouched
        self.assertEqual(platform_amount, Decimal('200'))  # platform's cut shrinks from 800 to 200

    def test_split_settlement_deal_discount_can_wipe_out_platform_cut_entirely(self):
        """A steep enough Deal discount floors the platform's cut at ₦0 rather than going negative."""
        from payments.pricing import split_settlement
        payout = Decimal('10000')
        amount_paid = Decimal('9000')  # Deal discount deep enough to undercut the vendor's own payout
        vendor_amount, platform_amount = split_settlement(
            amount_paid, payout, deal_absorbed_by_platform=True,
        )
        self.assertEqual(vendor_amount, payout)  # vendor is still made whole
        self.assertEqual(platform_amount, Decimal('0'))  # platform absorbs the full loss, floored at 0

    def test_split_settlement_vendor_discount_absorbed_by_vendor(self):
        """Vendor's own discount_percent — vendor absorbs it, platform keeps its full fee."""
        from payments.pricing import split_settlement
        payout = Decimal('10000')
        price = Decimal('10800')
        discount_pct = Decimal('10')
        vendor_discount_currency = (price * discount_pct / 100).quantize(Decimal('0.01'))  # 1080.00
        amount_paid = price - vendor_discount_currency  # 9720.00
        vendor_amount, platform_amount = split_settlement(
            amount_paid, payout, vendor_discount_currency=vendor_discount_currency,
        )
        self.assertEqual(vendor_amount, payout - vendor_discount_currency)  # vendor eats it
        self.assertEqual(platform_amount, Decimal('800'))  # platform's fee is untouched

    def test_split_settlement_never_goes_negative(self):
        from payments.pricing import split_settlement
        vendor_amount, platform_amount = split_settlement(
            Decimal('100'), Decimal('10000'), vendor_discount_currency=Decimal('50000'),
        )
        self.assertEqual(vendor_amount, Decimal('0'))
        self.assertEqual(platform_amount, Decimal('100'))

    def test_recompute_all_listing_prices_is_retroactive(self):
        """Confirmed product decision: changing the fee % updates every existing listing immediately."""
        from payments.pricing import recompute_all_listing_prices
        seller = User.objects.create_user(username='pricing_vendor', email='pricing_vendor@pau.edu.ng', password='pass123', user_type='vendor', is_verified_vendor=True)
        category = Category.objects.create(title='Pricing Cat', slug='pricing-cat')
        listing = Listing.objects.create(
            title='Priced Item', description='x', vendor=seller, category=category,
            payout_amount=Decimal('10000'), price=Decimal('10800'), is_available=True,
        )
        listing_no_payout = Listing.objects.create(
            title='Legacy Item', description='x', vendor=seller, category=category,
            price=Decimal('5000'), is_available=True,
        )

        count = recompute_all_listing_prices(Decimal('10.00'))

        listing.refresh_from_db()
        listing_no_payout.refresh_from_db()
        self.assertEqual(count, 1)  # only listings with payout_amount set are touched
        self.assertEqual(listing.price, Decimal('11000.00'))  # 10000 + 10%
        self.assertEqual(listing_no_payout.price, Decimal('5000'))  # untouched, no payout_amount
