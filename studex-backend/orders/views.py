# orders/views.py
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db import models, transaction
from django.utils import timezone
from django.contrib.auth import get_user_model
from decimal import Decimal
from .models import Order, Booking, Dispute
from .serializers import (
    OrderSerializer, DisputeSerializer, DisputeResponseSerializer,
    DisputeResolutionSerializer, DisputeAppealSerializer, BookingSerializer
)
import logging

logger = logging.getLogger(__name__)
User = get_user_model()


def _notify(recipient, notification_type, title, message, action_url=""):
    """Helper — creates a Notification silently, never crashes the caller."""
    try:
        from notifications.models import Notification
        Notification.objects.create(
            recipient=recipient,
            notification_type=notification_type,
            title=title,
            message=message,
            action_url=action_url,
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
        user = self.request.user
        order = serializer.save(buyer=user)

        try:
            profile = user.profile
            if profile.profile_bonus_eligible and not profile.profile_bonus_used:
                discount = order.amount * Decimal('0.05')
                order.amount = order.amount - discount
                order.save(update_fields=['amount'])
                profile.profile_bonus_used = True
                profile.profile_bonus_eligible = False
                profile.save(update_fields=['profile_bonus_used', 'profile_bonus_eligible'])
        except Exception as e:
            logger.warning(f"Profile discount failed: {e}")

        return order

    def create(self, request, *args, **kwargs):
        user = request.user
        discount_eligible = False
        try:
            profile = user.profile
            if profile.profile_bonus_eligible and not profile.profile_bonus_used:
                discount_eligible = True
        except Exception:
            pass

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order = self.perform_create(serializer)

        discount_amount = Decimal('0')
        if discount_eligible:
            original = Decimal(str(request.data.get('amount', 0)))
            discount_amount = original * Decimal('0.05')

        response_data = self.get_serializer(order).data
        response_data['discount_applied'] = discount_eligible
        response_data['discount_amount'] = str(discount_amount)
        if discount_eligible:
            response_data['discount_message'] = (
                f"5% profile completion discount applied! You saved ₦{discount_amount:.2f}"
            )

        return Response(response_data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def confirm_payment(self, request, pk=None):
        from wallet.models import Wallet, WalletTransaction, EscrowTransaction
        from django.db.models import F
        import requests as http_requests
        from django.conf import settings

        order = self.get_object()

        if order.buyer != request.user:
            return Response(
                {"detail": "You are not the buyer of this order"},
                status=status.HTTP_403_FORBIDDEN
            )

        if order.status in ['paid', 'seller_completed', 'completed']:
            return Response({
                "message": "Payment already confirmed",
                "order": self.get_serializer(order).data,
                "status": order.status,
            }, status=status.HTTP_200_OK)

        if order.status != 'pending':
            return Response(
                {"detail": f"Order is already {order.status}"},
                status=status.HTTP_400_BAD_REQUEST
            )

        payment_method = request.data.get('payment_method')
        paystack_reference = request.data.get('paystack_reference')
        total_amount = Decimal(str(order.amount))

        if payment_method == 'wallet':
            buyer_wallet = Wallet.objects.select_for_update().get(user=request.user)
            if buyer_wallet.balance < total_amount:
                return Response(
                    {'error': 'Insufficient wallet balance'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            buyer_wallet.balance = F('balance') - total_amount
            buyer_wallet.save()
            buyer_wallet.refresh_from_db()
            WalletTransaction.objects.create(
                wallet=buyer_wallet,
                type='debit',
                amount=total_amount,
                status='success',
                description=f'Payment for order {order.reference}',
                order=order,
            )

        elif payment_method == 'card':
            if not paystack_reference:
                return Response(
                    {"error": "Paystack reference required"},
                    status=status.HTTP_400_BAD_REQUEST
                )
            verify_url = f"https://api.paystack.co/transaction/verify/{paystack_reference}"
            headers = {'Authorization': f'Bearer {settings.PAYSTACK_SECRET_KEY}'}
            paystack_response = http_requests.get(verify_url, headers=headers)
            if paystack_response.status_code != 200:
                return Response({'error': 'Failed to verify payment'}, status=400)
            data = paystack_response.json()
            if data['data']['status'] != 'success':
                return Response({'error': 'Payment not verified'}, status=400)
            order.payment_reference = paystack_reference
        else:
            return Response(
                {"error": "Invalid payment method"},
                status=status.HTTP_400_BAD_REQUEST
            )

        order.status = 'paid'
        order.paid_at = timezone.now()
        order.save()

        EscrowTransaction.objects.get_or_create(
            order=order,
            defaults={
                'buyer': order.buyer,
                'seller': order.listing.vendor,
                'total_amount': total_amount,
                'seller_amount': total_amount * Decimal('0.95'),
                'platform_fee': total_amount * Decimal('0.05'),
                'status': 'held',
            }
        )

        # Notify vendor
        _notify(
            recipient=order.listing.vendor,
            notification_type='booking_paid',
            title=f'💰 Payment Received — {order.listing.title}',
            message=(
                f'{request.user.username} has paid ₦{total_amount:,.0f} for '
                f'"{order.listing.title}". Funds are held in escrow.'
            ),
            action_url='/vendor/dashboard',
        )

        return Response({
            "message": "Payment confirmed! Order is now in escrow.",
            "order": self.get_serializer(order).data,
        })

    @action(detail=True, methods=['post', 'patch'])
    @transaction.atomic
    def confirm(self, request, pk=None):
        order = self.get_object()

        if order.buyer != request.user:
            return Response(
                {"detail": "You are not the buyer of this order."},
                status=status.HTTP_403_FORBIDDEN
            )

        if order.status == 'completed':
            return Response(
                {"message": "Order already confirmed.", "order": self.get_serializer(order).data},
                status=status.HTTP_200_OK
            )

        if order.status not in ['paid', 'seller_completed']:
            return Response(
                {"detail": f"Cannot confirm an order with status: '{order.status}'."},
                status=status.HTTP_400_BAD_REQUEST
            )

        order.status = 'completed'
        order.buyer_confirmed_at = timezone.now()
        order.save()

        # Notify vendor that buyer confirmed and funds will be released
        _notify(
            recipient=order.listing.vendor,
            notification_type='order_confirmed',
            title=f'✅ Order Confirmed — {order.listing.title}',
            message=(
                f'{request.user.username} has confirmed the order for '
                f'"{order.listing.title}". Payment will be released to you shortly.'
            ),
            action_url='/vendor/dashboard',
        )

        credits_awarded = False
        credits_amount = 0
        try:
            from loyalty.models import LoyaltyAccount, LoyaltyTransaction
            from decimal import Decimal as D
            account, _ = LoyaltyAccount.objects.get_or_create(user=request.user)
            account.total_completed_orders += 1
            account.save(update_fields=['total_completed_orders'])
            if account.total_completed_orders % 5 == 0:
                account.credit_balance = (account.credit_balance or D('0')) + D('100')
                account.save(update_fields=['credit_balance'])
                LoyaltyTransaction.objects.create(
                    account=account,
                    type='earned',
                    amount=D('100'),
                    description=f"Loyalty reward: {account.total_completed_orders} orders completed!",
                    order=order,
                )
                credits_awarded = True
                credits_amount = 100
        except Exception as e:
            logger.warning(f"Loyalty award skipped for order {order.id}: {e}")

        try:
            vendor = order.listing.vendor
            vp = vendor.profile
            vp.on_platform_sales = (vp.on_platform_sales or 0) + 1
            sales = vp.on_platform_sales
            if sales >= 50:
                vp.vendor_badge = 'top'
            elif sales >= 30:
                vp.vendor_badge = 'trusted'
            elif sales >= 10:
                vp.vendor_badge = 'rising'
            vp.save(update_fields=['on_platform_sales', 'vendor_badge'])
        except Exception as e:
            logger.warning(f"Vendor badge update skipped for order {order.id}: {e}")

        response_data = {
            "message": "Order confirmed! Payment will be released to the vendor.",
            "order": self.get_serializer(order).data,
            "can_review": True,
        }
        if credits_awarded:
            response_data["loyalty_reward"] = {
                "awarded": True,
                "amount": credits_amount,
                "message": f"🎉 You earned ₦{credits_amount} loyalty credits!",
            }

        return Response(response_data, status=status.HTTP_200_OK)


class DisputeViewSet(viewsets.ModelViewSet):
    queryset = Dispute.objects.all()
    serializer_class = DisputeSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.is_staff or user.is_superuser:
            return self.queryset.all()
        return self.queryset.filter(
            models.Q(order__buyer=user) |
            models.Q(order__listing__vendor=user)
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

        # Notify vendor of new booking request
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

        # Notify buyer that vendor confirmed
        _notify(
            recipient=booking.buyer,
            notification_type='booking_confirmed',
            title=f'✅ Booking Confirmed — {booking.listing.title}',
            message=(
                f'Great news! {request.user.username} has confirmed your booking for '
                f'"{booking.listing.title}" on {booking.scheduled_date} at '
                f'{booking.scheduled_time}. Proceed to payment to lock it in.'
            ),
            action_url='/book',
        )

        return Response({
            'detail': 'Booking confirmed.',
            'status': 'confirmed',
        })

    @action(detail=True, methods=['post'], url_path='cancel')
    def cancel(self, request, pk=None):
        booking = self.get_object()
        is_buyer = booking.buyer == request.user
        is_vendor = booking.listing.vendor == request.user

        if not (is_buyer or is_vendor):
            return Response({'detail': 'Not allowed.'}, status=403)
        if booking.status in ['completed', 'cancelled']:
            return Response(
                {'detail': f'Cannot cancel a {booking.status} booking.'},
                status=400
            )

        booking.status = 'cancelled'
        booking.save()

        # Notify the other party about cancellation
        if is_buyer:
            # Buyer cancelled → notify vendor
            _notify(
                recipient=booking.listing.vendor,
                notification_type='booking_cancelled',
                title=f'❌ Booking Cancelled — {booking.listing.title}',
                message=(
                    f'{request.user.username} has cancelled their booking for '
                    f'"{booking.listing.title}" on {booking.scheduled_date}.'
                ),
                action_url='/vendor/dashboard',
            )
        else:
            # Vendor cancelled → notify buyer
            _notify(
                recipient=booking.buyer,
                notification_type='booking_cancelled',
                title=f'❌ Booking Cancelled — {booking.listing.title}',
                message=(
                    f'Unfortunately, {request.user.username} has cancelled your booking for '
                    f'"{booking.listing.title}" on {booking.scheduled_date}. '
                    f'You can book another vendor for the same service.'
                ),
                action_url='/book',
            )

        return Response({'detail': 'Booking cancelled.', 'status': 'cancelled'})