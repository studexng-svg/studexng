# services/views.py
from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny  # ← ADD THIS LINE
from .models import Category, Listing, Transaction
from .serializers import CategorySerializer, ListingSerializer, TransactionSerializer


class CategoryViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint that allows categories to be viewed.
    """
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [AllowAny]  # Now works!


class ListingViewSet(viewsets.ModelViewSet):
    """
    API endpoint for vendor product/service listings
    - Public can view available listings
    - Verified vendors can create/update/delete their own listings
    """
    queryset = Listing.objects.all()
    serializer_class = ListingSerializer

    # CRITICAL FIX: Configure filtering and search
    filterset_fields = ['category', 'is_available', 'vendor']
    search_fields = ['title', 'description', 'vendor__username', 'vendor__business_name']
    ordering_fields = ['price', 'created_at', 'title']
    ordering = ['-created_at']  # Default ordering: newest first

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            permission_classes = [AllowAny]
        else:
            permission_classes = [permissions.IsAuthenticated]
        return [perm() for perm in permission_classes]

    def get_queryset(self):
        if self.request.user.is_authenticated and self.request.user.user_type == 'vendor':
            return self.queryset.filter(vendor=self.request.user)
        return self.queryset.filter(is_available=True)

    def perform_create(self, serializer):
        serializer.save(vendor=self.request.user)


class TransactionViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint for vendor payout transactions
    """
    serializer_class = TransactionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        if self.request.user.user_type != 'vendor':
            return Transaction.objects.none()
        return Transaction.objects.filter(vendor=self.request.user)