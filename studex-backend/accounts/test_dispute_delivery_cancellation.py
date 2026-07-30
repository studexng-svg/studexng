# accounts/test_dispute_delivery_cancellation.py
"""
Regression coverage for AdminDisputeDetailView.patch's _cancel_active_delivery
helper: a dispute resolving (either branch) while a rider is still mid-delivery
must cancel the DeliveryAssignment, notify the rider, and drop the order out
of the rider's active-assignment lists — otherwise the rider's dashboard kept
showing "Mark as Picked Up" for an order that had already been refunded or
released out from under them.
"""
from decimal import Decimal

from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from unittest.mock import patch

from accounts.models import User
from services.models import Category, Listing
from orders.models import Order, Dispute
from delivery.models import DeliveryAssignment, CampusPickupPoint
from payments.models import PaymentTransaction


class DisputeCancelsActiveDeliveryTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            username='admin_dt', email='admin_dt@pau.edu.ng', password='pass12345',
            is_staff=True, is_superuser=True,
        )
        self.buyer = User.objects.create_user(
            username='buyer_dt', email='buyer_dt@pau.edu.ng', password='pass12345',
        )
        self.vendor = User.objects.create_user(
            username='vendor_dt', email='vendor_dt@pau.edu.ng', password='pass12345',
            user_type='vendor', is_verified_vendor=True,
        )
        self.rider = User.objects.create_user(
            username='rider_dt', email='rider_dt@pau.edu.ng', password='pass12345',
            user_type='rider',
        )
        category = Category.objects.create(title='Food DT', slug='food-dt')
        self.listing = Listing.objects.create(
            title='Jollof Rice', description='x', price=Decimal('1500.00'),
            vendor=self.vendor, category=category, is_available=True, campus='pau',
        )
        self.order = Order.objects.create(
            reference='ORD-DT-1', buyer=self.buyer, listing=self.listing,
            amount=Decimal('1500.00'), status='paid',
        )
        self.point = CampusPickupPoint.objects.create(name='Gate DT', campus='pau')
        self.assignment = DeliveryAssignment.objects.create(
            order=self.order, rider=self.rider, pickup_point=self.point, status='assigned',
        )
        self.dispute = Dispute.objects.create(
            order=self.order, filed_by='customer', filer=self.buyer,
            reason='service_not_completed', complaint='Never arrived',
        )
        self.client.force_authenticate(user=self.admin)

    def _patch_url(self):
        return reverse('dispute-detail', kwargs={'dispute_id': self.dispute.id})

    def test_refund_customer_cancels_active_delivery_and_notifies_rider(self):
        PaymentTransaction.objects.create(
            reference=self.order.reference, amount=Decimal('0'), seller_amount=Decimal('0'),
            platform_amount=Decimal('0'), buyer_email='buyer_dt@pau.edu.ng', status='success',
        )
        with patch('accounts.utils.send_notification') as mock_notify:
            res = self.client.patch(self._patch_url(), {
                'status': 'resolved', 'resolution': 'refund_customer',
            }, format='json')

        self.assertEqual(res.status_code, 200)
        self.assignment.refresh_from_db()
        self.assertEqual(self.assignment.status, 'cancelled')
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, 'cancelled')
        rider_notified = any(
            call.kwargs.get('recipient') == self.rider or (call.args and call.args[0] == self.rider)
            for call in mock_notify.call_args_list
        )
        self.assertTrue(rider_notified, "rider should be notified their delivery was cancelled")

    def test_release_to_provider_cancels_active_delivery(self):
        PaymentTransaction.objects.create(
            reference=self.order.reference, amount=Decimal('1500.00'), seller_amount=Decimal('1400.00'),
            platform_amount=Decimal('100.00'), buyer_email='buyer_dt@pau.edu.ng', status='success',
            transfer_reference='PAYOUT-ORD-DT-1',
        )
        res = self.client.patch(self._patch_url(), {
            'status': 'resolved', 'resolution': 'release_to_provider',
        }, format='json')

        self.assertEqual(res.status_code, 200)
        self.assignment.refresh_from_db()
        self.assertEqual(self.assignment.status, 'cancelled')
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, 'completed')

    def test_already_completed_delivery_untouched_by_resolution(self):
        self.assignment.status = 'completed'
        self.assignment.save(update_fields=['status'])
        PaymentTransaction.objects.create(
            reference=self.order.reference, amount=Decimal('1500.00'), seller_amount=Decimal('1400.00'),
            platform_amount=Decimal('100.00'), buyer_email='buyer_dt@pau.edu.ng', status='success',
            transfer_reference='PAYOUT-ORD-DT-1',
        )
        res = self.client.patch(self._patch_url(), {
            'status': 'resolved', 'resolution': 'release_to_provider',
        }, format='json')

        self.assertEqual(res.status_code, 200)
        self.assignment.refresh_from_db()
        self.assertEqual(self.assignment.status, 'completed')

    def test_cancelled_delivery_excluded_from_rider_active_list(self):
        PaymentTransaction.objects.create(
            reference=self.order.reference, amount=Decimal('0'), seller_amount=Decimal('0'),
            platform_amount=Decimal('0'), buyer_email='buyer_dt@pau.edu.ng', status='success',
        )
        self.client.patch(self._patch_url(), {
            'status': 'resolved', 'resolution': 'refund_customer',
        }, format='json')

        self.client.force_authenticate(user=self.rider)
        res = self.client.get('/api/delivery/my-assignments/')
        ids = [a['id'] for a in res.data] if isinstance(res.data, list) else [a['id'] for a in res.data.get('results', [])]
        self.assertNotIn(self.assignment.id, ids)
