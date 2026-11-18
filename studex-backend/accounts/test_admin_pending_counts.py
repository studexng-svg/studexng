"""
Tests for the admin pending-counts endpoint that powers the sidebar red
badges and the guard shield.

Covers the one subtle rule: a listing is "awaiting approval" when is_available
is False, EXCEPT a tracked item sitting at zero stock (that one was already
approved and auto-disabled when it sold out, so it must not be counted).
"""
from decimal import Decimal

from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from accounts.models import User, SellerApplication
from services.models import Category, Listing

URL = "/api/admin/pending-counts/"


class AdminPendingCountsTests(APITestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            username="pc_admin", email="pc_admin@pau.edu.ng", password="pass123", is_staff=True,
        )
        self.non_admin = User.objects.create_user(
            username="pc_regular", email="pc_regular@pau.edu.ng", password="pass123",
        )
        self.vendor = User.objects.create_user(
            username="pc_vendor", email="pc_vendor@pau.edu.ng", password="pass123",
            user_type="vendor", is_verified_vendor=True,
        )
        self.category = Category.objects.create(title="PC Cat", slug="pc-cat")

    def _listing(self, title, *, is_available, track_inventory=False, stock_quantity=0):
        return Listing.objects.create(
            vendor=self.vendor, category=self.category, title=title, description="x",
            payout_amount=Decimal("10000"), price=Decimal("10800"),
            is_available=is_available, track_inventory=track_inventory,
            stock_quantity=stock_quantity,
        )

    def test_requires_admin(self):
        self.client.force_authenticate(user=self.non_admin)
        self.assertEqual(self.client.get(URL).status_code, status.HTTP_403_FORBIDDEN)

    def test_unauthenticated_rejected(self):
        self.assertIn(
            self.client.get(URL).status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )

    def test_zero_when_nothing_outstanding(self):
        self.client.force_authenticate(user=self.admin)
        data = self.client.get(URL).json()
        self.assertEqual(data, {"listings": 0, "seller_applications": 0, "total": 0})

    def test_counts_only_genuinely_outstanding_items(self):
        # Listings awaiting approval:
        self._listing("new-untracked", is_available=False)                              # counted
        self._listing("new-tracked-in-stock", is_available=False,
                      track_inventory=True, stock_quantity=5)                            # counted
        # Not awaiting approval:
        self._listing("approved-live", is_available=True)                               # not counted
        self._listing("approved-soldout", is_available=False,
                      track_inventory=True, stock_quantity=0)                            # excluded

        # Seller applications (OneToOne per user).
        for i in range(2):
            u = User.objects.create_user(
                username=f"pc_applicant_{i}", email=f"pc_applicant_{i}@pau.edu.ng", password="pass123",
            )
            SellerApplication.objects.create(user=u, status="pending")
        approved_user = User.objects.create_user(
            username="pc_applicant_ok", email="pc_applicant_ok@pau.edu.ng", password="pass123",
        )
        SellerApplication.objects.create(user=approved_user, status="approved")

        self.client.force_authenticate(user=self.admin)
        data = self.client.get(URL).json()
        self.assertEqual(data["listings"], 2)
        self.assertEqual(data["seller_applications"], 2)
        self.assertEqual(data["total"], 4)

    def test_approving_clears_the_count(self):
        listing = self._listing("to-approve", is_available=False)
        self.client.force_authenticate(user=self.admin)
        self.assertEqual(self.client.get(URL).json()["listings"], 1)
        # Admin approves (publishes) it.
        listing.is_available = True
        listing.save()
        self.assertEqual(self.client.get(URL).json()["listings"], 0)
