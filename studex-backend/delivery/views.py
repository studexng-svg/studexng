import logging
import secrets

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import permissions, status
from django.utils import timezone

from studex.permissions import IsAdminUser
from .models import CampusPickupPoint, DeliveryAssignment, generate_delivery_code, MAX_CODE_ATTEMPTS
from .serializers import (
    CampusPickupPointSerializer, DeliveryAssignmentSerializer, BuyerDeliveryStatusSerializer,
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
        ).exclude(status='completed')
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
                    assignment = DeliveryAssignment.objects.select_for_update().select_related(
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
                send_notification(
                    recipient=assignment.order.buyer,
                    notification_type='order',
                    title='Your package is ready for pickup!',
                    message=(
                        f'Your order #{assignment.order.reference} has arrived at '
                        f'"{assignment.pickup_point.name}". Come collect it! '
                        f'Give the rider the delivery code shown on your order page.'
                    ),
                    action_url=f'/account/orders/{assignment.order.id}',
                    send_email=False,
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
