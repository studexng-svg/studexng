# accounts/admin_views.py
"""
Admin-only API views for managing the StudEx platform.

All views require is_staff=True permission.
These endpoints power the Next.js admin dashboard.
"""

from rest_framework import status, generics
from rest_framework.views import APIView
from rest_framework.response import Response
from django.db.models import Q

from studex.permissions import IsAdminUser, IsSuperAdminUser
from accounts.models import User, Profile
from accounts.serializers import UserSerializer
from accounts.analytics import AdminAnalytics


# ============================================
# ANALYTICS & DASHBOARD
# ============================================

class AdminDashboardView(APIView):
    """
    GET /api/admin/dashboard/

    Returns comprehensive analytics for admin dashboard.
    Includes user stats, listing stats, order stats, revenue data.
    """
    permission_classes = [IsAdminUser]

    def get(self, request):
        """
        Get complete dashboard analytics.

        Returns:
            Response: Dashboard data with all statistics
        """
        data = AdminAnalytics.get_dashboard_summary()
        return Response(data, status=status.HTTP_200_OK)


# ============================================
# USER MANAGEMENT
# ============================================

class AdminUserListView(generics.ListAPIView):
    """
    GET /api/admin/users/

    List all users with filtering and search.
    Supports query params: ?search=john&user_type=vendor&is_active=true
    """
    permission_classes = [IsAdminUser]
    serializer_class = UserSerializer

    def get_queryset(self):
        """
        Get filtered queryset based on query params.

        Query Params:
            search: Search in username, email, first_name, last_name
            user_type: Filter by user_type (student/vendor)
            is_active: Filter by active status (true/false)
            is_staff: Filter by staff status (true/false)
        """
        queryset = User.objects.all().select_related('profile').order_by('-date_joined')

        # Search filter
        search = self.request.query_params.get('search', None)
        if search:
            queryset = queryset.filter(
                Q(username__icontains=search) |
                Q(email__icontains=search) |
                Q(first_name__icontains=search) |
                Q(last_name__icontains=search)
            )

        # User type filter
        user_type = self.request.query_params.get('user_type', None)
        if user_type:
            queryset = queryset.filter(user_type=user_type)

        # Active status filter
        is_active = self.request.query_params.get('is_active', None)
        if is_active is not None:
            is_active_bool = is_active.lower() == 'true'
            queryset = queryset.filter(is_active=is_active_bool)

        # Staff status filter
        is_staff = self.request.query_params.get('is_staff', None)
        if is_staff is not None:
            is_staff_bool = is_staff.lower() == 'true'
            queryset = queryset.filter(is_staff=is_staff_bool)

        return queryset


class AdminUserDetailView(APIView):
    """
    GET /api/admin/users/{user_id}/
    PATCH /api/admin/users/{user_id}/
    DELETE /api/admin/users/{user_id}/

    Manage individual user details.
    """
    permission_classes = [IsAdminUser]

    def get(self, request, user_id):
        """Get user details including profile."""
        try:
            user = User.objects.select_related('profile').get(id=user_id)
            serializer = UserSerializer(user)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except User.DoesNotExist:
            return Response(
                {'error': 'User not found'},
                status=status.HTTP_404_NOT_FOUND
            )

    def patch(self, request, user_id):
        """
        Update user details.

        Allowed fields:
            - is_active: Activate/deactivate user
            - is_staff: Grant/revoke admin access
            - user_type: Change user type
            - profile.is_verified_vendor: Verify vendor
        """
        try:
            user = User.objects.get(id=user_id)

            # Update user fields
            if 'is_active' in request.data:
                user.is_active = request.data['is_active']

            if 'is_staff' in request.data:
                # Only superusers can grant/revoke staff status
                if not request.user.is_superuser:
                    return Response(
                        {'error': 'Only superusers can modify staff status'},
                        status=status.HTTP_403_FORBIDDEN
                    )
                user.is_staff = request.data['is_staff']

            if 'user_type' in request.data:
                user.user_type = request.data['user_type']

            user.save()

            # Update profile if needed
            if 'profile' in request.data:
                profile = user.profile
                if 'is_verified_vendor' in request.data['profile']:
                    profile.is_verified_vendor = request.data['profile']['is_verified_vendor']
                    profile.save()

            serializer = UserSerializer(user)
            return Response(serializer.data, status=status.HTTP_200_OK)

        except User.DoesNotExist:
            return Response(
                {'error': 'User not found'},
                status=status.HTTP_404_NOT_FOUND
            )

    def delete(self, request, user_id):
        """
        Delete user (soft delete by deactivating).
        Hard delete requires superuser permission.
        """
        try:
            user = User.objects.get(id=user_id)

            # Check if requesting hard delete
            hard_delete = request.query_params.get('hard_delete', 'false').lower() == 'true'

            if hard_delete:
                if not request.user.is_superuser:
                    return Response(
                        {'error': 'Only superusers can permanently delete users'},
                        status=status.HTTP_403_FORBIDDEN
                    )
                user.delete()
                return Response(
                    {'message': 'User permanently deleted'},
                    status=status.HTTP_204_NO_CONTENT
                )
            else:
                # Soft delete
                user.is_active = False
                user.save()
                return Response(
                    {'message': 'User deactivated'},
                    status=status.HTTP_200_OK
                )

        except User.DoesNotExist:
            return Response(
                {'error': 'User not found'},
                status=status.HTTP_404_NOT_FOUND
            )


# ============================================
# LISTING MANAGEMENT (if services app exists)
# ============================================

try:
    from services.models import Listing
    from services.serializers import ListingSerializer

    class AdminListingListView(generics.ListAPIView):
        """
        GET /api/admin/listings/

        List all listings with filtering.
        Supports: ?search=nails&is_published=true&category=1
        """
        permission_classes = [IsAdminUser]
        serializer_class = ListingSerializer

        def get_queryset(self):
            """Get filtered listings queryset."""
            queryset = Listing.objects.all().select_related(
                'vendor', 'category'
            ).order_by('-created_at')

            # Search
            search = self.request.query_params.get('search', None)
            if search:
                queryset = queryset.filter(
                    Q(title__icontains=search) |
                    Q(description__icontains=search)
                )

            # Available status
            is_available = self.request.query_params.get('is_available', None)
            if is_available is not None:
                is_available_bool = is_available.lower() == 'true'
                queryset = queryset.filter(is_available=is_available_bool)

            # Category filter
            category_id = self.request.query_params.get('category', None)
            if category_id:
                queryset = queryset.filter(category_id=category_id)

            return queryset


    class AdminListingDetailView(APIView):
        """
        GET /api/admin/listings/{listing_id}/
        PATCH /api/admin/listings/{listing_id}/
        DELETE /api/admin/listings/{listing_id}/

        Manage individual listings.
        """
        permission_classes = [IsAdminUser]

        def get(self, request, listing_id):
            """Get listing details."""
            try:
                listing = Listing.objects.select_related('vendor', 'category').get(id=listing_id)
                serializer = ListingSerializer(listing)
                return Response(serializer.data, status=status.HTTP_200_OK)
            except Listing.DoesNotExist:
                return Response(
                    {'error': 'Listing not found'},
                    status=status.HTTP_404_NOT_FOUND
                )

        def patch(self, request, listing_id):
            """
            Update listing (enable/disable availability, modify details).

            Allowed fields:
                - is_available: Enable/disable listing
                - title, description, price: Update details
            """
            try:
                listing = Listing.objects.get(id=listing_id)

                # Update fields
                if 'is_available' in request.data:
                    listing.is_available = request.data['is_available']

                if 'title' in request.data:
                    listing.title = request.data['title']

                if 'description' in request.data:
                    listing.description = request.data['description']

                if 'price' in request.data:
                    listing.price = request.data['price']

                listing.save()

                serializer = ListingSerializer(listing)
                return Response(serializer.data, status=status.HTTP_200_OK)

            except Listing.DoesNotExist:
                return Response(
                    {'error': 'Listing not found'},
                    status=status.HTTP_404_NOT_FOUND
                )

        def delete(self, request, listing_id):
            """Delete listing."""
            try:
                listing = Listing.objects.get(id=listing_id)
                listing.delete()
                return Response(
                    {'message': 'Listing deleted'},
                    status=status.HTTP_204_NO_CONTENT
                )
            except Listing.DoesNotExist:
                return Response(
                    {'error': 'Listing not found'},
                    status=status.HTTP_404_NOT_FOUND
                )

except ImportError:
    # Services app not available, skip listing views
    AdminListingListView = None
    AdminListingDetailView = None


# ============================================
# ORDER MANAGEMENT (if orders app exists)
# ============================================

try:
    from orders.models import Order
    from orders.serializers import OrderSerializer

    class AdminOrderListView(generics.ListAPIView):
        """
        GET /api/admin/orders/

        List all orders with filtering.
        """
        permission_classes = [IsAdminUser]
        serializer_class = OrderSerializer

        def get_queryset(self):
            """Get filtered orders queryset."""
            queryset = Order.objects.all().select_related(
                'buyer', 'listing'
            ).order_by('-created_at')

            # Status filter
            order_status = self.request.query_params.get('status', None)
            if order_status:
                queryset = queryset.filter(status=order_status)

            return queryset


    class AdminOrderDetailView(APIView):
        """
        PATCH /api/admin/orders/{order_id}/

        Update order status.
        """
        permission_classes = [IsAdminUser]

        def patch(self, request, order_id):
            """Update order status."""
            try:
                order = Order.objects.get(id=order_id)

                if 'status' in request.data:
                    order.status = request.data['status']
                    order.save()

                serializer = OrderSerializer(order)
                return Response(serializer.data, status=status.HTTP_200_OK)

            except Order.DoesNotExist:
                return Response(
                    {'error': 'Order not found'},
                    status=status.HTTP_404_NOT_FOUND
                )

except ImportError:
    # Services app not available, skip order views
    AdminOrderListView = None
    AdminOrderDetailView = None
