# orders/views.py
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db import models
from django.utils import timezone
from django.contrib.auth import get_user_model
from decimal import Decimal
from .models import Order, Booking, Dispute
from .serializers import OrderSerializer, DisputeSerializer, BookingSerializer
import logging

logger = logging.getLogger(__name__)
User = get_user_model()


def _notify(recipient, notification_type, title, message, action_url=""):
    try:
        from notifications.models import Notification
        Notification.objects.create(
            recipient=recipient, notification_type=notification_type,
            title=title, message=message, action_url=action_url,
        )
    except Exception as e:
        logger.warning(f"Notification creation failed: {e}")


class OrderViewSet(viewsets.ModelViewSet):
    queryset = Order.objects.all()
    serializer_class = OrderSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        return self.queryset.filter(buyer=user).order_by('-created_at')

    def perform_create(self, serializer):
        serializer.save(buyer=self.request.user)

    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        """Buyer confirms order is complete."""
        order = self.get_object()

        if order.buyer != request.user:
            return Response({"detail": "You are not the buyer of this order."}, status=403)

        if order.status == 'completed':
            return Response({"message": "Order already confirmed.", "order": self.get_serializer(order).data})

        if order.status not in ['paid', 'seller_completed']:
            return Response({"detail": f"Cannot confirm an order with status: '{order.status}'."}, status=400)

        order.status = 'completed'
        order.buyer_confirmed_at = timezone.now()
        order.save()

        _notify(
            recipient=order.listing.vendor,
            notification_type='order_confirmed',
            title=f'✅ Order Confirmed — {order.listing.title}',
            message=(
                f'{request.user.username} has confirmed the order for '
                f'"{order.listing.title}". Flutterwave will transfer your share within 1-2 business days.'
            ),
            action_url='/vendor/dashboard',
        )

        # Loyalty credits
        credits_awarded = False
        credits_amount = 0
        try:
            from loyalty.models import LoyaltyAccount, LoyaltyTransaction
            MILESTONE = 10
            REWARD = Decimal('200')
            account, _ = LoyaltyAccount.objects.get_or_create(user=request.user)
            account.total_completed_orders += 1
            account.save(update_fields=['total_completed_orders'])
            if account.total_completed_orders % MILESTONE == 0:
                account.credit_balance = (account.credit_balance or Decimal('0')) + REWARD
                account.save(update_fields=['credit_balance'])
                LoyaltyTransaction.objects.create(
                    account=account, type='earned', amount=REWARD,
                    description=f"Loyalty reward: {account.total_completed_orders} orders completed!",
                    order=order,
                )
                credits_awarded = True
                credits_amount = 200
        except Exception as e:
            logger.warning(f"Loyalty award skipped for order {order.id}: {e}")

        # Vendor badge
        try:
            vendor = order.listing.vendor
            vp = vendor.profile
            vp.on_platform_sales = (vp.on_platform_sales or 0) + 1
            sales = vp.on_platform_sales
            if sales >= 50: vp.vendor_badge = 'top'
            elif sales >= 30: vp.vendor_badge = 'trusted'
            elif sales >= 10: vp.vendor_badge = 'rising'
            vp.save(update_fields=['on_platform_sales', 'vendor_badge'])
        except Exception as e:
            logger.warning(f"Vendor badge update skipped: {e}")

        response_data = {
            "message": "Order confirmed! Flutterwave will transfer payment to the vendor.",
            "order": self.get_serializer(order).data,
            "can_review": True,
        }
        if credits_awarded:
            response_data["loyalty_reward"] = {
                "awarded": True, "amount": credits_amount,
                "message": f"🎉 You earned ₦{credits_amount} loyalty credits!",
            }

        return Response(response_data)


class DisputeViewSet(viewsets.ModelViewSet):
    queryset = Dispute.objects.all()
    serializer_class = DisputeSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.is_staff or user.is_superuser:
            return self.queryset.all()
        return self.queryset.filter(
            models.Q(order__buyer=user) | models.Q(order__listing__vendor=user)
        ).distinct()


class BookingViewSet(viewsets.ModelViewSet):
    serializer_class = BookingSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        from services.models import Listing
        vendor_listing_ids = Listing.objects.filter(vendor=user).values_list('id', flat=True)
        return Booking.objects.filter(
            models.Q(buyer=user) | models.Q(listing__id__in=vendor_listing_ids)
        ).select_related('buyer', 'listing', 'listing__vendor')

    def perform_create(self, serializer):
        booking = serializer.save(buyer=self.request.user)
        _notify(
            recipient=booking.listing.vendor,
            notification_type='new_booking_request',
            title=f'📅 New Booking Request — {booking.listing.title}',
            message=(
                f'{self.request.user.username} has requested a booking for '
                f'"{booking.listing.title}" on {booking.scheduled_date} at '
                f'{booking.scheduled_time}. Please confirm or cancel.'
            ),
            action_url='/vendor/dashboard',
        )

    @action(detail=True, methods=['post'], url_path='confirm')
    def confirm_booking(self, request, pk=None):
        booking = self.get_object()
        if booking.listing.vendor != request.user:
            return Response({'detail': 'Only the vendor can confirm.'}, status=403)
        if booking.status != 'pending':
            return Response({'detail': f'Booking is already {booking.status}.'}, status=400)

        booking.status = 'confirmed'
        booking.save()

        _notify(
            recipient=booking.buyer,
            notification_type='booking_confirmed',
            title=f'✅ Booking Accepted — {booking.listing.title}',
            message=(
                f'Great news! {request.user.username} has accepted your booking for '
                f'"{booking.listing.title}" on {booking.scheduled_date} at '
                f'{booking.scheduled_time}. You can now proceed to pay.'
            ),
            action_url='/account/bookings',
        )
        return Response({'detail': 'Booking confirmed.', 'status': 'confirmed'})

    @action(detail=True, methods=['post'], url_path='cancel')
    def cancel(self, request, pk=None):
        booking = self.get_object()
        is_buyer = booking.buyer == request.user
        is_vendor = booking.listing.vendor == request.user

        if not (is_buyer or is_vendor):
            return Response({'detail': 'Not allowed.'}, status=403)
        if booking.status in ['completed', 'cancelled']:
            return Response({'detail': f'Cannot cancel a {booking.status} booking.'}, status=400)

        booking.status = 'cancelled'
        booking.save()

        if is_vendor:
            _notify(
                recipient=booking.buyer,
                notification_type='booking_cancelled',
                title=f'❌ Booking Declined — {booking.listing.title}',
                message=(
                    f'Unfortunately, {request.user.username} has declined your booking for '
                    f'"{booking.listing.title}" on {booking.scheduled_date}. '
                    f'You can book again or choose another vendor.'
                ),
                action_url='/account/bookings',
            )
        elif is_buyer:
            _notify(
                recipient=booking.listing.vendor,
                notification_type='booking_cancelled',
                title=f'❌ Booking Cancelled by Buyer — {booking.listing.title}',
                message=(
                    f'{request.user.username} has cancelled their booking for '
                    f'"{booking.listing.title}" on {booking.scheduled_date}.'
                ),
                action_url='/vendor/dashboard',
            )

        return Response({'detail': 'Booking cancelled.', 'status': 'cancelled'})

    @action(detail=False, methods=['get'], url_path='vendor-paid')
    def vendor_paid_bookings(self, request):
        """
        Returns paid bookings for this vendor's listings.
        Used in Vendor Dashboard → Orders tab.
        """
        from services.models import Listing
        vendor_listing_ids = Listing.objects.filter(
            vendor=request.user
        ).values_list('id', flat=True)

        paid_bookings = Booking.objects.filter(
            listing__id__in=vendor_listing_ids,
            status="paid",
        ).select_related('buyer', 'listing', 'listing__vendor').order_by('-created_at')

        serializer = self.get_serializer(paid_bookings, many=True)
        return Response(serializer.data)