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

from django.core.cache import cache
from django.test import TestCase

from accounts.models import User
from services.models import Category, Listing
from orders.models import Order, OrderItem
from payments.models import PaymentTransaction, VendorDebt
from payments.item_refund import mark_order_item_unavailable, ItemRefundError


class MarkOrderItemUnavailableTests(TestCase):
    def setUp(self):
        # accounts.utils.send_notification dedupes identical (recipient,
        # notification_type, title) sends within a real 30s wall-clock
        # window — without this, a notification assertion here can be
        # silently defeated by an earlier test in the same run that hit the
        # same recipient id + title inside that window (SQLite reuses PKs
        # across TestCase's per-test transaction rollback).
        cache.clear()
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
    def test_order_stays_in_progress_while_a_sibling_item_is_still_fulfilled(self, mock_refund):
        mark_order_item_unavailable(self.item_a.id)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, 'paid')

    @patch('payments.views.refund_paystack_transaction', return_value=True)
    def test_order_cancelled_once_every_item_is_unavailable(self, mock_refund):
        """
        Regression: marking the last remaining item unavailable left the
        order itself stuck at 'paid' ("in progress" to the buyer) forever —
        nothing updated Order.status once there was nothing left to fulfill.
        """
        mark_order_item_unavailable(self.item_a.id)
        mark_order_item_unavailable(self.item_b.id)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, 'cancelled')

    @patch('payments.views.refund_paystack_transaction', return_value=False)
    def test_paystack_failure_reverts_order_cancellation_too(self, mock_refund):
        """If this was the order's only fulfilled item and the refund call then
        fails, the order-level cancellation must revert alongside the item."""
        # Make item_a the only item so marking it unavailable would cancel the order.
        self.item_b.delete()
        with self.assertRaises(ItemRefundError):
            mark_order_item_unavailable(self.item_a.id)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, 'paid')  # not left stuck as 'cancelled'

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


class MarkOrderItemUnavailableBankTransferTests(TestCase):
    """
    A bank-transfer order (payments.models.PaymentTransaction.is_bank_transfer)
    has no real Paystack transaction — refund_paystack_transaction must never
    be called against it. Instead a ManualRefund record is created so the
    buyer can submit their own bank details and an admin can send the money
    back manually.
    """
    def setUp(self):
        cache.clear()  # see MarkOrderItemUnavailableTests.setUp
        self.buyer = User.objects.create_user(username='irbt_buyer', email='irbt_buyer@pau.edu.ng', password='pass123')
        self.vendor = User.objects.create_user(username='irbt_vendor', email='irbt_vendor@pau.edu.ng', password='pass123')
        self.admin = User.objects.create_user(
            username='irbt_admin', email='irbt_admin@pau.edu.ng', password='pass123', is_staff=True,
        )
        self.category = Category.objects.create(title='FoodIRBT', slug='food-irbt')
        self.listing = Listing.objects.create(
            title='Jollof Rice', description='x', payout_amount=Decimal('3000'), price=Decimal('3240'),
            vendor=self.vendor, category=self.category, is_available=True,
        )
        self.order = Order.objects.create(
            buyer=self.buyer, listing=self.listing, amount=Decimal('3240'),
            reference='STX-BANKXFER-IRBT0001', status='paid',
        )
        self.item = OrderItem.objects.create(
            order=self.order, listing=self.listing, quantity=1,
            unit_price_at_order_time=Decimal('3240'), line_total=Decimal('3240'),
        )
        self.txn = PaymentTransaction.objects.create(
            buyer=self.buyer, seller=self.vendor, reference='STX-BANKXFER-IRBT0001',
            amount=Decimal('3240'), seller_amount=Decimal('3000'), platform_amount=Decimal('240'),
            status='success', is_bank_transfer=True, buyer_email=self.buyer.email, order_id=self.order.id,
        )

    @patch('payments.views.refund_paystack_transaction')
    def test_never_calls_paystack_refund(self, mock_refund):
        mark_order_item_unavailable(self.item.id)
        mock_refund.assert_not_called()

    @patch('payments.views.refund_paystack_transaction')
    def test_order_cancelled_when_its_only_item_marked_unavailable(self, mock_refund):
        """
        The exact bug report: a rider marks a single-item bank-transfer
        order's only item unavailable — the buyer's order list kept showing
        it "in progress" forever instead of cancelled.
        """
        mark_order_item_unavailable(self.item.id)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, 'cancelled')

    @patch('payments.views.refund_paystack_transaction')
    def test_succeeds_and_marks_item_unavailable_with_no_error(self, mock_refund):
        refund_amount, vendor_debt = mark_order_item_unavailable(self.item.id)
        self.assertEqual(refund_amount, Decimal('3240'))
        self.assertIsNone(vendor_debt)
        self.item.refresh_from_db()
        self.assertEqual(self.item.status, 'unavailable')

    @patch('payments.views.refund_paystack_transaction')
    def test_creates_manual_refund_record(self, mock_refund):
        from payments.models import ManualRefund
        mark_order_item_unavailable(self.item.id)
        refund = ManualRefund.objects.get(order=self.order)
        self.assertEqual(refund.buyer, self.buyer)
        self.assertEqual(refund.amount, Decimal('3240'))
        self.assertEqual(refund.status, 'awaiting_bank_details')
        self.assertEqual(refund.order_item_id, self.item.id)

    @patch('payments.views.refund_paystack_transaction')
    def test_seller_amount_still_reduced_for_bookkeeping(self, mock_refund):
        mark_order_item_unavailable(self.item.id)
        self.txn.refresh_from_db()
        self.assertEqual(self.txn.seller_amount, Decimal('0.00'))
        self.assertEqual(self.txn.platform_amount, Decimal('0.00'))

    @patch('payments.views.refund_paystack_transaction')
    def test_notifies_buyer_and_admin(self, mock_refund):
        from notifications.models import Notification
        mark_order_item_unavailable(self.item.id)
        self.assertTrue(Notification.objects.filter(recipient=self.buyer, title__icontains='Refund Owed').exists())
        self.assertTrue(Notification.objects.filter(recipient=self.admin, title__icontains='Manual Refund Needed').exists())


class ManualRefundSubmitAndResolveTests(TestCase):
    def setUp(self):
        self.buyer = User.objects.create_user(username='mr_buyer', email='mr_buyer@pau.edu.ng', password='pass123')
        self.other_buyer = User.objects.create_user(username='mr_other', email='mr_other@pau.edu.ng', password='pass123')
        self.vendor = User.objects.create_user(username='mr_vendor', email='mr_vendor@pau.edu.ng', password='pass123')
        self.admin = User.objects.create_user(
            username='mr_admin', email='mr_admin@pau.edu.ng', password='pass123', is_staff=True,
        )
        self.category = Category.objects.create(title='FoodMR', slug='food-mr')
        self.listing = Listing.objects.create(
            title='Jollof Rice', description='x', payout_amount=Decimal('3000'), price=Decimal('3240'),
            vendor=self.vendor, category=self.category, is_available=True,
        )
        self.order = Order.objects.create(
            buyer=self.buyer, listing=self.listing, amount=Decimal('3240'),
            reference='STX-BANKXFER-MR0001', status='paid',
        )
        from payments.models import ManualRefund
        self.refund = ManualRefund.objects.create(
            order=self.order, buyer=self.buyer, amount=Decimal('3240'), reason='Item unavailable',
        )

    def test_buyer_can_view_own_refund(self):
        from rest_framework.test import APIClient
        client = APIClient()
        client.force_authenticate(user=self.buyer)
        res = client.get(f'/api/payments/manual-refunds/{self.refund.id}/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['status'], 'awaiting_bank_details')

    def test_other_user_cannot_view_refund(self):
        from rest_framework.test import APIClient
        client = APIClient()
        client.force_authenticate(user=self.other_buyer)
        res = client.get(f'/api/payments/manual-refunds/{self.refund.id}/')
        self.assertEqual(res.status_code, 403)

    def test_buyer_submits_bank_details(self):
        from rest_framework.test import APIClient
        from notifications.models import Notification
        client = APIClient()
        client.force_authenticate(user=self.buyer)
        res = client.post(f'/api/payments/manual-refunds/{self.refund.id}/', {
            'account_name': 'Test Buyer', 'account_number': '0123456789', 'bank_name': 'Kuda',
        }, format='json')
        self.assertEqual(res.status_code, 200)

        self.refund.refresh_from_db()
        self.assertEqual(self.refund.status, 'awaiting_admin_action')
        self.assertEqual(self.refund.buyer_account_number, '0123456789')
        self.assertTrue(Notification.objects.filter(recipient=self.admin, title__icontains='Ready to Refund').exists())

    def test_cannot_resubmit_bank_details_twice(self):
        from rest_framework.test import APIClient
        client = APIClient()
        client.force_authenticate(user=self.buyer)
        client.post(f'/api/payments/manual-refunds/{self.refund.id}/', {
            'account_name': 'Test Buyer', 'account_number': '0123456789', 'bank_name': 'Kuda',
        }, format='json')
        res = client.post(f'/api/payments/manual-refunds/{self.refund.id}/', {
            'account_name': 'Someone Else', 'account_number': '9999999999', 'bank_name': 'GTBank',
        }, format='json')
        self.assertEqual(res.status_code, 400)
        self.refund.refresh_from_db()
        self.assertEqual(self.refund.buyer_account_number, '0123456789')  # untouched

    def test_admin_mark_refunded_action_notifies_buyer(self):
        from django.contrib.auth import get_user_model
        from notifications.models import Notification
        self.refund.buyer_account_name = 'Test Buyer'
        self.refund.buyer_account_number = '0123456789'
        self.refund.buyer_bank_name = 'Kuda'
        self.refund.status = 'awaiting_admin_action'
        self.refund.save()

        from payments.admin import ManualRefundAdmin
        from payments.models import ManualRefund
        from django.test import RequestFactory
        factory = RequestFactory()
        request = factory.post('/studex-portal-9f3a2/payments/manualrefund/')
        request.user = self.admin
        request._messages = _FakeMessages()

        admin_instance = ManualRefundAdmin(ManualRefund, None)
        admin_instance.mark_refunded(request, ManualRefund.objects.filter(id=self.refund.id))

        self.refund.refresh_from_db()
        self.assertEqual(self.refund.status, 'completed')
        self.assertEqual(self.refund.resolved_by, self.admin)
        self.assertIsNotNone(self.refund.resolved_at)
        self.assertTrue(Notification.objects.filter(recipient=self.buyer, title__icontains='Refund Sent').exists())


class _FakeMessages:
    """Minimal stand-in for Django admin's request._messages, used only so
    ModelAdmin.message_user() doesn't crash when called outside a real request."""
    def add(self, *args, **kwargs):
        pass
