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
    # Note: 'category' removed from filterset_fields, handled manually in get_queryset to support slug
    filterset_fields = ['is_available', 'vendor']
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
        queryset = self.queryset

        # Filter by category slug if provided (support both ID and slug)
        category_param = self.request.query_params.get('category', None)
        if category_param:
            # Try filtering by slug first, then by ID
            if category_param.isdigit():
                queryset = queryset.filter(category__id=category_param)
            else:
                queryset = queryset.filter(category__slug=category_param)

        # Vendors see their own listings, public sees only available ones
        if self.request.user.is_authenticated and self.request.user.user_type == 'vendor':
            return queryset.filter(vendor=self.request.user)
        return queryset.filter(is_available=True)

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