# delivery/tests.py
"""
Test suite for Blocker 4 (Rider Verification Evidence) — see the Design
Validation & Risk Register. Before this, RiderUpdateStatusView let a rider
transition a DeliveryAssignment all the way to "completed" (buyer collected
it) with zero evidence: no photo, no buyer confirmation of any kind. A
dishonest or compromised rider account could mark any delivery collected
and the buyer would have no recourse.

Covers: the buyer-only delivery_code never leaking to rider-facing
endpoints, the code being required (and validated) before "completed",
photo evidence being required at both the pickup and completion
transitions, and the code being rotated on reassignment.

The `delivery` app had zero pre-existing tests before this blocker, so this
file also exercises the base assignment/status-transition golden path —
there's no prior baseline to regress against, but the flow still needs its
own coverage.
"""
from decimal import Decimal
from unittest.mock import patch, MagicMock

from django.test import TestCase
from django.contrib.auth import get_user_model
from django.db.models.query import QuerySet
from rest_framework.test import APIClient
from rest_framework import status

from services.models import Category, Listing
from orders.models import Order
from delivery.models import (
    CampusPickupPoint, DeliveryAssignment, DeliveryVerificationEvent, MAX_CODE_ATTEMPTS,
)
from accounts.models import Vendor, VendorType
from payments.models import PaymentTransaction

User = get_user_model()


def make_proof_file(name="proof.jpg"):
    from django.core.files.uploadedfile import SimpleUploadedFile
    return SimpleUploadedFile(name, b"fake-image-bytes", content_type="image/jpeg")


class DeliveryTestBase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.buyer = User.objects.create_user(
            username="buyer", email="buyer@pau.edu.ng", password="pass12345",
        )
        self.vendor = User.objects.create_user(
            username="vendor", email="vendor@pau.edu.ng", password="pass12345",
            user_type="vendor",
        )
        self.rider = User.objects.create_user(
            username="rider", email="rider@pau.edu.ng", password="pass12345",
            user_type="rider",
        )
        self.staff = User.objects.create_user(
            username="staff", email="staff@pau.edu.ng", password="pass12345",
            is_staff=True,
        )
        self.category = Category.objects.create(title="Test Category", slug="test-category")
        self.listing = Listing.objects.create(
            title="Test Product", description="Test Description",
            price=Decimal("1000.00"), vendor=self.vendor, category=self.category,
        )
        self.order = Order.objects.create(
            reference="ORD-TEST-1", buyer=self.buyer, listing=self.listing,
            amount=Decimal("1000.00"), status="paid",
        )
        self.point = CampusPickupPoint.objects.create(name="Hall A Gate", campus="pau")

    def assign(self):
        self.client.force_authenticate(user=self.staff)
        response = self.client.post(
            f"/api/admin/orders/{self.order.id}/assign-rider/",
            {"rider_id": self.rider.id, "pickup_point_id": self.point.id},
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        return DeliveryAssignment.objects.get(order=self.order)


class DeliveryCodeSecrecyTests(DeliveryTestBase):
    """The buyer handoff code must never appear on any rider-facing response."""

    def test_delivery_code_generated_on_assignment(self):
        assignment = self.assign()
        self.assertTrue(assignment.delivery_code)
        self.assertEqual(len(assignment.delivery_code), 6)
        self.assertTrue(assignment.delivery_code.isdigit())

    def test_code_absent_from_rider_assignment_list(self):
        self.assign()
        self.client.force_authenticate(user=self.rider)
        response = self.client.get("/api/delivery/my-assignments/")
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("delivery_code", response.data[0])

    def test_code_absent_from_rider_update_status_response(self):
        assignment = self.assign()
        self.client.force_authenticate(user=self.rider)
        proof = make_proof_file()
        with patch("services.views.upload_to_cloudinary", return_value="https://cdn.example.com/fake.jpg"):
            response = self.client.post(
                f"/api/delivery/assignments/{assignment.id}/update-status/",
                {"status": "picked_up", "proof_image": proof},
                format="multipart",
            )
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("delivery_code", response.data)

    def test_code_absent_from_admin_delivery_list(self):
        self.assign()
        self.client.force_authenticate(user=self.staff)
        response = self.client.get("/api/admin/deliveries/")
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("delivery_code", response.data[0])

    def test_code_hidden_from_buyer_before_at_pickup_point(self):
        assignment = self.assign()
        self.client.force_authenticate(user=self.buyer)
        response = self.client.get(f"/api/delivery/order/{self.order.id}/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("delivery_code", response.data)
        self.assertIsNone(response.data["delivery_code"])  # status is still "assigned"

    def test_code_revealed_to_buyer_once_at_pickup_point(self):
        assignment = self.assign()
        assignment.status = "at_pickup_point"
        assignment.save()
        self.client.force_authenticate(user=self.buyer)
        response = self.client.get(f"/api/delivery/order/{self.order.id}/")
        self.assertEqual(response.data["delivery_code"], assignment.delivery_code)

    def test_code_rotates_on_reassignment(self):
        assignment = self.assign()
        original_code = assignment.delivery_code

        new_rider = User.objects.create_user(
            username="rider2", email="rider2@pau.edu.ng", password="pass12345", user_type="rider",
        )
        self.client.force_authenticate(user=self.staff)
        response = self.client.post(
            f"/api/admin/orders/{self.order.id}/assign-rider/",
            {"rider_id": new_rider.id, "pickup_point_id": self.point.id},
        )
        self.assertEqual(response.status_code, 200)
        assignment.refresh_from_db()
        self.assertNotEqual(assignment.delivery_code, original_code)


class PickupEvidenceTests(DeliveryTestBase):
    def test_pickup_requires_photo(self):
        assignment = self.assign()
        self.client.force_authenticate(user=self.rider)
        response = self.client.post(
            f"/api/delivery/assignments/{assignment.id}/update-status/",
            {"status": "picked_up"},
        )
        self.assertEqual(response.status_code, 400)
        assignment.refresh_from_db()
        self.assertEqual(assignment.status, "assigned")

    def test_pickup_succeeds_with_photo_and_stores_url(self):
        assignment = self.assign()
        self.client.force_authenticate(user=self.rider)
        proof = make_proof_file()
        with patch("services.views.upload_to_cloudinary", return_value="https://cdn.example.com/pickup.jpg") as mock_upload:
            response = self.client.post(
                f"/api/delivery/assignments/{assignment.id}/update-status/",
                {"status": "picked_up", "proof_image": proof},
                format="multipart",
            )
        self.assertEqual(response.status_code, 200)
        mock_upload.assert_called_once()
        self.assertEqual(mock_upload.call_args.kwargs.get("folder"), "studex/delivery_pickup_proofs")
        assignment.refresh_from_db()
        self.assertEqual(assignment.status, "picked_up")
        self.assertEqual(assignment.pickup_proof_image, "https://cdn.example.com/pickup.jpg")
        self.assertIsNotNone(assignment.picked_up_at)

    def test_pickup_upload_failure_does_not_advance_status(self):
        assignment = self.assign()
        self.client.force_authenticate(user=self.rider)
        proof = make_proof_file()
        with patch("services.views.upload_to_cloudinary", return_value=None):
            response = self.client.post(
                f"/api/delivery/assignments/{assignment.id}/update-status/",
                {"status": "picked_up", "proof_image": proof},
                format="multipart",
            )
        self.assertEqual(response.status_code, 500)
        assignment.refresh_from_db()
        self.assertEqual(assignment.status, "assigned")


class RiderUpdateStatusPostgresLockingTests(DeliveryTestBase):
    """
    Regression for a production-only bug: RiderUpdateStatusView's row lock
    combined select_for_update() with select_related('pickup_point') — a
    nullable FK, so select_related turns it into a LEFT OUTER JOIN. Postgres
    raises "FOR UPDATE cannot be applied to the nullable side of an outer
    join" on every single call, a 500 that hit every rider status update in
    production. SQLite (this suite's DB) doesn't enforce that restriction at
    all, so no amount of exercising the view's behavior on this DB can catch
    a regression here — this asserts the actual fix (scoping the lock to
    of=('self',), which Postgres accepts regardless of the joined tables)
    is really what the view's queryset uses, by capturing the real call the
    view makes rather than a hand-copied duplicate query.
    """
    def test_lookup_scopes_for_update_to_self_only(self):
        assignment = self.assign()
        self.client.force_authenticate(user=self.rider)
        proof = make_proof_file()

        original = QuerySet.select_for_update
        captured = []

        def spy(self, *args, **kwargs):
            captured.append(kwargs)
            return original(self, *args, **kwargs)

        QuerySet.select_for_update = spy
        try:
            with patch("services.views.upload_to_cloudinary", return_value="https://cdn.example.com/pickup.jpg"):
                response = self.client.post(
                    f"/api/delivery/assignments/{assignment.id}/update-status/",
                    {"status": "picked_up", "proof_image": proof},
                    format="multipart",
                )
        finally:
            QuerySet.select_for_update = original

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(captured), 1)
        self.assertEqual(captured[0].get("of"), ("self",))


class CompletionEvidenceTests(DeliveryTestBase):
    def _advance_to_at_pickup_point(self):
        assignment = self.assign()
        with patch("services.views.upload_to_cloudinary", return_value="https://cdn.example.com/pickup.jpg"):
            self.client.force_authenticate(user=self.rider)
            self.client.post(
                f"/api/delivery/assignments/{assignment.id}/update-status/",
                {"status": "picked_up", "proof_image": make_proof_file()},
                format="multipart",
            )
        self.client.post(
            f"/api/delivery/assignments/{assignment.id}/update-status/",
            {"status": "at_pickup_point"},
        )
        assignment.refresh_from_db()
        return assignment

    def test_completion_rejected_without_code(self):
        assignment = self._advance_to_at_pickup_point()
        proof = make_proof_file()
        response = self.client.post(
            f"/api/delivery/assignments/{assignment.id}/update-status/",
            {"status": "completed", "proof_image": proof},
            format="multipart",
        )
        self.assertEqual(response.status_code, 400)
        assignment.refresh_from_db()
        self.assertEqual(assignment.status, "at_pickup_point")

    def test_completion_rejected_with_wrong_code(self):
        assignment = self._advance_to_at_pickup_point()
        proof = make_proof_file()
        response = self.client.post(
            f"/api/delivery/assignments/{assignment.id}/update-status/",
            {"status": "completed", "delivery_code": "000000", "proof_image": proof},
            format="multipart",
        )
        self.assertEqual(response.status_code, 400)
        assignment.refresh_from_db()
        self.assertEqual(assignment.status, "at_pickup_point")

    def test_completion_rejected_without_photo_even_with_correct_code(self):
        assignment = self._advance_to_at_pickup_point()
        response = self.client.post(
            f"/api/delivery/assignments/{assignment.id}/update-status/",
            {"status": "completed", "delivery_code": assignment.delivery_code},
        )
        self.assertEqual(response.status_code, 400)
        assignment.refresh_from_db()
        self.assertEqual(assignment.status, "at_pickup_point")

    def test_completion_succeeds_with_correct_code_and_photo(self):
        assignment = self._advance_to_at_pickup_point()
        proof = make_proof_file()
        with patch("services.views.upload_to_cloudinary", return_value="https://cdn.example.com/complete.jpg") as mock_upload:
            response = self.client.post(
                f"/api/delivery/assignments/{assignment.id}/update-status/",
                {"status": "completed", "delivery_code": assignment.delivery_code, "proof_image": proof},
                format="multipart",
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(mock_upload.call_args.kwargs.get("folder"), "studex/delivery_completion_proofs")
        assignment.refresh_from_db()
        self.assertEqual(assignment.status, "completed")
        self.assertEqual(assignment.completion_proof_image, "https://cdn.example.com/complete.jpg")
        self.assertIsNotNone(assignment.completed_at)


class DeliveryStatusTransitionGuardTests(DeliveryTestBase):
    """Existing state-machine guard behavior — never had test coverage before this blocker."""

    def test_only_rider_can_hit_update_status(self):
        assignment = self.assign()
        self.client.force_authenticate(user=self.buyer)
        response = self.client.post(
            f"/api/delivery/assignments/{assignment.id}/update-status/",
            {"status": "picked_up"},
        )
        self.assertEqual(response.status_code, 403)

    def test_rider_cannot_touch_another_riders_assignment(self):
        assignment = self.assign()
        other_rider = User.objects.create_user(
            username="rider3", email="rider3@pau.edu.ng", password="pass12345", user_type="rider",
        )
        self.client.force_authenticate(user=other_rider)
        response = self.client.post(
            f"/api/delivery/assignments/{assignment.id}/update-status/",
            {"status": "picked_up"},
        )
        self.assertEqual(response.status_code, 404)

    def test_cannot_skip_a_transition(self):
        assignment = self.assign()
        self.client.force_authenticate(user=self.rider)
        response = self.client.post(
            f"/api/delivery/assignments/{assignment.id}/update-status/",
            {"status": "completed", "delivery_code": assignment.delivery_code},
        )
        self.assertEqual(response.status_code, 400)
        assignment.refresh_from_db()
        self.assertEqual(assignment.status, "assigned")


class ResponsibilityTransferTests(DeliveryTestBase):
    """
    The system must explicitly model who is responsible for the physical
    order: the vendor until pickup is verified, StudEx Delivery afterward.
    """

    def test_vendor_responsible_before_pickup(self):
        assignment = self.assign()
        self.assertEqual(assignment.responsibility, "vendor")
        self.assertIsNone(assignment.responsibility_transferred_at)

    def test_responsibility_transfers_on_pickup_verification(self):
        assignment = self.assign()
        self.client.force_authenticate(user=self.rider)
        with patch("services.views.upload_to_cloudinary", return_value="https://cdn.example.com/pickup.jpg"):
            response = self.client.post(
                f"/api/delivery/assignments/{assignment.id}/update-status/",
                {"status": "picked_up", "proof_image": make_proof_file()},
                format="multipart",
            )
        self.assertEqual(response.status_code, 200)
        assignment.refresh_from_db()
        self.assertEqual(assignment.responsibility, "studex_delivery")
        self.assertIsNotNone(assignment.responsibility_transferred_at)

    def test_responsibility_unaffected_by_later_transitions(self):
        assignment = self._advance_through_pickup()
        transferred_at = assignment.responsibility_transferred_at
        self.client.force_authenticate(user=self.rider)
        self.client.post(
            f"/api/delivery/assignments/{assignment.id}/update-status/",
            {"status": "at_pickup_point"},
        )
        assignment.refresh_from_db()
        self.assertEqual(assignment.responsibility, "studex_delivery")
        self.assertEqual(assignment.responsibility_transferred_at, transferred_at)

    def test_responsibility_resets_on_reassignment(self):
        assignment = self._advance_through_pickup()
        self.assertEqual(assignment.responsibility, "studex_delivery")

        new_rider = User.objects.create_user(
            username="rider4", email="rider4@pau.edu.ng", password="pass12345", user_type="rider",
        )
        self.client.force_authenticate(user=self.staff)
        self.client.post(
            f"/api/admin/orders/{self.order.id}/assign-rider/",
            {"rider_id": new_rider.id, "pickup_point_id": self.point.id},
        )
        assignment.refresh_from_db()
        self.assertEqual(assignment.responsibility, "vendor")
        self.assertIsNone(assignment.responsibility_transferred_at)

    def _advance_through_pickup(self):
        assignment = self.assign()
        self.client.force_authenticate(user=self.rider)
        with patch("services.views.upload_to_cloudinary", return_value="https://cdn.example.com/pickup.jpg"):
            self.client.post(
                f"/api/delivery/assignments/{assignment.id}/update-status/",
                {"status": "picked_up", "proof_image": make_proof_file()},
                format="multipart",
            )
        assignment.refresh_from_db()
        return assignment


class VerificationEventTests(DeliveryTestBase):
    """
    Permanent, append-only audit trail: every verification event records who
    (rider), what (evidence image), and when (timestamp) — independent of
    DeliveryAssignment's own mutable fields.
    """

    def test_pickup_creates_verification_event(self):
        assignment = self.assign()
        self.client.force_authenticate(user=self.rider)
        with patch("services.views.upload_to_cloudinary", return_value="https://cdn.example.com/pickup.jpg"):
            self.client.post(
                f"/api/delivery/assignments/{assignment.id}/update-status/",
                {"status": "picked_up", "proof_image": make_proof_file()},
                format="multipart",
            )
        event = DeliveryVerificationEvent.objects.get(assignment=assignment, event_type="pickup")
        self.assertEqual(event.rider, self.rider)
        self.assertEqual(event.evidence_image, "https://cdn.example.com/pickup.jpg")
        self.assertIsNotNone(event.occurred_at)
        self.assertEqual(event.ip_address, "127.0.0.1")

    def test_completion_creates_verification_event(self):
        assignment = self._advance_to_at_pickup_point_helper()
        self.client.force_authenticate(user=self.rider)
        with patch("services.views.upload_to_cloudinary", return_value="https://cdn.example.com/complete.jpg"):
            self.client.post(
                f"/api/delivery/assignments/{assignment.id}/update-status/",
                {"status": "completed", "delivery_code": assignment.delivery_code, "proof_image": make_proof_file()},
                format="multipart",
            )
        event = DeliveryVerificationEvent.objects.get(assignment=assignment, event_type="completion")
        self.assertEqual(event.rider, self.rider)
        self.assertEqual(event.evidence_image, "https://cdn.example.com/complete.jpg")

    def test_duplicate_event_blocked_at_db_level(self):
        """Direct model-level proof of the hard DB constraint, independent of view logic."""
        assignment = self.assign()
        DeliveryVerificationEvent.objects.create(
            assignment=assignment, event_type="pickup", rider=self.rider,
            evidence_image="https://cdn.example.com/one.jpg",
        )
        from django.db import IntegrityError
        with self.assertRaises(IntegrityError):
            DeliveryVerificationEvent.objects.create(
                assignment=assignment, event_type="pickup", rider=self.rider,
                evidence_image="https://cdn.example.com/two.jpg",
            )

    def test_second_pickup_submission_rejected_by_state_machine(self):
        """A repeated 'picked_up' submission after it already succeeded is rejected."""
        assignment = self.assign()
        self.client.force_authenticate(user=self.rider)
        with patch("services.views.upload_to_cloudinary", return_value="https://cdn.example.com/pickup.jpg"):
            first = self.client.post(
                f"/api/delivery/assignments/{assignment.id}/update-status/",
                {"status": "picked_up", "proof_image": make_proof_file()},
                format="multipart",
            )
            second = self.client.post(
                f"/api/delivery/assignments/{assignment.id}/update-status/",
                {"status": "picked_up", "proof_image": make_proof_file()},
                format="multipart",
            )
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 400)
        self.assertEqual(
            DeliveryVerificationEvent.objects.filter(assignment=assignment, event_type="pickup").count(), 1,
        )

    def test_reassignment_clears_stale_verification_events(self):
        """
        A reassignment restarts the whole cycle (all progress fields reset) —
        a leftover pickup event from the previous rider must not permanently
        block the new rider from ever verifying pickup themselves.
        """
        assignment = self._advance_through_pickup()
        self.assertEqual(
            DeliveryVerificationEvent.objects.filter(assignment=assignment).count(), 1,
        )

        new_rider = User.objects.create_user(
            username="rider5", email="rider5@pau.edu.ng", password="pass12345", user_type="rider",
        )
        self.client.force_authenticate(user=self.staff)
        self.client.post(
            f"/api/admin/orders/{self.order.id}/assign-rider/",
            {"rider_id": new_rider.id, "pickup_point_id": self.point.id},
        )
        self.assertEqual(DeliveryVerificationEvent.objects.filter(assignment=assignment).count(), 0)

        self.client.force_authenticate(user=new_rider)
        with patch("services.views.upload_to_cloudinary", return_value="https://cdn.example.com/pickup2.jpg"):
            response = self.client.post(
                f"/api/delivery/assignments/{assignment.id}/update-status/",
                {"status": "picked_up", "proof_image": make_proof_file()},
                format="multipart",
            )
        self.assertEqual(response.status_code, 200)
        event = DeliveryVerificationEvent.objects.get(assignment=assignment, event_type="pickup")
        self.assertEqual(event.rider, new_rider)

    def _advance_through_pickup(self):
        assignment = self.assign()
        self.client.force_authenticate(user=self.rider)
        with patch("services.views.upload_to_cloudinary", return_value="https://cdn.example.com/pickup.jpg"):
            self.client.post(
                f"/api/delivery/assignments/{assignment.id}/update-status/",
                {"status": "picked_up", "proof_image": make_proof_file()},
                format="multipart",
            )
        assignment.refresh_from_db()
        return assignment

    def _advance_to_at_pickup_point_helper(self):
        assignment = self._advance_through_pickup()
        self.client.post(
            f"/api/delivery/assignments/{assignment.id}/update-status/",
            {"status": "at_pickup_point"},
        )
        assignment.refresh_from_db()
        return assignment


class CodeLockoutTests(DeliveryTestBase):
    """Brute-force defense on the 6-digit buyer handoff code."""

    def _advance_to_at_pickup_point(self):
        assignment = self.assign()
        self.client.force_authenticate(user=self.rider)
        with patch("services.views.upload_to_cloudinary", return_value="https://cdn.example.com/pickup.jpg"):
            self.client.post(
                f"/api/delivery/assignments/{assignment.id}/update-status/",
                {"status": "picked_up", "proof_image": make_proof_file()},
                format="multipart",
            )
        self.client.post(
            f"/api/delivery/assignments/{assignment.id}/update-status/",
            {"status": "at_pickup_point"},
        )
        assignment.refresh_from_db()
        return assignment

    def test_attempts_counter_increments_on_wrong_code(self):
        assignment = self._advance_to_at_pickup_point()
        self.client.post(
            f"/api/delivery/assignments/{assignment.id}/update-status/",
            {"status": "completed", "delivery_code": "000000", "proof_image": make_proof_file()},
            format="multipart",
        )
        assignment.refresh_from_db()
        self.assertEqual(assignment.code_attempts, 1)
        self.assertFalse(assignment.code_locked)

    def test_locks_after_max_attempts(self):
        assignment = self._advance_to_at_pickup_point()
        for _ in range(MAX_CODE_ATTEMPTS):
            self.client.post(
                f"/api/delivery/assignments/{assignment.id}/update-status/",
                {"status": "completed", "delivery_code": "000000", "proof_image": make_proof_file()},
                format="multipart",
            )
        assignment.refresh_from_db()
        self.assertTrue(assignment.code_locked)

        # Even the CORRECT code is now rejected — must go through admin recovery.
        response = self.client.post(
            f"/api/delivery/assignments/{assignment.id}/update-status/",
            {"status": "completed", "delivery_code": assignment.delivery_code, "proof_image": make_proof_file()},
            format="multipart",
        )
        self.assertEqual(response.status_code, 423)
        assignment.refresh_from_db()
        self.assertEqual(assignment.status, "at_pickup_point")

    def test_correct_code_before_lockout_threshold_still_works(self):
        assignment = self._advance_to_at_pickup_point()
        for _ in range(MAX_CODE_ATTEMPTS - 1):
            self.client.post(
                f"/api/delivery/assignments/{assignment.id}/update-status/",
                {"status": "completed", "delivery_code": "000000", "proof_image": make_proof_file()},
                format="multipart",
            )
        with patch("services.views.upload_to_cloudinary", return_value="https://cdn.example.com/complete.jpg"):
            response = self.client.post(
                f"/api/delivery/assignments/{assignment.id}/update-status/",
                {"status": "completed", "delivery_code": assignment.delivery_code, "proof_image": make_proof_file()},
                format="multipart",
            )
        self.assertEqual(response.status_code, 200)

    def test_admin_regenerate_code_clears_lockout(self):
        assignment = self._advance_to_at_pickup_point()
        assignment.code_locked = True
        assignment.code_attempts = MAX_CODE_ATTEMPTS
        assignment.save(update_fields=["code_locked", "code_attempts"])

        from delivery.admin import DeliveryAssignmentAdmin
        from django.contrib.admin.sites import AdminSite
        from django.test import RequestFactory
        from django.contrib.messages.storage.fallback import FallbackStorage

        admin_instance = DeliveryAssignmentAdmin(DeliveryAssignment, AdminSite())
        request = RequestFactory().post("/admin/delivery/deliveryassignment/")
        request.user = self.staff
        setattr(request, "session", {})
        setattr(request, "_messages", FallbackStorage(request))

        old_code = assignment.delivery_code
        admin_instance.regenerate_delivery_code(request, DeliveryAssignment.objects.filter(pk=assignment.pk))

        assignment.refresh_from_db()
        self.assertFalse(assignment.code_locked)
        self.assertEqual(assignment.code_attempts, 0)
        self.assertNotEqual(assignment.delivery_code, old_code)


class SettlementPolicyTests(DeliveryTestBase):
    """
    Blocker 5 — Food vendors settle on pickup verification instead of
    buyer-confirmation/auto-release; every other vendor type (and any vendor
    with no VendorType assigned at all, which is every vendor that existed
    before this blocker) must see zero change in payout timing.
    """

    def _make_txn(self, **overrides):
        defaults = dict(
            reference=self.order.reference, amount=Decimal("1000.00"),
            seller_amount=Decimal("950.00"), platform_amount=Decimal("50.00"),
            buyer_email=self.buyer.email, status="success", seller=self.vendor,
        )
        defaults.update(overrides)
        return PaymentTransaction.objects.create(**defaults)

    def _verify_pickup(self, assignment=None):
        if assignment is None:
            assignment = self.assign()
        self.client.force_authenticate(user=self.rider)
        with patch("services.views.upload_to_cloudinary", return_value="https://cdn.example.com/pickup.jpg"):
            return self.client.post(
                f"/api/delivery/assignments/{assignment.id}/update-status/",
                {"status": "picked_up", "proof_image": make_proof_file()},
                format="multipart",
            )

    def test_food_vendor_pickup_verification_triggers_payout(self):
        food = VendorType.objects.get(name="food")
        Vendor.objects.create(user=self.vendor, vendor_type=food)
        txn = self._make_txn()

        with patch("payments.views.trigger_vendor_payout") as mock_transfer:
            response = self._verify_pickup()

        self.assertEqual(response.status_code, 200)
        mock_transfer.assert_called_once()
        called_txn = mock_transfer.call_args.args[0]
        self.assertEqual(called_txn.pk, txn.pk)

    def test_vendor_with_no_vendor_record_does_not_trigger_payout_on_pickup(self):
        """Every vendor that existed before this blocker has no Vendor.vendor_type at all."""
        self._make_txn()

        with patch("payments.views.trigger_vendor_payout") as mock_transfer:
            response = self._verify_pickup()

        self.assertEqual(response.status_code, 200)
        mock_transfer.assert_not_called()

    def test_beauty_vendor_pickup_verification_does_not_trigger_payout(self):
        beauty = VendorType.objects.get(name="beauty")
        Vendor.objects.create(user=self.vendor, vendor_type=beauty)
        self._make_txn()

        with patch("payments.views.trigger_vendor_payout") as mock_transfer:
            response = self._verify_pickup()

        self.assertEqual(response.status_code, 200)
        mock_transfer.assert_not_called()

    def test_already_paid_out_food_order_is_not_paid_again_on_pickup(self):
        food = VendorType.objects.get(name="food")
        Vendor.objects.create(user=self.vendor, vendor_type=food)
        self._make_txn(transfer_reference="PAYOUT-ALREADY-DONE", transfer_status="success")

        with patch("payments.views.trigger_vendor_payout") as mock_transfer:
            response = self._verify_pickup()

        self.assertEqual(response.status_code, 200)
        mock_transfer.assert_not_called()

    def test_pickup_verification_still_succeeds_even_if_settlement_trigger_raises(self):
        """A payout-side bug must never break the pickup verification response itself."""
        food = VendorType.objects.get(name="food")
        Vendor.objects.create(user=self.vendor, vendor_type=food)
        self._make_txn()

        with patch("payments.views.trigger_vendor_payout", side_effect=Exception("boom")):
            response = self._verify_pickup()

        self.assertEqual(response.status_code, 200)
        assignment = DeliveryAssignment.objects.get(order=self.order)
        self.assertEqual(assignment.status, "picked_up")

    def test_buyer_notified_on_pickup_verification(self):
        assignment = self.assign()
        with patch("accounts.utils.send_notification") as mock_notify:
            response = self._verify_pickup(assignment)

        self.assertEqual(response.status_code, 200)
        mock_notify.assert_called_once()
        self.assertEqual(mock_notify.call_args.kwargs.get("recipient"), self.buyer)
        self.assertIn("picked up", mock_notify.call_args.kwargs.get("title", "").lower())


class OrderStatusFinalizationOnCompletionTests(DeliveryTestBase):
    """
    Regression coverage: nothing in the delivery app used to touch
    Order.status at all — a rider-delivered order stayed stuck at 'paid'
    forever regardless of what the rider did, so the buyer never saw
    resolution and award_vendor_badge_progress never fired for it. Covers
    both settlement branches: pickup-verification vendors (payout already
    happened at pickup, so completion just finalizes status + badge
    progress) and buyer-confirmation vendors (completion hands off to the
    existing seller_completed -> buyer-confirm/auto-release machinery,
    exactly like a non-delivery-app order — never bypassing that buyer
    protection just because a rider was involved).
    """

    def _advance_to_at_pickup_point(self):
        assignment = self.assign()
        self.client.force_authenticate(user=self.rider)
        with patch("services.views.upload_to_cloudinary", return_value="https://cdn.example.com/pickup.jpg"):
            self.client.post(
                f"/api/delivery/assignments/{assignment.id}/update-status/",
                {"status": "picked_up", "proof_image": make_proof_file()},
                format="multipart",
            )
        self.client.post(
            f"/api/delivery/assignments/{assignment.id}/update-status/",
            {"status": "at_pickup_point"},
        )
        assignment.refresh_from_db()
        self.assertEqual(assignment.status, "at_pickup_point")
        return assignment

    def _complete(self, assignment):
        with patch("services.views.upload_to_cloudinary", return_value="https://cdn.example.com/complete.jpg"):
            return self.client.post(
                f"/api/delivery/assignments/{assignment.id}/update-status/",
                {"status": "completed", "delivery_code": assignment.delivery_code, "proof_image": make_proof_file()},
                format="multipart",
            )

    def test_pickup_verification_vendor_order_marked_completed_and_earns_badge_progress(self):
        food = VendorType.objects.get(name="food")
        Vendor.objects.create(user=self.vendor, vendor_type=food)
        PaymentTransaction.objects.create(
            reference=self.order.reference, amount=Decimal("1000.00"),
            seller_amount=Decimal("950.00"), platform_amount=Decimal("50.00"),
            buyer_email=self.buyer.email, status="success", seller=self.vendor,
        )
        assignment = self._advance_to_at_pickup_point()

        with patch("payments.views.trigger_vendor_payout"):
            response = self._complete(assignment)

        self.assertEqual(response.status_code, 200)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, "completed")
        self.assertIsNotNone(self.order.buyer_confirmed_at)
        self.vendor.profile.refresh_from_db()
        self.assertEqual(self.vendor.profile.on_platform_sales, 1)

    def test_buyer_confirmation_vendor_order_marked_seller_completed_not_completed(self):
        """No VendorType at all -> default buyer_confirmation trigger — payout was never triggered at pickup."""
        assignment = self._advance_to_at_pickup_point()

        response = self._complete(assignment)

        self.assertEqual(response.status_code, 200)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, "seller_completed")
        self.assertIsNotNone(self.order.seller_completed_at)
        self.assertIsNone(self.order.buyer_confirmed_at)
        self.vendor.profile.refresh_from_db()
        self.assertEqual(self.vendor.profile.on_platform_sales or 0, 0)

    def test_buyer_confirmation_vendor_can_still_confirm_after_rider_delivery(self):
        """The buyer's own Confirm button (existing payout/badge machinery) must work normally afterward."""
        assignment = self._advance_to_at_pickup_point()
        self._complete(assignment)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, "seller_completed")

        self.client.force_authenticate(user=self.buyer)
        with patch("payments.views.trigger_vendor_payout"):
            response = self.client.post(f"/api/orders/orders/{self.order.id}/confirm/")

        self.assertEqual(response.status_code, 200)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, "completed")
        self.vendor.profile.refresh_from_db()
        self.assertEqual(self.vendor.profile.on_platform_sales, 1)
