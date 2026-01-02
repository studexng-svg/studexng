# orders/views.py
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from .models import Order
from .serializers import OrderSerializer

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
    def confirm_receipt(self, request, pk=None):
        """Confirm receipt by buyer - releases money to vendor"""
        order = self.get_object()
        
        # Check if current user is the buyer
        if order.buyer != request.user:
            return Response(
                {"detail": "You are not the buyer of this order"}, 
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Can only confirm if seller has marked complete
        if order.status != 'seller_completed':
            return Response(
                {"detail": "Seller has not marked this order as complete yet"}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Mark order as completed
        order.status = 'completed'
        order.buyer_confirmed_at = timezone.now()
        order.save()
        
        # Release money to vendor's wallet
        vendor = order.listing.vendor
        vendor.wallet_balance += order.amount
        vendor.save()
        
        return Response({
            "message": "Order confirmed! Money released to seller.",
            "order": self.get_serializer(order).data
        }, status=status.HTTP_200_OK)