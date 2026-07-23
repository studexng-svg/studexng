# orders/test_delivery_evidence.py
"""
Test suite for Blocker 5's addition to OrderViewSet.tracking(): a "delivery"
key surfacing rider pickup/completion evidence (Blocker 4) in the buyer's
order tracking response, additive and null for any order with no rider
DeliveryAssignment — so this must never change the response shape for
existing order types (services, vendor-self-fulfilled products).
"""
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status

from accounts.models import User
from services.models import Category, Listing
from orders.models import Order
from delivery.models import CampusPickupPoint, DeliveryAssignment


class TrackingDeliveryEvidenceTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.buyer = User.objects.create_user(
            username="buyer", email="buyer@pau.edu.ng", password="pass12345",
        )
        self.vendor = User.objects.create_user(
            username="vendor", email="vendor@pau.edu.ng", password="pass12345", user_type="vendor",
        )
        self.rider = User.objects.create_user(
            username="rider", email="rider@pau.edu.ng", password="pass12345", user_type="rider",
        )
        self.category = Category.objects.create(title="Cat", slug="cat")
        self.listing = Listing.objects.create(
            title="Product", description="Desc", price=Decimal("1000.00"),
            vendor=self.vendor, category=self.category,
        )
        self.order = Order.objects.create(
            reference="ORD-1", buyer=self.buyer, listing=self.listing,
            amount=Decimal("1000.00"), status="paid",
        )

    def test_delivery_key_is_null_when_no_rider_assignment_exists(self):
        self.client.force_authenticate(user=self.buyer)
        response = self.client.get(f"/api/orders/orders/{self.order.id}/tracking/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("delivery", response.data)
        self.assertIsNone(response.data["delivery"])
        # Existing keys must be completely unaffected
        self.assertIn("timeline", response.data)
        self.assertIn("history", response.data)

    def test_delivery_key_populated_when_rider_assignment_exists(self):
        point = CampusPickupPoint.objects.create(name="Gate", campus="pau")
        DeliveryAssignment.objects.create(
            order=self.order, rider=self.rider, pickup_point=point, status="picked_up",
            pickup_proof_image="https://cdn.example.com/pickup.jpg",
        )
        self.client.force_authenticate(user=self.buyer)
        response = self.client.get(f"/api/orders/orders/{self.order.id}/tracking/")
        self.assertEqual(response.status_code, 200)
        delivery = response.data["delivery"]
        self.assertIsNotNone(delivery)
        self.assertEqual(delivery["status"], "picked_up")
        self.assertEqual(delivery["rider_username"], "rider")
        self.assertEqual(delivery["pickup_proof_image"], "https://cdn.example.com/pickup.jpg")
        self.assertEqual(delivery["responsibility"], "vendor")

    def test_delivery_evidence_does_not_expose_buyer_handoff_code(self):
        point = CampusPickupPoint.objects.create(name="Gate", campus="pau")
        DeliveryAssignment.objects.create(order=self.order, rider=self.rider, pickup_point=point)
        self.client.force_authenticate(user=self.buyer)
        response = self.client.get(f"/api/orders/orders/{self.order.id}/tracking/")
        self.assertNotIn("delivery_code", response.data["delivery"])
