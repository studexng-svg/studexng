from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import permissions, status
from django.utils import timezone

from studex.permissions import IsAdminUser
from .models import CampusPickupPoint, DeliveryAssignment
from .serializers import CampusPickupPointSerializer, DeliveryAssignmentSerializer


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
            },
        )

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


class RiderUpdateStatusView(APIView):
    """
    POST /api/delivery/assignments/<id>/update-status/
    Body: { status: 'picked_up' | 'at_pickup_point' | 'completed' }
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        if request.user.user_type != 'rider':
            return Response({'error': 'Not a rider'}, status=status.HTTP_403_FORBIDDEN)

        try:
            assignment = DeliveryAssignment.objects.select_related(
                'order__buyer', 'pickup_point',
            ).get(pk=pk, rider=request.user)
        except DeliveryAssignment.DoesNotExist:
            return Response({'error': 'Assignment not found'}, status=status.HTTP_404_NOT_FOUND)

        new_status = request.data.get('status')
        valid_transitions = {
            'assigned': 'picked_up',
            'picked_up': 'at_pickup_point',
            'at_pickup_point': 'completed',
        }

        if new_status != valid_transitions.get(assignment.status):
            return Response(
                {'error': f'Cannot transition from "{assignment.status}" to "{new_status}"'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        now = timezone.now()
        if new_status == 'picked_up':
            assignment.picked_up_at = now
        elif new_status == 'at_pickup_point':
            assignment.at_pickup_point_at = now
            # Notify the buyer that their package is ready for collection
            try:
                from accounts.utils import send_notification
                send_notification(
                    recipient=assignment.order.buyer,
                    notification_type='order',
                    title='Your package is ready for pickup!',
                    message=(
                        f'Your order #{assignment.order.reference} has arrived at '
                        f'"{assignment.pickup_point.name}". Come collect it!'
                    ),
                    action_url=f'/account/orders/{assignment.order.id}',
                    send_email=False,
                )
            except Exception:
                pass
        elif new_status == 'completed':
            assignment.completed_at = now

        assignment.status = new_status
        assignment.save()

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

        return Response(DeliveryAssignmentSerializer(assignment).data)
