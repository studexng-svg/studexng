"""
End-to-end smoke test walking the full payment-gated booking/chat lifecycle in a
single continuous script: book -> locked chat -> pay -> unlocked chat -> vendor
accept/start -> mark complete -> buyer confirm -> payout -> chat expires -> admin
still sees history. The individual behaviors are covered piecemeal elsewhere
(orders/tests.py, chat/tests.py, payments/tests.py); this catches integration
wiring bugs across those apps that isolated unit tests would miss.
"""
from decimal import Decimal
from unittest.mock import patch
from django.test import TestCase
from django.utils import timezone
from datetime import timedelta
from rest_framework.test import APIClient

from accounts.models import User
from services.models import Category, Listing
from orders.models import Order, Booking
from chat.models import Conversation
from payments.views import _create_order_from_paystack_data


class FullLifecycleSmokeTest(TestCase):
    def test_full_lifecycle(self):
        def step(label):
            print(f"\n=== {label} ===")

        step("1. Create buyer + vendor + listing")
        buyer = User.objects.create_user(username='e2e_buyer', email='e2e_buyer@pau.edu.ng', password='pass123', school='pau')
        vendor = User.objects.create_user(username='e2e_vendor', email='e2e_vendor@pau.edu.ng', password='pass123', user_type='vendor', is_verified_vendor=True, school='pau')
        category = Category.objects.create(title='E2E Beauty', slug='e2e-beauty')
        listing = Listing.objects.create(title='E2E Lash Set', description='full set', price=Decimal('5000.00'), vendor=vendor, category=category, is_available=True)
        print(f"buyer={buyer.id} vendor={vendor.id} listing={listing.id}")

        client = APIClient()
        client.force_authenticate(user=buyer)

        step("2. Buyer creates a booking (pending) via the real BookingWizard endpoint")
        res = client.post('/api/orders/bookings/', {
            'listing': listing.id, 'scheduled_date': '2099-01-01', 'scheduled_time': '2:30 PM',
            'note': 'please be gentle',
        }, format='multipart')
        print(res.status_code, res.data)
        self.assertEqual(res.status_code, 201)
        booking = Booking.objects.get(id=res.data['id'])
        self.assertEqual(booking.status, 'pending')

        step("3. Chat is locked before payment")
        res = client.post('/api/chat/conversations/', {'listing_id': listing.id, 'seller_id': vendor.id})
        print("create (pre-payment):", res.status_code, res.data)
        self.assertEqual(res.status_code, 403)

        step("4. Simulate Paystack charge.success (same helper webhook/verify use)")
        order_id, error = _create_order_from_paystack_data(
            {'amount': 500000, 'reference': 'E2E-REF-0001', 'id': 999, 'customer': {'email': buyer.email}, 'metadata': {}},
            buyer, listing.id, 'service',
        )
        print("order_id:", order_id, "error:", error)
        self.assertIsNone(error)
        order = Order.objects.get(id=order_id)
        booking.refresh_from_db()
        print("order.status:", order.status, "| booking.status:", booking.status)
        self.assertEqual(order.status, 'paid')
        self.assertEqual(booking.status, 'paid')

        conversation = Conversation.objects.get(buyer=buyer, seller=vendor, listing=listing)
        print("conversation.order_id:", conversation.order_id, "== order.id:", order.id)
        self.assertEqual(conversation.order_id, order.id)

        step("5. Chat now unlocked — buyer can send a normal message")
        res = client.post(f'/api/chat/conversations/{conversation.id}/send/', {'content': 'Hi, excited for my appointment!'})
        print(res.status_code, res.data.get('content'))
        self.assertEqual(res.status_code, 201)

        step("6. Contact-info sharing is still blocked post-payment")
        res = client.post(f'/api/chat/conversations/{conversation.id}/send/', {'content': 'call me on 08012345678'})
        print(res.status_code, res.data)
        self.assertEqual(res.status_code, 400)

        step("7. Vendor accepts the order")
        vendor_client = APIClient()
        vendor_client.force_authenticate(user=vendor)
        res = vendor_client.post(f'/api/orders/orders/{order.id}/vendor-accept/')
        print(res.status_code, res.data.get('message'))
        self.assertEqual(res.status_code, 200)

        step("8. Vendor starts the service")
        res = vendor_client.post(f'/api/orders/orders/{order.id}/start-service/')
        print(res.status_code, res.data.get('message'))
        self.assertEqual(res.status_code, 200)

        step("9. Order timeline endpoint (7-step buyer-facing timeline)")
        res = client.get(f'/api/orders/orders/{order.id}/tracking/')
        for s in res.data['timeline']:
            print(f"  [{'x' if s['done'] else ' '}] {s['label']}")
        self.assertEqual([s['done'] for s in res.data['timeline']], [True, True, True, True, True, False, False])

        step("10. Vendor marks order complete")
        order.paid_at = timezone.now() - timedelta(minutes=20)
        order.save()
        res = vendor_client.patch(f'/api/orders/orders/{order.id}/mark-complete/')
        print(res.status_code, res.data.get('message') or res.data)
        self.assertEqual(res.status_code, 200)
        order.refresh_from_db()
        self.assertEqual(order.status, 'seller_completed')

        step("11. Buyer confirms — this triggers the Paystack payout in real life")
        with patch('payments.views._transfer_to_vendor') as mock_transfer:
            res = client.post(f'/api/orders/orders/{order.id}/confirm/')
            print(res.status_code, res.data.get('message'))
            print("payout triggered:", mock_transfer.called)
            self.assertTrue(mock_transfer.called)
        order.refresh_from_db()
        self.assertEqual(order.status, 'completed')

        step("12. Chat has now EXPIRED — buyer can no longer send messages")
        res = client.post(f'/api/chat/conversations/{conversation.id}/send/', {'content': 'thanks!'})
        print(res.status_code, res.data)
        self.assertEqual(res.status_code, 404)

        step("13. Conversation has disappeared entirely for the participant")
        res = client.get(f'/api/chat/conversations/{conversation.id}/messages/')
        print(res.status_code, "— no longer visible to participant")
        self.assertEqual(res.status_code, 404)

        step("14. Participant cannot even see the expired conversation to delete it")
        res = client.delete(f'/api/chat/conversations/{conversation.id}/')
        print(res.status_code, res.data)
        self.assertEqual(res.status_code, 404)
        self.assertTrue(Conversation.objects.filter(id=conversation.id).exists())

        step("15. Admin can still see the full conversation regardless of expiry")
        admin = User.objects.create_superuser(username='e2e_admin', email='e2e_admin@pau.edu.ng', password='pass123')
        admin_client = APIClient()
        admin_client.force_authenticate(user=admin)
        res = admin_client.get(f'/api/admin/conversations/{conversation.id}/')
        print(res.status_code, "messages visible to admin:", len(res.data.get('messages', [])))
        self.assertEqual(res.status_code, 200)
        self.assertGreaterEqual(len(res.data['messages']), 1)

        step("DONE — full lifecycle verified end to end")
