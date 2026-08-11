import logging
import secrets

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import permissions, status
from django.utils import timezone

from studex.permissions import IsAdminUser
from .models import (
    CampusPickupPoint, DeliveryAssignment, generate_delivery_code, MAX_CODE_ATTEMPTS,
    DeliverySlot,
)
from .serializers import (
    CampusPickupPointSerializer, DeliveryAssignmentSerializer, BuyerDeliveryStatusSerializer,
    DeliverySlotSerializer,
)

logger = logging.getLogger(__name__)


# ─── Pickup Points ────────────────────────────────────────────────────────────

class PickupPointListView(APIView):
    """GET /api/delivery/pickup-points/ — public (used at checkout to show options)."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        campus = request.query_params.get('campus', '')
        qs = CampusPickupPoint.objects.filter(is_active=True)
        if campus:
            qs = qs.filter(campus__iexact=campus)
        return Response(CampusPickupPointSerializer(qs, many=True).data)


class VendorEligibleBatchesView(APIView):
    """
    GET /api/delivery/vendor-batches/<vendor_id>/ — public preview used at
    checkout so a buyer sees which delivery slot (and how many spots are
    left today) their order will land in *before* paying, instead of only
    finding out from a post-payment refund if none are eligible. Read-only
    — nothing reserved here (see delivery.capacity.reserve_delivery_slot
    for the real, race-safe reservation at verify time).

    `uses_batched_delivery: false` means this vendor doesn't use delivery
    slots at all (VendorType-incapable, or capable but no admin has set
    them up with a DeliverySlot yet) — the frontend should hide the slot UI
    entirely in that case, not show an empty/misleading "no slots" state.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, vendor_id):
        from django.contrib.auth import get_user_model
        from delivery.capacity import vendor_uses_batched_delivery, list_eligible_slots
        User = get_user_model()

        try:
            vendor = User.objects.get(id=vendor_id)
        except User.DoesNotExist:
            return Response({'error': 'Vendor not found'}, status=status.HTTP_404_NOT_FOUND)

        if not vendor_uses_batched_delivery(vendor):
            return Response({'uses_batched_delivery': False, 'batches': []})

        from datetime import datetime
        from delivery.capacity import LAGOS, _cutoff_datetime
        from delivery.fees import get_delivery_fee_quote, get_free_delivery_remaining
        campus = (getattr(vendor, 'school', '') or '').lower()
        today = timezone.now().astimezone(LAGOS).date()
        eligible = list_eligible_slots(vendor, campus)
        delivery_fee, delivery_fee_waived = get_delivery_fee_quote(vendor)
        return Response({
            'uses_batched_delivery': True,
            'delivery_fee': float(delivery_fee),
            'delivery_fee_waived': delivery_fee_waived,
            # None when there's no free-delivery promo running at all;
            # otherwise a live count, 0 once it's exhausted.
            'free_deliveries_remaining': get_free_delivery_remaining(vendor),
            'batches': [
                {
                    'id': entry['slot'].id,
                    'display_name': entry['slot'].display_name,
                    'delivery_time': datetime.combine(today, entry['slot'].delivery_time, tzinfo=LAGOS).isoformat(),
                    # Ordering closes here — lets checkout show a live
                    # countdown instead of the buyer only finding out the
                    # slot vanished on the next 15s poll.
                    'cutoff_time': _cutoff_datetime(entry['slot'], today).isoformat(),
                    'remaining_slots': entry['remaining'],
                }
                for entry in eligible
            ],
        })


class AdminPickupPointListView(APIView):
    """GET/POST /api/admin/pickup-points/"""
    permission_classes = [IsAdminUser]

    def get(self, request):
        campus = request.query_params.get('campus', '')
        qs = CampusPickupPoint.objects.all()
        if campus:
            qs = qs.filter(campus__iexact=campus)
        return Response(CampusPickupPointSerializer(qs, many=True).data)

    def post(self, request):
        ser = CampusPickupPointSerializer(data=request.data)
        if ser.is_valid():
            ser.save()
            return Response(ser.data, status=status.HTTP_201_CREATED)
        return Response(ser.errors, status=status.HTTP_400_BAD_REQUEST)


class AdminPickupPointDetailView(APIView):
    """PATCH/DELETE /api/admin/pickup-points/<id>/"""
    permission_classes = [IsAdminUser]

    def _get(self, pk):
        try:
            return CampusPickupPoint.objects.get(pk=pk)
        except CampusPickupPoint.DoesNotExist:
            return None

    def patch(self, request, pk):
        obj = self._get(pk)
        if not obj:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)
        ser = CampusPickupPointSerializer(obj, data=request.data, partial=True)
        if ser.is_valid():
            ser.save()
            return Response(ser.data)
        return Response(ser.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        obj = self._get(pk)
        if not obj:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)
        obj.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ─── Admin: assign rider to order ────────────────────────────────────────────

class AdminAssignRiderView(APIView):
    """
    POST /api/admin/orders/<order_id>/assign-rider/
    Body: { rider_id, pickup_point_id }
    Creates or updates the DeliveryAssignment for this order.
    """
    permission_classes = [IsAdminUser]

    def post(self, request, order_id):
        from orders.models import Order
        from django.contrib.auth import get_user_model
        User = get_user_model()

        try:
            order = Order.objects.select_related('buyer', 'listing__vendor').get(id=order_id)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)

        rider_id = request.data.get('rider_id')
        pickup_point_id = request.data.get('pickup_point_id')

        if not rider_id or not pickup_point_id:
            return Response(
                {'error': 'rider_id and pickup_point_id are required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            rider = User.objects.get(id=rider_id, user_type='rider')
        except User.DoesNotExist:
            return Response({'error': 'Rider not found'}, status=status.HTTP_404_NOT_FOUND)

        try:
            point = CampusPickupPoint.objects.get(id=pickup_point_id, is_active=True)
        except CampusPickupPoint.DoesNotExist:
            return Response({'error': 'Pickup point not found'}, status=status.HTTP_404_NOT_FOUND)

        assignment, created = DeliveryAssignment.objects.update_or_create(
            order=order,
            defaults={
                'rider': rider,
                'pickup_point': point,
                'status': 'assigned',
                'assigned_by': request.user,
                'picked_up_at': None,
                'at_pickup_point_at': None,
                'completed_at': None,
                # Rotate on every (re)assignment — a code shown to the buyer
                # for a previous rider must not still work for a new one.
                'delivery_code': generate_delivery_code(),
                'code_attempts': 0,
                'code_locked': False,
                'pickup_proof_image': None,
                'completion_proof_image': None,
                # A reassignment (e.g. original rider was unreachable) hands
                # custody back to a fresh assigned-to-rider state — the vendor
                # is responsible again until the new rider verifies pickup.
                'responsibility': 'vendor',
                'responsibility_transferred_at': None,
            },
        )

        if not created:
            # Reassignment restarts the whole delivery cycle from scratch (as
            # the resets above already did to every other progress field) —
            # any verification events from a prior rider's attempt on this
            # same assignment row would otherwise permanently block the new
            # rider from ever verifying pickup/completion themselves, since
            # DeliveryVerificationEvent enforces one event per (assignment,
            # event_type).
            from .models import DeliveryVerificationEvent
            DeliveryVerificationEvent.objects.filter(assignment=assignment).delete()

        try:
            from accounts.utils import send_notification

            # Notify the rider
            send_notification(
                recipient=rider,
                notification_type='order',
                title='New Delivery Assignment',
                message=(
                    f'You have been assigned to deliver order #{order.reference}. '
                    f'Collect from vendor "@{order.listing.vendor.username}" and drop at "{point.name}".'
                ),
                action_url='/rider',
                send_email=False,
            )

            # Notify the vendor — package and hand off to rider
            send_notification(
                recipient=order.listing.vendor,
                notification_type='order',
                title='Rider Assigned — Package Your Order',
                message=(
                    f'A rider has been assigned to order #{order.reference}. '
                    f'Please package the order and hand it to rider "@{rider.username}" when they arrive.'
                ),
                action_url=f'/vendor/dashboard/orders',
                send_email=False,
            )

            # Notify the buyer — delivery is on the way
            send_notification(
                recipient=order.buyer,
                notification_type='order',
                title='Your delivery is on the way!',
                message=(
                    f'A rider has been assigned to your order #{order.reference}. '
                    f'Your package will be delivered to "{point.name}". We\'ll notify you when it arrives.'
                ),
                action_url=f'/account/orders/{order.id}',
                send_email=False,
            )
        except Exception:
            pass

        return Response(DeliveryAssignmentSerializer(assignment).data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


# ─── Admin: list all delivery assignments ─────────────────────────────────────

class AdminDeliveryListView(APIView):
    """GET /api/admin/deliveries/"""
    permission_classes = [IsAdminUser]

    def get(self, request):
        qs = DeliveryAssignment.objects.select_related(
            'order__buyer', 'order__listing__vendor',
            'rider', 'pickup_point',
        )
        status_filter = request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
        return Response(DeliveryAssignmentSerializer(qs, many=True).data)


# ─── Admin: list riders ───────────────────────────────────────────────────────

class AdminRiderListView(APIView):
    """GET /api/admin/riders/ — all users with user_type='rider'"""
    permission_classes = [IsAdminUser]

    def get(self, request):
        from django.contrib.auth import get_user_model
        User = get_user_model()
        riders = User.objects.filter(user_type='rider').values('id', 'username', 'email', 'school')
        return Response(list(riders))


# ─── Rider: own assignments ───────────────────────────────────────────────────

class RiderAssignmentListView(APIView):
    """GET /api/delivery/my-assignments/"""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if request.user.user_type != 'rider':
            return Response({'error': 'Not a rider'}, status=status.HTTP_403_FORBIDDEN)
        qs = DeliveryAssignment.objects.filter(rider=request.user).select_related(
            'order__buyer', 'order__listing__vendor', 'pickup_point',
        ).exclude(status__in=['completed', 'cancelled'])
        return Response(DeliveryAssignmentSerializer(qs, many=True).data)


class RiderHistoryView(APIView):
    """GET /api/delivery/my-history/ — completed deliveries, newest first."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if request.user.user_type != 'rider':
            return Response({'error': 'Not a rider'}, status=status.HTTP_403_FORBIDDEN)
        qs = DeliveryAssignment.objects.filter(
            rider=request.user, status='completed',
        ).select_related(
            'order__buyer', 'order__listing__vendor', 'pickup_point',
        ).order_by('-completed_at')[:100]
        return Response(DeliveryAssignmentSerializer(qs, many=True).data)


class RiderStatsView(APIView):
    """
    GET /api/delivery/my-stats/ — overview numbers for the rider dashboard
    (active count, completed today/this week/all-time, and a 7-day daily
    breakdown for the chart). Riders have no earnings/commission concept
    anywhere else in this codebase, so "analytics" here means delivery
    activity, not money.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if request.user.user_type != 'rider':
            return Response({'error': 'Not a rider'}, status=status.HTTP_403_FORBIDDEN)

        from datetime import timedelta
        from zoneinfo import ZoneInfo
        LAGOS = ZoneInfo("Africa/Lagos")
        now_lagos = timezone.now().astimezone(LAGOS)
        today = now_lagos.date()
        week_start = today - timedelta(days=6)

        base = DeliveryAssignment.objects.filter(rider=request.user)
        completed = base.filter(status='completed', completed_at__isnull=False)

        total_completed = completed.count()
        # A fully-refunded order (every OrderItem unavailable — see
        # payments.item_refund.mark_order_item_unavailable) flips Order.status
        # to 'cancelled' but never touches DeliveryAssignment.status, since
        # there's no delivery left to drive through the pickup/dropoff state
        # machine. Without this exclusion such an assignment still reads as
        # "active" here even though RiderBatchListView (below) now keeps it
        # out of the rider's active list — the two would silently disagree.
        active_count = base.exclude(status='completed').exclude(order__status='cancelled').count()

        completed_local_dates = [c.astimezone(LAGOS).date() for c in completed.values_list('completed_at', flat=True)]
        completed_today = sum(1 for d in completed_local_dates if d == today)
        completed_this_week = sum(1 for d in completed_local_dates if week_start <= d <= today)

        daily_counts = []
        for i in range(6, -1, -1):
            day = today - timedelta(days=i)
            daily_counts.append({
                'date': day.isoformat(),
                'label': day.strftime('%a'),
                'count': sum(1 for d in completed_local_dates if d == day),
            })

        return Response({
            'active_count': active_count,
            'completed_today': completed_today,
            'completed_this_week': completed_this_week,
            'total_completed': total_completed,
            'daily_counts': daily_counts,
        })


class RiderBatchListView(APIView):
    """
    GET /api/delivery/my-batches/. Groups a rider's incomplete assignments
    by DeliverySlot — additive UI layer over the same data
    RiderAssignmentListView already returns. Pickup and completion actions
    are untouched — this is a read-only grouping view, not a new
    verification mechanic (see RiderUpdateStatusView, unmodified).
    Assignments with no slot (every non-slotted vendor's order) are
    returned separately under 'unbatched'. delivery_time/cutoff_time are
    computed for *today* from the slot's recurring delivery_time —
    there's no per-day row to read them off anymore.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if request.user.user_type != 'rider':
            return Response({'error': 'Not a rider'}, status=status.HTTP_403_FORBIDDEN)

        from datetime import datetime, timedelta
        from delivery.capacity import LAGOS
        today = timezone.now().astimezone(LAGOS).date()

        assignments = DeliveryAssignment.objects.filter(
            rider=request.user,
        ).exclude(status__in=['completed', 'cancelled']).exclude(order__status='cancelled').select_related(
            'order__buyer', 'order__listing__vendor', 'pickup_point', 'delivery_slot__vendor',
        ).prefetch_related('order__items__selected_addons').order_by(
            'delivery_slot__delivery_time', '-assigned_at',
        )

        slots = {}
        unbatched = []
        for assignment in assignments:
            data = DeliveryAssignmentSerializer(assignment).data
            if assignment.delivery_slot_id:
                slot = assignment.delivery_slot
                delivery_dt = datetime.combine(today, slot.delivery_time, tzinfo=LAGOS)
                cutoff_dt = delivery_dt - timedelta(minutes=slot.cutoff_offset_minutes)
                group = slots.setdefault(slot.id, {
                    'batch_id': slot.id,
                    'display_name': slot.display_name,
                    'vendor_username': slot.vendor.username,
                    'delivery_time': delivery_dt.isoformat(),
                    'cutoff_time': cutoff_dt.isoformat(),
                    'status': 'open',
                    'assignments': [],
                })
                group['assignments'].append(data)
            else:
                unbatched.append(data)

        return Response({
            'batches': list(slots.values()),
            'unbatched': unbatched,
        })


class RiderRefundedListView(APIView):
    """
    GET /api/delivery/my-refunded/ — a rider's assignments whose underlying
    Order was fully refunded out from under the delivery (every OrderItem
    marked unavailable — see payments.item_refund.mark_order_item_unavailable
    — flips Order.status to 'cancelled' but never touches
    DeliveryAssignment.status, since there's nothing left to drive through
    the pickup/dropoff state machine). RiderBatchListView excludes these from
    the active list; this is where they actually show up, so a rider can see
    why an order vanished instead of it just disappearing.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if request.user.user_type != 'rider':
            return Response({'error': 'Not a rider'}, status=status.HTTP_403_FORBIDDEN)

        qs = DeliveryAssignment.objects.filter(
            rider=request.user, order__status='cancelled',
        ).exclude(status='completed').select_related(
            'order__buyer', 'order__listing__vendor', 'pickup_point', 'delivery_slot__vendor',
        ).prefetch_related('order__items__selected_addons').order_by('-assigned_at')[:100]
        return Response(DeliveryAssignmentSerializer(qs, many=True).data)


def _client_ip(request):
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR', '')
    return (x_forwarded_for.split(',')[0].strip() if x_forwarded_for
            else request.META.get('REMOTE_ADDR', '')) or None


class RiderUpdateStatusView(APIView):
    """
    POST /api/delivery/assignments/<id>/update-status/
    Body: { status: 'picked_up' | 'at_pickup_point' | 'completed' }

    Every transition is taken under a row lock (select_for_update) so two
    concurrent submissions for the same assignment — a double-tap, a client
    retry — can never both pass the state-machine check; the second one
    blocks until the first commits, then sees the already-advanced status
    and is rejected. "pickup" and "completion" additionally write a
    DeliveryVerificationEvent, whose (assignment, event_type) DB uniqueness
    constraint is a second, independent guarantee against duplicate
    verification even if the state-machine check were ever bypassed by a bug.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        if request.user.user_type != 'rider':
            return Response({'error': 'Not a rider'}, status=status.HTTP_403_FORBIDDEN)

        from django.db import transaction as db_transaction, IntegrityError
        from .models import DeliveryVerificationEvent

        new_status = request.data.get('status')
        valid_transitions = {
            'assigned': 'picked_up',
            'picked_up': 'at_pickup_point',
            'at_pickup_point': 'completed',
        }

        try:
            with db_transaction.atomic():
                try:
                    # of=('self',) scopes FOR UPDATE to just this table — without it,
                    # Postgres raises "FOR UPDATE cannot be applied to the nullable
                    # side of an outer join" because pickup_point is nullable and
                    # select_related() turns it into a LEFT OUTER JOIN. SQLite (the
                    # local test DB) doesn't enforce this, so it only ever surfaced
                    # in production — every rider status update was 500ing.
                    assignment = DeliveryAssignment.objects.select_for_update(of=('self',)).select_related(
                        'order__buyer', 'order__listing__vendor', 'pickup_point',
                    ).get(pk=pk, rider=request.user)
                except DeliveryAssignment.DoesNotExist:
                    return Response({'error': 'Assignment not found'}, status=status.HTTP_404_NOT_FOUND)

                if new_status != valid_transitions.get(assignment.status):
                    return Response(
                        {'error': f'Cannot transition from "{assignment.status}" to "{new_status}"'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                now = timezone.now()
                if new_status == 'picked_up':
                    proof = request.FILES.get('proof_image')
                    if not proof:
                        return Response(
                            {'error': 'A photo proving pickup from the vendor is required.'},
                            status=status.HTTP_400_BAD_REQUEST,
                        )
                    from services.views import upload_to_cloudinary
                    proof_url = upload_to_cloudinary(proof, folder='studex/delivery_pickup_proofs')
                    if not proof_url:
                        return Response(
                            {'error': 'Failed to upload proof image. Please try again.'},
                            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        )
                    try:
                        DeliveryVerificationEvent.objects.create(
                            assignment=assignment, event_type='pickup', rider=request.user,
                            evidence_image=proof_url, ip_address=_client_ip(request),
                        )
                    except IntegrityError:
                        return Response(
                            {'error': 'Pickup has already been verified for this assignment.'},
                            status=status.HTTP_409_CONFLICT,
                        )
                    assignment.pickup_proof_image = proof_url
                    assignment.picked_up_at = now
                    # Responsibility transfer: the vendor's obligation ends the
                    # instant pickup is verified — from here StudEx Delivery
                    # (via the rider) is responsible for the physical order.
                    assignment.responsibility = 'studex_delivery'
                    assignment.responsibility_transferred_at = now
                elif new_status == 'at_pickup_point':
                    assignment.at_pickup_point_at = now
                elif new_status == 'completed':
                    if assignment.code_locked:
                        return Response(
                            {'error': 'Too many incorrect code attempts. Ask an admin to regenerate the delivery code.'},
                            status=status.HTTP_423_LOCKED,
                        )
                    provided_code = str(request.data.get('delivery_code', '')).strip()
                    if not provided_code or not secrets.compare_digest(provided_code, assignment.delivery_code):
                        assignment.code_attempts += 1
                        if assignment.code_attempts >= MAX_CODE_ATTEMPTS:
                            assignment.code_locked = True
                        assignment.save(update_fields=['code_attempts', 'code_locked'])
                        return Response(
                            {
                                'error': 'Incorrect delivery code. Ask the buyer for the code '
                                         'shown on their order page before handing over the package.'
                            },
                            status=status.HTTP_400_BAD_REQUEST,
                        )
                    proof = request.FILES.get('proof_image')
                    if not proof:
                        return Response(
                            {'error': 'A photo proving handoff to the buyer is required.'},
                            status=status.HTTP_400_BAD_REQUEST,
                        )
                    from services.views import upload_to_cloudinary
                    proof_url = upload_to_cloudinary(proof, folder='studex/delivery_completion_proofs')
                    if not proof_url:
                        return Response(
                            {'error': 'Failed to upload proof image. Please try again.'},
                            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        )
                    try:
                        DeliveryVerificationEvent.objects.create(
                            assignment=assignment, event_type='completion', rider=request.user,
                            evidence_image=proof_url, ip_address=_client_ip(request),
                        )
                    except IntegrityError:
                        return Response(
                            {'error': 'Completion has already been verified for this assignment.'},
                            status=status.HTTP_409_CONFLICT,
                        )
                    assignment.completion_proof_image = proof_url
                    assignment.completed_at = now

                    # Nothing else in the delivery app ever touches
                    # Order.status — without this, a rider-delivered order
                    # stays stuck at 'paid' forever: the buyer never sees
                    # resolution on their order page, and
                    # award_vendor_badge_progress (orders/views.py) never
                    # fires for it (that's exactly why Store vendors weren't
                    # accruing badge progress from these orders).
                    order = assignment.order
                    from payments.settlement import should_settle_on_pickup
                    if should_settle_on_pickup(order.listing.vendor):
                        # Payout already happened at pickup (Settlement
                        # Policy) — this only finalizes the order's status
                        # and counts it toward the vendor's badge progress.
                        order.status = 'completed'
                        order.buyer_confirmed_at = now
                        order.save(update_fields=['status', 'buyer_confirmed_at'])
                        from orders.views import award_vendor_badge_progress
                        award_vendor_badge_progress(order)
                    else:
                        # Buyer-confirmation vendor: mirror the existing
                        # "vendor marks ready" step so the buyer's own
                        # Confirm button (or 24h auto-release) still
                        # triggers payout — same buyer protection as every
                        # non-delivery-app order, not bypassed just because
                        # a rider was involved.
                        order.status = 'seller_completed'
                        order.seller_completed_at = now
                        order.save(update_fields=['status', 'seller_completed_at'])

                assignment.status = new_status
                assignment.save()
        except DeliveryAssignment.DoesNotExist:
            return Response({'error': 'Assignment not found'}, status=status.HTTP_404_NOT_FOUND)

        # Settlement Policy (see payments/settlement.py): most vendor types
        # keep the global buyer-confirmation/auto-release payout trigger
        # completely untouched. A vendor type can opt into settling on pickup
        # verification instead (e.g. Food — see the Blocker 5 report) — this
        # is the one call site where that trigger fires, using the exact same
        # already-idempotent trigger_vendor_payout/PayoutAuditRecord machinery
        # as every other payout path. Kept outside the DB transaction above
        # since it's an external Paystack call, same convention as
        # auto_release_orders/OrderViewSet.confirm().
        if new_status == 'picked_up':
            try:
                from payments.settlement import should_settle_on_pickup
                from payments.views import trigger_vendor_payout
                vendor = assignment.order.listing.vendor
                if should_settle_on_pickup(vendor):
                    from payments.models import PaymentTransaction
                    txn = PaymentTransaction.objects.filter(
                        reference=assignment.order.reference, status="success",
                    ).first()
                    if txn and not txn.transfer_reference:
                        trigger_vendor_payout(txn, assignment.order.listing.title)
            except Exception as e:
                logger.error(
                    f"RiderUpdateStatusView: pickup-triggered settlement failed for "
                    f"assignment {assignment.id}: {e}", exc_info=True,
                )

        # Notifications are side effects on external systems (email/push) —
        # kept outside the DB transaction, same convention as elsewhere in
        # this codebase (auto_release_orders, trigger_vendor_payout).
        if new_status == 'picked_up':
            try:
                from accounts.utils import send_notification
                send_notification(
                    recipient=assignment.order.buyer,
                    notification_type='order',
                    title='Your order has been picked up!',
                    message=(
                        f'Your order #{assignment.order.reference} has been picked up '
                        f'from "{assignment.order.listing.vendor.username}" and is on the way.'
                    ),
                    action_url=f'/account/orders/{assignment.order.id}',
                    send_email=False,
                )
            except Exception:
                pass
        if new_status == 'at_pickup_point':
            try:
                from accounts.utils import send_notification
                # Auto-assigned deliveries (delivery.assignment.auto_assign_rider)
                # never set pickup_point — same gap BuyerDeliveryStatusSerializer's
                # delivery_location field exists to cover. Falling back here keeps
                # this notification from silently no-oping (pickup_point.name would
                # raise AttributeError on None, swallowed by the bare except below)
                # for exactly the orders that most need the buyer's location, not
                # a pickup point, spelled out.
                where = assignment.pickup_point.name if assignment.pickup_point_id else (
                    assignment.order.delivery_location or "your delivery location"
                )
                # The code itself goes straight in the push notification — sent
                # like an OTP the instant the rider arrives — instead of making
                # the buyer open the app and find their order page first. Still
                # shown there too (BuyerDeliveryStatusSerializer.delivery_code),
                # this is just the faster path to the same value.
                #
                # send_email=True (was False): push has no delivery guarantee —
                # no registered token, a stale/uninstalled Expo token, FCM
                # rejecting it, the buyer's phone offline. Email is the fallback
                # that still lands the code even when every one of those happens,
                # since send_notification_email fires independently of push
                # success/failure. Respects the buyer's email_notifications
                # preference same as every other notification email.
                send_notification(
                    recipient=assignment.order.buyer,
                    notification_type='order',
                    title='Your package is ready for pickup!',
                    message=(
                        f'Your order #{assignment.order.reference} has arrived at {where}. '
                        f'Give the rider this code to collect it: {assignment.delivery_code}'
                    ),
                    action_url=f'/account/orders/{assignment.order.id}',
                    send_email=True,
                )
            except Exception:
                pass

        return Response(DeliveryAssignmentSerializer(assignment).data)


# ─── Public: get delivery status for an order (buyer order page) ──────────────

class OrderDeliveryStatusView(APIView):
    """GET /api/delivery/order/<order_id>/"""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, order_id):
        try:
            assignment = DeliveryAssignment.objects.select_related(
                'pickup_point', 'rider',
            ).get(order_id=order_id, order__buyer=request.user)
        except DeliveryAssignment.DoesNotExist:
            return Response({'error': 'No delivery for this order'}, status=status.HTTP_404_NOT_FOUND)

        return Response(BuyerDeliveryStatusSerializer(assignment).data)


# ─────────────────────────────────────────────────────────────────────────────
# Admin: Delivery Slots (Phase 2 simplification — replaces the earlier
# BatchTemplate + DeliveryBatch pair; one CRUD surface instead of two).
# Registered under /api/admin/ via accounts/admin_urls.py, same convention
# as every other Admin*View in this file.
# ─────────────────────────────────────────────────────────────────────────────

class AdminDeliverySlotListView(APIView):
    """GET/POST /api/admin/delivery-slots/"""
    permission_classes = [IsAdminUser]

    def get(self, request):
        qs = DeliverySlot.objects.select_related('vendor').all()
        vendor_id = request.query_params.get('vendor_id')
        if vendor_id:
            qs = qs.filter(vendor_id=vendor_id)
        return Response(DeliverySlotSerializer(qs, many=True).data)

    def post(self, request):
        ser = DeliverySlotSerializer(data=request.data)
        if ser.is_valid():
            ser.save()
            return Response(ser.data, status=status.HTTP_201_CREATED)
        return Response(ser.errors, status=status.HTTP_400_BAD_REQUEST)


class AdminDeliverySlotDetailView(APIView):
    """PATCH/DELETE /api/admin/delivery-slots/<id>/"""
    permission_classes = [IsAdminUser]

    def _get(self, pk):
        try:
            return DeliverySlot.objects.get(pk=pk)
        except DeliverySlot.DoesNotExist:
            return None

    def patch(self, request, pk):
        obj = self._get(pk)
        if not obj:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)
        ser = DeliverySlotSerializer(obj, data=request.data, partial=True)
        if ser.is_valid():
            ser.save()
            return Response(ser.data)
        return Response(ser.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        obj = self._get(pk)
        if not obj:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)
        obj.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
