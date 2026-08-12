# orders/test_auto_refund_stale_orders.py
"""
Buyer-protection counterpart to orders.tests's auto_release_orders coverage
(scheduler.py JOB 2 protects the vendor when a buyer goes silent) — this
covers JOB 16/17 (scheduler.warn_vendors_of_pending_auto_refund /
auto_refund_stale_paid_orders), which protect the buyer when a vendor never
fulfils a paid, self-fulfilled marketplace order at all.

Scope under test: self-fulfilled 'product' orders only. Service bookings
and anything routed through the rider/batched-delivery pipeline (a
DeliveryAssignment or a delivery_slot) must never be touched here — that's
what keeps a Buka-9-style food order and a lash appointment both out of
this job entirely.
"""
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone

from accounts.models import User
from delivery.models import DeliveryAssignment, DeliverySlot
from delivery.capacity import LAGOS
from orders.models import Order, Dispute, AutoRefundSettings
from payments.models import PaymentTransaction, ManualRefund
from notifications.models import Notification
from services.models import Category, Listing

from scheduler import warn_vendors_of_pending_auto_refund, auto_refund_stale_paid_orders


class AutoRefundTestBase(TestCase):
    def setUp(self):
        # accounts.utils.send_notification dedupes identical (recipient,
        # notification_type, title) sends within a real 30s wall-clock
        # window. Without this, an assertion here can be silently defeated
        # by an earlier test in the same run that hit the same recipient id
        # + title inside that window — SQLite reuses PKs across TestCase's
        # per-test transaction rollback, and make_order's reference is
        # derived from the fresh Listing's id, so it repeats across tests.
        cache.clear()
        self.buyer = User.objects.create_user(username='ar_buyer', email='ar_buyer@pau.edu.ng', password='pass123')
        self.vendor = User.objects.create_user(username='ar_vendor', email='ar_vendor@pau.edu.ng', password='pass123')
        self.category = Category.objects.create(title='ArCat', slug='ar-cat')

    def make_order(self, hours_ago, listing_type='product', **order_kwargs):
        listing = Listing.objects.create(
            title='Wired Earphones', description='x', payout_amount=Decimal('2000'), price=Decimal('2200'),
            vendor=self.vendor, category=self.category, is_available=True, listing_type=listing_type,
        )
        reference = order_kwargs.pop('reference', f'STX-AR-{listing.id}')
        order = Order.objects.create(
            buyer=self.buyer, listing=listing, amount=Decimal('2200'), status='paid',
            reference=reference, paid_at=timezone.now() - timedelta(hours=hours_ago),
            **order_kwargs,
        )
        PaymentTransaction.objects.create(
            buyer=self.buyer, seller=self.vendor, reference=reference,
            amount=Decimal('2200'), seller_amount=Decimal('2000'), platform_amount=Decimal('200'),
            status='success', buyer_email=self.buyer.email, order_id=order.id,
        )
        return order


class AutoRefundStalePaidOrdersTests(AutoRefundTestBase):
    @patch('payments.views.refund_paystack_transaction', return_value=True)
    def test_refunds_self_fulfilled_product_order_past_the_window(self, mock_refund):
        order = self.make_order(hours_ago=73)  # default window is 72h
        auto_refund_stale_paid_orders()

        order.refresh_from_db()
        self.assertEqual(order.status, 'vendor_declined')
        self.assertTrue(order.vendor_timeout_refunded)
        mock_refund.assert_called_once_with(order.reference)
        self.assertTrue(Notification.objects.filter(recipient=self.buyer, notification_type='order_auto_refunded').exists())
        self.assertTrue(Notification.objects.filter(recipient=self.vendor, notification_type='order_auto_refunded').exists())

    @patch('payments.views.refund_paystack_transaction', return_value=True)
    def test_does_not_touch_order_still_within_the_window(self, mock_refund):
        order = self.make_order(hours_ago=10)
        auto_refund_stale_paid_orders()

        order.refresh_from_db()
        self.assertEqual(order.status, 'paid')
        self.assertFalse(order.vendor_timeout_refunded)
        mock_refund.assert_not_called()

    @patch('payments.views.refund_paystack_transaction', return_value=True)
    def test_excludes_service_bookings(self, mock_refund):
        """A lash appointment is pinned to its own scheduled_date, not a fulfillment-speed window."""
        order = self.make_order(hours_ago=100, listing_type='service')
        auto_refund_stale_paid_orders()

        order.refresh_from_db()
        self.assertEqual(order.status, 'paid')
        mock_refund.assert_not_called()

    @patch('payments.views.refund_paystack_transaction', return_value=True)
    def test_excludes_orders_with_a_delivery_assignment(self, mock_refund):
        """Rider-fulfilled (Buka-9-style) orders resolve through their own pipeline, not this job."""
        order = self.make_order(hours_ago=100)
        rider = User.objects.create_user(username='ar_rider', email='ar_rider@pau.edu.ng', password='pass123', user_type='rider')
        DeliveryAssignment.objects.create(order=order, rider=rider)

        auto_refund_stale_paid_orders()

        order.refresh_from_db()
        self.assertEqual(order.status, 'paid')
        mock_refund.assert_not_called()

    @patch('payments.views.refund_paystack_transaction', return_value=True)
    def test_excludes_orders_with_a_delivery_slot(self, mock_refund):
        """A batched vendor's order, even before a DeliveryAssignment exists yet."""
        FROZEN_NOW = timezone.now()
        slot = DeliverySlot.objects.create(
            vendor=self.vendor, campus='pau', display_name='Lunch',
            delivery_time=(FROZEN_NOW + timedelta(hours=3)).astimezone(LAGOS).time(), max_orders=100,
        )
        order = self.make_order(hours_ago=100, delivery_slot=slot)

        auto_refund_stale_paid_orders()

        order.refresh_from_db()
        self.assertEqual(order.status, 'paid')
        mock_refund.assert_not_called()

    @patch('payments.views.refund_paystack_transaction', return_value=True)
    def test_excludes_orders_with_an_open_dispute(self, mock_refund):
        order = self.make_order(hours_ago=100)
        Dispute.objects.create(
            order=order, filer=self.buyer, filed_by='customer',
            reason='service_not_completed', complaint='Item never arrived', status='open',
        )

        auto_refund_stale_paid_orders()

        order.refresh_from_db()
        self.assertEqual(order.status, 'paid')
        mock_refund.assert_not_called()

    @patch('payments.views.refund_paystack_transaction', return_value=False)
    def test_leaves_order_paid_when_the_refund_call_fails(self, mock_refund):
        """Left status='paid', vendor_timeout_refunded=False — retried next hourly run."""
        order = self.make_order(hours_ago=100)
        auto_refund_stale_paid_orders()

        order.refresh_from_db()
        self.assertEqual(order.status, 'paid')
        self.assertFalse(order.vendor_timeout_refunded)

    @patch('payments.views.refund_paystack_transaction', return_value=True)
    def test_idempotent_second_run_does_not_refund_again(self, mock_refund):
        order = self.make_order(hours_ago=100)
        auto_refund_stale_paid_orders()
        auto_refund_stale_paid_orders()

        mock_refund.assert_called_once()

    @patch('payments.views.refund_paystack_transaction')
    def test_bank_transfer_order_gets_a_manual_refund_not_a_paystack_call(self, mock_refund):
        order = self.make_order(hours_ago=100)
        PaymentTransaction.objects.filter(reference=order.reference).update(is_bank_transfer=True)

        auto_refund_stale_paid_orders()

        mock_refund.assert_not_called()
        order.refresh_from_db()
        self.assertEqual(order.status, 'vendor_declined')
        self.assertTrue(order.vendor_timeout_refunded)
        refund = ManualRefund.objects.get(order=order)
        self.assertEqual(refund.buyer, self.buyer)
        self.assertEqual(refund.amount, Decimal('2200.00'))
        self.assertIsNone(refund.order_item)

    @patch('payments.views.refund_paystack_transaction', return_value=True)
    def test_uses_configured_window_not_the_default(self, mock_refund):
        AutoRefundSettings.objects.update_or_create(pk=1, defaults={'hours': 10})
        order = self.make_order(hours_ago=11)  # would NOT qualify under the 72h default

        auto_refund_stale_paid_orders()

        order.refresh_from_db()
        self.assertEqual(order.status, 'vendor_declined')


class WarnVendorsOfPendingAutoRefundTests(AutoRefundTestBase):
    def test_warns_vendor_past_the_halfway_point(self):
        order = self.make_order(hours_ago=37)  # default window 72h — halfway is 36h
        warn_vendors_of_pending_auto_refund()

        order.refresh_from_db()
        self.assertTrue(order.vendor_timeout_warned)
        self.assertTrue(Notification.objects.filter(recipient=self.vendor, notification_type='order_timeout_warning').exists())

    def test_does_not_warn_before_the_halfway_point(self):
        order = self.make_order(hours_ago=10)
        warn_vendors_of_pending_auto_refund()

        order.refresh_from_db()
        self.assertFalse(order.vendor_timeout_warned)
        self.assertFalse(Notification.objects.filter(recipient=self.vendor, notification_type='order_timeout_warning').exists())

    def test_never_warns_twice_for_the_same_order(self):
        order = self.make_order(hours_ago=37)
        warn_vendors_of_pending_auto_refund()
        warn_vendors_of_pending_auto_refund()

        self.assertEqual(
            Notification.objects.filter(recipient=self.vendor, notification_type='order_timeout_warning').count(), 1,
        )

    def test_excludes_service_bookings_and_rider_fulfilled_orders(self):
        service_order = self.make_order(hours_ago=100, listing_type='service')
        rider_order = self.make_order(hours_ago=100)
        rider = User.objects.create_user(username='ar_rider2', email='ar_rider2@pau.edu.ng', password='pass123', user_type='rider')
        DeliveryAssignment.objects.create(order=rider_order, rider=rider)

        warn_vendors_of_pending_auto_refund()

        service_order.refresh_from_db()
        rider_order.refresh_from_db()
        self.assertFalse(service_order.vendor_timeout_warned)
        self.assertFalse(rider_order.vendor_timeout_warned)


class AutoRefundSettingsTests(TestCase):
    def test_get_creates_singleton_with_default_72_hours(self):
        settings_obj = AutoRefundSettings.get()
        self.assertEqual(settings_obj.hours, 72)
        self.assertEqual(AutoRefundSettings.objects.count(), 1)

    def test_get_returns_the_same_row_on_repeated_calls(self):
        first = AutoRefundSettings.get()
        first.hours = 48
        first.save()
        second = AutoRefundSettings.get()
        self.assertEqual(second.pk, first.pk)
        self.assertEqual(second.hours, 48)
