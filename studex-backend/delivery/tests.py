# delivery/tests.py
"""
Test suite for the rider verification flow (originally Blocker 4 — Rider
Verification Evidence, see the Design Validation & Risk Register). Before
that blocker, RiderUpdateStatusView let a rider transition a
DeliveryAssignment all the way to "completed" (buyer collected it) with
zero evidence: no photo, no buyer confirmation of any kind.

Photo evidence at both the pickup and completion transitions has since been
removed again (it added friction without buyer-side verification value at
the pickup step, and duplicated the delivery code's own verification at the
completion step) — the delivery code the buyer reads off their own order
page is what actually verifies handoff now. DeliveryVerificationEvent still
fires at both transitions as a who/when/where (IP) audit trail and a
DB-level duplicate-verification guard; evidence_image on it is now optional
and simply never populated going forward.

Covers: the buyer-only delivery_code never leaking to rider-facing
endpoints, the code being required (and validated) before "completed", and
the code being rotated on reassignment.

The `delivery` app had zero pre-existing tests before the original blocker,
so this file also exercises the base assignment/status-transition golden
path — there's no prior baseline to regress against, but the flow still
needs its own coverage.
"""
from decimal import Decimal
from unittest.mock import patch

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

    def pick_up(self, assignment):
        """Advances 'assigned' -> 'picked_up' — no photo required."""
        self.client.force_authenticate(user=self.rider)
        return self.client.post(
            f"/api/delivery/assignments/{assignment.id}/update-status/",
            {"status": "picked_up"},
        )

    def advance_to_at_pickup_point(self, assignment=None):
        if assignment is None:
            assignment = self.assign()
        self.pick_up(assignment)
        self.client.force_authenticate(user=self.rider)
        self.client.post(
            f"/api/delivery/assignments/{assignment.id}/update-status/",
            {"status": "at_pickup_point"},
        )
        assignment.refresh_from_db()
        return assignment

    def complete(self, assignment, code=None):
        """Advances 'at_pickup_point' -> 'completed' — code required, no photo."""
        self.client.force_authenticate(user=self.rider)
        return self.client.post(
            f"/api/delivery/assignments/{assignment.id}/update-status/",
            {"status": "completed", "delivery_code": code if code is not None else assignment.delivery_code},
        )


class AutoAssignRiderCampusTests(DeliveryTestBase):
    """
    delivery.assignment.auto_assign_rider — before the campus filter, this
    picked the least-busy rider platform-wide with zero regard for whether
    they could physically reach the order's campus (self.listing defaults
    to 'pau' — see services.models.Listing.campus). Covers: same-campus
    riders get picked, other-campus riders never do, and a no-coverage
    campus no-ops exactly like "no active riders at all" already did.
    """

    def test_picks_rider_covering_the_order_campus(self):
        from delivery.assignment import auto_assign_rider
        self.rider.school = "pau"
        self.rider.save(update_fields=["school"])
        User.objects.create_user(
            username="futo_rider", email="futo_rider@futo.edu.ng", password="pass12345",
            user_type="rider", school="futo",
        )

        assignment = auto_assign_rider(self.order)

        self.assertIsNotNone(assignment)
        self.assertEqual(assignment.rider_id, self.rider.id)

    def test_never_assigns_a_rider_from_a_different_campus(self):
        from delivery.assignment import auto_assign_rider
        self.rider.school = "futo"  # only rider that exists, but wrong campus
        self.rider.save(update_fields=["school"])

        assignment = auto_assign_rider(self.order)

        self.assertIsNone(assignment)
        self.assertFalse(DeliveryAssignment.objects.filter(order=self.order).exists())

    def test_no_op_when_no_rider_covers_the_campus_at_all(self):
        from delivery.assignment import auto_assign_rider
        self.rider.delete()  # DeliveryTestBase's only rider gone

        assignment = auto_assign_rider(self.order)

        self.assertIsNone(assignment)


class AdminAssignRiderViewTests(DeliveryTestBase):
    """
    pickup_point_id used to be mandatory on every manual assignment, so an
    admin had to pick *some* CampusPickupPoint even for orders that should
    just go to the buyer's own typed delivery_location — which is exactly
    what ended up showing as "Drop-off" on the rider dashboard instead of
    the buyer's actual address. Covers the fix: pickup_point_id is now
    optional, rider_id alone is enough.
    """

    def test_assign_without_pickup_point_succeeds(self):
        self.order.delivery_location = "Hostel B, Room 12"
        self.order.save(update_fields=["delivery_location"])
        self.client.force_authenticate(user=self.staff)

        res = self.client.post(
            f"/api/admin/orders/{self.order.id}/assign-rider/",
            {"rider_id": self.rider.id},
        )

        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        assignment = DeliveryAssignment.objects.get(order=self.order)
        self.assertIsNone(assignment.pickup_point)
        # DRF drops a read_only CharField entirely (SkipField, not null) when
        # its nested source can't resolve (pickup_point.name on a None
        # pickup_point) — key is just absent, not present-as-None. That's
        # fine: rider/page.tsx's dropoffLabel treats a.pickup_point_name as
        # falsy either way and falls back to delivery_location.
        self.assertNotIn("pickup_point_name", res.data)
        self.assertEqual(res.data["delivery_location"], "Hostel B, Room 12")

    def test_missing_rider_id_still_rejected(self):
        self.client.force_authenticate(user=self.staff)
        res = self.client.post(f"/api/admin/orders/{self.order.id}/assign-rider/", {})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(DeliveryAssignment.objects.filter(order=self.order).exists())

    def test_notifications_use_delivery_location_when_no_pickup_point(self):
        """Must not crash on point.name when point is None (drop_label fallback)."""
        self.order.delivery_location = "Hostel B, Room 12"
        self.order.save(update_fields=["delivery_location"])
        self.client.force_authenticate(user=self.staff)

        with patch("accounts.utils.send_notification") as mock_notify:
            res = self.client.post(
                f"/api/admin/orders/{self.order.id}/assign-rider/",
                {"rider_id": self.rider.id},
            )

        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertEqual(mock_notify.call_count, 3)  # rider, vendor, buyer
        messages = [c.kwargs["message"] for c in mock_notify.call_args_list]
        assert any("Hostel B, Room 12" in m for m in messages)

    def test_assign_with_pickup_point_still_works(self):
        """Existing behavior unchanged when an admin does pick a hub."""
        self.client.force_authenticate(user=self.staff)
        res = self.client.post(
            f"/api/admin/orders/{self.order.id}/assign-rider/",
            {"rider_id": self.rider.id, "pickup_point_id": self.point.id},
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        assignment = DeliveryAssignment.objects.get(order=self.order)
        self.assertEqual(assignment.pickup_point_id, self.point.id)
        self.assertEqual(res.data["pickup_point_name"], "Hall A Gate")


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
        response = self.pick_up(assignment)
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


class PickupTransitionTests(DeliveryTestBase):
    """
    'assigned' -> 'picked_up' is a single tap, no photo — see RiderUpdateStatusView.
    """

    def test_pickup_succeeds_with_no_photo(self):
        assignment = self.assign()
        response = self.pick_up(assignment)

        self.assertEqual(response.status_code, 200)
        assignment.refresh_from_db()
        self.assertEqual(assignment.status, "picked_up")
        self.assertIsNotNone(assignment.picked_up_at)
        self.assertIsNone(assignment.pickup_proof_image)


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

        original = QuerySet.select_for_update
        captured = []

        def spy(self, *args, **kwargs):
            captured.append(kwargs)
            return original(self, *args, **kwargs)

        QuerySet.select_for_update = spy
        try:
            response = self.pick_up(assignment)
        finally:
            QuerySet.select_for_update = original

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(captured), 1)
        self.assertEqual(captured[0].get("of"), ("self",))


class CompletionCodeTests(DeliveryTestBase):
    """
    'at_pickup_point' -> 'completed' still requires the buyer's delivery
    code — that's the actual handoff verification now, no photo alongside it.
    """

    def test_completion_rejected_without_code(self):
        assignment = self.advance_to_at_pickup_point()
        self.client.force_authenticate(user=self.rider)
        response = self.client.post(
            f"/api/delivery/assignments/{assignment.id}/update-status/",
            {"status": "completed"},
        )
        self.assertEqual(response.status_code, 400)
        assignment.refresh_from_db()
        self.assertEqual(assignment.status, "at_pickup_point")

    def test_completion_rejected_with_wrong_code(self):
        assignment = self.advance_to_at_pickup_point()
        response = self.complete(assignment, code="000000")
        self.assertEqual(response.status_code, 400)
        assignment.refresh_from_db()
        self.assertEqual(assignment.status, "at_pickup_point")

    def test_completion_succeeds_with_correct_code_and_no_photo(self):
        assignment = self.advance_to_at_pickup_point()
        response = self.complete(assignment)

        self.assertEqual(response.status_code, 200)
        assignment.refresh_from_db()
        self.assertEqual(assignment.status, "completed")
        self.assertIsNotNone(assignment.completed_at)
        self.assertIsNone(assignment.completion_proof_image)


class AtPickupPointNotificationTests(DeliveryTestBase):
    """
    The buyer must get the delivery code pushed to them the instant the rider
    reaches the pickup point/drop-off — not just have it sit on their order
    page waiting to be looked up. Regression coverage for both: the code
    landing in the notification body (the "send it like an OTP" behavior),
    and the pickup_point.name lookup not crashing (silently, via the view's
    bare except) for an auto-assigned delivery that has no pickup_point.
    """

    def test_notification_includes_delivery_code(self):
        assignment = self.assign()
        self.pick_up(assignment)
        with patch("accounts.utils.send_notification") as mock_notify:
            response = self.client.post(
                f"/api/delivery/assignments/{assignment.id}/update-status/",
                {"status": "at_pickup_point"},
            )
        self.assertEqual(response.status_code, 200)
        assignment.refresh_from_db()
        mock_notify.assert_called_once()
        message = mock_notify.call_args.kwargs["message"]
        self.assertIn(assignment.delivery_code, message)
        self.assertEqual(mock_notify.call_args.kwargs["recipient"], self.buyer)

    def test_delivery_code_notification_emails_as_push_fallback(self):
        """
        Push has no delivery guarantee (no token registered, stale Expo
        token, phone offline) — email is what still lands the code when
        push doesn't. send_notification fires both independently, so this
        just confirms the code notification opts in to the email channel
        instead of the send_email=False used for admin-only notifications.
        """
        assignment = self.assign()
        self.pick_up(assignment)
        with patch("accounts.utils.send_notification") as mock_notify:
            self.client.post(
                f"/api/delivery/assignments/{assignment.id}/update-status/",
                {"status": "at_pickup_point"},
            )
        mock_notify.assert_called_once()
        self.assertTrue(mock_notify.call_args.kwargs["send_email"])

    def test_notification_falls_back_to_delivery_location_when_no_pickup_point(self):
        """Auto-assignment never sets pickup_point — see delivery.assignment.auto_assign_rider."""
        self.order.delivery_location = "3rd floor, Block C, Room 12"
        self.order.save(update_fields=["delivery_location"])
        assignment = DeliveryAssignment.objects.create(order=self.order, rider=self.rider, pickup_point=None)
        self.pick_up(assignment)
        with patch("accounts.utils.send_notification") as mock_notify:
            response = self.client.post(
                f"/api/delivery/assignments/{assignment.id}/update-status/",
                {"status": "at_pickup_point"},
            )
        self.assertEqual(response.status_code, 200)
        mock_notify.assert_called_once()
        message = mock_notify.call_args.kwargs["message"]
        self.assertIn("3rd floor, Block C, Room 12", message)


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
        response = self.pick_up(assignment)

        self.assertEqual(response.status_code, 200)
        assignment.refresh_from_db()
        self.assertEqual(assignment.responsibility, "studex_delivery")
        self.assertIsNotNone(assignment.responsibility_transferred_at)

    def test_responsibility_unaffected_by_later_transitions(self):
        assignment = self.assign()
        self.pick_up(assignment)
        assignment.refresh_from_db()
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
        assignment = self.assign()
        self.pick_up(assignment)
        assignment.refresh_from_db()
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


class VerificationEventTests(DeliveryTestBase):
    """
    Permanent, append-only audit trail: every verification event records who
    (rider) and when (timestamp) — independent of DeliveryAssignment's own
    mutable fields. evidence_image is optional and unpopulated now that
    neither transition requires a photo.
    """

    def test_pickup_creates_verification_event(self):
        assignment = self.assign()
        self.pick_up(assignment)

        event = DeliveryVerificationEvent.objects.get(assignment=assignment, event_type="pickup")
        self.assertEqual(event.rider, self.rider)
        self.assertIsNone(event.evidence_image)
        self.assertIsNotNone(event.occurred_at)
        self.assertEqual(event.ip_address, "127.0.0.1")

    def test_completion_creates_verification_event(self):
        assignment = self.advance_to_at_pickup_point()
        self.complete(assignment)

        event = DeliveryVerificationEvent.objects.get(assignment=assignment, event_type="completion")
        self.assertEqual(event.rider, self.rider)
        self.assertIsNone(event.evidence_image)

    def test_duplicate_event_blocked_at_db_level(self):
        """Direct model-level proof of the hard DB constraint, independent of view logic."""
        assignment = self.assign()
        DeliveryVerificationEvent.objects.create(
            assignment=assignment, event_type="pickup", rider=self.rider,
        )
        from django.db import IntegrityError
        with self.assertRaises(IntegrityError):
            DeliveryVerificationEvent.objects.create(
                assignment=assignment, event_type="pickup", rider=self.rider,
            )

    def test_second_pickup_submission_rejected_by_state_machine(self):
        """A repeated 'picked_up' submission after it already succeeded is rejected."""
        assignment = self.assign()
        first = self.pick_up(assignment)
        second = self.pick_up(assignment)

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
        assignment = self.assign()
        self.pick_up(assignment)
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
        response = self.client.post(
            f"/api/delivery/assignments/{assignment.id}/update-status/",
            {"status": "picked_up"},
        )
        self.assertEqual(response.status_code, 200)
        event = DeliveryVerificationEvent.objects.get(assignment=assignment, event_type="pickup")
        self.assertEqual(event.rider, new_rider)


class CodeLockoutTests(DeliveryTestBase):
    """Brute-force defense on the 6-digit buyer handoff code."""

    def test_attempts_counter_increments_on_wrong_code(self):
        assignment = self.advance_to_at_pickup_point()
        self.complete(assignment, code="000000")
        assignment.refresh_from_db()
        self.assertEqual(assignment.code_attempts, 1)
        self.assertFalse(assignment.code_locked)

    def test_locks_after_max_attempts(self):
        assignment = self.advance_to_at_pickup_point()
        for _ in range(MAX_CODE_ATTEMPTS):
            self.complete(assignment, code="000000")
        assignment.refresh_from_db()
        self.assertTrue(assignment.code_locked)

        # Even the CORRECT code is now rejected — must go through admin recovery.
        response = self.complete(assignment)
        self.assertEqual(response.status_code, 423)
        assignment.refresh_from_db()
        self.assertEqual(assignment.status, "at_pickup_point")

    def test_correct_code_before_lockout_threshold_still_works(self):
        assignment = self.advance_to_at_pickup_point()
        for _ in range(MAX_CODE_ATTEMPTS - 1):
            self.complete(assignment, code="000000")
        response = self.complete(assignment)
        self.assertEqual(response.status_code, 200)

    def test_admin_regenerate_code_clears_lockout(self):
        assignment = self.advance_to_at_pickup_point()
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

    def test_food_vendor_pickup_verification_triggers_payout(self):
        food = VendorType.objects.get(name="food")
        Vendor.objects.create(user=self.vendor, vendor_type=food)
        txn = self._make_txn()
        assignment = self.assign()

        with patch("payments.views.trigger_vendor_payout") as mock_transfer:
            response = self.pick_up(assignment)

        self.assertEqual(response.status_code, 200)
        mock_transfer.assert_called_once()
        called_txn = mock_transfer.call_args.args[0]
        self.assertEqual(called_txn.pk, txn.pk)

    def test_vendor_with_no_vendor_record_does_not_trigger_payout_on_pickup(self):
        """Every vendor that existed before this blocker has no Vendor.vendor_type at all."""
        self._make_txn()
        assignment = self.assign()

        with patch("payments.views.trigger_vendor_payout") as mock_transfer:
            response = self.pick_up(assignment)

        self.assertEqual(response.status_code, 200)
        mock_transfer.assert_not_called()

    def test_beauty_vendor_pickup_verification_does_not_trigger_payout(self):
        beauty = VendorType.objects.get(name="beauty")
        Vendor.objects.create(user=self.vendor, vendor_type=beauty)
        self._make_txn()
        assignment = self.assign()

        with patch("payments.views.trigger_vendor_payout") as mock_transfer:
            response = self.pick_up(assignment)

        self.assertEqual(response.status_code, 200)
        mock_transfer.assert_not_called()

    def test_already_paid_out_food_order_is_not_paid_again_on_pickup(self):
        food = VendorType.objects.get(name="food")
        Vendor.objects.create(user=self.vendor, vendor_type=food)
        self._make_txn(transfer_reference="PAYOUT-ALREADY-DONE", transfer_status="success")
        assignment = self.assign()

        with patch("payments.views.trigger_vendor_payout") as mock_transfer:
            response = self.pick_up(assignment)

        self.assertEqual(response.status_code, 200)
        mock_transfer.assert_not_called()

    def test_pickup_verification_still_succeeds_even_if_settlement_trigger_raises(self):
        """A payout-side bug must never break the pickup verification response itself."""
        food = VendorType.objects.get(name="food")
        Vendor.objects.create(user=self.vendor, vendor_type=food)
        self._make_txn()
        assignment = self.assign()

        with patch("payments.views.trigger_vendor_payout", side_effect=Exception("boom")):
            response = self.pick_up(assignment)

        self.assertEqual(response.status_code, 200)
        assignment = DeliveryAssignment.objects.get(order=self.order)
        self.assertEqual(assignment.status, "picked_up")

    def test_buyer_notified_on_pickup_verification(self):
        assignment = self.assign()
        with patch("accounts.utils.send_notification") as mock_notify:
            response = self.pick_up(assignment)

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

    def test_pickup_verification_vendor_order_marked_completed_and_earns_badge_progress(self):
        food = VendorType.objects.get(name="food")
        Vendor.objects.create(user=self.vendor, vendor_type=food)
        PaymentTransaction.objects.create(
            reference=self.order.reference, amount=Decimal("1000.00"),
            seller_amount=Decimal("950.00"), platform_amount=Decimal("50.00"),
            buyer_email=self.buyer.email, status="success", seller=self.vendor,
        )
        assignment = self.advance_to_at_pickup_point()

        with patch("payments.views.trigger_vendor_payout"):
            response = self.complete(assignment)

        self.assertEqual(response.status_code, 200)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, "completed")
        self.assertIsNotNone(self.order.buyer_confirmed_at)
        self.vendor.profile.refresh_from_db()
        self.assertEqual(self.vendor.profile.on_platform_sales, 1)

    def test_buyer_confirmation_vendor_order_marked_seller_completed_not_completed(self):
        """No VendorType at all -> default buyer_confirmation trigger — payout was never triggered at pickup."""
        assignment = self.advance_to_at_pickup_point()

        response = self.complete(assignment)

        self.assertEqual(response.status_code, 200)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, "seller_completed")
        self.assertIsNotNone(self.order.seller_completed_at)
        self.assertIsNone(self.order.buyer_confirmed_at)
        self.vendor.profile.refresh_from_db()
        self.assertEqual(self.vendor.profile.on_platform_sales or 0, 0)

    def test_buyer_confirmation_vendor_can_still_confirm_after_rider_delivery(self):
        """The buyer's own Confirm button (existing payout/badge machinery) must work normally afterward."""
        assignment = self.advance_to_at_pickup_point()
        self.complete(assignment)
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
