# accounts/admin_views.py
"""
Admin-only API views for managing the StudEx platform.

All views require is_staff=True permission.
These endpoints power the Next.js admin dashboard.
"""

from rest_framework import status, generics
from rest_framework.views import APIView
from rest_framework.response import Response
from django.db.models import Q, Count, Sum, Avg
from django.conf import settings
from django.core.cache import cache

from studex.permissions import IsAdminUser, IsSuperAdminUser
from studex.pagination import AdminPagination
from accounts.models import User, Profile
from accounts.serializers import UserSerializer
from accounts.analytics import AdminAnalytics


# ============================================
# ANALYTICS & DASHBOARD
# ============================================

class AdminDashboardView(APIView):
    """GET /api/admin/dashboard/ — aggregate stats for admin dashboard."""
    permission_classes = [IsAdminUser]

    def get(self, request):
        cached = cache.get('admin_dashboard')
        if cached is not None:
            return Response(cached)
        try:
            data = AdminAnalytics.get_dashboard_summary()
            cache.set('admin_dashboard', data, 30)
            return Response(data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class AdminAnalyticsTimeSeriesView(APIView):
    """
    GET /api/admin/analytics/timeseries/
    Returns daily counts for the last N days (default 30) for charts.
    """
    permission_classes = [IsAdminUser]

    def get(self, request):
        from django.utils import timezone as tz
        from django.db.models.functions import TruncDate
        from datetime import timedelta
        try:
            days = min(int(request.query_params.get('days', 30)), 90)
        except (ValueError, TypeError):
            days = 30

        cache_key = f'admin_analytics_{days}'
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)

        try:
            today = tz.now().date()
            start = today - timedelta(days=days - 1)
            date_range = [start + timedelta(days=i) for i in range(days)]

            # Users registered per day (PostgreSQL-safe via TruncDate)
            from accounts.models import User as UserModel
            user_qs = (
                UserModel.objects
                .filter(date_joined__date__gte=start)
                .annotate(day=TruncDate('date_joined'))
                .values('day')
                .annotate(count=Count('id'))
                .order_by('day')
            )
            user_by_day = {row['day']: row['count'] for row in user_qs}

            # Daily active users (DAU) — users seen each day
            dau_qs = (
                UserModel.objects
                .filter(last_seen__date__gte=start, last_seen__isnull=False)
                .annotate(day=TruncDate('last_seen'))
                .values('day')
                .annotate(count=Count('id'))
                .order_by('day')
            )
            dau_by_day = {row['day']: row['count'] for row in dau_qs}

            # Orders per day + revenue per day
            order_by_day = {}
            revenue_by_day = {}
            try:
                from orders.models import Order as OrderModel
                order_qs = (
                    OrderModel.objects
                    .filter(created_at__date__gte=start)
                    .annotate(day=TruncDate('created_at'))
                    .values('day')
                    .annotate(count=Count('id'), rev=Sum('amount'))
                    .order_by('day')
                )
                for row in order_qs:
                    order_by_day[row['day']] = row['count']
                    revenue_by_day[row['day']] = float(row['rev'] or 0)
            except Exception:
                pass

            series = []
            for d in date_range:
                day_str = d.isoformat()
                series.append({
                    'date': day_str,
                    'label': d.strftime('%b %d'),
                    'new_users': user_by_day.get(d, 0),
                    'active_users': dau_by_day.get(d, 0),
                    'orders': order_by_day.get(d, 0),
                    'revenue': revenue_by_day.get(d, 0.0),
                })

            # Order status distribution
            status_dist = {}
            try:
                from orders.models import Order as OrderModel
                for row in OrderModel.objects.values('status').annotate(count=Count('id')):
                    status_dist[row['status']] = row['count']
            except Exception:
                pass

            result = {'series': series, 'status_distribution': status_dist}
            cache.set(cache_key, result, 300)  # 5 minutes
            return Response(result)
        except Exception as e:
            return Response({
                'series': [],
                'status_distribution': {},
                'error': str(e),
            })


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
    pagination_class = AdminPagination

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

        # Verification type filter — 'nin' = non-students, 'matric' = enrolled students
        verification_type = self.request.query_params.get('verification_type', None)
        if verification_type == 'nin':
            queryset = queryset.filter(nin__isnull=False).exclude(nin='')
        elif verification_type == 'matric':
            queryset = queryset.filter(matric_number__isnull=False).exclude(matric_number='')

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

        # Campus / school filter — PAU includes null/blank (legacy users)
        school = self.request.query_params.get('school', None)
        if school:
            school = school.lower()
            queryset = queryset.filter(school__iexact=school)

        return queryset

    def list(self, request, *args, **kwargs):
        p = request.query_params
        cache_key = f'admin_users_{p.get("search","")}_{p.get("user_type","")}_{p.get("is_active","")}_{p.get("school","")}_{p.get("verification_type","")}_{p.get("page","1")}'
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)
        response = super().list(request, *args, **kwargs)
        cache.set(cache_key, response.data, 30)
        return response


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
            data = serializer.data
            data['vendor'] = self._serialize_vendor(user)
            return Response(data, status=status.HTTP_200_OK)
        except User.DoesNotExist:
            return Response(
                {'error': 'User not found'},
                status=status.HTTP_404_NOT_FOUND
            )

    def _serialize_vendor(self, user):
        """
        Delivery fee / free-delivery-quota block for the admin dashboard.
        None when the user has no accounts.models.Vendor row at all (never
        approved as a vendor) — distinct from a Vendor row that simply has no
        fee configured (delivery_fee=0), which returns real zeros below.
        Read-only lookup — never creates a Vendor row as a side effect of GET.
        """
        from accounts.models import Vendor
        from orders.models import Order
        try:
            v = user.vendor
        except Vendor.DoesNotExist:
            return None

        used = None
        remaining = None
        if v.free_delivery_quota is not None:
            used = Order.objects.filter(
                listing__vendor=user, delivery_slot__isnull=False,
            ).exclude(status='cancelled').count()
            remaining = max(v.free_delivery_quota - used, 0)

        return {
            'delivery_fee': str(v.delivery_fee),
            'free_delivery_quota': v.free_delivery_quota,
            'free_deliveries_used': used,
            'free_deliveries_remaining': remaining,
            'delivery_paused': v.delivery_paused,
        }

    def patch(self, request, user_id):
        """
        Update user details.

        Allowed fields:
            - is_active: Activate/deactivate user
            - is_staff: Grant/revoke admin access
            - user_type: Change user type
            - profile.is_verified_vendor: Verify vendor
            - vendor.delivery_fee / vendor.free_delivery_quota: Delivery fee
              and "first N deliveries free" promo quota (see delivery.fees).
              Only meaningful for a vendor using batched delivery.
            - vendor.delivery_paused: Kill-switch — true means checkout shows
              no delivery slots for this vendor at all, without touching any
              individual DeliverySlot row (see delivery.capacity).
        """
        try:
            user = User.objects.get(id=user_id)

            was_vendor = user.user_type == 'vendor'

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

            if 'school' in request.data:
                # The only "coverage area" this codebase's location model
                # supports (services.models.Listing.campus / delivery.models.
                # CampusPickupPoint.CAMPUS_CHOICES use the same 3 values) —
                # this is what delivery.assignment._pick_least_busy_rider
                # filters riders by, so setting it here is literally "which
                # campus can this rider be auto-assigned orders from."
                new_school = (request.data['school'] or '').strip().lower()
                if new_school not in ('pau', 'futo', 'imsu'):
                    return Response(
                        {'error': "school must be one of: pau, futo, imsu"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                user.school = new_school

            if 'user_type' in request.data:
                new_type = request.data['user_type']
                if new_type == 'vendor' and not user.is_verified_vendor:
                    from accounts.models import SellerApplication
                    has_approved = SellerApplication.objects.filter(
                        user=user, status='approved'
                    ).exists()
                    if not has_approved:
                        return Response(
                            {'error': 'User must have an approved seller application before being promoted to vendor.'},
                            status=status.HTTP_400_BAD_REQUEST,
                        )
                user.user_type = new_type

            user.save()

            # Update vendor verification flag (lives on User, not Profile)
            if 'profile' in request.data:
                if 'is_verified_vendor' in request.data['profile']:
                    user.is_verified_vendor = request.data['profile']['is_verified_vendor']
                    user.save()

            # Update delivery fee / free-delivery-quota (lives on the
            # dedicated Vendor row, not User or Profile)
            if 'vendor' in request.data:
                from accounts.models import Vendor
                from decimal import Decimal, InvalidOperation

                vendor_data = request.data['vendor']

                if 'delivery_fee' in vendor_data:
                    try:
                        fee = Decimal(str(vendor_data['delivery_fee']))
                    except (InvalidOperation, TypeError):
                        return Response(
                            {'error': 'delivery_fee must be a number'},
                            status=status.HTTP_400_BAD_REQUEST
                        )
                    if fee < 0:
                        return Response(
                            {'error': 'delivery_fee cannot be negative'},
                            status=status.HTTP_400_BAD_REQUEST
                        )

                if 'free_delivery_quota' in vendor_data:
                    quota = vendor_data['free_delivery_quota']
                    if quota is not None:
                        try:
                            quota = int(quota)
                        except (TypeError, ValueError):
                            return Response(
                                {'error': 'free_delivery_quota must be an integer or null'},
                                status=status.HTTP_400_BAD_REQUEST
                            )
                        if quota < 0:
                            return Response(
                                {'error': 'free_delivery_quota cannot be negative'},
                                status=status.HTTP_400_BAD_REQUEST
                            )

                if 'delivery_paused' in vendor_data and not isinstance(vendor_data['delivery_paused'], bool):
                    return Response(
                        {'error': 'delivery_paused must be a boolean'},
                        status=status.HTTP_400_BAD_REQUEST
                    )

                v, _ = Vendor.objects.get_or_create(user=user)
                if 'delivery_fee' in vendor_data:
                    v.delivery_fee = fee
                if 'free_delivery_quota' in vendor_data:
                    v.free_delivery_quota = quota
                if 'delivery_paused' in vendor_data:
                    v.delivery_paused = vendor_data['delivery_paused']
                v.save()

            serializer = UserSerializer(user)
            data = serializer.data
            data['vendor'] = self._serialize_vendor(user)
            return Response(data, status=status.HTTP_200_OK)

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
        pagination_class = AdminPagination

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

            # Campus filter
            campus = self.request.query_params.get('campus', None)
            if campus:
                queryset = queryset.filter(campus__iexact=campus)

            return queryset

        def list(self, request, *args, **kwargs):
            p = request.query_params
            cache_key = f'admin_listings_{p.get("search","")}_{p.get("is_available","")}_{p.get("category","")}_{p.get("campus","")}_{p.get("page","1")}'
            cached = cache.get(cache_key)
            if cached is not None:
                return Response(cached)
            response = super().list(request, *args, **kwargs)
            cache.set(cache_key, response.data, 30)
            return response


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
                - title, description, payout_amount: Update details

            `price` is never set directly here — it's always derived from
            payout_amount via payments.pricing.calculate_final_price, the same
            rule the vendor-facing API and Django admin both enforce. Letting
            an admin edit price directly desyncs it from payout_amount and
            silently drops the platform fee.
            """
            try:
                listing = Listing.objects.get(id=listing_id)

                # Track availability change before saving
                was_available = listing.is_available
                becoming_available = False

                # Update fields
                if 'is_available' in request.data:
                    listing.is_available = request.data['is_available']
                    becoming_available = not was_available and listing.is_available

                if 'title' in request.data:
                    listing.title = request.data['title']

                if 'description' in request.data:
                    listing.description = request.data['description']

                if 'payout_amount' in request.data:
                    from decimal import Decimal, InvalidOperation
                    from payments.pricing import calculate_final_price
                    try:
                        payout_amount = Decimal(str(request.data['payout_amount']))
                    except InvalidOperation:
                        return Response({'error': 'payout_amount must be a number.'}, status=status.HTTP_400_BAD_REQUEST)
                    if payout_amount <= 0:
                        return Response({'error': 'payout_amount must be greater than zero.'}, status=status.HTTP_400_BAD_REQUEST)
                    listing.payout_amount = payout_amount
                    from payments.settlement import get_vendor_type
                    listing.price = calculate_final_price(
                        payout_amount, campus=listing.campus, vendor_type=get_vendor_type(listing.vendor),
                    )

                listing.save()

                # The home page's listings list is cached per campus for 60s
                # (services.views.ListingViewSet.list) — vendor-triggered
                # creates/updates already invalidate it (perform_create/
                # perform_update) but this admin endpoint didn't, so toggling
                # is_available here left a stale cached copy on the home page
                # until the TTL happened to expire.
                if 'is_available' in request.data:
                    from services.contracts import invalidate_listing_cache
                    invalidate_listing_cache(listing.campus)

                # Notify vendor when listing goes live for the first time
                if becoming_available:
                    try:
                        from studex.notifications import notify_vendor_listing_approved
                        notify_vendor_listing_approved(listing)
                    except Exception:
                        pass

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

    class AdminListingBulkUpdateCategoryView(APIView):
        """
        PATCH /api/admin/listings/bulk-update-category/
        Body: { listing_ids: [1, 2, 3], category_id: 5 }
        Updates all specified listings to the new category.
        Returns { updated: count, category_name: string }
        """
        permission_classes = [IsAdminUser]

        def patch(self, request):
            from services.models import Category
            listing_ids = request.data.get('listing_ids', [])
            category_id = request.data.get('category_id')

            if not listing_ids:
                return Response({'error': 'listing_ids is required'}, status=status.HTTP_400_BAD_REQUEST)
            if not category_id:
                return Response({'error': 'category_id is required'}, status=status.HTTP_400_BAD_REQUEST)

            try:
                category = Category.objects.get(id=category_id)
            except Category.DoesNotExist:
                return Response({'error': 'Category not found'}, status=status.HTTP_404_NOT_FOUND)

            updated = Listing.objects.filter(id__in=listing_ids).update(category=category)
            return Response({'updated': updated, 'category_name': category.title})

except ImportError:
    # Services app not available, skip listing views
    AdminListingListView = None
    AdminListingDetailView = None
    AdminListingBulkUpdateCategoryView = None


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
        pagination_class = AdminPagination

        def get_queryset(self):
            """Get filtered orders queryset."""
            queryset = Order.objects.all().select_related(
                'buyer', 'listing'
            ).order_by('-created_at')

            # Status filter
            order_status = self.request.query_params.get('status', None)
            if order_status:
                queryset = queryset.filter(status=order_status)

            # Campus filter via listing
            campus = self.request.query_params.get('campus', None)
            if campus:
                queryset = queryset.filter(listing__campus__iexact=campus)

            return queryset

        def list(self, request, *args, **kwargs):
            p = request.query_params
            cache_key = f'admin_orders_{p.get("status","")}_{p.get("campus","")}_{p.get("page","1")}'
            cached = cache.get(cache_key)
            if cached is not None:
                return Response(cached)
            response = super().list(request, *args, **kwargs)
            cache.set(cache_key, response.data, 30)
            return response


    class AdminOrderDetailView(APIView):
        """
        GET  /api/admin/orders/{order_id}/
        PATCH /api/admin/orders/{order_id}/
        """
        permission_classes = [IsAdminUser]

        def get(self, request, order_id):
            try:
                order = Order.objects.select_related('buyer', 'listing__vendor', 'listing__category').get(id=order_id)
                serializer = OrderSerializer(order)
                data = serializer.data
                data['seller'] = order.listing.vendor.username if order.listing else None
                data['seller_id'] = order.listing.vendor.id if order.listing else None
                data['paid_at'] = order.paid_at.isoformat() if order.paid_at else None
                data['seller_completed_at'] = order.seller_completed_at.isoformat() if order.seller_completed_at else None
                data['buyer_confirmed_at'] = order.buyer_confirmed_at.isoformat() if order.buyer_confirmed_at else None

                # Payment breakdown — what the buyer actually paid vs. what the
                # vendor is owed vs. StudEx's cut. order.amount is buyer-paid
                # only; PaymentTransaction (matched by the same `reference`
                # every checkout path stamps on both rows — see e.g. the
                # payout-trigger lookup a few lines below in patch()) is the
                # one place seller_amount/platform_amount already live, computed
                # once at checkout by payments.pricing.split_settlement. Never
                # re-derive this from listing.price here — that's exactly the
                # fee-inclusive-vs-payout mixup pricing.py's apply_vendor_discount
                # docstring warns about.
                from payments.models import PaymentTransaction
                txn = PaymentTransaction.objects.filter(reference=order.reference).order_by('-created_at').first()
                if txn:
                    data['buyer_paid'] = str(txn.amount)
                    data['vendor_gets'] = str(txn.seller_amount)
                    data['platform_fee'] = str(txn.platform_amount)
                    data['payment_status'] = txn.status
                    data['vendor_payout_status'] = txn.transfer_status
                else:
                    data['buyer_paid'] = None
                    data['vendor_gets'] = None
                    data['platform_fee'] = None
                    data['payment_status'] = None
                    data['vendor_payout_status'] = None
                return Response(data, status=status.HTTP_200_OK)
            except Order.DoesNotExist:
                return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)

        def patch(self, request, order_id):
            try:
                order = Order.objects.get(id=order_id)
                new_status = request.data.get('status')
                if new_status:
                    old_status = order.status
                    order.status = new_status
                    if new_status == 'completed':
                        from django.utils import timezone as _tz
                        order.buyer_confirmed_at = _tz.now()
                    if old_status == 'pending_bank_transfer' and new_status == 'paid':
                        from django.utils import timezone as _tz
                        order.paid_at = _tz.now()
                    order.save()

                    if new_status == 'completed':
                        # Trigger vendor payout via Transfer API
                        try:
                            from payments.models import PaymentTransaction
                            from payments.views import trigger_vendor_payout
                            txn = PaymentTransaction.objects.filter(
                                reference=order.reference, status='success'
                            ).first()
                            if txn and not txn.transfer_reference:
                                trigger_vendor_payout(txn, order.listing.title)
                        except Exception as pe:
                            import logging as _log
                            _log.getLogger(__name__).warning(
                                f"Admin payout trigger failed for order {order.id}: {pe}"
                            )
                        # Notify vendor
                        try:
                            from accounts.utils import send_notification
                            send_notification(
                                recipient=order.listing.vendor,
                                notification_type='order_confirmed',
                                title=f'✅ Order Confirmed — {order.listing.title}',
                                message=(
                                    f'An admin has confirmed the order for '
                                    f'"{order.listing.title}". Your payout is being processed.'
                                ),
                                action_url='/vendor/dashboard',
                                send_email=False,
                            )
                        except Exception:
                            pass

                    # Manual bank-transfer settlement (temporary path while
                    # Payout on Demand isn't approved — see payments.models.
                    # BankTransferSettings). Admin has personally checked
                    # their bank account and is confirming the buyer's
                    # transfer actually arrived, or that it never did.
                    if old_status == 'pending_bank_transfer' and new_status == 'paid':
                        import logging as _log
                        try:
                            from payments.models import PaymentTransaction
                            PaymentTransaction.objects.filter(reference=order.reference).update(status='success')
                        except Exception as pe:
                            _log.getLogger(__name__).warning(
                                f"Bank transfer confirm: txn update failed for order {order.id}: {pe}")

                        if order.delivery_slot_id:
                            try:
                                from delivery.assignment import auto_assign_rider
                                auto_assign_rider(order)
                            except Exception as e:
                                _log.getLogger(__name__).warning(
                                    f"Bank transfer confirm: auto_assign_rider failed for order {order.id}: {e}")

                        try:
                            from accounts.utils import send_notification
                            from payments.models import PaymentTransaction
                            txn = PaymentTransaction.objects.filter(reference=order.reference).first()
                            payout_note = (
                                f'Your payout of ₦{txn.seller_amount:,.0f} will be paid to you manually — '
                                f'Paystack Payout on Demand isn\'t enabled yet.'
                                if txn else 'Please prepare the order.'
                            )
                            send_notification(
                                recipient=order.listing.vendor, notification_type='new_order',
                                title=f'New Order — {order.items.count()} item(s)',
                                message=f"{order.buyer.username}'s payment has been confirmed. {payout_note}",
                                action_url='/vendor/dashboard', send_email=False,
                            )
                            send_notification(
                                recipient=order.buyer, notification_type='order_update',
                                title='Payment Confirmed',
                                message=(
                                    f'Your bank transfer for order #{order.reference} has been confirmed. '
                                    f'The vendor has been notified and is preparing your order.'
                                ),
                                action_url=f'/account/orders/{order.id}',
                            )
                        except Exception:
                            pass

                    elif old_status == 'pending_bank_transfer' and new_status == 'cancelled':
                        import logging as _log
                        try:
                            for item in order.items.select_related('listing').all():
                                item.listing.restock(item.quantity)
                        except Exception as pe:
                            _log.getLogger(__name__).warning(
                                f"Bank transfer reject: restock failed for order {order.id}: {pe}")

                        try:
                            from payments.models import PaymentTransaction
                            PaymentTransaction.objects.filter(reference=order.reference).update(status='failed')
                        except Exception:
                            pass

                        try:
                            from accounts.utils import send_notification
                            send_notification(
                                recipient=order.buyer, notification_type='order_update',
                                title='Order Cancelled — Transfer Not Received',
                                message=(
                                    f"We didn't receive your bank transfer for order #{order.reference}, so "
                                    f"it has been cancelled. If you did send the money, please contact "
                                    f"support with your proof of payment."
                                ),
                                action_url='/account/orders',
                            )
                        except Exception:
                            pass

                serializer = OrderSerializer(order)
                return Response(serializer.data, status=status.HTTP_200_OK)
            except Order.DoesNotExist:
                return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)

except ImportError:
    AdminOrderListView = None
    AdminOrderDetailView = None


# ============================================
# MANUAL REFUNDS (temporary bank-transfer settlement path — see
# payments.models.BankTransferSettings / ManualRefund). Powers the Next.js
# admin dashboard directly — in-app notifications for these link here
# (/admin/manual-refunds/{id}), not to Django Admin, since a client-side
# Next.js route push can't navigate into a different app (Django Admin is
# a separate origin/session entirely) — that mismatch is exactly what was
# 404ing before this existed.
# ============================================

def _serialize_manual_refund(r):
    return {
        'id': r.id,
        'order_id': r.order_id,
        'order_reference': r.order.reference,
        'buyer_username': r.buyer.username,
        'amount': str(r.amount),
        'reason': r.reason,
        'status': r.status,
        'item_title': r.order_item.listing.title if r.order_item_id else None,
        'buyer_account_name': r.buyer_account_name,
        'buyer_account_number': r.buyer_account_number,
        'buyer_bank_name': r.buyer_bank_name,
        'created_at': r.created_at.isoformat(),
        'resolved_at': r.resolved_at.isoformat() if r.resolved_at else None,
    }


class AdminManualRefundListView(generics.ListAPIView):
    """GET /api/admin/manual-refunds/ — newest first, optional ?status= filter."""
    permission_classes = [IsAdminUser]
    pagination_class = AdminPagination

    def get_queryset(self):
        from payments.models import ManualRefund
        qs = ManualRefund.objects.select_related('order', 'buyer', 'order_item__listing').order_by('-created_at')
        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param)
        return qs

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(queryset)
        data = [_serialize_manual_refund(r) for r in (page if page is not None else queryset)]
        if page is not None:
            return self.get_paginated_response(data)
        return Response(data)


class AdminManualRefundDetailView(APIView):
    """
    GET   /api/admin/manual-refunds/{id}/
    PATCH /api/admin/manual-refunds/{id}/ — body: {"status": "completed"}
    marks it refunded (money already sent manually) and notifies the buyer.
    """
    permission_classes = [IsAdminUser]

    def get(self, request, refund_id):
        from payments.models import ManualRefund
        try:
            r = ManualRefund.objects.select_related('order', 'buyer', 'order_item__listing').get(id=refund_id)
        except ManualRefund.DoesNotExist:
            return Response({'error': 'Refund not found'}, status=status.HTTP_404_NOT_FOUND)
        return Response(_serialize_manual_refund(r))

    def patch(self, request, refund_id):
        from payments.models import ManualRefund
        try:
            r = ManualRefund.objects.select_related('order', 'buyer', 'order_item__listing').get(id=refund_id)
        except ManualRefund.DoesNotExist:
            return Response({'error': 'Refund not found'}, status=status.HTTP_404_NOT_FOUND)

        new_status = request.data.get('status')
        if new_status == 'completed' and r.status != 'completed':
            from django.utils import timezone as _tz
            r.status = 'completed'
            r.resolved_at = _tz.now()
            r.resolved_by = request.user
            r.save(update_fields=['status', 'resolved_at', 'resolved_by'])
            try:
                from accounts.utils import send_notification
                send_notification(
                    recipient=r.buyer, notification_type='order_update',
                    title='Refund Sent',
                    message=f'₦{r.amount:,.2f} has been sent to {r.buyer_account_name} ({r.buyer_bank_name}).',
                    action_url=f'/account/refunds/{r.id}',
                )
            except Exception:
                pass

        return Response(_serialize_manual_refund(r))


class AdminNotifyUserView(APIView):
    """POST /api/admin/users/<user_id>/notify/ — send a notification to any user."""
    permission_classes = [IsAdminUser]

    def post(self, request, user_id):
        try:
            target_user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

        title = (request.data.get('title') or '').strip()
        message = (request.data.get('message') or '').strip()
        if not title or not message:
            return Response({'error': 'title and message are required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            from accounts.utils import send_notification
            send_notification(
                recipient=target_user,
                notification_type='admin_message',
                title=title,
                message=message,
                action_url='',
            )
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        return Response({'status': 'sent'})


class AdminPromoteToRiderView(APIView):
    """
    POST /api/admin/users/<user_id>/make-rider/
    PATCH body: {} — promotes the user to rider and sends email.
    DELETE — removes the rider role (reverts to student).
    """
    permission_classes = [IsAdminUser]

    def post(self, request, user_id):
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

        if user.user_type == 'rider':
            return Response({'error': 'User is already a rider'}, status=status.HTTP_400_BAD_REQUEST)

        user.user_type = 'rider'
        user.save(update_fields=['user_type'])

        # Send email notification
        try:
            from django.core.mail import send_mail
            from django.conf import settings as django_settings
            send_mail(
                subject='You have been assigned as a StudEx Rider!',
                message=(
                    f'Hi {user.username},\n\n'
                    f'You have been assigned as a delivery rider on StudEx. '
                    f'Log in and visit /rider to see and manage your delivery assignments.\n\n'
                    f'— The StudEx Team'
                ),
                from_email=getattr(django_settings, 'DEFAULT_FROM_EMAIL', 'noreply@studex.ng'),
                recipient_list=[user.email],
                fail_silently=True,
            )
        except Exception:
            pass

        # In-app notification
        try:
            from accounts.utils import send_notification
            send_notification(
                recipient=user,
                notification_type='admin_message',
                title='You are now a StudEx Rider!',
                message='Your account has been upgraded. Visit the Rider Dashboard to manage deliveries.',
                action_url='/rider',
                send_email=False,
            )
        except Exception:
            pass

        from accounts.serializers import UserSerializer
        return Response(UserSerializer(user).data)

    def delete(self, request, user_id):
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

        if user.user_type != 'rider':
            return Response({'error': 'User is not a rider'}, status=status.HTTP_400_BAD_REQUEST)

        user.user_type = 'student'
        user.save(update_fields=['user_type'])

        from accounts.serializers import UserSerializer
        return Response(UserSerializer(user).data)


# ============================================
# DISPUTE MANAGEMENT
# ============================================

try:
    from orders.models import Dispute
    from orders.serializers import DisputeSerializer

    class AdminDisputeListView(generics.ListAPIView):
        """GET /api/admin/disputes/ — list all disputes with optional ?status= filter."""
        permission_classes = [IsAdminUser]
        serializer_class = DisputeSerializer

        def get_queryset(self):
            qs = Dispute.objects.all().select_related(
                'order', 'filer', 'assigned_to', 'resolved_by'
            ).order_by('-created_at')
            disp_status = self.request.query_params.get('status')
            if disp_status:
                qs = qs.filter(status=disp_status)
            search = self.request.query_params.get('search')
            if search:
                qs = qs.filter(
                    Q(order__reference__icontains=search) |
                    Q(filer__username__icontains=search) |
                    Q(complaint__icontains=search)
                )
            campus = self.request.query_params.get('campus')
            if campus:
                qs = qs.filter(order__listing__campus__iexact=campus)
            return qs

        def list(self, request, *args, **kwargs):
            p = request.query_params
            cache_key = f'admin_disputes_{p.get("status","")}_{p.get("search","")}_{p.get("campus","")}_{p.get("page","1")}'
            cached = cache.get(cache_key)
            if cached is not None:
                return Response(cached)
            response = super().list(request, *args, **kwargs)
            cache.set(cache_key, response.data, 30)
            return response

    class AdminDisputeDetailView(APIView):
        """
        GET   /api/admin/disputes/{id}/
        PATCH /api/admin/disputes/{id}/  — update status, resolution, admin_decision
        POST  /api/admin/disputes/{id}/resolve/ — resolve dispute
        """
        permission_classes = [IsAdminUser]

        def _get(self, dispute_id):
            return Dispute.objects.select_related(
                'order__buyer', 'order__listing__vendor', 'filer', 'assigned_to', 'resolved_by'
            ).get(id=dispute_id)

        def get(self, request, dispute_id):
            try:
                dispute = self._get(dispute_id)
                s = DisputeSerializer(dispute)
                data = s.data
                data['order_buyer'] = dispute.order.buyer.username if dispute.order else None
                data['order_seller'] = dispute.order.listing.vendor.username if (dispute.order and dispute.order.listing) else None
                data['order_amount'] = str(dispute.order.amount) if dispute.order else None
                return Response(data)
            except Dispute.DoesNotExist:
                return Response({'error': 'Dispute not found'}, status=status.HTTP_404_NOT_FOUND)

        def patch(self, request, dispute_id):
            try:
                dispute = self._get(dispute_id)
                allowed = ('status', 'resolution', 'admin_decision')
                for field in allowed:
                    if field in request.data:
                        setattr(dispute, field, request.data[field])

                new_status = request.data.get('status')
                resolution = dispute.resolution  # may have just been set above

                order = dispute.order

                def _dn(recipient, ntype, title, message, url=""):
                    try:
                        from accounts.utils import send_notification
                        send_notification(recipient=recipient, notification_type=ntype,
                                          title=title, message=message, action_url=url)
                    except Exception:
                        pass

                def _cancel_active_delivery(reason):
                    # A dispute can resolve while a rider is still mid-delivery
                    # (assigned/picked_up/at_pickup_point) — without this, the
                    # rider's dashboard kept showing "Mark as Picked Up" for an
                    # order that's already been refunded/closed out, since
                    # RiderUpdateStatusView's state machine has no idea a
                    # dispute happened. Never touches an already-completed
                    # delivery (the buyer already has their item in hand).
                    try:
                        from delivery.models import DeliveryAssignment
                        assignment = DeliveryAssignment.objects.select_related('rider').filter(
                            order=order,
                        ).exclude(status__in=['completed', 'cancelled']).first()
                        if assignment:
                            assignment.status = 'cancelled'
                            assignment.save(update_fields=['status'])
                            if assignment.rider:
                                _dn(assignment.rider, 'order_update',
                                    'Delivery Cancelled',
                                    f'Order #{order.reference} ({order.listing.title}) was cancelled — {reason}. '
                                    f'No pickup or delivery is needed for this order.',
                                    '/rider')
                    except Exception as de:
                        import logging as _log
                        _log.getLogger(__name__).warning(
                            f"Dispute resolution: failed to cancel delivery assignment for order {order.id}: {de}")

                if new_status == 'under_review':
                    listing_title = order.listing.title if order and order.listing else 'your order'
                    _dn(order.buyer, 'order_update',
                        f'Dispute Under Review — {listing_title}',
                        f'Your dispute for "{listing_title}" is now being reviewed by our support team. We will notify you once a decision is made.',
                        f'/account/orders/{order.id}')
                    _dn(order.listing.vendor, 'order_update',
                        f'Dispute Under Review — {listing_title}',
                        f'The dispute on "{listing_title}" is now under review by our support team. We will notify you of the outcome.',
                        '/vendor/dashboard/disputes')

                if new_status == 'resolved':
                    from django.utils import timezone as tz
                    dispute.resolved_at = tz.now()
                    dispute.resolved_by = request.user

                    if resolution == 'release_to_provider':
                        try:
                            from payments.models import PaymentTransaction
                            from payments.views import trigger_vendor_payout
                            txn = PaymentTransaction.objects.filter(
                                reference=order.reference, status='success'
                            ).first()
                            if txn and not txn.transfer_reference:
                                trigger_vendor_payout(txn, order.listing.title)
                        except Exception as pe:
                            import logging as _log
                            _log.getLogger(__name__).warning(
                                f"Dispute payout failed for order {order.id}: {pe}")
                        order.status = 'completed'
                        order.save()
                        _cancel_active_delivery('this dispute was resolved and the order marked complete')
                        _dn(order.listing.vendor, 'order_confirmed',
                            f'✅ Dispute Resolved — {order.listing.title}',
                            f'The dispute for "{order.listing.title}" was resolved in your favour. Your payment is being processed.',
                            '/vendor/dashboard')
                        _dn(order.buyer, 'order_update',
                            f'Dispute Resolved — {order.listing.title}',
                            f'The dispute for "{order.listing.title}" has been reviewed. Payment has been released to the vendor.',
                            f'/account/orders/{order.id}')

                    elif resolution == 'refund_customer':
                        try:
                            from payments.views import refund_paystack_transaction
                            from payments.models import PaymentTransaction
                            import logging as _log
                            txn = PaymentTransaction.objects.filter(
                                reference=order.reference, status='success'
                            ).first()

                            if txn is None:
                                # No PaymentTransaction on record — cannot auto-refund.
                                # Admin must process manually via Paystack dashboard.
                                _log.getLogger(__name__).error(
                                    f"Dispute {dispute_id}: no PaymentTransaction for order "
                                    f"{order.id} (ref {order.reference}) — manual refund required."
                                )
                                return Response({
                                    'error': (
                                        'No payment record found for this order. '
                                        'Refund the buyer manually via the Paystack dashboard, '
                                        'then mark this dispute as resolved.'
                                    )
                                }, status=status.HTTP_404_NOT_FOUND)

                            # Guard: vendor already received a bank transfer.
                            # Refunding the buyer here would mean StudEx absorbs both sides.
                            if txn.transfer_reference:
                                _log.getLogger(__name__).error(
                                    f"Dispute {dispute_id}: refund blocked — vendor transfer "
                                    f"{txn.transfer_reference} already sent for order {order.id}."
                                )
                                return Response({
                                    'error': (
                                        f'Cannot auto-refund: vendor payout {txn.transfer_reference} '
                                        'was already sent. Resolve this manually.'
                                    )
                                }, status=status.HTTP_409_CONFLICT)

                            credits_only = txn.amount == 0
                            if not credits_only:
                                amount_kobo = int(txn.amount * 100)
                                ok = refund_paystack_transaction(order.reference, amount_kobo)
                                if not ok:
                                    _log.getLogger(__name__).warning(
                                        f"Dispute refund: Paystack rejected refund for order {order.id}")
                                    return Response(
                                        {'error': 'Paystack refund request failed. Retry or process manually.'},
                                        status=status.HTTP_502_BAD_GATEWAY
                                    )
                                txn.status = 'refunded'
                                txn.save()

                            order.status = 'cancelled'
                            order.save()
                            _cancel_active_delivery('the buyer was refunded')

                            # Notify only after a confirmed successful outcome.
                            if credits_only:
                                _dn(order.buyer, 'order_update',
                                    '✅ Dispute Resolved — Order Cancelled',
                                    f'Your dispute for "{order.listing.title}" was resolved in your favour. Your order has been cancelled.',
                                    f'/account/orders/{order.id}')
                            else:
                                _dn(order.buyer, 'order_update',
                                    '✅ Dispute Resolved — Refund Initiated',
                                    f'Your dispute for "{order.listing.title}" was resolved in your favour. '
                                    f'A refund of ₦{txn.amount:,.0f} has been initiated to your original payment method. '
                                    f'Please allow at least 24 hours before checking — it can take up to 3–5 business days to reflect depending on your bank.',
                                    f'/account/orders/{order.id}')
                            _dn(order.listing.vendor, 'order_update',
                                f'Dispute Resolved — {order.listing.title}',
                                f'The dispute for "{order.listing.title}" has been resolved. The buyer has been refunded.',
                                '/vendor/dashboard')

                        except Exception as pe:
                            import logging as _log
                            _log.getLogger(__name__).warning(
                                f"Dispute refund failed for order {order.id}: {pe}", exc_info=True)
                            return Response(
                                {'error': f'Refund failed unexpectedly: {pe}. Check server logs and process manually.'},
                                status=status.HTTP_500_INTERNAL_SERVER_ERROR
                            )

                    else:
                        _dn(order.buyer, 'order_update',
                            f'Dispute Update — {order.listing.title}',
                            f'Your dispute for "{order.listing.title}" is being held for further investigation. Our team will follow up with you shortly.',
                            f'/account/orders/{order.id}')
                        _dn(order.listing.vendor, 'order_update',
                            f'Dispute Update — {order.listing.title}',
                            f'The dispute on "{order.listing.title}" is being held for further investigation. Our team will be in touch.',
                            '/vendor/dashboard/disputes')

                dispute.save()
                data = DisputeSerializer(dispute).data
                data['order_buyer'] = dispute.order.buyer.username if dispute.order else None
                data['order_seller'] = dispute.order.listing.vendor.username if (dispute.order and dispute.order.listing) else None
                data['order_amount'] = str(dispute.order.amount) if dispute.order else None
                return Response(data)
            except Dispute.DoesNotExist:
                return Response({'error': 'Dispute not found'}, status=status.HTTP_404_NOT_FOUND)

except ImportError:
    AdminDisputeListView = None
    AdminDisputeDetailView = None


# ============================================
# PAYMENT TRANSACTIONS
# ============================================

try:
    from payments.models import PaymentTransaction, SellerBankAccount

    class AdminPaymentListView(generics.ListAPIView):
        """GET /api/admin/payments/ — list payment transactions."""
        permission_classes = [IsAdminUser]

        def get_queryset(self):
            from payments.models import PaymentTransaction
            qs = PaymentTransaction.objects.all().select_related('buyer', 'seller').order_by('-created_at')
            pay_status = self.request.query_params.get('status')
            if pay_status:
                qs = qs.filter(status=pay_status)
            search = self.request.query_params.get('search')
            if search:
                qs = qs.filter(
                    Q(reference__icontains=search) |
                    Q(buyer__username__icontains=search) |
                    Q(seller__username__icontains=search) |
                    Q(transfer_reference__icontains=search)
                )
            campus = self.request.query_params.get('campus')
            if campus:
                campus = campus.lower()
                if campus == 'pau':
                    qs = qs.filter(
                        Q(seller__school__iexact='pau') | Q(seller__school='') | Q(seller__school__isnull=True)
                    )
                else:
                    qs = qs.filter(seller__school__iexact=campus)
            return qs

        def list(self, request, *args, **kwargs):
            params = request.query_params
            cache_key = f'admin_payments_{params.get("status","")}_{params.get("search","")}_{params.get("campus","")}_{params.get("page","1")}'
            cached = cache.get(cache_key)
            if cached is not None:
                return Response(cached)
            qs = self.get_queryset()
            data = []
            for p in qs:
                data.append({
                    'id': p.id,
                    'reference': p.reference,
                    'buyer': p.buyer.username if p.buyer else None,
                    'buyer_email': p.buyer_email,
                    'seller': p.seller.username if p.seller else None,
                    'amount': str(p.amount),
                    'seller_amount': str(p.seller_amount),
                    'platform_amount': str(p.platform_amount),
                    'service_charge': str(p.service_charge),
                    'discount_amount': str(p.discount_amount),
                    'status': p.status,
                    'order_type': p.order_type,
                    'transfer_status': p.transfer_status,
                    'transfer_reference': p.transfer_reference,
                    'order_id': p.order_id,
                    'created_at': p.created_at.isoformat(),
                })
            cache.set(cache_key, data, 30)
            return Response(data)

    class AdminPaymentDetailView(APIView):
        """GET /api/admin/payments/{id}/  POST /api/admin/payments/{id}/retry/"""
        permission_classes = [IsAdminUser]

        def get(self, request, payment_id):
            try:
                p = PaymentTransaction.objects.select_related('buyer', 'seller').get(id=payment_id)
                return Response({
                    'id': p.id,
                    'reference': p.reference,
                    'paystack_transaction_id': p.paystack_transaction_id,
                    'buyer': p.buyer.username if p.buyer else None,
                    'buyer_id': p.buyer.id if p.buyer else None,
                    'buyer_email': p.buyer_email,
                    'buyer_name': p.buyer_name,
                    'seller': p.seller.username if p.seller else None,
                    'seller_id': p.seller.id if p.seller else None,
                    'amount': str(p.amount),
                    'seller_amount': str(p.seller_amount),
                    'platform_amount': str(p.platform_amount),
                    'service_charge': str(p.service_charge),
                    'discount_amount': str(p.discount_amount),
                    'status': p.status,
                    'order_type': p.order_type,
                    'order_id': p.order_id,
                    'transfer_reference': p.transfer_reference,
                    'transfer_status': p.transfer_status,
                    'created_at': p.created_at.isoformat(),
                    'updated_at': p.updated_at.isoformat(),
                })
            except PaymentTransaction.DoesNotExist:
                return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

    class AdminBankAccountListView(generics.ListAPIView):
        """GET /api/admin/bank-accounts/ — list seller bank accounts."""
        permission_classes = [IsAdminUser]

        def list(self, request, *args, **kwargs):
            accounts = SellerBankAccount.objects.all().select_related('user').order_by('-created_at')
            search = request.query_params.get('search')
            if search:
                accounts = accounts.filter(
                    Q(user__username__icontains=search) |
                    Q(bank_name__icontains=search) |
                    Q(account_number__icontains=search) |
                    Q(account_name__icontains=search)
                )
            data = []
            for a in accounts:
                data.append({
                    'id': a.id,
                    'user_id': a.user.id,
                    'username': a.user.username,
                    'business_name': getattr(a.user, 'business_name', None),
                    'bank_name': a.bank_name,
                    'bank_code': a.bank_code,
                    'account_number': a.account_number,
                    'account_name': a.account_name,
                    'paystack_subaccount_code': a.paystack_subaccount_code,
                    'paystack_recipient_code': a.paystack_recipient_code,
                    'is_active': a.is_active,
                    'created_at': a.created_at.isoformat(),
                })
            return Response(data)

    class AdminBankAccountDetailView(APIView):
        """PATCH /api/admin/bank-accounts/{id}/ — toggle is_active."""
        permission_classes = [IsAdminUser]

        def get(self, request, account_id):
            try:
                a = SellerBankAccount.objects.select_related('user').get(id=account_id)
                return Response({
                    'id': a.id,
                    'user_id': a.user.id,
                    'username': a.user.username,
                    'business_name': getattr(a.user, 'business_name', None),
                    'bank_name': a.bank_name,
                    'bank_code': a.bank_code,
                    'account_number': a.account_number,
                    'account_name': a.account_name,
                    'paystack_subaccount_code': a.paystack_subaccount_code,
                    'paystack_recipient_code': a.paystack_recipient_code,
                    'is_active': a.is_active,
                    'created_at': a.created_at.isoformat(),
                    'updated_at': a.updated_at.isoformat(),
                })
            except SellerBankAccount.DoesNotExist:
                return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

        def patch(self, request, account_id):
            try:
                a = SellerBankAccount.objects.get(id=account_id)
                if 'is_active' in request.data:
                    a.is_active = request.data['is_active']
                    a.save()
                return Response({'id': a.id, 'is_active': a.is_active})
            except SellerBankAccount.DoesNotExist:
                return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

except ImportError:
    AdminPaymentListView = None
    AdminPaymentDetailView = None
    AdminBankAccountListView = None
    AdminBankAccountDetailView = None


# ============================================
# VENDOR PAYOUTS (per-vendor earnings breakdown)
# ============================================

class AdminVendorPayoutsView(APIView):
    """GET /api/admin/vendor-payouts/ — per-vendor total earnings."""
    permission_classes = [IsAdminUser]

    def get(self, request):
        from django.db.models import Sum, Count, Max
        from django.utils import timezone
        from datetime import timedelta

        search = request.query_params.get('search', '')
        campus = request.query_params.get('campus', '')

        def _campus_filter(qs, field_prefix):
            if not campus:
                return qs
            cl = campus.lower()
            if cl == 'pau':
                return qs.filter(
                    Q(**{f'{field_prefix}__iexact': 'pau'}) |
                    Q(**{f'{field_prefix}': ''}) |
                    Q(**{f'{field_prefix}__isnull': True})
                )
            return qs.filter(**{f'{field_prefix}__iexact': cl})

        # Try PaymentTransaction first
        try:
            from payments.models import PaymentTransaction
            qs = PaymentTransaction.objects.filter(status='success').select_related('seller')
            if search:
                qs = qs.filter(
                    Q(seller__username__icontains=search) |
                    Q(seller__business_name__icontains=search)
                )
            qs = _campus_filter(qs, 'seller__school')
            if qs.exists():
                rows = (
                    qs.values('seller', 'seller__username', 'seller__business_name', 'seller__school')
                    .annotate(total_earned=Sum('seller_amount'), order_count=Count('id'), last_date=Max('created_at'))
                    .order_by('-total_earned')
                )
                result = []
                for v in rows:
                    result.append({
                        'vendor_id': v['seller'] or 0,
                        'vendor': v['seller__username'] or '[Deleted Account]',
                        'business_name': v['seller__business_name'] or '',
                        'school': (v['seller__school'] or 'pau').upper(),
                        'total_earned': float(v['total_earned'] or 0),
                        'order_count': v['order_count'],
                        'last_date': v['last_date'].isoformat() if v['last_date'] else None,
                    })
                return Response(result)
        except ImportError:
            pass

        # Fallback: derive from Orders
        try:
            from orders.models import Order
            from django.db.models import F
            PAID = ['paid', 'seller_completed', 'completed']
            qs = (
                Order.objects.filter(status__in=PAID)
                .annotate(listing_price=F('listing__price'))
                .select_related('listing__vendor', 'listing')
            )
            if search:
                qs = qs.filter(
                    Q(listing__vendor__username__icontains=search) |
                    Q(listing__vendor__business_name__icontains=search)
                )
            # Filter by listing.campus (authoritative — set at listing creation,
            # never changes even if vendor later updates their school field).
            qs = _campus_filter(qs, 'listing__campus')
            rows = (
                qs.values(
                    'listing__vendor', 'listing__vendor__username',
                    'listing__vendor__business_name', 'listing__campus'
                )
                .annotate(total_earned=Sum('listing_price'), order_count=Count('id'), last_date=Max('created_at'))
                .order_by('-total_earned')
            )
            result = []
            for v in rows:
                result.append({
                    'vendor_id': v['listing__vendor'] or 0,
                    'vendor': v['listing__vendor__username'] or '[Deleted Account]',
                    'business_name': v['listing__vendor__business_name'] or '',
                    'school': (v['listing__campus'] or 'pau').upper(),
                    'total_earned': float(v['total_earned'] or 0),
                    'order_count': v['order_count'],
                    'last_date': v['last_date'].isoformat() if v['last_date'] else None,
                })
            return Response(result)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ============================================
# PLATFORM EARNINGS (per-transaction fee breakdown)
# ============================================

class AdminPlatformEarningsView(APIView):
    """GET /api/admin/platform-earnings/ — platform fee per transaction."""
    permission_classes = [IsAdminUser]

    def get(self, request):
        from django.db.models import Sum, Count
        from django.utils import timezone
        from datetime import timedelta
        thirty_days_ago = timezone.now() - timedelta(days=30)
        search = request.query_params.get('search', '')

        # Try PaymentTransaction first
        try:
            from payments.models import PaymentTransaction
            qs = PaymentTransaction.objects.filter(status='success').select_related('buyer', 'seller').order_by('-created_at')
            if search:
                qs = qs.filter(
                    Q(reference__icontains=search) |
                    Q(buyer__username__icontains=search) |
                    Q(seller__username__icontains=search)
                )
            if qs.exists():
                agg = qs.aggregate(total_fees=Sum('platform_amount'), total_vol=Sum('amount'), count=Count('id'))
                agg_30d = qs.filter(created_at__gte=thirty_days_ago).aggregate(fees_30d=Sum('platform_amount'))
                txns = []
                for p in qs[:500]:
                    txns.append({
                        'id': p.id,
                        'reference': p.reference,
                        'buyer': p.buyer.username if p.buyer else None,
                        'seller': p.seller.username if p.seller else None,
                        'total_paid': float(p.amount),
                        'seller_amount': float(p.seller_amount),
                        'platform_fee': float(p.platform_amount),
                        'service_charge': float(p.service_charge),
                        'discount': float(p.discount_amount),
                        'date': p.created_at.isoformat(),
                    })
                return Response({
                    'totals': {
                        'total_platform_fees': float(agg['total_fees'] or 0),
                        'total_platform_fees_30d': float(agg_30d['fees_30d'] or 0),
                        'total_volume': float(agg['total_vol'] or 0),
                        'transaction_count': agg['count'],
                    },
                    'transactions': txns,
                })
        except ImportError:
            pass

        # Fallback: derive from Orders
        try:
            from orders.models import Order
            from django.db.models import F
            PAID = ['paid', 'seller_completed', 'completed']
            qs = (
                Order.objects.filter(status__in=PAID)
                .annotate(listing_price=F('listing__price'))
                .select_related('buyer', 'listing__vendor')
                .order_by('-created_at')
            )
            if search:
                qs = qs.filter(
                    Q(reference__icontains=search) |
                    Q(buyer__username__icontains=search) |
                    Q(listing__vendor__username__icontains=search)
                )
            vol = float(qs.aggregate(t=Sum('amount'))['t'] or 0)
            vendor_total = float(qs.aggregate(t=Sum('listing_price'))['t'] or 0)
            fee_total = max(vol - vendor_total, 0.0)
            vol_30d = float(qs.filter(created_at__gte=thirty_days_ago).aggregate(t=Sum('amount'))['t'] or 0)
            vend_30d = float(qs.filter(created_at__gte=thirty_days_ago).aggregate(t=Sum('listing_price'))['t'] or 0)
            fee_30d = max(vol_30d - vend_30d, 0.0)
            txns = []
            for o in qs[:500]:
                listing_price = float(o.listing.price) if o.listing else 0.0
                total_paid = float(o.amount)
                txns.append({
                    'id': o.id,
                    'reference': o.reference,
                    'buyer': o.buyer.username if o.buyer else None,
                    'seller': o.listing.vendor.username if o.listing else None,
                    'total_paid': total_paid,
                    'seller_amount': listing_price,
                    'platform_fee': max(total_paid - listing_price, 0.0),
                    'date': o.created_at.isoformat(),
                })
            return Response({
                'totals': {
                    'total_platform_fees': fee_total,
                    'total_platform_fees_30d': fee_30d,
                    'total_volume': vol,
                    'transaction_count': qs.count(),
                },
                'transactions': txns,
            })
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ============================================
# SERVICE TRANSACTIONS (ESCROW / PAYOUTS)
# Backed by Order — the authoritative source. PaymentTransaction is sparsely
# populated (only created when Paystack webhook fires); Order always exists.
# Status mapping: paid/seller_completed → in_escrow, completed → released.
# ============================================

def _order_payout_status(order_status):
    if order_status == 'completed':
        return 'released'
    if order_status == 'cancelled':
        return 'withdrawn'
    return 'in_escrow'  # paid, seller_completed


class AdminServiceTransactionListView(APIView):
    """GET /api/admin/service-transactions/ — per-order vendor payout records."""
    permission_classes = [IsAdminUser]

    def get(self, request):
        try:
            from orders.models import Order

            PAID_STATUSES = ['paid', 'seller_completed', 'completed', 'cancelled']

            qs = (
                Order.objects
                .filter(status__in=PAID_STATUSES)
                .select_related('listing__vendor', 'listing')
                .order_by('-created_at')
            )

            # Map UI tab → order status filter
            tx_status = request.query_params.get('status', '')
            if tx_status == 'released':
                qs = qs.filter(status='completed')
            elif tx_status == 'withdrawn':
                qs = qs.filter(status='cancelled')
            elif tx_status == 'in_escrow':
                qs = qs.filter(status__in=['paid', 'seller_completed'])

            search = request.query_params.get('search', '')
            if search:
                qs = qs.filter(
                    Q(listing__vendor__username__icontains=search) |
                    Q(listing__vendor__business_name__icontains=search) |
                    Q(reference__icontains=search)
                )

            campus = request.query_params.get('campus', '')
            if campus:
                campus = campus.lower()
                if campus == 'pau':
                    qs = qs.filter(
                        Q(listing__campus__iexact='pau') | Q(listing__campus='') | Q(listing__campus__isnull=True)
                    )
                else:
                    qs = qs.filter(listing__campus__iexact=campus)

            data = []
            for o in qs:
                vendor = o.listing.vendor if o.listing else None
                data.append({
                    'id': o.id,
                    'vendor_id': vendor.id if vendor else None,
                    'vendor': vendor.username if vendor else '[Deleted]',
                    'business_name': getattr(vendor, 'business_name', None) if vendor else None,
                    'order_id': o.id,
                    'order_reference': o.reference,
                    'amount': str(o.listing.price) if o.listing else '0',
                    'status': _order_payout_status(o.status),
                    'created_at': o.created_at.isoformat(),
                    'released_at': o.buyer_confirmed_at.isoformat() if getattr(o, 'buyer_confirmed_at', None) else None,
                    'withdrawn_at': None,
                })
            return Response(data)
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"AdminServiceTransactionListView error: {e}", exc_info=True)
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class AdminServiceTransactionDetailView(APIView):
    """PATCH /api/admin/service-transactions/{id}/ — release or mark an order payout."""
    permission_classes = [IsAdminUser]

    def patch(self, request, tx_id):
        from orders.models import Order
        PAID_STATUSES = ['paid', 'seller_completed', 'completed', 'cancelled']
        try:
            order = Order.objects.select_related('listing__vendor').get(id=tx_id, status__in=PAID_STATUSES)
        except Order.DoesNotExist:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

        new_status = request.data.get('status')

        if new_status == 'released' and order.status in ('paid', 'seller_completed'):
            order.status = 'completed'
            order.save(update_fields=['status'])

        return Response({'id': order.id, 'status': _order_payout_status(order.status)})


# ============================================
# REVIEWS
# ============================================

try:
    from reviews.models import Review, AppFeedback

    class AdminReviewListView(generics.ListAPIView):
        """GET /api/admin/reviews/"""
        permission_classes = [IsAdminUser]

        def list(self, request, *args, **kwargs):
            qs = Review.objects.all().select_related('reviewer', 'vendor', 'listing', 'order').order_by('-created_at')
            search = request.query_params.get('search')
            if search:
                qs = qs.filter(
                    Q(reviewer__username__icontains=search) |
                    Q(vendor__username__icontains=search) |
                    Q(listing__title__icontains=search) |
                    Q(comment__icontains=search)
                )
            rating = request.query_params.get('rating')
            if rating:
                qs = qs.filter(rating=rating)
            campus = request.query_params.get('campus')
            if campus:
                campus = campus.lower()
                if campus == 'pau':
                    qs = qs.filter(
                        Q(vendor__school__iexact='pau') | Q(vendor__school='') | Q(vendor__school__isnull=True)
                    )
                else:
                    qs = qs.filter(vendor__school__iexact=campus)
            data = []
            for r in qs:
                data.append({
                    'id': r.id,
                    'reviewer': r.reviewer.username,
                    'reviewer_id': r.reviewer.id,
                    'vendor': r.vendor.username,
                    'vendor_id': r.vendor.id,
                    'listing_title': r.listing.title if r.listing else None,
                    'listing_id': r.listing.id if r.listing else None,
                    'order_reference': r.order.reference if r.order else None,
                    'rating': r.rating,
                    'comment': r.comment,
                    'created_at': r.created_at.isoformat(),
                })
            return Response(data)

    class AdminReviewDetailView(APIView):
        """DELETE /api/admin/reviews/{id}/"""
        permission_classes = [IsAdminUser]

        def delete(self, request, review_id):
            try:
                r = Review.objects.get(id=review_id)
                r.delete()
                return Response({'message': 'Review deleted'}, status=status.HTTP_204_NO_CONTENT)
            except Review.DoesNotExist:
                return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

    class AdminFeedbackListView(generics.ListAPIView):
        """GET /api/admin/feedback/"""
        permission_classes = [IsAdminUser]

        def list(self, request, *args, **kwargs):
            qs = AppFeedback.objects.all().select_related('user').order_by('-created_at')
            data = []
            for f in qs:
                data.append({
                    'id': f.id,
                    'user': f.user.username if f.user else 'Anonymous',
                    'feedback_type': f.feedback_type,
                    'rating': f.rating,
                    'comment': f.comment,
                    'created_at': f.created_at.isoformat(),
                })
            return Response(data)

except ImportError:
    AdminReviewListView = None
    AdminReviewDetailView = None
    AdminFeedbackListView = None


# ============================================
# CATEGORIES
# ============================================

try:
    from services.models import Category

    class AdminCategoryListView(APIView):
        """GET /api/admin/categories/  POST /api/admin/categories/"""
        permission_classes = [IsAdminUser]

        def get(self, request):
            cats = Category.objects.annotate(listing_count=Count('listings')).order_by('title')
            data = []
            for c in cats:
                if c.is_pau and c.is_futo and c.is_imsu:
                    campus = 'all'
                elif c.is_futo:
                    campus = 'futo'
                elif c.is_imsu:
                    campus = 'imsu'
                else:
                    campus = 'pau'
                data.append({
                    'id': c.id,
                    'title': c.title,
                    'slug': c.slug,
                    'image': c.image,
                    'campus': campus,
                    'listing_count': c.listing_count,
                })
            return Response(data)

        def post(self, request):
            from django.utils.text import slugify
            title = (request.data.get('title') or '').strip()
            if not title:
                return Response({'error': 'title is required'}, status=status.HTTP_400_BAD_REQUEST)
            slug = slugify(title)
            campus = request.data.get('campus', 'pau')
            image = request.data.get('image', '')
            is_pau  = campus in ('pau', 'all')
            is_futo = campus in ('futo', 'all')
            is_imsu = campus in ('imsu', 'all')
            try:
                cat = Category.objects.create(
                    title=title, slug=slug, image=image or None,
                    is_pau=is_pau, is_futo=is_futo, is_imsu=is_imsu,
                )
                campus_out = 'all' if (cat.is_pau and cat.is_futo and cat.is_imsu) else campus
                return Response({'id': cat.id, 'title': cat.title, 'slug': cat.slug, 'campus': campus_out, 'image': cat.image}, status=status.HTTP_201_CREATED)
            except Exception as e:
                return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    class AdminCategoryDetailView(APIView):
        """PATCH /api/admin/categories/{id}/  DELETE /api/admin/categories/{id}/"""
        permission_classes = [IsAdminUser]

        def patch(self, request, category_id):
            try:
                cat = Category.objects.get(id=category_id)
                if 'title' in request.data:
                    cat.title = request.data['title']
                if 'campus' in request.data:
                    campus = request.data['campus']
                    cat.is_pau  = campus in ('pau', 'all')
                    cat.is_futo = campus in ('futo', 'all')
                    cat.is_imsu = campus in ('imsu', 'all')
                if 'image' in request.data:
                    cat.image = request.data['image'] or None
                cat.save()
                if cat.is_pau and cat.is_futo and cat.is_imsu:
                    campus_out = 'all'
                elif cat.is_futo:
                    campus_out = 'futo'
                elif cat.is_imsu:
                    campus_out = 'imsu'
                else:
                    campus_out = 'pau'
                return Response({'id': cat.id, 'title': cat.title, 'slug': cat.slug, 'campus': campus_out, 'image': cat.image})
            except Category.DoesNotExist:
                return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

        def delete(self, request, category_id):
            try:
                cat = Category.objects.get(id=category_id)
                cat.delete()
                return Response({'message': 'Category deleted'}, status=status.HTTP_204_NO_CONTENT)
            except Category.DoesNotExist:
                return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

except ImportError:
    AdminCategoryListView = None
    AdminCategoryDetailView = None


# ============================================
# CART OVERSIGHT
# ============================================

try:
    from cart.models import CartItem

    class AdminCartListView(APIView):
        """GET /api/admin/cart/ — all active cart items across all users."""
        permission_classes = [IsAdminUser]

        def get(self, request):
            qs = CartItem.objects.all().select_related('user', 'listing').order_by('-created_at')

            search = request.query_params.get('search')
            if search:
                qs = qs.filter(
                    Q(user__username__icontains=search) |
                    Q(listing__title__icontains=search)
                )

            campus = request.query_params.get('campus')
            if campus:
                qs = qs.filter(listing__campus__iexact=campus)

            school = request.query_params.get('school')
            if school:
                school = school.lower()
                if school == 'pau':
                    qs = qs.filter(
                        Q(user__school__iexact='pau') | Q(user__school='') | Q(user__school__isnull=True)
                    )
                else:
                    qs = qs.filter(user__school__iexact=school)

            data = []
            for item in qs:
                data.append({
                    'id': item.id,
                    'user_id': item.user.id,
                    'username': item.user.username,
                    'user_school': (item.user.school or 'pau').upper(),
                    'listing_id': item.listing.id,
                    'listing_title': item.listing.title,
                    'listing_price': str(item.listing.price),
                    'listing_campus': item.listing.campus,
                    'quantity': item.quantity,
                    'created_at': item.created_at.isoformat(),
                    'reserved_at': item.reserved_at.isoformat() if item.reserved_at else None,
                })
            return Response(data)

    class AdminAbandonedCartsView(APIView):
        """GET /api/admin/abandoned-carts/ — users with cart items added 5+ hours ago."""
        permission_classes = [IsAdminUser]

        def get(self, request):
            from django.utils import timezone
            from datetime import timedelta
            from collections import defaultdict

            cutoff = timezone.now() - timedelta(hours=5)
            qs = CartItem.objects.filter(
                created_at__lte=cutoff
            ).select_related('user', 'listing').order_by('user_id', 'created_at')

            campus = request.query_params.get('campus')
            if campus:
                qs = qs.filter(user__school__iexact=campus)

            user_items = defaultdict(list)
            for item in qs:
                user_items[item.user_id].append(item)

            data = []
            now = timezone.now()
            for uid, cart_items in user_items.items():
                user = cart_items[0].user
                oldest = cart_items[0].created_at
                age_hours = (now - oldest).total_seconds() / 3600
                total_value = sum(float(item.listing.price) * item.quantity for item in cart_items)
                data.append({
                    'user_id': uid,
                    'username': user.username,
                    'email': user.email,
                    'campus': (user.school or 'pau').lower(),
                    'item_count': len(cart_items),
                    'total_value': round(total_value, 2),
                    'oldest_item_hours': round(age_hours, 1),
                    'items': [
                        {
                            'listing_title': item.listing.title,
                            'quantity': item.quantity,
                            'price': str(item.listing.price),
                            'added_at': item.created_at.isoformat(),
                        }
                        for item in cart_items
                    ],
                })

            data.sort(key=lambda x: x['oldest_item_hours'], reverse=True)
            return Response(data)

    class AdminAbandonedCartReminderView(APIView):
        """POST /api/admin/abandoned-carts/remind/ — send reminders to selected users."""
        permission_classes = [IsAdminUser]

        def post(self, request):
            from django.utils import timezone
            from datetime import timedelta
            from accounts.utils import send_notification
            from django.contrib.auth import get_user_model
            _User = get_user_model()

            user_ids = request.data.get('user_ids', [])
            if not user_ids:
                return Response({'error': 'No user_ids provided.'}, status=status.HTTP_400_BAD_REQUEST)

            cutoff = timezone.now() - timedelta(hours=5)
            sent = 0
            failed = 0

            for uid in user_ids:
                try:
                    user = _User.objects.get(id=uid)
                    items = CartItem.objects.filter(
                        user=user, created_at__lte=cutoff
                    ).select_related('listing')

                    if not items.exists():
                        continue

                    count = items.count()
                    names = ', '.join(i.listing.title for i in items[:3])
                    if count > 3:
                        names += f' and {count - 3} more'

                    send_notification(
                        recipient=user,
                        notification_type='order_update',
                        title='🛒 You left items in your cart!',
                        message=(
                            f'You have {count} item{"s" if count > 1 else ""} waiting: {names}. '
                            f'Complete your purchase before they sell out!'
                        ),
                        action_url='/cart',
                        send_email=False,
                    )
                    sent += 1
                except Exception as e:
                    import logging
                    logging.getLogger(__name__).warning(f'Abandoned cart reminder failed for user {uid}: {e}')
                    failed += 1

            return Response({'sent': sent, 'failed': failed})

except ImportError:
    AdminCartListView = None
    AdminAbandonedCartsView = None
    AdminAbandonedCartReminderView = None


# ============================================
# CONVERSATION / CHAT OVERSIGHT
# ============================================

try:
    from chat.models import Conversation, Message as ChatMessage, BlockedMessageAttempt

    class AdminConversationListView(APIView):
        """GET /api/admin/conversations/ — all conversations."""
        permission_classes = [IsAdminUser]

        def get(self, request):
            search = request.query_params.get('search', '')
            campus = request.query_params.get('campus', '')
            cache_key = f'admin_conversations_{search}_{campus}_{request.query_params.get("page","1")}'
            cached = cache.get(cache_key)
            if cached is not None:
                return Response(cached)

            qs = Conversation.objects.all().select_related(
                'buyer', 'seller', 'listing'
            ).order_by('-updated_at')

            if search:
                qs = qs.filter(
                    Q(buyer__username__icontains=search) |
                    Q(seller__username__icontains=search) |
                    Q(listing__title__icontains=search)
                )

            if campus:
                qs = qs.filter(listing__campus__iexact=campus)

            data = []
            for conv in qs:
                msg_count = ChatMessage.objects.filter(conversation=conv).count()
                data.append({
                    'id': conv.id,
                    'buyer_id': conv.buyer.id,
                    'buyer': conv.buyer.username,
                    'seller_id': conv.seller.id,
                    'seller': conv.seller.username,
                    'listing_id': conv.listing.id if conv.listing else None,
                    'listing_title': conv.listing.title if conv.listing else None,
                    'listing_campus': conv.listing.campus if conv.listing else None,
                    'last_message': conv.last_message or '',
                    'last_message_at': conv.last_message_at.isoformat() if conv.last_message_at else None,
                    'message_count': msg_count,
                    'created_at': conv.created_at.isoformat(),
                    'updated_at': conv.updated_at.isoformat(),
                })
            cache.set(cache_key, data, 30)
            return Response(data)

    class AdminConversationDetailView(APIView):
        """GET /api/admin/conversations/{id}/ — conversation + all messages."""
        permission_classes = [IsAdminUser]

        def get(self, request, conversation_id):
            try:
                conv = Conversation.objects.select_related(
                    'buyer', 'seller', 'listing'
                ).get(id=conversation_id)
            except Conversation.DoesNotExist:
                return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

            messages = ChatMessage.objects.filter(
                conversation=conv
            ).select_related('sender').order_by('created_at')

            msgs_data = []
            for msg in messages:
                msgs_data.append({
                    'id': msg.id,
                    'sender_id': msg.sender.id,
                    'sender': msg.sender.username,
                    'message_type': msg.message_type,
                    'content': msg.content or '',
                    'image_url': msg.image_url or None,
                    'offer_amount': str(msg.offer_amount) if msg.offer_amount else None,
                    'offer_status': msg.offer_status,
                    'is_read': msg.is_read,
                    'is_edited': msg.is_edited,
                    'is_pinned': msg.is_pinned,
                    'created_at': msg.created_at.isoformat(),
                })

            return Response({
                'id': conv.id,
                'buyer_id': conv.buyer.id,
                'buyer': conv.buyer.username,
                'seller_id': conv.seller.id,
                'seller': conv.seller.username,
                'listing_id': conv.listing.id if conv.listing else None,
                'listing_title': conv.listing.title if conv.listing else None,
                'listing_campus': conv.listing.campus if conv.listing else None,
                'messages': msgs_data,
            })

    class AdminBlockedMessagesView(APIView):
        """
        GET /api/admin/blocked-messages/ — blocked contact-info/off-platform/unpaid-chat
        attempts, newest first, plus a per-user offender count so repeat offenders are
        visible without a separate model.
        """
        permission_classes = [IsAdminUser]

        def get(self, request):
            reason = request.query_params.get('reason', '')
            sender_id = request.query_params.get('sender_id', '')

            qs = BlockedMessageAttempt.objects.select_related('sender', 'conversation').order_by('-created_at')
            if reason:
                qs = qs.filter(reason=reason)
            if sender_id:
                qs = qs.filter(sender_id=sender_id)

            attempts = [{
                'id': a.id,
                'sender_id': a.sender.id,
                'sender': a.sender.username,
                'conversation_id': a.conversation_id,
                'attempted_content': a.attempted_content,
                'reason': a.reason,
                'created_at': a.created_at.isoformat(),
            } for a in qs[:200]]

            repeat_offenders = list(
                BlockedMessageAttempt.objects.values('sender_id', 'sender__username')
                .annotate(attempt_count=Count('id'))
                .filter(attempt_count__gte=2)
                .order_by('-attempt_count')[:50]
            )

            return Response({'attempts': attempts, 'repeat_offenders': repeat_offenders})

except ImportError:
    AdminConversationListView = None
    AdminConversationDetailView = None
    AdminBlockedMessagesView = None


# ============================================
# BROADCAST MESSAGING
# ============================================

class AdminVendorOfMonthView(APIView):
    """
    GET  /api/admin/vendor-of-month/  — current winner + last 6 months history
    POST /api/admin/vendor-of-month/  — manually set or trigger auto-pick
      Body (manual override): { vendor_id: int }
      Body (trigger auto-pick): { action: 'pick_now' }
    """
    permission_classes = [IsAdminUser]

    def _serialize(self, votm, request):
        if not votm or not votm.vendor:
            return None
        vendor = votm.vendor
        profile = getattr(vendor, 'profile', None)
        pic = None
        img = getattr(vendor, 'profile_image', None)
        if img:
            name = getattr(img, 'name', None)
            if name and name != 'profiles/default.jpg':
                if name.startswith('http'):
                    pic = name
                else:
                    try:
                        url = img.url
                        pic = url if url.startswith('http') else request.build_absolute_uri(url)
                    except Exception:
                        pass
        return {
            'id': votm.id,
            'vendor_id': vendor.id,
            'vendor_username': vendor.username,
            'business_name': getattr(profile, 'business_name', None) or vendor.username,
            'profile_picture': pic,
            'rating': float(getattr(profile, 'rating', 0) or 0),
            'total_reviews': int(getattr(profile, 'total_reviews', 0) or 0),
            'vendor_badge': getattr(profile, 'vendor_badge', 'none') or 'none',
            'month': votm.month.strftime('%B %Y'),
            'month_raw': votm.month.isoformat(),
            'score': round(votm.score, 1),
            'total_orders': votm.total_orders,
            'avg_rating': round(votm.avg_rating, 2),
            'completion_rate': round(votm.completion_rate, 1),
            'is_manual_override': votm.is_manual_override,
            'nominated_at': votm.nominated_at.isoformat(),
            'campus': votm.campus,
        }

    def get(self, request):
        from services.models import VendorOfTheMonth
        campus = (request.query_params.get('campus') or 'futo').lower()
        records = VendorOfTheMonth.objects.filter(campus=campus).select_related('vendor', 'vendor__profile').order_by('-month')[:6]
        current = records[0] if records else None
        return Response({
            'current': self._serialize(current, request),
            'history': [self._serialize(r, request) for r in records],
        })

    def post(self, request):
        from services.models import VendorOfTheMonth
        action = request.data.get('action')
        campus = (request.data.get('campus') or 'futo').lower()

        if action == 'pick_now':
            try:
                from datetime import date
                today = date.today()
                if today.month == 1:
                    month_start = date(today.year - 1, 12, 1)
                    month_end   = date(today.year, 1, 1)
                else:
                    month_start = date(today.year, today.month - 1, 1)
                    month_end   = date(today.year, today.month, 1)

                from scheduler import pick_vendor_of_month_for_campus
                pick_vendor_of_month_for_campus(campus, month_start, month_end)
                records = VendorOfTheMonth.objects.filter(campus=campus).select_related('vendor', 'vendor__profile').order_by('-month')[:6]
                current = records[0] if records else None
                return Response({
                    'message': f'Vendor of the Month picked for {campus.upper()}.',
                    'current': self._serialize(current, request),
                    'history': [self._serialize(r, request) for r in records],
                })
            except Exception as e:
                return Response({'error': str(e)}, status=500)

        # Manual override: set a specific vendor
        vendor_id = request.data.get('vendor_id')
        if not vendor_id:
            return Response({'error': 'vendor_id or action required.'}, status=400)

        try:
            vendor = User.objects.select_related('profile').get(id=vendor_id)
        except User.DoesNotExist:
            return Response({'error': 'Vendor not found.'}, status=404)

        from datetime import date
        today = date.today()
        if today.month == 1:
            month_start = date(today.year - 1, 12, 1)
        else:
            month_start = date(today.year, today.month - 1, 1)

        from orders.models import Order
        profile = getattr(vendor, 'profile', None)
        completed = Order.objects.filter(listing__vendor=vendor, status='completed').count()

        votm, created = VendorOfTheMonth.objects.update_or_create(
            month=month_start,
            campus=campus,
            defaults={
                'vendor': vendor,
                'score': 0,
                'total_orders': completed,
                'avg_rating': float(getattr(profile, 'rating', 0) or 0),
                'completion_rate': float(getattr(profile, 'completion_rate', 0) or 0),
                'is_manual_override': True,
            }
        )

        try:
            from accounts.utils import send_notification
            send_notification(
                recipient=vendor,
                notification_type='vendor_of_month',
                title='🏆 You are Vendor of the Month!',
                message=(
                    f'Congratulations {vendor.username}! You have been selected as '
                    f'Vendor of the Month for {month_start.strftime("%B %Y")} at {campus.upper()}. '
                    f'Your profile is now featured on the StudEx home page!'
                ),
                action_url='/seller',
                send_email=False,
            )
        except Exception:
            pass

        return Response({
            'message': f'{vendor.username} set as Vendor of the Month for {campus.upper()} — {month_start.strftime("%B %Y")}.',
            'current': self._serialize(votm, request),
        }, status=201 if created else 200)

    def delete(self, request):
        """DELETE /api/admin/vendor-of-month/?campus=X — remove the most recent winner for a campus."""
        from services.models import VendorOfTheMonth
        campus = (request.query_params.get('campus') or 'futo').lower()
        record = VendorOfTheMonth.objects.filter(campus=campus).order_by('-month').first()
        if record:
            record.delete()
            return Response({'message': f'Vendor of the Month for {campus.upper()} removed.'})
        return Response({'error': 'No vendor of the month set for this campus.'}, status=404)


class AdminActivityView(APIView):
    """GET /api/admin/activity/ — real-time online/offline counts."""
    permission_classes = [IsAdminUser]

    def get(self, request):
        from django.utils import timezone
        from datetime import timedelta
        threshold = timezone.now() - timedelta(minutes=3)
        online_qs = User.objects.filter(last_seen__gte=threshold, is_active=True)
        online_users = list(
            online_qs.values('id', 'username', 'user_type', 'business_name', 'last_seen')
        )
        for u in online_users:
            if u['last_seen']:
                u['last_seen'] = u['last_seen'].isoformat()
        return Response({
            'online_count': online_qs.count(),
            'online_vendors': online_qs.filter(user_type='vendor').count(),
            'online_students': online_qs.filter(user_type='student').count(),
            'online_users': online_users,
        })


class AdminGroqNotifyView(APIView):
    """
    GET  /api/admin/groq-notify/  — last 20 AI broadcast logs
    POST /api/admin/groq-notify/  — generate preview or generate + send
      Body: { audience: 'students'|'vendors'|'all', school?: str, preview?: bool }
    """
    permission_classes = [IsAdminUser]

    def get(self, request):
        from notifications.models import GrokNotificationLog
        logs = GrokNotificationLog.objects.all()[:20]
        return Response([{
            'id': log.id,
            'audience': log.audience,
            'school': log.school,
            'title': log.title,
            'message': log.message,
            'sent_count': log.sent_count,
            'triggered_by': log.triggered_by,
            'created_at': log.created_at.isoformat(),
        } for log in logs])

    def post(self, request):
        from groq_notifications import call_groq, build_recipients, send_groq_notifications

        audience = (request.data.get('audience') or 'all').strip()
        school = (request.data.get('school') or '').strip().lower()
        preview_only = bool(request.data.get('preview', False))

        if audience not in ('students', 'vendors', 'all'):
            return Response({'error': 'audience must be students, vendors, or all'}, status=400)

        if preview_only:
            payload = call_groq(audience, school)
            if not payload:
                return Response(
                    {'error': 'Groq API unavailable — check GROQ_API_KEY on Render'},
                    status=503,
                )
            recipient_count = build_recipients(audience, school).count()
            return Response({
                'title': payload['title'],
                'message': payload['message'],
                'recipient_count': recipient_count,
            })

        result = send_groq_notifications(audience=audience, school=school, triggered_by='admin')
        if 'error' in result:
            return Response(result, status=503)
        return Response(result)


def _get_platform_context() -> str:
    """Full live snapshot of every entity on the platform for the AI admin assistant."""
    from django.utils import timezone as tz
    from datetime import timedelta
    from django.db.models import Count as DjCount, Avg

    now       = tz.now()
    week_ago  = now - timedelta(days=7)
    month_ago = now - timedelta(days=30)
    sections: list[str] = [f"=== StudEx Platform Snapshot — {now.strftime('%A %d %B %Y, %H:%M WAT')} ==="]

    # ── ALL USERS ────────────────────────────────────────────────────────────
    try:
        all_users = list(
            User.objects.filter(is_active=True)
            .select_related('profile')
            .order_by('user_type', 'username')
        )
        vendors  = [u for u in all_users if u.user_type == 'vendor']
        students = [u for u in all_users if u.user_type == 'student']
        new_week  = User.objects.filter(date_joined__gte=week_ago).count()
        new_month = User.objects.filter(date_joined__gte=month_ago).count()

        hdr = (
            f"USERS: {len(all_users)} active ({len(students)} students, {len(vendors)} vendors) | "
            f"+{new_week} this week | +{new_month} this month"
        )

        vendor_lines = []
        for u in vendors:
            try:
                p = u.profile
                active_l = u.listings.filter(is_available=True).count()
                total_l  = u.listings.count()
                vl = (f"  [user_id:{u.id}] {u.username} | {u.school or '?'} | "
                      f"{u.business_name or 'no biz'} | joined:{u.date_joined.strftime('%d %b %Y')} | "
                      f"sales:{p.total_sales} rating:{p.rating}/5 badge:{p.vendor_badge} "
                      f"listings:{active_l}/{total_l} | wallet:₦{u.wallet_balance:,.0f} | "
                      f"verified:{u.is_verified_vendor}")
            except Exception:
                vl = f"  [user_id:{u.id}] {u.username} | {u.school or '?'}"
            vendor_lines.append(vl)

        # Students: summary only — individual lines would bloat the context
        pau_students = sum(1 for u in students if (u.school or '').lower() == 'pau')
        futo_students = sum(1 for u in students if (u.school or '').lower() == 'futo')

        sections.append(
            hdr + f"\n\nALL VENDORS ({len(vendors)}):\n" + "\n".join(vendor_lines) +
            f"\n\nSTUDENTS: {len(students)} total (PAU:{pau_students} FUTO:{futo_students}) — use lookup_user for individual student details"
        )
    except Exception:
        pass

    # ── SELLER APPLICATIONS ──────────────────────────────────────────────────
    try:
        from accounts.models import SellerApplication
        pending = list(
            SellerApplication.objects.filter(status='pending')
            .select_related('user').order_by('submitted_at')
            .values('id', 'user__id', 'user__username', 'submitted_at')
        )
        all_apps = list(
            SellerApplication.objects.select_related('user')
            .order_by('-submitted_at')
            .values('id', 'user__username', 'status', 'submitted_at', 'reviewed_at')[:100]
        )
        approved_month = sum(1 for a in all_apps if a['status'] == 'approved' and a['reviewed_at'] and a['reviewed_at'] >= month_ago)
        rejected_month = sum(1 for a in all_apps if a['status'] == 'rejected' and a['reviewed_at'] and a['reviewed_at'] >= month_ago)

        pending_items = [
            f"  [application_id:{a['id']}] {a['user__username']} (user_id:{a['user__id']}, submitted:{a['submitted_at'].strftime('%d %b %Y')})"
            for a in pending
        ]
        app_lines = [
            f"  [application_id:{a['id']}] {a['user__username']} | {a['status']} | submitted:{a['submitted_at'].strftime('%d %b %Y')}"
            for a in all_apps
        ]
        sections.append(
            f"SELLER APPLICATIONS: {len(pending)} pending | {approved_month} approved this month | {rejected_month} rejected this month\n"
            f"PENDING:\n" + ("\n".join(pending_items) if pending_items else "  none") +
            f"\nALL APPLICATIONS ({len(all_apps)}):\n" + "\n".join(app_lines)
        )
    except Exception:
        sections.append("SELLER APPLICATIONS: unavailable")

    # ── ALL LISTINGS & CATEGORIES ────────────────────────────────────────────
    try:
        from services.models import Listing, Category

        all_listings = list(
            Listing.objects.select_related('vendor', 'category')
            .order_by('-created_at')
            .values('id', 'title', 'vendor__username', 'vendor__id', 'price',
                    'listing_type', 'campus', 'is_available', 'category__title',
                    'stock_quantity', 'track_inventory', 'created_at')
        )
        total_l  = len(all_listings)
        active_l = sum(1 for l in all_listings if l['is_available'])
        new_w_l  = sum(1 for l in all_listings if l['created_at'] >= week_ago)

        listing_lines = [
            f"  [listing_id:{l['id']}] {l['title']} | by {l['vendor__username']} (user_id:{l['vendor__id']}) | "
            f"₦{l['price']:,.0f} | {l['listing_type']} | {l['category__title']} | {l['campus']} | "
            f"{'ACTIVE' if l['is_available'] else 'inactive'} | "
            f"{'stock:' + str(l['stock_quantity']) if l['track_inventory'] else 'no inventory'} | "
            f"added:{l['created_at'].strftime('%d %b %Y')}"
            for l in all_listings
        ]

        cats = list(Category.objects.annotate(n=DjCount('listings')).order_by('-n'))
        cat_lines = [
            f"  [cat_id:{c.id}] {c.title} | {c.n} listings | campus:{c.campus}"
            for c in cats
        ]

        sections.append(
            f"LISTINGS: {total_l} total | {active_l} active | {total_l-active_l} inactive | +{new_w_l} this week\n"
            f"ALL LISTINGS ({total_l}):\n" + "\n".join(listing_lines) +
            f"\n\nALL CATEGORIES ({len(cats)}):\n" + "\n".join(cat_lines)
        )
    except Exception:
        pass

    # ── ALL ORDERS ───────────────────────────────────────────────────────────
    try:
        from orders.models import Order
        all_orders = list(
            Order.objects.select_related('buyer', 'listing', 'listing__vendor')
            .order_by('-created_at')
            .values('id', 'reference', 'buyer__username', 'buyer__id',
                    'listing__title', 'listing__vendor__username', 'listing__vendor__id',
                    'amount', 'status', 'created_at')[:50]
        )
        total_o = Order.objects.count()
        sc = {s['status']: s['n'] for s in Order.objects.values('status').annotate(n=DjCount('id'))}

        order_lines = [
            f"  [order_id:{o['id']} ref:{o['reference']}] {o['status']} | ₦{o['amount']:,.0f} | "
            f"buyer:{o['buyer__username']} (user_id:{o['buyer__id']}) → "
            f"vendor:{o['listing__vendor__username']} | {o['listing__title'][:40]} | "
            f"{o['created_at'].strftime('%d %b %Y')}"
            for o in all_orders
        ]
        sections.append(
            f"ORDERS: {total_o} total | pending:{sc.get('pending',0)} confirmed:{sc.get('confirmed',0)} "
            f"completed:{sc.get('completed',0)} cancelled:{sc.get('cancelled',0)} disputed:{sc.get('disputed',0)}\n"
            f"ALL ORDERS (most recent {len(all_orders)}):\n" + "\n".join(order_lines)
        )
    except Exception:
        pass

    # ── ALL DISPUTES ─────────────────────────────────────────────────────────
    try:
        from orders.models import Dispute
        all_disputes = list(
            Dispute.objects.select_related('order', 'order__buyer', 'order__listing', 'order__listing__vendor', 'filer')
            .order_by('-created_at')
        )
        dispute_lines = [
            f"  [dispute_id:{d.id}] order:{d.order.reference} | status:{d.status} | resolution:{d.resolution} | "
            f"filed_by:{d.filer.username} ({d.filed_by}) | reason:{d.reason} | "
            f"buyer:{d.order.buyer.username} → vendor:{d.order.listing.vendor.username} | "
            f"₦{d.order.amount:,.0f} | {d.created_at.strftime('%d %b %Y')}"
            for d in all_disputes
        ]
        open_count = sum(1 for d in all_disputes if d.status in ('open', 'under_review'))
        sections.append(
            f"DISPUTES: {len(all_disputes)} total | {open_count} open/under review\n"
            f"ALL DISPUTES:\n" + ("\n".join(dispute_lines) if dispute_lines else "  none")
        )
    except Exception:
        pass

    # ── PAYMENTS & PAYOUTS ───────────────────────────────────────────────────
    try:
        from payments.models import PaymentTransaction
        txns = list(
            PaymentTransaction.objects.select_related('buyer', 'seller')
            .order_by('-created_at')
            .values('id', 'reference', 'buyer__username', 'seller__username',
                    'amount', 'seller_amount', 'platform_amount',
                    'status', 'transfer_status', 'order_id', 'created_at')[:50]
        )
        agg_success = PaymentTransaction.objects.filter(status='success')
        rev_total = agg_success.aggregate(t=Sum('platform_amount'))['t'] or 0
        rev_month = agg_success.filter(created_at__gte=month_ago).aggregate(t=Sum('platform_amount'))['t'] or 0
        rev_week  = agg_success.filter(created_at__gte=week_ago).aggregate(t=Sum('platform_amount'))['t'] or 0
        vol_total = agg_success.aggregate(t=Sum('amount'))['t'] or 0
        failed_payouts = sum(1 for t in txns if t['status'] == 'success' and t['transfer_status'] == 'failed')

        txn_lines = [
            f"  [txn_id:{t['id']} ref:{t['reference']}] {t['status']} | ₦{t['amount']:,.0f} total "
            f"(vendor:₦{t['seller_amount']:,.0f} fee:₦{t['platform_amount']:,.0f}) | "
            f"buyer:{t['buyer__username'] or '?'} → seller:{t['seller__username'] or '?'} | "
            f"payout:{t['transfer_status'] or 'pending'} | order_id:{t['order_id']} | "
            f"{t['created_at'].strftime('%d %b %Y')}"
            for t in txns
        ]
        sections.append(
            f"PAYMENTS & REVENUE:\n"
            f"  Platform fees earned: ₦{rev_total:,.0f} all-time | ₦{rev_month:,.0f} this month | ₦{rev_week:,.0f} this week\n"
            f"  Total transaction volume: ₦{vol_total:,.0f}\n"
            f"  {'⚠ WARNING: ' + str(failed_payouts) + ' failed vendor payout(s) need attention' if failed_payouts else 'All payouts healthy'}\n"
            f"ALL TRANSACTIONS (most recent {len(txns)}):\n" + "\n".join(txn_lines)
        )
    except Exception:
        pass

    # ── ALL REVIEWS ──────────────────────────────────────────────────────────
    try:
        from reviews.models import Review
        all_reviews = list(
            Review.objects.select_related('reviewer', 'vendor')
            .order_by('-created_at')
            .values('id', 'reviewer__username', 'reviewer__id', 'vendor__username', 'vendor__id',
                    'rating', 'comment', 'created_at')[:30]
        )
        avg_r = Review.objects.aggregate(a=Avg('rating'))['a'] or 0
        review_lines = [
            f"  [review_id:{r['id']}] {r['reviewer__username']} (user_id:{r['reviewer__id']}) → "
            f"{r['vendor__username']} (user_id:{r['vendor__id']}) | {r['rating']}/5 | "
            f"{(r['comment'] or '')[:80]} | {r['created_at'].strftime('%d %b %Y')}"
            for r in all_reviews
        ]
        sections.append(
            f"REVIEWS: {len(all_reviews)} total | avg rating:{avg_r:.1f}/5\n"
            f"ALL REVIEWS:\n" + ("\n".join(review_lines) if review_lines else "  none")
        )
    except Exception:
        pass

    # ── CONVERSATIONS ────────────────────────────────────────────────────────
    try:
        from chat.models import Conversation
        total_convs = Conversation.objects.count()
        sections.append(
            f"CONVERSATIONS: {total_convs} total — use lookup_conversation action for message content"
        )
    except Exception:
        pass

    # ── GROQ AI BROADCASTS ───────────────────────────────────────────────────
    try:
        from notifications.models import GrokNotificationLog, PlatformSettings
        ai_enabled = PlatformSettings.get().grok_notifications_enabled
        logs = list(GrokNotificationLog.objects.order_by('-created_at')[:20])
        log_lines = [
            f"  \"{log.title}\" → {log.sent_count} {log.audience}"
            f"{'/' + log.school.upper() if log.school else ''} ({log.triggered_by}, {log.created_at.strftime('%d %b %Y')})"
            for log in logs
        ]
        sections.append(
            f"AI BROADCASTS: {'enabled' if ai_enabled else 'DISABLED'}\n"
            f"RECENT BROADCASTS:\n" + ("\n".join(log_lines) if log_lines else "  none")
        )
    except Exception:
        pass

    return '\n\n'.join(sections)


class AdminAIChatView(APIView):
    """
    POST /api/admin/ai-chat/
    Body: { messages: [{role: str, content: str}] }
    Returns: { message: str, action?: {type, label, params} }
    """
    permission_classes = [IsAdminUser]

    def post(self, request):
        import re
        import json as json_lib
        import requests as http
        from django.conf import settings as dj_settings

        messages = request.data.get('messages') or []
        if not messages:
            return Response({'error': 'messages required'}, status=400)

        api_key = (getattr(dj_settings, 'GROQ_API_KEY', '') or '').strip()
        if not api_key:
            return Response({'error': 'GROQ_API_KEY not configured on this server'}, status=503)

        ctx = _get_platform_context()
        # Hard cap: prevent 413s as platform data grows
        if len(ctx) > 14_000:
            ctx = ctx[:14_000] + "\n\n[Context truncated to fit model limits — use lookup actions for deeper detail]"

        system_prompt = f"""You are StudEx Admin AI — the intelligent assistant inside the StudEx campus marketplace admin dashboard.

LIVE PLATFORM DATA (refreshed each message):
{ctx}

YOUR CAPABILITIES:
• Full analytics: users, orders, revenue, listings, reviews, disputes, broadcasts — give specific numbers, trends, and insights
• Send notifications to any audience: all users, only students, only vendors, only PAU, only FUTO, PAU students, FUTO vendors, etc.
• Approve or deactivate any listing by its listing_id
• Approve or reject seller applications by application_id
• Generate detailed reports on demand
• Proactive recommendations: flag failed payouts, disputes, inactive vendors, empty categories, etc.

RESPONSE FORMAT:
- Match the admin's tone. If they say "hi" or small talk, reply briefly and casually — do NOT dump data unprompted.
- Only give analytics/reports when explicitly asked.
- Be concise. Use markdown: **bold**, bullet lists "- ", ## headers.
- Base all data answers on the LIVE PLATFORM DATA above.
- For any concrete action, include exactly ONE action block at the very end of your reply:

<action>
{{"type": "...", "label": "Short button label", "params": {{...}}}}
</action>

AVAILABLE ACTIONS:

1. send_notification
   params: title (str), message (str), audience ("all"|"students"|"vendors"|"single"), school (""|"pau"|"futo"), user_id (int, only when audience="single")
   Audience combinations the admin can ask for:
     "send to everyone"              → audience:"all",      school:""
     "send to all students"          → audience:"students", school:""
     "send to all vendors"           → audience:"vendors",  school:""
     "send to PAU students"          → audience:"students", school:"pau"
     "send to FUTO students"         → audience:"students", school:"futo"
     "send to PAU vendors"           → audience:"vendors",  school:"pau"
     "send to FUTO vendors"          → audience:"vendors",  school:"futo"
     "send to PAU users"             → audience:"all",      school:"pau"
     "send to FUTO users"            → audience:"all",      school:"futo"
   Always compose a proper notification title AND message — never leave them blank.

2. verify_vendor
   params: application_id (int), username (str), action ("approve"|"reject")
   Only use application_id values from the pending seller applications in LIVE DATA above. Never invent IDs.

3. set_listing_status
   params: listing_id (int), listing_title (str), vendor_username (str), action ("approve"|"deactivate")
   Use "approve" to make an inactive listing live in the marketplace.
   Use "deactivate" to take a live listing down.
   For "approve", only use listing_id values from the "Inactive/unapproved listings" list above.
   The vendor is notified automatically.

4. generate_report
   params: report_type ("weekly"|"monthly"|"revenue"|"users"|"orders"|"full")

5. lookup_user
   params: query (str) — username, partial name, or email to search
   Use when the admin wants details about a specific user. The full profile is returned and injected back.
   Examples: "check ugo", "who is ugochukwu", "show me john's details"

6. lookup_order
   params: query (str) — order reference, buyer username, or vendor username
   Use when admin asks about a specific order or a user's order history.
   Examples: "show me order ORD-123", "what orders has ada placed", "vendor ugo's orders"

7. lookup_conversation
   params: query (str) — buyer or seller username
   Use when admin wants to see chat messages between two users.
   Example: "show me the conversation between ada and ugo"

The platform snapshot above already contains every user, listing, order, dispute, payment, review, and conversation — use that data to answer most questions directly. Only use lookup actions when the admin asks for deeper detail beyond what the snapshot shows.

Do NOT include <action> if no action is needed.
Do NOT identify yourself as Groq, LLaMA, or any third-party AI — you are StudEx Admin AI."""

        # Keep only the last 20 turns to avoid conversation-history bloat
        trimmed_messages = [
            m for m in messages
            if m.get("role") in ("user", "assistant") and m.get("content")
        ][-20:]

        groq_messages = [
            {"role": "system", "content": system_prompt},
            *[{"role": m["role"], "content": m["content"]} for m in trimmed_messages],
        ]

        try:
            resp = http.post(
                'https://api.groq.com/openai/v1/chat/completions',
                headers={
                    'Authorization': f'Bearer {api_key}',
                    'Content-Type': 'application/json',
                },
                json={
                    'model': 'llama-3.3-70b-versatile',
                    'messages': groq_messages,
                    'max_tokens': 1500,
                    'temperature': 0.5,
                },
                timeout=45,
            )
            resp.raise_for_status()
            content = resp.json()['choices'][0]['message']['content']
        except Exception as e:
            return Response({'error': f'AI service unavailable: {e}'}, status=503)

        action = None
        match = re.search(r'<action>\s*([\s\S]*?)\s*</action>', content)
        if match:
            try:
                action = json_lib.loads(match.group(1))
            except Exception:
                pass
            content = content[:match.start()].rstrip()

        return Response({'message': content, 'action': action})


class AdminAIActionView(APIView):
    """
    POST /api/admin/ai-action/
    Body: { type: str, params: dict }
    Executes a confirmed AI-suggested action.
    """
    permission_classes = [IsAdminUser]

    def post(self, request):
        action_type = request.data.get('type')
        params = request.data.get('params') or {}

        if action_type == 'send_notification':
            return self._send_notification(params)
        elif action_type == 'verify_vendor':
            return self._verify_vendor(request, params)
        elif action_type == 'set_listing_status':
            return self._set_listing_status(request, params)
        elif action_type == 'lookup_user':
            return self._lookup_user(params)
        elif action_type == 'lookup_order':
            return self._lookup_order(params)
        elif action_type == 'lookup_conversation':
            return self._lookup_conversation(params)
        else:
            return Response({'error': f'Unknown action type: {action_type}'}, status=400)

    def _send_notification(self, params):
        from groq_notifications import build_recipients
        from accounts.utils import send_notification as _notify

        audience = params.get('audience', 'all')
        title    = (params.get('title')   or '').strip()
        message  = (params.get('message') or '').strip()
        school   = (params.get('school')  or '').strip().lower()
        user_id  = params.get('user_id')

        if not title or not message:
            return Response({'error': 'title and message are required'}, status=400)

        if audience == 'single' and user_id:
            try:
                target = User.objects.get(id=user_id)
                _notify(recipient=target, notification_type='admin_message', title=title, message=message)
                return Response({'detail': f'Notification sent to {target.username}', 'sent': 1})
            except User.DoesNotExist:
                return Response({'error': 'User not found'}, status=404)

        recipients = build_recipients(audience, school)
        sent = 0
        for user in recipients.iterator():
            try:
                _notify(recipient=user, notification_type='admin_message', title=title, message=message)
                sent += 1
            except Exception:
                pass

        scope = f"{audience}{' at ' + school.upper() if school else ''}"
        return Response({'detail': f'Sent to {sent} {scope}', 'sent': sent})

    def _verify_vendor(self, request, params):
        from accounts.models import SellerApplication
        from accounts.utils import send_notification as _notify
        from django.utils import timezone as tz

        app_id = params.get('application_id')
        action = params.get('action')
        if not app_id or action not in ('approve', 'reject'):
            return Response({'error': 'application_id and action (approve/reject) required'}, status=400)

        try:
            application = SellerApplication.objects.select_related('user').get(id=app_id)
        except SellerApplication.DoesNotExist:
            return Response({'error': 'Seller application not found'}, status=404)

        vendor_user = application.user

        if action == 'approve':
            application.status = 'approved'
            application.reviewed_at = tz.now()
            application.reviewed_by = request.user
            application.save()
            vendor_user.is_verified_vendor = True
            vendor_user.user_type = 'vendor'
            vendor_user.save()
            _notify(
                recipient=vendor_user,
                notification_type='seller_approved',
                title='Application Accepted!',
                message='Your seller application has been approved. You are now a verified vendor on StudEx. Go to Account Settings → Bank Account to add your bank details so you can receive payouts, then start listing your services!',
                action_url='/account',
            )
            return Response({'detail': f'{vendor_user.username} approved as a vendor'})

        application.status = 'rejected'
        application.reviewed_at = tz.now()
        application.reviewed_by = request.user
        application.save()
        vendor_user.is_verified_vendor = False
        vendor_user.user_type = 'student'
        vendor_user.save()
        _notify(
            recipient=vendor_user,
            notification_type='seller_rejected',
            title='Application Not Approved',
            message='Your seller application was not approved at this time. You can reapply after addressing the requirements.',
            action_url='/seller',
        )
        return Response({'detail': f'{vendor_user.username} application rejected'})

    def _set_listing_status(self, request, params):
        from services.models import Listing
        from accounts.utils import send_notification as _notify

        listing_id = params.get('listing_id')
        action     = params.get('action', 'approve')

        if not listing_id:
            return Response({'error': 'listing_id required'}, status=400)

        try:
            listing = Listing.objects.select_related('vendor').get(id=listing_id)
        except Listing.DoesNotExist:
            return Response({'error': 'Listing not found'}, status=404)

        if action == 'approve':
            listing.is_available = True
            listing.save(update_fields=['is_available', 'updated_at'])
            from services.contracts import invalidate_listing_cache
            invalidate_listing_cache(listing.campus)
            try:
                _notify(
                    recipient=listing.vendor,
                    notification_type='admin_message',
                    title='Listing Approved!',
                    message=f'Your listing "{listing.title}" has been approved and is now live in the marketplace.',
                    action_url='/seller',
                )
            except Exception:
                pass
            return Response({'detail': f'"{listing.title}" by {listing.vendor.username} approved and now live'})

        if action == 'deactivate':
            listing.is_available = False
            listing.save(update_fields=['is_available', 'updated_at'])
            from services.contracts import invalidate_listing_cache
            invalidate_listing_cache(listing.campus)
            try:
                _notify(
                    recipient=listing.vendor,
                    notification_type='admin_message',
                    title='Listing Deactivated',
                    message=f'Your listing "{listing.title}" has been temporarily deactivated.',
                    action_url='/seller',
                )
            except Exception:
                pass
            return Response({'detail': f'"{listing.title}" deactivated'})

        return Response({'error': 'action must be approve or deactivate'}, status=400)

    def _lookup_user(self, params):
        from django.db.models import Q
        query = (params.get('query') or '').strip()
        if len(query) < 2:
            return Response({'error': 'query must be at least 2 characters'}, status=400)

        users = list(
            User.objects.filter(
                Q(username__icontains=query) |
                Q(first_name__icontains=query) |
                Q(last_name__icontains=query) |
                Q(email__icontains=query)
            ).filter(is_active=True)
            .select_related('profile')[:5]
        )

        if not users:
            return Response({
                'detail': f'No active user found matching "{query}". They may not exist or may be inactive.'
            })

        blocks = [f'Found {len(users)} user(s) matching "{query}":']
        for u in users:
            lines = [
                f'\n{u.username} (user_id:{u.id})',
                f'  Type: {u.user_type}',
                f'  School: {u.school or "not set"}',
                f'  Email: {u.email or "not set"}',
                f'  Phone: {u.phone or "not set"}',
                f'  Joined: {u.date_joined.strftime("%d %b %Y")}',
                f'  Verified vendor: {u.is_verified_vendor}',
                f'  Wallet balance: ₦{u.wallet_balance:,.2f}',
            ]
            if u.business_name:
                lines.append(f'  Business name: {u.business_name}')
            try:
                p = u.profile
                lines.append(f'  Orders placed: {p.total_orders}')
                if u.user_type == 'vendor':
                    lines.append(
                        f'  Sales: {p.total_sales} | Badge: {p.vendor_badge} | '
                        f'Completion rate: {p.completion_rate}% | '
                        f'Rating: {p.rating}/5 ({p.total_reviews} reviews)'
                    )
            except Exception:
                pass
            try:
                total_l  = u.listings.count()
                active_l = u.listings.filter(is_available=True).count()
                if total_l:
                    lines.append(f'  Listings: {total_l} total, {active_l} active')
            except Exception:
                pass
            try:
                app = u.seller_application
                lines.append(f'  Seller application: {app.status} (application_id:{app.id})')
            except Exception:
                pass
            blocks.append('\n'.join(lines))

        return Response({'detail': '\n'.join(blocks)})

    def _lookup_order(self, params):
        from django.db.models import Q
        from orders.models import Order, Dispute
        query = (params.get('query') or '').strip()
        if len(query) < 2:
            return Response({'error': 'query must be at least 2 characters'}, status=400)

        orders = list(
            Order.objects.filter(
                Q(reference__icontains=query) |
                Q(buyer__username__icontains=query) |
                Q(listing__vendor__username__icontains=query) |
                Q(listing__title__icontains=query)
            ).select_related('buyer', 'listing', 'listing__vendor', 'listing__category')
            .prefetch_related('disputes')
            .order_by('-created_at')[:20]
        )
        if not orders:
            return Response({'detail': f'No orders found matching "{query}".'})

        blocks = [f'Found {len(orders)} order(s) matching "{query}":']
        for o in orders:
            lines = [
                f'\n[order_id:{o.id} ref:{o.reference}]',
                f'  Status: {o.status}',
                f'  Amount: ₦{o.amount:,.2f}',
                f'  Buyer: {o.buyer.username} (user_id:{o.buyer.id})',
                f'  Listing: "{o.listing.title}" (listing_id:{o.listing.id})',
                f'  Vendor: {o.listing.vendor.username} (user_id:{o.listing.vendor.id})',
                f'  Category: {o.listing.category.title}',
                f'  Campus: {o.listing.campus}',
                f'  Placed: {o.created_at.strftime("%d %b %Y %H:%M")}',
            ]
            try:
                from payments.models import PaymentTransaction
                txn = PaymentTransaction.objects.filter(order_id=o.id).first()
                if txn:
                    lines.append(
                        f'  Payment ref: {txn.reference} | status:{txn.status} | '
                        f'vendor payout:₦{txn.seller_amount:,.0f} payout_status:{txn.transfer_status or "pending"}'
                    )
            except Exception:
                pass
            for d in o.disputes.all():
                lines.append(
                    f'  Dispute [id:{d.id}] status:{d.status} reason:{d.reason} '
                    f'resolution:{d.resolution} filed_by:{d.filed_by}'
                )
            blocks.append('\n'.join(lines))
        return Response({'detail': '\n'.join(blocks)})

    def _lookup_conversation(self, params):
        from django.db.models import Q
        from chat.models import Conversation, Message as ChatMessage
        query = (params.get('query') or '').strip()
        if len(query) < 2:
            return Response({'error': 'query must be at least 2 characters'}, status=400)

        convs = list(
            Conversation.objects.filter(
                Q(buyer__username__icontains=query) |
                Q(seller__username__icontains=query)
            ).select_related('buyer', 'seller')
            .order_by('-last_message_at')[:10]
        )
        if not convs:
            return Response({'detail': f'No conversations found involving "{query}".'})

        blocks = [f'Found {len(convs)} conversation(s) involving "{query}":']
        for c in convs:
            msgs = list(
                ChatMessage.objects.filter(conversation=c)
                .select_related('sender')
                .order_by('-created_at')[:20]
            )
            msg_lines = [
                f'  [{m.created_at.strftime("%d %b %H:%M")}] {m.sender.username}: {m.content[:100]}'
                for m in reversed(msgs)
            ]
            blocks.append(
                f'\n[conv_id:{c.id}] {c.buyer.username} ↔ {c.seller.username}\n'
                + ('\n'.join(msg_lines) if msg_lines else '  (no messages)')
            )
        return Response({'detail': '\n'.join(blocks)})


class AdminAIChatHistoryView(APIView):
    """
    GET    /api/admin/ai-history/        — list saved sessions [{id, title, created_at}]
    POST   /api/admin/ai-history/        — save session {title, messages}
    GET    /api/admin/ai-history/<id>/   — load full session
    DELETE /api/admin/ai-history/<id>/   — delete session
    """
    permission_classes = [IsAdminUser]

    def get(self, request, session_id=None):
        from accounts.models import AdminChatSession
        if session_id:
            try:
                s = AdminChatSession.objects.get(id=session_id)
                return Response({'id': s.id, 'title': s.title, 'messages': s.messages, 'created_at': s.created_at})
            except AdminChatSession.DoesNotExist:
                return Response({'error': 'Not found'}, status=404)
        sessions = list(AdminChatSession.objects.values('id', 'title', 'created_at')[:100])
        return Response(sessions)

    def post(self, request):
        from accounts.models import AdminChatSession
        title    = (request.data.get('title') or 'Chat').strip()[:200]
        messages = request.data.get('messages') or []
        if not messages:
            return Response({'error': 'messages required'}, status=400)
        s = AdminChatSession.objects.create(title=title, messages=messages)
        return Response({'id': s.id, 'title': s.title, 'created_at': s.created_at}, status=201)

    def delete(self, request, session_id=None):
        from accounts.models import AdminChatSession
        if not session_id:
            return Response({'error': 'session_id required'}, status=400)
        AdminChatSession.objects.filter(id=session_id).delete()
        return Response(status=204)


class AdminPlatformSettingsView(APIView):
    """
    GET  /api/admin/platform-settings/ — returns { grok_notifications_enabled: bool }
    PATCH /api/admin/platform-settings/ — body: { grok_notifications_enabled: bool }
    """
    permission_classes = [IsAdminUser]

    def get(self, request):
        from notifications.models import PlatformSettings
        settings_obj = PlatformSettings.get()
        return Response({'grok_notifications_enabled': settings_obj.grok_notifications_enabled})

    def patch(self, request):
        from notifications.models import PlatformSettings
        enabled = request.data.get('grok_notifications_enabled')
        if not isinstance(enabled, bool):
            return Response({'error': 'grok_notifications_enabled must be a boolean'}, status=400)
        settings_obj = PlatformSettings.get()
        settings_obj.grok_notifications_enabled = enabled
        settings_obj.save(update_fields=['grok_notifications_enabled'])
        return Response({'grok_notifications_enabled': settings_obj.grok_notifications_enabled})


class AdminPricingSettingsView(APIView):
    """
    GET   /api/admin/pricing-settings/ — returns { service_fee_percent: "8.00" }
    PATCH /api/admin/pricing-settings/ — body: { service_fee_percent: number }
    PATCH retroactively recomputes every existing listing's price from its stored
    payout_amount using the new percentage (confirmed product decision — not just
    new/edited listings). Omitting `campus`/`vendor_type` from either verb is the
    exact behavior this endpoint had before Blocker 6 (Campus Pricing) — byte-for-
    byte unchanged.

    Three-level resolution (see payments.pricing.get_service_fee_percent):
      Level 1: campus + vendor_type   Level 2: campus only   Level 3: global

      GET  ?campus=pau                       -> Level 2 (campus default)
      GET  ?campus=pau&vendor_type=food       -> Level 1 (campus+type override)
      PATCH {campus, service_fee_percent}                  -> sets Level 2
      PATCH {campus, vendor_type, service_fee_percent}     -> sets Level 1
      PATCH {campus, [vendor_type,] clear_override: true}  -> reverts that row
                                                               to inheriting the
                                                               next level up

    `vendor_type` is always the VendorType's friendly `name` (e.g. "food") at
    this API boundary — resolved to the actual VendorType instance once, here,
    before anything touches CampusPricingSettings. The resolver and the model
    itself never compare on the name string (see payments/pricing.py and
    payments/settlement.py get_vendor_type).

    Every PATCH form recomputes only the listings it affects — global changes
    still recompute every listing (unchanged); a campus or campus+type override
    recomputes only that scope.
    """
    permission_classes = [IsAdminUser]

    def _resolve_vendor_type(self, name):
        """Returns (VendorType_or_None, error_response_or_None)."""
        if not name:
            return None, None
        from accounts.models import VendorType
        vendor_type = VendorType.objects.filter(name=name).first()
        if vendor_type is None:
            return None, Response({'error': f'Unknown vendor type "{name}".'}, status=400)
        return vendor_type, None

    def get(self, request):
        from payments.models import PricingSettings

        campus = (request.query_params.get('campus') or '').lower()
        vendor_type_name = (request.query_params.get('vendor_type') or '').lower()

        if not campus:
            if vendor_type_name:
                return Response({'error': 'vendor_type requires campus.'}, status=400)
            settings_obj = PricingSettings.get()
            return Response({'service_fee_percent': str(settings_obj.service_fee_percent)})

        vendor_type, error = self._resolve_vendor_type(vendor_type_name)
        if error:
            return error

        from payments.models import CampusPricingSettings
        global_percent = PricingSettings.get().service_fee_percent

        campus_default = CampusPricingSettings.objects.filter(campus=campus, vendor_type__isnull=True).first()
        campus_default_percent = (
            campus_default.service_fee_percent if campus_default and campus_default.service_fee_percent is not None
            else None
        )

        if vendor_type is not None:
            override = CampusPricingSettings.objects.filter(campus=campus, vendor_type=vendor_type).first()
            is_override = override is not None and override.service_fee_percent is not None
            if is_override:
                effective = override.service_fee_percent
            elif campus_default_percent is not None:
                effective = campus_default_percent
            else:
                effective = global_percent
            return Response({
                'campus': campus,
                'vendor_type': vendor_type.name,
                'service_fee_percent': str(effective),
                'is_override': is_override,
                'campus_default_service_fee_percent': (
                    str(campus_default_percent) if campus_default_percent is not None else None
                ),
                'global_service_fee_percent': str(global_percent),
            })

        is_override = campus_default_percent is not None
        effective = campus_default_percent if is_override else global_percent
        return Response({
            'campus': campus,
            'service_fee_percent': str(effective),
            'is_override': is_override,
            'global_service_fee_percent': str(global_percent),
        })

    def patch(self, request):
        from decimal import Decimal, InvalidOperation
        from payments.models import PricingSettings
        from payments.pricing import recompute_all_listing_prices

        campus = (request.data.get('campus') or '').lower()
        vendor_type_name = (request.data.get('vendor_type') or '').lower()

        if not campus:
            if vendor_type_name:
                return Response({'error': 'vendor_type requires campus.'}, status=400)
            raw = request.data.get('service_fee_percent')
            try:
                new_percent = Decimal(str(raw))
            except (InvalidOperation, TypeError):
                return Response({'error': 'service_fee_percent must be a number'}, status=400)
            if not (Decimal('0') <= new_percent <= Decimal('100')):
                return Response({'error': 'service_fee_percent must be between 0 and 100'}, status=400)

            settings_obj = PricingSettings.get()
            settings_obj.service_fee_percent = new_percent
            settings_obj.save(update_fields=['service_fee_percent'])

            recomputed_count = recompute_all_listing_prices(new_percent)

            return Response({
                'service_fee_percent': str(settings_obj.service_fee_percent),
                'listings_recomputed': recomputed_count,
            })

        from payments.models import CampusPricingSettings

        valid_campuses = {c for c, _ in CampusPricingSettings.CAMPUS_CHOICES}
        if campus not in valid_campuses:
            return Response({'error': f'Unknown campus "{campus}".'}, status=400)

        vendor_type, error = self._resolve_vendor_type(vendor_type_name)
        if error:
            return error

        override, _ = CampusPricingSettings.objects.get_or_create(campus=campus, vendor_type=vendor_type)

        if request.data.get('clear_override'):
            override.service_fee_percent = None
            override.save(update_fields=['service_fee_percent'])
            from payments.pricing import get_service_fee_percent
            new_percent = get_service_fee_percent(campus=campus, vendor_type=vendor_type)
        else:
            raw = request.data.get('service_fee_percent')
            try:
                new_percent = Decimal(str(raw))
            except (InvalidOperation, TypeError):
                return Response({'error': 'service_fee_percent must be a number'}, status=400)
            if not (Decimal('0') <= new_percent <= Decimal('100')):
                return Response({'error': 'service_fee_percent must be between 0 and 100'}, status=400)
            override.service_fee_percent = new_percent
            override.save(update_fields=['service_fee_percent'])

        recomputed_count = recompute_all_listing_prices(new_percent, campus=campus, vendor_type=vendor_type)

        response_data = {
            'campus': campus,
            'service_fee_percent': str(new_percent),
            'is_override': not bool(request.data.get('clear_override')),
            'listings_recomputed': recomputed_count,
        }
        if vendor_type is not None:
            response_data['vendor_type'] = vendor_type.name
        return Response(response_data)


def _broadcast_base_qs(school: str):
    """Return the base active-user queryset filtered by school."""
    qs = User.objects.filter(is_active=True)
    if school == 'pau':
        qs = qs.filter(Q(school__iexact='pau') | Q(school='') | Q(school__isnull=True))
    elif school:
        qs = qs.filter(school__iexact=school)
    return qs


def _apply_user_type_filter(qs, user_type: str):
    """Apply user_type filter to a queryset. Returns (filtered_qs, needs_distinct)."""
    if user_type == 'student':
        return qs.filter(user_type='student'), False
    if user_type == 'vendor':
        return qs.filter(user_type='vendor'), False
    if user_type == 'vendors_no_listings':
        return qs.filter(user_type='vendor', listings__isnull=True), False
    if user_type == 'vendors_with_listings':
        return qs.filter(user_type='vendor', listings__isnull=False).distinct(), True
    if user_type == 'vendors_active':
        return qs.filter(user_type='vendor', listings__is_available=True).distinct(), True
    if user_type == 'vendors_inactive':
        active_ids = qs.filter(user_type='vendor', listings__is_available=True).values_list('id', flat=True)
        return qs.filter(user_type='vendor', listings__isnull=False).exclude(id__in=active_ids).distinct(), True
    if user_type == 'students_no_orders':
        return qs.filter(user_type='student', orders__isnull=True), False
    if user_type == 'students_with_orders':
        return qs.filter(
            user_type='student',
            orders__status__in=('paid', 'seller_completed', 'completed'),
        ).distinct(), True
    return qs, False


def _personalize_message(template: str, user) -> str:
    """Replace template variables like {{username}} with user data."""
    import re

    # Map of available variables
    variables = {
        'username': user.username or '',
        'email': user.email or '',
        'first_name': user.first_name or '',
        'last_name': user.last_name or '',
        'business_name': user.business_name or '',
        'school': user.school or '',
        'user_type': user.user_type or '',
    }

    # Replace {{variable}} with actual values
    def replace_var(match):
        var_name = match.group(1)
        return str(variables.get(var_name, match.group(0)))

    return re.sub(r'\{\{(\w+)\}\}', replace_var, template)


class AdminBroadcastCountsView(APIView):
    """
    GET /api/admin/broadcast-counts/?school=
    Returns recipient counts for every broadcast filter type.
    """
    permission_classes = [IsAdminUser]

    def get(self, request):
        school = (request.query_params.get('school') or '').strip().lower()
        base = _broadcast_base_qs(school)

        vendors = base.filter(user_type='vendor')
        students = base.filter(user_type='student')

        active_vendor_ids = vendors.filter(listings__is_available=True).values_list('id', flat=True)

        counts = {
            'all':                    base.count(),
            'student':                students.count(),
            'vendor':                 vendors.count(),
            'vendors_no_listings':    vendors.filter(listings__isnull=True).count(),
            'vendors_with_listings':  vendors.filter(listings__isnull=False).distinct().count(),
            'vendors_active':         vendors.filter(listings__is_available=True).distinct().count(),
            'vendors_inactive':       vendors.filter(listings__isnull=False).exclude(id__in=active_vendor_ids).distinct().count(),
            'students_no_orders':     students.filter(orders__isnull=True).count(),
            'students_with_orders':   students.filter(
                orders__status__in=('paid', 'seller_completed', 'completed')
            ).distinct().count(),
        }
        return Response(counts)


class AdminBroadcastPreviewView(APIView):
    """
    POST /api/admin/broadcast-preview/
    Preview how a message template will look for sample users.
    Body: { title, message, school?, user_type? }
    Returns: { samples: [{ username, title, message }, ...] }
    """
    permission_classes = [IsAdminUser]

    def post(self, request):
        title   = (request.data.get('title')   or '').strip()
        message = (request.data.get('message') or '').strip()
        school     = (request.data.get('school')     or '').strip().lower()
        user_type  = (request.data.get('user_type')  or '').strip().lower()

        if not title or not message:
            return Response(
                {'error': 'title and message are required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        recipients = _broadcast_base_qs(school)
        if user_type:
            recipients, _ = _apply_user_type_filter(recipients, user_type)

        # Get up to 3 sample users
        samples = []
        for user in recipients[:3]:
            personalized_title = _personalize_message(title, user)
            personalized_message = _personalize_message(message, user)
            samples.append({
                'username': user.username,
                'business_name': user.business_name or user.username,
                'title': personalized_title,
                'message': personalized_message,
            })

        return Response({'samples': samples})


class AdminBroadcastMessageView(APIView):
    """
    POST /api/admin/notify-all/
    Send a notification to all active users or a filtered subset.
    Body: { title, message, school?, user_type? }
    """
    permission_classes = [IsAdminUser]

    def post(self, request):
        from accounts.utils import send_notification

        title   = (request.data.get('title')   or '').strip()
        message = (request.data.get('message') or '').strip()
        school     = (request.data.get('school')     or '').strip().lower()
        user_type  = (request.data.get('user_type')  or '').strip().lower()

        if not title or not message:
            return Response(
                {'error': 'title and message are required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        recipients = _broadcast_base_qs(school)
        if user_type:
            recipients, _ = _apply_user_type_filter(recipients, user_type)

        sent = 0
        for user in recipients.iterator():
            try:
                personalized_title = _personalize_message(title, user)
                personalized_message = _personalize_message(message, user)
                send_notification(
                    recipient=user,
                    notification_type='admin_message',
                    title=personalized_title,
                    message=personalized_message,
                    action_url='',
                )
                sent += 1
            except Exception:
                pass

        return Response({'sent': sent})


class AdminTestEmailView(APIView):
    """
    POST /api/admin/test-email/
    Send a test email to verify Resend and Brevo are configured correctly.
    Body: { to?: str }  — defaults to the requesting admin's email.
    Returns a detailed report of which provider succeeded or failed.
    """
    permission_classes = [IsAdminUser]

    def post(self, request):
        from studex.email import try_resend, try_brevo, html_wrapper
        from django.conf import settings as s

        to = (request.data.get('to') or '').strip() or request.user.email
        if not to:
            return Response({'error': 'No recipient email — provide "to" or log in with an email account.'}, status=400)

        subject = 'StudEx — Email Delivery Test'
        html = html_wrapper(
            'Email delivery test',
            '<p style="font-size:15px;color:#44403C;line-height:1.7;margin:0;">This is a test email sent from the StudEx admin panel to verify that your email provider is configured correctly.</p>',
        )

        resend_key = getattr(s, 'RESEND_API_KEY', '') or ''
        brevo_key  = getattr(s, 'BREVO_API_KEY',  '') or ''

        resend_result = {'configured': bool(resend_key), 'success': False, 'error': None}
        brevo_result  = {'configured': bool(brevo_key),  'success': False, 'error': None}

        # Test Resend
        if resend_key:
            try:
                import resend as resend_lib
                resend_lib.api_key = resend_key
                resend_lib.Emails.send({
                    'from': 'StudEx <noreply@studex.com.ng>',
                    'to': [to],
                    'subject': subject,
                    'html': html,
                })
                resend_result['success'] = True
            except Exception as e:
                resend_result['error'] = str(e)
        else:
            resend_result['error'] = 'RESEND_API_KEY is not set in environment variables.'

        # Test Brevo
        if brevo_key:
            try:
                import requests as http
                resp = http.post(
                    'https://api.brevo.com/v3/smtp/email',
                    headers={'api-key': brevo_key, 'Content-Type': 'application/json'},
                    json={
                        'sender': {'name': 'StudEx', 'email': 'noreply@studex.com.ng'},
                        'to': [{'email': to}],
                        'subject': subject + ' (Brevo)',
                        'htmlContent': html,
                    },
                    timeout=10,
                )
                resp.raise_for_status()
                brevo_result['success'] = True
            except Exception as e:
                brevo_result['error'] = str(e)
        else:
            brevo_result['error'] = 'BREVO_API_KEY is not set in environment variables.'

        overall = resend_result['success'] or brevo_result['success']
        return Response({
            'to': to,
            'overall_success': overall,
            'resend': resend_result,
            'brevo': brevo_result,
        }, status=200 if overall else 207)


# ============================================
# REWARDS OVERVIEW
# ============================================

class AdminRewardsOverviewView(APIView):
    """GET /api/admin/rewards-overview/ — loyalty credits and 5% discount usage."""
    permission_classes = [IsAdminUser]

    def get(self, request):
        from loyalty.models import LoyaltyAccount, LoyaltyTransaction
        from django.db.models import Sum

        MILESTONE = 10

        # Aggregate stats
        total_credits_issued = LoyaltyTransaction.objects.filter(
            type='earned'
        ).aggregate(total=Sum('amount'))['total'] or 0

        total_credits_redeemed = LoyaltyTransaction.objects.filter(
            type='redeemed'
        ).aggregate(total=Sum('amount'))['total'] or 0

        discount_users_count = Profile.objects.filter(profile_bonus_used=True).count()
        users_with_credits = LoyaltyAccount.objects.filter(credit_balance__gt=0).count()

        # Per-user loyalty data (all users who have a loyalty account)
        accounts = LoyaltyAccount.objects.select_related('user', 'user__profile').order_by('-credit_balance')
        loyalty_users = []
        for acc in accounts:
            completed = acc.total_completed_orders
            orders_until_next = MILESTONE - (completed % MILESTONE)
            if orders_until_next == MILESTONE and completed == 0:
                orders_until_next = MILESTONE
            try:
                bonus_used = acc.user.profile.profile_bonus_used
                bonus_eligible = acc.user.profile.profile_bonus_eligible
            except Exception:
                bonus_used = False
                bonus_eligible = False
            loyalty_users.append({
                'username': acc.user.username,
                'credit_balance': float(acc.credit_balance),
                'total_completed_orders': completed,
                'orders_until_next_reward': orders_until_next,
                'progress_pct': round((completed % MILESTONE) / MILESTONE * 100),
                'discount_eligible': bonus_eligible,
                'discount_used': bonus_used,
            })

        # Users who used the 5% profile bonus but have no loyalty account yet
        bonus_used_ids = set(
            Profile.objects.filter(profile_bonus_used=True).values_list('user_id', flat=True)
        )
        loyalty_user_ids = set(LoyaltyAccount.objects.values_list('user_id', flat=True))
        bonus_only_ids = bonus_used_ids - loyalty_user_ids
        for user in User.objects.filter(id__in=bonus_only_ids).select_related('profile'):
            loyalty_users.append({
                'username': user.username,
                'credit_balance': 0,
                'total_completed_orders': 0,
                'orders_until_next_reward': MILESTONE,
                'progress_pct': 0,
                'discount_eligible': getattr(user.profile, 'profile_bonus_eligible', False),
                'discount_used': True,
            })

        return Response({
            'summary': {
                'total_credits_issued': float(total_credits_issued),
                'total_credits_redeemed': float(total_credits_redeemed),
                'credits_outstanding': float(total_credits_issued) - float(total_credits_redeemed),
                'users_with_credit_balance': users_with_credits,
                'discount_users_count': discount_users_count,
            },
            'users': loyalty_users,
        })


# ═════════════════════════════════════════════════════════════════════════════
# DEALS MANAGEMENT
# ═════════════════════════════════════════════════════════════════════════════

class AdminDealsListView(APIView):
    """
    GET /api/admin/deals/ - List all deals with listing details
    POST /api/admin/deals/ - Create a new deal
    """
    permission_classes = [IsAdminUser]

    def get(self, request):
        from services.models import Deal, Listing
        from services.serializers import DealDetailSerializer, ListingSerializer
        from decimal import Decimal

        # ── Admin-created deals ───────────────────────────────────────────────
        admin_qs = Deal.objects.select_related(
            'listing__vendor__profile', 'listing__category'
        ).order_by('-created_at')
        admin_data = DealDetailSerializer(admin_qs, many=True).data
        admin_listing_ids = {d['listing']['id'] for d in admin_data}
        for d in admin_data:
            d['source'] = 'admin'

        # ── Vendor-set discounts (listings not in an admin deal) ─────────────
        vendor_qs = Listing.objects.filter(
            discount_percent__gt=0
        ).exclude(id__in=admin_listing_ids).select_related(
            'vendor__profile', 'category'
        ).order_by('-updated_at')

        vendor_data = []
        for listing in vendor_qs:
            serialized = dict(ListingSerializer(listing).data)
            discount = listing.discount_percent
            discounted = float(listing.price - listing.price * Decimal(discount) / 100)
            vendor_data.append({
                'id': f'v_{listing.id}',
                'listing': serialized,
                'discount_percent': discount,
                'discounted_price': round(discounted, 2),
                'is_active': listing.is_available,
                'created_at': listing.updated_at.isoformat() if listing.updated_at else None,
                'source': 'vendor',
                'vendor_username': listing.vendor.username,
            })

        all_deals = list(admin_data) + vendor_data
        all_deals.sort(key=lambda x: x.get('created_at') or '', reverse=True)
        return Response(all_deals)

    def post(self, request):
        from services.models import Deal, Listing
        from services.serializers import DealSerializer

        listing_id = request.data.get('listing_id')
        discount_percent = request.data.get('discount_percent')

        if not listing_id or discount_percent is None:
            return Response(
                {'error': 'listing_id and discount_percent are required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not (1 <= discount_percent <= 100):
            return Response(
                {'error': 'discount_percent must be between 1 and 100'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            listing = Listing.objects.get(id=listing_id)
        except Listing.DoesNotExist:
            return Response({'error': 'Listing not found'}, status=status.HTTP_404_NOT_FOUND)

        deal, created = Deal.objects.update_or_create(
            listing=listing,
            defaults={'discount_percent': discount_percent, 'is_active': True}
        )

        serializer = DealSerializer(deal)
        return Response(
            serializer.data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK
        )


class AdminDealDetailView(APIView):
    """
    PATCH /api/admin/deals/{id}/ - Update a deal
    DELETE /api/admin/deals/{id}/ - Delete a deal
    """
    permission_classes = [IsAdminUser]

    def patch(self, request, deal_id):
        from services.models import Deal
        from services.serializers import DealSerializer

        try:
            deal = Deal.objects.get(id=deal_id)
        except Deal.DoesNotExist:
            return Response({'error': 'Deal not found'}, status=status.HTTP_404_NOT_FOUND)

        discount_percent = request.data.get('discount_percent')
        is_active = request.data.get('is_active')

        if discount_percent is not None:
            if not (1 <= discount_percent <= 100):
                return Response(
                    {'error': 'discount_percent must be between 1 and 100'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            deal.discount_percent = discount_percent

        if is_active is not None:
            deal.is_active = is_active

        deal.save()
        serializer = DealSerializer(deal)
        return Response(serializer.data)

    def delete(self, request, deal_id):
        from services.models import Deal

        try:
            deal = Deal.objects.get(id=deal_id)
        except Deal.DoesNotExist:
            return Response({'error': 'Deal not found'}, status=status.HTTP_404_NOT_FOUND)

        deal.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
