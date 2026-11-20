"""
The admin order detail endpoint exposes the buyer's phone (admin-only) so the
admin can call the buyer from the dashboard, the same as the rider does.
"""
from decimal import Decimal

from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from accounts.models import User
from services.models import Category, Listing
from orders.models import Order


class AdminOrderBuyerPhoneTests(APITestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            username="op_admin", email="op_admin@pau.edu.ng", password="x", is_staff=True,
        )
        self.buyer = User.objects.create_user(
            username="op_buyer", email="op_buyer@pau.edu.ng", password="x", phone="08012345678",
        )
        self.vendor = User.objects.create_user(
            username="op_vendor", email="op_vendor@pau.edu.ng", password="x",
            user_type="vendor", is_verified_vendor=True,
        )
        cat = Category.objects.create(title="OP Cat", slug="op-cat")
        self.listing = Listing.objects.create(
            vendor=self.vendor, category=cat, title="Jollof", description="x",
            payout_amount=Decimal("1000"), price=Decimal("1080"), is_available=True,
        )
        self.order = Order.objects.create(
            buyer=self.buyer, listing=self.listing, amount=Decimal("1080"),
            quantity=1, reference="OP-REF-1", status="paid",
        )
        self.url = f"/api/admin/orders/{self.order.id}/"

    def test_admin_sees_buyer_phone(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["buyer_phone"], "08012345678")

    def test_non_admin_forbidden(self):
        self.client.force_authenticate(user=self.buyer)
        self.assertEqual(self.client.get(self.url).status_code, status.HTTP_403_FORBIDDEN)
