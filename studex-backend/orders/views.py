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


class OrderViewSet(viewsets.ModelViewSet):
    queryset = Order.objects.all()
    serializer_class = OrderSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        # Always return orders where user is the buyer.
        # Vendors see their sales via the vendor dashboard earnings tab, not here.
        return self.queryset.filter(buyer=user).order_by('-created_at')

    def perform_create(self, serializer):
        serializer.save(buyer=self.request.user)

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def confirm_payment(self, request, pk=None):
        from wallet.models import Wallet, WalletTransaction, EscrowTransaction
        from django.db.models import F
        import requests
        from django.conf import settings

        order = self.get_object()

        if order.buyer != request.user:
            return Response({"detail": "You are not the buyer of this order"},
                            status=status.HTTP_403_FORBIDDEN)

        if order.status in ['paid', 'seller_completed', 'completed']:
            return Response({
                "message": "Payment already confirmed",
                "order": self.get_serializer(order).data,
                "status": order.status
            }, status=status.HTTP_200_OK)

        if order.status != 'pending':
            return Response({"detail": f"Order is already {order.status}"},
                            status=status.HTTP_400_BAD_REQUEST)

        payment_method = request.data.get('payment_method')
        paystack_reference = request.data.get('paystack_reference')

        total_amount = Decimal(str(order.amount))

        if payment_method == 'wallet':
            buyer_wallet = Wallet.objects.select_for_update().get(user=request.user)
            if buyer_wallet.balance < total_amount:
                return Response({'error': 'Insufficient wallet balance'},
                                status=status.HTTP_400_BAD_REQUEST)
            buyer_wallet.balance = F('balance') - total_amount
            buyer_wallet.save()
            buyer_wallet.refresh_from_db()
            WalletTransaction.objects.create(
                wallet=buyer_wallet,
                type='debit',
                amount=total_amount,
                status='success',
                description=f'Payment for order {order.reference}',
                order=order
            )

        elif payment_method == 'card':
            if not paystack_reference:
                return Response({"error": "Paystack reference required"},
                                status=status.HTTP_400_BAD_REQUEST)
            verify_url = f"https://api.paystack.co/transaction/verify/{paystack_reference}"
            headers = {'Authorization': f'Bearer {settings.PAYSTACK_SECRET_KEY}'}
            paystack_response = requests.get(verify_url, headers=headers)
            if paystack_response.status_code != 200:
                return Response({'error': 'Failed to verify payment'}, status=400)
            data = paystack_response.json()
            if data['data']['status'] != 'success':
                return Response({'error': 'Payment not verified'}, status=400)
            order.payment_reference = paystack_reference
        else:
            return Response({"error": "Invalid payment method"},
                            status=status.HTTP_400_BAD_REQUEST)

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
                'status': 'held'
            }
        )

        return Response({
            "message": "Payment confirmed! Order is now in escrow.",
            "order": self.get_serializer(order).data
        })

    @action(detail=True, methods=['post', 'patch'])
    @transaction.atomic
    def confirm(self, request, pk=None):
        """Buyer confirms receipt — marks order completed, releases payment to vendor."""
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
                {"detail": f"Cannot confirm an order with status: '{order.status}'. Order must be paid or seller_completed."},
                status=status.HTTP_400_BAD_REQUEST
            )

        order.status = 'completed'
        order.buyer_confirmed_at = timezone.now()
        order.save()

        # Loyalty credits (non-blocking)
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

        # Vendor badge update (non-blocking)
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
        serializer.save(buyer=self.request.user)

    @action(detail=True, methods=['post'], url_path='confirm')
    def confirm_booking(self, request, pk=None):
        """Vendor confirms a booking."""
        booking = self.get_object()
        if booking.listing.vendor != request.user:
            return Response({'detail': 'Only the vendor can confirm.'}, status=403)
        if booking.status != 'pending':
            return Response({'detail': f'Booking is already {booking.status}.'}, status=400)
        booking.status = 'confirmed'
        booking.save()
        # Notify buyer that their booking was accepted
        try:
            from notifications.models import Notification
            Notification.objects.create(
                recipient=booking.buyer,
                notification_type='vendor_approved',
                title=f'✅ Booking Accepted — {booking.listing.title}',
                message=(
                    f'Great news! {booking.listing.vendor.username} '
                    f'has accepted your booking for "{booking.listing.title}" '
                    f'on {booking.scheduled_date} at {booking.scheduled_time}. '
                    f'You can now proceed to pay.'
                ),
                action_url='/account/bookings',
            )
        except Exception:
            pass
        return Response({'detail': 'Booking confirmed.', 'status': 'confirmed'})

    @action(detail=True, methods=['post'], url_path='cancel')
    def cancel(self, request, pk=None):
        """Buyer or vendor cancels a booking."""
        booking = self.get_object()
        is_buyer = booking.buyer == request.user
        is_vendor = booking.listing.vendor == request.user
        if not (is_buyer or is_vendor):
            return Response({'detail': 'Not allowed.'}, status=403)
        if booking.status in ['completed', 'cancelled']:
            return Response({'detail': f'Cannot cancel a {booking.status} booking.'}, status=400)
        booking.status = 'cancelled'
        booking.save()
        # Notify the other party about cancellation
        try:
            from notifications.models import Notification
            if is_vendor:
                # Vendor cancelled — notify buyer
                Notification.objects.create(
                    recipient=booking.buyer,
                    notification_type='vendor_revoked',
                    title=f'❌ Booking Declined — {booking.listing.title}',
                    message=(
                        f'Unfortunately, {booking.listing.vendor.business_name or booking.listing.vendor.username} '
                        f'has declined your booking for "{booking.listing.title}" '
                        f'on {booking.scheduled_date} at {booking.scheduled_time}. '
                        f'You can book again or choose another vendor.'
                    ),
                    action_url='/account/bookings',
                )
            elif is_buyer:
                # Buyer cancelled — notify vendor
                Notification.objects.create(
                    recipient=booking.listing.vendor,
                    notification_type='vendor_revoked',
                    title=f'❌ Booking Cancelled by Buyer — {booking.listing.title}',
                    message=(
                        f'{booking.buyer.username} has cancelled their booking for '
                        f'"{booking.listing.title}" on {booking.scheduled_date} at {booking.scheduled_time}.'
                    ),
                    action_url='/vendor/dashboard',
                )
        except Exception:
            pass
        return Response({'detail': 'Booking cancelled.', 'status': 'cancelled'})