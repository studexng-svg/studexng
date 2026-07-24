# orders/test_mark_item_unavailable.py
"""
Test suite for POST /api/orders/orders/{id}/items/{item_id}/mark-unavailable/
(Phase 1 — Food Commerce Engine, Step 6). Permission model (vendor or
assigned rider, pre-pickup only) lives in the view; refund math lives in
payments.item_refund (see payments/test_item_refund.py) — not re-tested here.
"""
from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from services.models import Category, Listing
from orders.models import Order, OrderItem
from payments.models import PaymentTransaction
from delivery.models import DeliveryAssignment, CampusPickupPoint


class MarkItemUnavailableViewTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.buyer = User.objects.create_user(username='miu_buyer', email='miu_buyer@pau.edu.ng', password='pass123')
        self.vendor = User.objects.create_user(username='miu_vendor', email='miu_vendor@pau.edu.ng', password='pass123')
        self.rider = User.objects.create_user(username='miu_rider', email='miu_rider@pau.edu.ng', password='pass123', user_type='rider')
        self.stranger = User.objects.create_user(username='miu_stranger', email='miu_stranger@pau.edu.ng', password='pass123')
        self.category = Category.objects.create(title='FoodMIU', slug='food-miu')
        self.listing = Listing.objects.create(
            title='Jollof Rice', description='x', payout_amount=Decimal('3000'), price=Decimal('3240'),
            vendor=self.vendor, category=self.category, is_available=True,
        )
        self.order = Order.objects.create(
            buyer=self.buyer, listing=self.listing, amount=Decimal('3240'),
            reference='STX-MIU-0001', status='paid',
        )
        self.item = OrderItem.objects.create(
            order=self.order, listing=self.listing, quantity=1,
            unit_price_at_order_time=Decimal('3240'), line_total=Decimal('3240'),
        )
        PaymentTransaction.objects.create(
            buyer=self.buyer, seller=self.vendor, reference='STX-MIU-0001',
            amount=Decimal('3240'), seller_amount=Decimal('3000'), platform_amount=Decimal('240'),
            status='success', buyer_email=self.buyer.email, order_id=self.order.id,
        )

    def _url(self, item_id=None):
        return f"/api/orders/orders/{self.order.id}/items/{item_id if item_id is not None else self.item.id}/mark-unavailable/"

    @patch('payments.views.refund_paystack_transaction', return_value=True)
    def test_vendor_can_mark_own_order_item_unavailable(self, mock_refund):
        self.client.force_authenticate(user=self.vendor)
        response = self.client.post(self._url())

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['refund_amount'], 3240.0)
        self.item.refresh_from_db()
        self.assertEqual(self.item.status, 'unavailable')

    @patch('payments.views.refund_paystack_transaction', return_value=True)
    def test_assigned_rider_can_mark_item_unavailable(self, mock_refund):
        point = CampusPickupPoint.objects.create(name='Hostel A', campus='pau')
        DeliveryAssignment.objects.create(order=self.order, rider=self.rider, pickup_point=point)

        self.client.force_authenticate(user=self.rider)
        response = self.client.post(self._url())

        self.assertEqual(response.status_code, 200)

    def test_unrelated_user_forbidden(self):
        self.client.force_authenticate(user=self.stranger)
        response = self.client.post(self._url())
        self.assertEqual(response.status_code, 403)

    def test_buyer_forbidden(self):
        """The buyer themself is neither vendor nor rider — cannot mark their own order's item unavailable."""
        self.client.force_authenticate(user=self.buyer)
        response = self.client.post(self._url())
        self.assertEqual(response.status_code, 403)

    def test_unassigned_rider_forbidden(self):
        other_rider = User.objects.create_user(username='miu_rider2', email='miu_rider2@pau.edu.ng', password='pass123', user_type='rider')
        point = CampusPickupPoint.objects.create(name='Hostel A', campus='pau')
        DeliveryAssignment.objects.create(order=self.order, rider=self.rider, pickup_point=point)

        self.client.force_authenticate(user=other_rider)
        response = self.client.post(self._url())
        self.assertEqual(response.status_code, 403)

    def test_rejected_after_pickup_verified(self):
        point = CampusPickupPoint.objects.create(name='Hostel A', campus='pau')
        DeliveryAssignment.objects.create(
            order=self.order, rider=self.rider, pickup_point=point,
            responsibility='studex_delivery', responsibility_transferred_at=timezone.now(),
        )

        self.client.force_authenticate(user=self.vendor)
        response = self.client.post(self._url())

        self.assertEqual(response.status_code, 400)
        self.item.refresh_from_db()
        self.assertEqual(self.item.status, 'fulfilled')

    def test_allowed_before_pickup_verified(self):
        point = CampusPickupPoint.objects.create(name='Hostel A', campus='pau')
        DeliveryAssignment.objects.create(order=self.order, rider=self.rider, pickup_point=point)  # not yet transferred

        with patch('payments.views.refund_paystack_transaction', return_value=True):
            self.client.force_authenticate(user=self.vendor)
            response = self.client.post(self._url())

        self.assertEqual(response.status_code, 200)

    def test_nonexistent_item_404(self):
        self.client.force_authenticate(user=self.vendor)
        response = self.client.post(self._url(item_id=999999))
        self.assertEqual(response.status_code, 404)

    def test_nonexistent_order_404(self):
        self.client.force_authenticate(user=self.vendor)
        response = self.client.post(f"/api/orders/orders/999999/items/{self.item.id}/mark-unavailable/")
        self.assertEqual(response.status_code, 404)

    @patch('payments.views.refund_paystack_transaction', return_value=True)
    def test_already_unavailable_item_rejected_on_second_call(self, mock_refund):
        self.client.force_authenticate(user=self.vendor)
        first = self.client.post(self._url())
        second = self.client.post(self._url())

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 400)
        self.assertEqual(mock_refund.call_count, 1)
