# payments/test_item_refund.py
"""
Test suite for payments/item_refund.py — partial refund for one unavailable
OrderItem (Phase 1 — Food Commerce Engine, Step 6).

Refund-amount correctness under test: line_total alone, with no added
proportional fee share — confirmed against the concrete over-refund bug a
literal reading of TDS §19 would produce, given how Step 3 actually prices
each line (fee embedded per-line via calculate_final_price, not tracked
only at the order level).
"""
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase

from accounts.models import User
from services.models import Category, Listing
from orders.models import Order, OrderItem
from payments.models import PaymentTransaction, VendorDebt
from payments.item_refund import mark_order_item_unavailable, ItemRefundError


class MarkOrderItemUnavailableTests(TestCase):
    def setUp(self):
        self.buyer = User.objects.create_user(username='ir_buyer', email='ir_buyer@pau.edu.ng', password='pass123')
        self.vendor = User.objects.create_user(username='ir_vendor', email='ir_vendor@pau.edu.ng', password='pass123')
        self.category = Category.objects.create(title='FoodIR', slug='food-ir')
        self.listing_a = Listing.objects.create(
            title='Jollof Rice', description='x', payout_amount=Decimal('3000'), price=Decimal('3240'),
            vendor=self.vendor, category=self.category, is_available=True,
        )
        self.listing_b = Listing.objects.create(
            title='Suya', description='x', payout_amount=Decimal('2000'), price=Decimal('2160'),
            vendor=self.vendor, category=self.category, is_available=True,
        )
        self.order = Order.objects.create(
            buyer=self.buyer, listing=self.listing_a, amount=Decimal('5400'),
            reference='STX-IR-0001', status='paid',
        )
        self.item_a = OrderItem.objects.create(
            order=self.order, listing=self.listing_a, quantity=1,
            unit_price_at_order_time=Decimal('3240'), line_total=Decimal('3240'),
        )
        self.item_b = OrderItem.objects.create(
            order=self.order, listing=self.listing_b, quantity=1,
            unit_price_at_order_time=Decimal('2160'), line_total=Decimal('2160'),
        )
        self.txn = PaymentTransaction.objects.create(
            buyer=self.buyer, seller=self.vendor, reference='STX-IR-0001',
            amount=Decimal('5400'), seller_amount=Decimal('5000'), platform_amount=Decimal('400'),
            status='success', buyer_email=self.buyer.email, order_id=self.order.id,
        )

    @patch('payments.views.refund_paystack_transaction', return_value=True)
    def test_refund_amount_is_exactly_line_total_no_added_fee(self, mock_refund):
        """The over-refund regression check: refund must equal line_total, never line_total + a proportional fee share."""
        refund_amount, debt = mark_order_item_unavailable(self.item_a.id)
        self.assertEqual(refund_amount, Decimal('3240'))
        self.assertIsNone(debt)
        mock_refund.assert_called_once_with('STX-IR-0001', 324000)

    @patch('payments.views.refund_paystack_transaction', return_value=True)
    def test_item_status_flips_to_unavailable(self, mock_refund):
        mark_order_item_unavailable(self.item_a.id)
        self.item_a.refresh_from_db()
        self.assertEqual(self.item_a.status, 'unavailable')

    @patch('payments.views.refund_paystack_transaction', return_value=True)
    def test_sibling_item_untouched(self, mock_refund):
        mark_order_item_unavailable(self.item_a.id)
        self.item_b.refresh_from_db()
        self.assertEqual(self.item_b.status, 'fulfilled')

    @patch('payments.views.refund_paystack_transaction', return_value=True)
    def test_seller_and_platform_amounts_reduced_proportionally_and_sum_to_refund(self, mock_refund):
        mark_order_item_unavailable(self.item_a.id)
        self.txn.refresh_from_db()
        # item_a is 3240/5400 = 60% of the order.
        self.assertEqual(self.txn.seller_amount, Decimal('5000') - Decimal('3000.00'))  # 5000*0.6=3000
        self.assertEqual(self.txn.platform_amount, Decimal('400') - Decimal('240.00'))  # 400*0.6=240
        # The two deductions must sum to exactly the refunded amount.
        original_seller, original_platform = Decimal('5000'), Decimal('400')
        seller_deduction = original_seller - self.txn.seller_amount
        platform_deduction = original_platform - self.txn.platform_amount
        self.assertEqual(seller_deduction + platform_deduction, Decimal('3240'))

    @patch('payments.views.refund_paystack_transaction', return_value=True)
    def test_already_unavailable_item_raises_and_does_not_double_refund(self, mock_refund):
        mark_order_item_unavailable(self.item_a.id)
        with self.assertRaises(ItemRefundError):
            mark_order_item_unavailable(self.item_a.id)
        self.assertEqual(mock_refund.call_count, 1)

    def test_missing_transaction_raises(self):
        self.txn.delete()
        with self.assertRaises(ItemRefundError):
            mark_order_item_unavailable(self.item_a.id)

    def test_nonexistent_item_raises(self):
        with self.assertRaises(ItemRefundError):
            mark_order_item_unavailable(999999)

    @patch('payments.views.refund_paystack_transaction', return_value=False)
    def test_paystack_failure_reverts_claim(self, mock_refund):
        with self.assertRaises(ItemRefundError):
            mark_order_item_unavailable(self.item_a.id)
        self.item_a.refresh_from_db()
        self.assertEqual(self.item_a.status, 'fulfilled')  # reverted, not stuck unavailable
        self.txn.refresh_from_db()
        self.assertEqual(self.txn.seller_amount, Decimal('5000'))  # untouched — never got that far

    @patch('payments.views.refund_paystack_transaction', return_value=True)
    def test_already_paid_out_creates_vendor_debt_instead_of_reducing_seller_amount(self, mock_refund):
        self.txn.transfer_reference = 'PAYOUT-STX-IR-0001'
        self.txn.save(update_fields=['transfer_reference'])

        refund_amount, debt = mark_order_item_unavailable(self.item_a.id)

        self.assertIsNotNone(debt)
        self.assertEqual(debt.vendor, self.vendor)
        self.assertEqual(debt.outstanding_amount, Decimal('3000.00'))
        self.assertEqual(VendorDebt.objects.filter(source_transaction=self.txn).count(), 1)

        self.txn.refresh_from_db()
        self.assertEqual(self.txn.seller_amount, Decimal('5000'))  # unchanged — vendor already has the money
