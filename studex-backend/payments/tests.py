"""
Test suite for payments app - the glue between a successful Paystack charge and
Booking/Order/Conversation state (see payments/views.py _create_order_from_paystack_data).
"""
from decimal import Decimal
from unittest.mock import patch, MagicMock
from django.test import TestCase, override_settings
from rest_framework.test import APIClient, APITestCase
from rest_framework import status

from accounts.models import User
from services.models import Category, Listing, ListingVariant
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


class VendorDiscountAbsorptionTests(TestCase):
    """
    Regression coverage for a real reported bug, in two parts:

    1. WHO absorbs the discount. _create_order_from_paystack_data computed
       deal_absorbed_by_platform as bool(deal_discount_amount) — but
       initialize_payment populates deal_discount_amount identically for an
       admin Deal AND a vendor's own discount (it just means "some discount
       was applied", not "who's paying for it"). That made
       deal_absorbed_by_platform True for a vendor's own sale too, routing
       it into split_settlement's platform-absorbs-it branch and silently
       discarding vendor_discount_currency. Fixed by also checking
       listing_vendor_discount, which initialize_payment only ever sets
       non-zero for a vendor's own discount_percent (stays 0 for an admin
       Deal) — the actual discriminator between the two cases.

    2. HOW MUCH the vendor absorbs. Fixing (1) alone still paid the vendor
       the wrong number: the discount currency was computed against
       listing.price (fee-inclusive — ₦2,160 for a ₦2,000 payout at 8%),
       not against payout_amount itself. A 17% vendor discount must leave
       them with exactly ₦1,660.00 (2,000 × 0.83), not ₦1,632.80
       (2,160 × 0.83) — the ₦27.20 gap between those two is the platform's
       own fee naturally shrinking on a smaller base, which must stay with
       the platform, not get pulled out of the vendor. Fixed via
       payments.pricing.apply_vendor_discount, the one shared function
       every discount->currency conversion in the codebase must now use.
    """

    def setUp(self):
        from payments.models import PricingSettings
        PricingSettings.objects.update_or_create(pk=1, defaults={'service_fee_percent': Decimal('8.00')})
        self.client = APIClient()
        self.buyer = User.objects.create_user(
            username='vda_buyer', email='vda_buyer@pau.edu.ng', password='pass123'
        )
        self.seller = User.objects.create_user(
            username='vda_seller', email='vda_seller@pau.edu.ng', password='pass123',
            user_type='vendor', is_verified_vendor=True,
        )
        self.category = Category.objects.create(title='Beauty2', slug='beauty2')

    def _fake_paystack_data(self, reference, amount_kobo, metadata):
        return {
            'amount': amount_kobo,
            'reference': reference,
            'id': 999,
            'customer': {'email': self.buyer.email},
            'metadata': metadata,
        }

    def _mock_paystack_init_response(self):
        mock_res = MagicMock()
        mock_res.status_code = 200
        mock_res.json.return_value = {
            'status': True,
            'data': {'access_code': 'test_code', 'authorization_url': 'https://paystack.test/pay', 'reference': 'STX-TEST'},
        }
        return mock_res

    @patch('payments.views.requests.post')
    def test_initialize_payment_computes_discount_against_payout_not_price(self, mock_post):
        """
        End-to-end through the real view: the exact reported case — hair
        accessories, 17% vendor discount, ₦2,000 payout, ₦2,160 price.
        """
        mock_post.return_value = self._mock_paystack_init_response()
        listing = Listing.objects.create(
            title='Hair bands and hair rings', description='x', price=Decimal('2160.00'),
            payout_amount=Decimal('2000.00'), discount_percent=17,
            vendor=self.seller, category=self.category, is_available=True,
        )
        self.client.force_authenticate(user=self.buyer)

        response = self.client.post('/api/payments/initialize/', {'listing_id': listing.id})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        sent = mock_post.call_args.kwargs['json']
        # Buyer charge: fee (8% of 1,660 = 132.80) recomputed on the
        # discounted payout, same total either formula gives here since
        # neither the floor nor cap kicks in — 1,660 + 132.80 = 1,792.80.
        self.assertEqual(sent['amount'], 179280)
        # The number that actually matters: ₦340.00 (17% of the ₦2,000
        # payout), not ₦367.20 (17% of the ₦2,160 fee-inclusive price).
        self.assertEqual(sent['metadata']['listing_vendor_discount'], '340.00')

    def test_vendor_own_discount_reduces_vendor_payout_by_exact_amount(self):
        """Consuming side: given that correct metadata, the vendor is paid exactly ₦1,660.00."""
        listing = Listing.objects.create(
            title='Hair bands and hair rings', description='x', price=Decimal('2160.00'),
            payout_amount=Decimal('2000.00'), discount_percent=17,
            vendor=self.seller, category=self.category, is_available=True,
        )
        order_id, error = _create_order_from_paystack_data(
            self._fake_paystack_data('ORD-VDA-0001', 179280, {
                'listing_id': str(listing.id),
                'deal_discount_amount': '340.00',
                'listing_deal_discount': '340.00',
                'listing_vendor_discount': '340.00',
            }),
            self.buyer, listing.id, 'product',
        )
        self.assertIsNone(error)
        from payments.models import PaymentTransaction
        txn = PaymentTransaction.objects.get(order_id=order_id)
        self.assertEqual(txn.seller_amount, Decimal('1660.00'))
        self.assertEqual(listing.payout_amount - txn.seller_amount, Decimal('340.00'))

    def test_admin_deal_still_pays_vendor_full_payout(self):
        """Unchanged existing behavior: an admin Deal stays platform-absorbed."""
        listing = Listing.objects.create(
            title='Admin Deal Item', description='x', price=Decimal('2160.00'),
            payout_amount=Decimal('2000.00'),
            vendor=self.seller, category=self.category, is_available=True,
        )
        order_id, error = _create_order_from_paystack_data(
            self._fake_paystack_data('ORD-VDA-0002', 179280, {
                'listing_id': str(listing.id),
                'deal_discount_amount': '340.00',
                'listing_deal_discount': '340.00',
                'listing_vendor_discount': '0',
            }),
            self.buyer, listing.id, 'product',
        )
        self.assertIsNone(error)
        from payments.models import PaymentTransaction
        txn = PaymentTransaction.objects.get(order_id=order_id)
        self.assertEqual(txn.seller_amount, listing.payout_amount)

    def test_no_discount_at_all_pays_full_payout(self):
        listing = Listing.objects.create(
            title='No Discount Item', description='x', price=Decimal('2160.00'),
            payout_amount=Decimal('2000.00'),
            vendor=self.seller, category=self.category, is_available=True,
        )
        order_id, error = _create_order_from_paystack_data(
            self._fake_paystack_data('ORD-VDA-0003', 216000, {'listing_id': str(listing.id)}),
            self.buyer, listing.id, 'product',
        )
        self.assertIsNone(error)
        from payments.models import PaymentTransaction
        txn = PaymentTransaction.objects.get(order_id=order_id)
        self.assertEqual(txn.seller_amount, listing.payout_amount)


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

    def test_apply_vendor_discount_uses_payout_not_price_as_the_base(self):
        """
        The exact reported bug's root cause, isolated: a 17% discount on a
        ₦2,000 payout (₦2,160 price at 8% fee) must take exactly ₦340.00
        off the payout, not ₦367.20 (17% of the fee-inclusive price) — that
        ₦27.20 gap is the platform's own fee shrinking on the smaller base,
        not vendor money.
        """
        from payments.pricing import apply_vendor_discount
        discounted_payout, vendor_discount_currency, discounted_price = apply_vendor_discount(
            Decimal('2000'), Decimal('17'), fee_percent=Decimal('8'),
        )
        self.assertEqual(vendor_discount_currency, Decimal('340.00'))
        self.assertEqual(discounted_payout, Decimal('1660.00'))
        # Fee recomputed on the discounted payout: 1660 * 0.08 = 132.80.
        self.assertEqual(discounted_price, Decimal('1792.80'))

    def test_apply_vendor_discount_floors_at_zero(self):
        from payments.pricing import apply_vendor_discount
        discounted_payout, vendor_discount_currency, _ = apply_vendor_discount(
            Decimal('100'), Decimal('150'), fee_percent=Decimal('8'),  # >100% discount, shouldn't happen but must not go negative
        )
        self.assertEqual(discounted_payout, Decimal('0'))
        self.assertEqual(vendor_discount_currency, Decimal('150.00'))

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


class PerUnitBookingSettlementTests(TestCase):
    """
    _create_order_from_paystack_data — vendor payout must scale with
    Booking.quantity for per-unit listings (e.g. laundry priced per cloth),
    and threading a real booking_id through must fix the pre-existing "blind
    filter" bug where paying for one booking flipped every pending booking
    for that listing to paid.
    """

    def setUp(self):
        from payments.models import PricingSettings
        PricingSettings.objects.update_or_create(pk=1, defaults={'service_fee_percent': Decimal('8.00')})

        self.buyer = User.objects.create_user(
            username='pu_buyer', email='pu_buyer@pau.edu.ng', password='pass123'
        )
        self.seller = User.objects.create_user(
            username='pu_seller', email='pu_seller@pau.edu.ng', password='pass123',
            user_type='vendor', is_verified_vendor=True
        )
        self.category = Category.objects.create(title='Laundry Settlement', slug='laundry-settlement')
        self.listing = Listing.objects.create(
            title='Washing & Ironing', description='Per cloth', payout_amount=Decimal('500.00'),
            price=Decimal('600.00'), is_per_unit=True, unit_label='cloth',
            vendor=self.seller, category=self.category, is_available=True,
        )

    def _fake_paystack_data(self, reference, amount_kobo):
        return {
            'amount': amount_kobo,
            'reference': reference,
            'id': 999999,
            'customer': {'email': self.buyer.email},
            'metadata': {},
        }

    def test_vendor_payout_scales_with_quantity_not_flat_payout(self):
        booking = Booking.objects.create(
            buyer=self.buyer, listing=self.listing, scheduled_date='2099-01-01',
            scheduled_time='2:30 PM', status='pending', quantity=4,
        )
        # Fee applied ONCE to the true total (payout*4=2000 -> 8%=160 -> 2160),
        # not 4x the per-unit floored fee (500 -> 600 -> x4 = 2400, which is wrong).
        order_id, error = _create_order_from_paystack_data(
            self._fake_paystack_data('ORD-PERUNIT-0001', 216000), self.buyer, self.listing.id, 'service',
            booking_id=booking.id,
        )
        self.assertIsNone(error)
        order = Order.objects.get(id=order_id)
        self.assertEqual(order.quantity, 4)

        from payments.models import PaymentTransaction
        txn = PaymentTransaction.objects.get(order_id=order_id)
        self.assertEqual(txn.seller_amount, Decimal('2000.00'))  # payout_amount * quantity, not flat 500
        self.assertEqual(txn.platform_amount, Decimal('160.00'))

        booking.refresh_from_db()
        self.assertEqual(booking.status, 'paid')

    def test_regression_default_quantity_one_unaffected(self):
        """A per-unit listing booked with quantity=1 (the default) behaves
        identically to a flat listing — vendor gets exactly payout_amount."""
        booking = Booking.objects.create(
            buyer=self.buyer, listing=self.listing, scheduled_date='2099-01-01',
            scheduled_time='2:30 PM', status='pending', quantity=1,
        )
        order_id, error = _create_order_from_paystack_data(
            self._fake_paystack_data('ORD-PERUNIT-0002', 60000), self.buyer, self.listing.id, 'service',
            booking_id=booking.id,
        )
        self.assertIsNone(error)
        from payments.models import PaymentTransaction
        txn = PaymentTransaction.objects.get(order_id=order_id)
        self.assertEqual(txn.seller_amount, Decimal('500.00'))

    def test_no_booking_id_falls_back_to_legacy_blind_update(self):
        """Deploy-safety: a payment with no booking_id (in-flight session from an
        older frontend bundle, or a direct-listing/cart purchase) must still
        complete successfully via the pre-existing blind-filter behavior."""
        booking = Booking.objects.create(
            buyer=self.buyer, listing=self.listing, scheduled_date='2099-01-01',
            scheduled_time='2:30 PM', status='pending', quantity=1,
        )
        order_id, error = _create_order_from_paystack_data(
            self._fake_paystack_data('ORD-PERUNIT-0003', 60000), self.buyer, self.listing.id, 'service',
        )
        self.assertIsNone(error)
        booking.refresh_from_db()
        self.assertEqual(booking.status, 'paid')

    def test_specific_booking_id_flips_only_that_booking(self):
        """Two pending bookings for the same buyer+listing — paying via a specific
        booking_id must not blindly flip the other pending booking too (the bug
        found during investigation, fixed as a side effect of quantity threading)."""
        booking1 = Booking.objects.create(
            buyer=self.buyer, listing=self.listing, scheduled_date='2099-01-01',
            scheduled_time='2:30 PM', status='pending', quantity=2,
        )
        booking2 = Booking.objects.create(
            buyer=self.buyer, listing=self.listing, scheduled_date='2099-02-01',
            scheduled_time='3:00 PM', status='pending', quantity=3,
        )
        order_id, error = _create_order_from_paystack_data(
            self._fake_paystack_data('ORD-PERUNIT-0004', 110000), self.buyer, self.listing.id, 'service',
            booking_id=booking1.id,
        )
        self.assertIsNone(error)
        booking1.refresh_from_db()
        booking2.refresh_from_db()
        self.assertEqual(booking1.status, 'paid')
        self.assertEqual(booking2.status, 'pending')  # NOT blindly flipped


class VariantBookingSettlementTests(TestCase):
    """
    _create_order_from_paystack_data — when a booking picked a named variant
    (e.g. "Washing Only" vs "Washing & Ironing" under one listing), settlement
    must use the variant's payout_amount, not the listing's own.
    """

    def setUp(self):
        from payments.models import PricingSettings
        PricingSettings.objects.update_or_create(pk=1, defaults={'service_fee_percent': Decimal('8.00')})

        self.buyer = User.objects.create_user(
            username='variant_settle_buyer', email='variant_settle_buyer@pau.edu.ng', password='pass123'
        )
        self.seller = User.objects.create_user(
            username='variant_settle_seller', email='variant_settle_seller@pau.edu.ng', password='pass123',
            user_type='vendor', is_verified_vendor=True
        )
        self.category = Category.objects.create(title='Variant Settlement', slug='variant-settlement')
        self.listing = Listing.objects.create(
            title='Laundry Service', description='x', payout_amount=Decimal('500.00'),
            price=Decimal('600.00'), is_per_unit=True, unit_label='cloth',
            vendor=self.seller, category=self.category, is_available=True,
        )
        self.variant = ListingVariant.objects.create(
            listing=self.listing, title='Washing Only',
            payout_amount=Decimal('300.00'), price=Decimal('400.00'),
        )

    def _fake_paystack_data(self, reference, amount_kobo):
        return {
            'amount': amount_kobo,
            'reference': reference,
            'id': 888888,
            'customer': {'email': self.buyer.email},
            'metadata': {},
        }

    def test_settlement_uses_variant_payout_not_listing_payout(self):
        booking = Booking.objects.create(
            buyer=self.buyer, listing=self.listing, variant=self.variant, scheduled_date='2099-01-01',
            scheduled_time='2:30 PM', status='pending', quantity=4,
        )
        # variant payout=300 * qty 4 = 1200 -> 8% fee = 96, below floor -> 100 -> total 1300.
        order_id, error = _create_order_from_paystack_data(
            self._fake_paystack_data('ORD-VARIANT-0001', 130000), self.buyer, self.listing.id, 'service',
            booking_id=booking.id,
        )
        self.assertIsNone(error)
        from payments.models import PaymentTransaction
        txn = PaymentTransaction.objects.get(order_id=order_id)
        # Vendor gets variant.payout_amount * quantity = 1200, NOT the listing's
        # own payout_amount (500) * quantity (which would be 2000).
        self.assertEqual(txn.seller_amount, Decimal('1200.00'))

    def test_regression_no_variant_uses_listing_payout(self):
        """A booking on the same listing with no variant still uses the
        listing's own payout_amount, exactly as before variants existed."""
        booking = Booking.objects.create(
            buyer=self.buyer, listing=self.listing, scheduled_date='2099-01-01',
            scheduled_time='2:30 PM', status='pending', quantity=4,
        )
        order_id, error = _create_order_from_paystack_data(
            self._fake_paystack_data('ORD-VARIANT-0002', 216000), self.buyer, self.listing.id, 'service',
            booking_id=booking.id,
        )
        self.assertIsNone(error)
        from payments.models import PaymentTransaction
        txn = PaymentTransaction.objects.get(order_id=order_id)
        self.assertEqual(txn.seller_amount, Decimal('2000.00'))


@override_settings(PAYSTACK_SECRET_KEY='test-secret-key')
class InitializePaymentPerUnitTests(APITestCase):
    """
    POST /api/payments/initialize/ — for a per-unit booking, the amount sent to
    Paystack must be calculate_final_price(payout_amount * quantity), not the
    flat listing.price (which would apply the fee floor per-unit and undercharge
    or overcharge depending on rounding).
    """

    def setUp(self):
        from payments.models import PricingSettings
        PricingSettings.objects.update_or_create(pk=1, defaults={'service_fee_percent': Decimal('8.00')})

        self.client = APIClient()
        self.buyer = User.objects.create_user(
            username='init_buyer', email='init_buyer@pau.edu.ng', password='pass123'
        )
        self.seller = User.objects.create_user(
            username='init_seller', email='init_seller@pau.edu.ng', password='pass123',
            user_type='vendor', is_verified_vendor=True
        )
        self.category = Category.objects.create(title='Init Laundry', slug='init-laundry')
        self.listing = Listing.objects.create(
            title='Washing & Ironing', description='Per cloth', payout_amount=Decimal('500.00'),
            price=Decimal('600.00'), is_per_unit=True, unit_label='cloth',
            vendor=self.seller, category=self.category, is_available=True,
        )
        self.booking = Booking.objects.create(
            buyer=self.buyer, listing=self.listing, scheduled_date='2099-01-01',
            scheduled_time='2:30 PM', status='pending', quantity=4,
        )

    def _mock_paystack_response(self):
        mock_res = MagicMock()
        mock_res.status_code = 200
        mock_res.json.return_value = {
            'status': True,
            'data': {'access_code': 'test_code', 'authorization_url': 'https://paystack.test/pay', 'reference': 'STX-TEST'},
        }
        return mock_res

    @patch('payments.views.requests.post')
    def test_charges_quantity_scaled_amount_not_flat_price(self, mock_post):
        mock_post.return_value = self._mock_paystack_response()
        self.client.force_authenticate(user=self.buyer)

        response = self.client.post('/api/payments/initialize/', {
            'listing_id': self.listing.id, 'booking_id': self.booking.id,
        })

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        sent_payload = mock_post.call_args.kwargs['json']
        # Correct: fee applied once to (500*4=2000) -> 160 -> 2160 -> 216000 kobo.
        # Buggy (flat price * quantity) would send 600*4*100 = 240000 kobo instead.
        self.assertEqual(sent_payload['amount'], 216000)
        self.assertEqual(sent_payload['metadata']['booking_id'], str(self.booking.id))

    @patch('payments.views.requests.post')
    def test_flat_listing_without_booking_id_unaffected(self, mock_post):
        """Regression: a plain listing purchase with no booking_id still charges
        the flat listing.price, exactly as before this feature existed."""
        mock_post.return_value = self._mock_paystack_response()
        flat_listing = Listing.objects.create(
            title='Gel Manicure', description='Flat', payout_amount=Decimal('1000.00'),
            price=Decimal('1100.00'), vendor=self.seller, category=self.category, is_available=True,
        )
        self.client.force_authenticate(user=self.buyer)

        response = self.client.post('/api/payments/initialize/', {'listing_id': flat_listing.id})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        sent_payload = mock_post.call_args.kwargs['json']
        self.assertEqual(sent_payload['amount'], 110000)
