# orders/views.py
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from django.db import models, transaction
from django.contrib.auth import get_user_model
from decimal import Decimal
from .models import Order, Dispute
from .serializers import (
    OrderSerializer, DisputeSerializer, DisputeResponseSerializer,
    DisputeResolutionSerializer, DisputeAppealSerializer
)
import logging

logger = logging.getLogger(__name__)
User = get_user_model()

class OrderViewSet(viewsets.ModelViewSet):
    queryset = Order.objects.all()
    serializer_class = OrderSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        """Filter orders based on user type"""
        user = self.request.user
        
        # Sellers see orders where they are the listing vendor
        if user.user_type == 'vendor':
            return self.queryset.filter(listing__vendor=user).order_by('-created_at')
        
        # Buyers see orders where they are the buyer
        return self.queryset.filter(buyer=user).order_by('-created_at')

    def perform_create(self, serializer):
        """Save order with current buyer"""
        serializer.save(buyer=self.request.user)

    # NEW: Get pending orders for seller
    @action(detail=False, methods=['get'])
    def pending(self, request):
        """Get all pending orders for the current seller"""
        user = request.user
        
        # Only vendors can view pending orders
        if user.user_type != 'vendor':
            return Response(
                {"detail": "Only vendors can view pending orders"}, 
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Get orders where listing vendor is current user and status is paid or seller_completed
        pending_orders = self.get_queryset().filter(
            status__in=['paid', 'seller_completed']
        )
        
        serializer = self.get_serializer(pending_orders, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['patch'])
    def mark_complete(self, request, pk=None):
        """Mark order as complete by seller"""
        order = self.get_object()
        
        # Check if current user is the seller of this listing
        if order.listing.vendor != request.user:
            return Response(
                {"detail": "You are not the seller of this listing"}, 
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Can only mark as complete if order is paid or already seller_completed
        if order.status not in ['paid', 'seller_completed']:
            return Response(
                {"detail": f"Cannot mark as complete. Current status: {order.status}"}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        order.status = 'seller_completed'
        order.seller_completed_at = timezone.now()
        order.save()
        
        return Response({
            "message": "Order marked as complete. Waiting for buyer confirmation.",
            "order": self.get_serializer(order).data
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['patch'])
    @transaction.atomic
    def confirm_receipt(self, request, pk=None):
        """Confirm receipt by buyer - releases money to vendor via escrow"""
        order = self.get_object()

        logger.info(f"Confirm receipt requested for order {order.id} by user {request.user.email}")

        # Check if current user is the buyer
        if order.buyer != request.user:
            logger.warning(f"Non-buyer attempting to confirm order {order.id}")
            return Response(
                {"detail": "You are not the buyer of this order"},
                status=status.HTTP_403_FORBIDDEN
            )

        # Can only confirm if seller has marked complete
        if order.status != 'seller_completed':
            logger.warning(f"Attempt to confirm order {order.id} with status {order.status}")
            return Response(
                {"detail": "Seller has not marked this order as complete yet"},
                status=status.HTTP_400_BAD_REQUEST
            )

        # CRITICAL FIX: Use escrow system instead of direct wallet manipulation
        from wallet.models import EscrowTransaction, Wallet, WalletTransaction

        try:
            escrow = EscrowTransaction.objects.get(order=order, status='held')
        except EscrowTransaction.DoesNotExist:
            logger.error(f"No held escrow found for order {order.id}")
            return Response({
                "detail": "No escrow found for this order. Please contact support."
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        # Mark order as completed
        order.status = 'completed'
        order.buyer_confirmed_at = timezone.now()
        order.save()

        logger.info(f"Order {order.id} marked as completed")

        # Release escrow to seller (95%)
        seller_wallet, _ = Wallet.objects.get_or_create(user=escrow.seller)
        seller_wallet.balance = Decimal(str(seller_wallet.balance)) + Decimal(str(escrow.seller_amount))
        seller_wallet.save()

        # Create transaction record for seller
        WalletTransaction.objects.create(
            wallet=seller_wallet,
            type='credit',
            amount=escrow.seller_amount,
            status='success',
            description=f'Payment from order {order.id}',
            order=order
        )

        logger.info(f"Seller received ₦{escrow.seller_amount} for order {order.id}")

        # Collect platform fee (5%)
        admin = User.objects.filter(is_staff=True, is_superuser=True).first()
        if admin:
            platform_wallet, _ = Wallet.objects.get_or_create(user=admin)
            platform_wallet.balance = Decimal(str(platform_wallet.balance)) + Decimal(str(escrow.platform_fee))
            platform_wallet.save()

            # Create transaction record for platform fee
            WalletTransaction.objects.create(
                wallet=platform_wallet,
                type='credit',
                amount=escrow.platform_fee,
                status='success',
                description=f'Platform fee from order {order.id}',
                order=order
            )

            logger.info(f"Platform fee collected: ₦{escrow.platform_fee} for order {order.id}")
        else:
            logger.error("No admin user found for platform fee collection!")

        # Update escrow status
        escrow.status = 'released_to_seller'
        escrow.released_at = timezone.now()
        escrow.save()

        logger.info(f"Escrow {escrow.id} released for order {order.id}")

        return Response({
            "message": "Order confirmed! Money released to seller.",
            "seller_received": float(escrow.seller_amount),
            "platform_fee": float(escrow.platform_fee),
            "order": self.get_serializer(order).data
        }, status=status.HTTP_200_OK)


class DisputeViewSet(viewsets.ModelViewSet):
    queryset = Dispute.objects.all()
    serializer_class = DisputeSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        """Filter disputes based on user role"""
        user = self.request.user

        # Admin users see all disputes
        if user.is_staff or user.is_superuser:
            return self.queryset.all()

        # Regular users see disputes they are involved in
        return self.queryset.filter(
            models.Q(order__buyer=user) | models.Q(order__listing__vendor=user)
        ).distinct()

    def create(self, request, *args, **kwargs):
        """File a new dispute"""
        try:
            # Check if order exists and user is authorized
            order_id = request.data.get('order')
            try:
                order = Order.objects.get(id=order_id)
            except Order.DoesNotExist:
                return Response(
                    {"error": "Order not found"},
                    status=status.HTTP_404_NOT_FOUND
                )

            # Check if user is buyer or provider
            if request.user != order.buyer and request.user != order.listing.vendor:
                return Response(
                    {"error": "You are not authorized to file a dispute for this order"},
                    status=status.HTTP_403_FORBIDDEN
                )

            # Check if order can be disputed
            if order.status not in ['paid', 'seller_completed', 'disputed']:
                return Response(
                    {"error": f"Cannot dispute order with status: {order.status}"},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Check if dispute already exists
            existing_dispute = Dispute.objects.filter(
                order=order,
                status__in=['open', 'under_review', 'appealed']
            ).first()

            if existing_dispute:
                return Response(
                    {"error": "An active dispute already exists for this order"},
                    status=status.HTTP_400_BAD_REQUEST
                )

            return super().create(request, *args, **kwargs)

        except Exception as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=['patch'])
    def respond(self, request, pk=None):
        """Provider responds to a dispute"""
        dispute = self.get_object()

        # Only the provider can respond
        if request.user != dispute.order.listing.vendor:
            return Response(
                {"error": "Only the provider can respond to this dispute"},
                status=status.HTTP_403_FORBIDDEN
            )

        # Can only respond if status is open
        if dispute.status != 'open':
            return Response(
                {"error": f"Cannot respond to dispute with status: {dispute.status}"},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = DisputeResponseSerializer(dispute, data=request.data, context={'request': request})
        if serializer.is_valid():
            serializer.save()
            return Response({
                "message": "Response submitted successfully",
                "dispute": DisputeSerializer(dispute).data
            })
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['patch'])
    def resolve(self, request, pk=None):
        """Admin resolves a dispute"""
        dispute = self.get_object()

        # Only admin/staff can resolve
        if not (request.user.is_staff or request.user.is_superuser):
            return Response(
                {"error": "Only administrators can resolve disputes"},
                status=status.HTTP_403_FORBIDDEN
            )

        # Can only resolve if under review or open
        if dispute.status not in ['open', 'under_review', 'appealed']:
            return Response(
                {"error": f"Cannot resolve dispute with status: {dispute.status}"},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = DisputeResolutionSerializer(dispute, data=request.data, context={'request': request})
        if serializer.is_valid():
            serializer.save()
            return Response({
                "message": "Dispute resolved successfully",
                "dispute": DisputeSerializer(dispute).data
            })
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['patch'])
    def appeal(self, request, pk=None):
        """User appeals a dispute resolution"""
        dispute = self.get_object()

        # Only buyer or provider can appeal
        if request.user != dispute.order.buyer and request.user != dispute.order.listing.vendor:
            return Response(
                {"error": "Only the buyer or provider can appeal this dispute"},
                status=status.HTTP_403_FORBIDDEN
            )

        # Can only appeal if resolved
        if dispute.status != 'resolved':
            return Response(
                {"error": "Can only appeal a resolved dispute"},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = DisputeAppealSerializer(dispute, data=request.data, context={'request': request})
        if serializer.is_valid():
            serializer.save()
            return Response({
                "message": "Appeal submitted successfully",
                "dispute": DisputeSerializer(dispute).data
            })
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['patch'])
    def assign(self, request, pk=None):
        """Admin assigns dispute to support staff"""
        dispute = self.get_object()

        # Only admin/staff can assign
        if not (request.user.is_staff or request.user.is_superuser):
            return Response(
                {"error": "Only administrators can assign disputes"},
                status=status.HTTP_403_FORBIDDEN
            )

        assigned_to_id = request.data.get('assigned_to')
        if not assigned_to_id:
            return Response(
                {"error": "assigned_to field is required"},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            from django.contrib.auth import get_user_model
            User = get_user_model()
            assigned_user = User.objects.get(id=assigned_to_id)

            dispute.assigned_to = assigned_user
            dispute.save()

            return Response({
                "message": f"Dispute assigned to {assigned_user.username}",
                "dispute": DisputeSerializer(dispute).data
            })
        except User.DoesNotExist:
            return Response(
                {"error": "User not found"},
                status=status.HTTP_404_NOT_FOUND
            )

    @action(detail=False, methods=['get'])
    def admin_dashboard(self, request):
        """Get all disputes for admin dashboard"""
        if not (request.user.is_staff or request.user.is_superuser):
            return Response(
                {"error": "Only administrators can access this endpoint"},
                status=status.HTTP_403_FORBIDDEN
            )

        # Get dispute counts by status
        from django.db.models import Count
        disputes = Dispute.objects.all()

        stats = disputes.aggregate(
            total=Count('id'),
            open=Count('id', filter=models.Q(status='open')),
            under_review=Count('id', filter=models.Q(status='under_review')),
            resolved=Count('id', filter=models.Q(status='resolved')),
            appealed=Count('id', filter=models.Q(status='appealed')),
        )

        # Get recent disputes
        recent = DisputeSerializer(disputes.order_by('-created_at')[:10], many=True).data

        return Response({
            "stats": stats,
            "recent_disputes": recent
        })