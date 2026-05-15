# accounts/admin_views.py
"""
Admin-only API views for managing the StudEx platform.

All views require is_staff=True permission.
These endpoints power the Next.js admin dashboard.
"""

from rest_framework import status, generics
from rest_framework.views import APIView
from rest_framework.response import Response
from django.db.models import Q, Count, Sum
from django.conf import settings
import resend

from studex.permissions import IsAdminUser, IsSuperAdminUser
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
        try:
            data = AdminAnalytics.get_dashboard_summary()
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

            return Response({
                'series': series,
                'status_distribution': status_dist,
            })
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

        # Campus / school filter — PAU includes null/blank (legacy users)
        school = self.request.query_params.get('school', None)
        if school:
            school = school.lower()
            if school == 'pau':
                queryset = queryset.filter(
                    Q(school__iexact='pau') | Q(school='') | Q(school__isnull=True)
                )
            else:
                queryset = queryset.filter(school__iexact=school)

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

            if not was_vendor and user.user_type == 'vendor':
                try:
                    resend.api_key = settings.RESEND_API_KEY
                    display_name = user.business_name or user.username
                    resend.Emails.send({
                        'from': 'StudEx <noreply@studex.com.ng>',
                        'to': [user.email],
                        'subject': 'You are now a verified vendor on StudEx!',
                        'html': f'''
                            <div style="font-family: DM Sans, sans-serif; max-width: 520px; margin: 0 auto; padding: 40px 32px; background: #ffffff;">
                                <h1 style="font-size: 26px; color: #1C1917; margin-bottom: 8px;">Congratulations, {display_name}! 🎉</h1>
                                <p style="font-size: 16px; color: #44403C; line-height: 1.6;">
                                    We are thrilled to let you know that your vendor application has been <strong>approved</strong>.
                                    You are now officially a verified vendor on <strong>StudEx</strong> and your profile is live on the marketplace.
                                </p>
                                <div style="background: linear-gradient(135deg, #0D9488, #7C3AED); border-radius: 16px; padding: 28px 24px; margin: 28px 0; text-align: center;">
                                    <p style="color: #ffffff; font-size: 18px; font-weight: 600; margin: 0 0 6px 0;">You are verified ✓</p>
                                    <p style="color: #e0f2fe; font-size: 14px; margin: 0;">Students on your campus can now discover and book your services.</p>
                                </div>
                                <p style="font-size: 15px; color: #44403C; line-height: 1.6;">
                                    Head over to your seller dashboard to create your first listing, set your prices, and start receiving orders.
                                    We built StudEx to help talented people like you grow, and we are excited to see what you bring to the community.
                                </p>
                                <a href="{settings.FRONTEND_BASE_URL}/seller" style="display: inline-block; margin-top: 20px; padding: 14px 28px; background: #0D9488; color: #ffffff; text-decoration: none; border-radius: 10px; font-size: 15px; font-weight: 600;">
                                    Go to Seller Dashboard
                                </a>
                                <p style="margin-top: 36px; font-size: 13px; color: #A8A29E;">
                                    If you have any questions, reach out to us anytime. Welcome to the StudEx vendor family!
                                </p>
                            </div>
                        ''',
                    })
                except Exception as e:
                    print(f"Resend vendor approval email error: {e}")

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

            # Campus filter
            campus = self.request.query_params.get('campus', None)
            if campus:
                queryset = queryset.filter(campus__iexact=campus)

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

            # Campus filter via listing
            campus = self.request.query_params.get('campus', None)
            if campus:
                queryset = queryset.filter(listing__campus__iexact=campus)

            return queryset


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
                return Response(data, status=status.HTTP_200_OK)
            except Order.DoesNotExist:
                return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)

        def patch(self, request, order_id):
            try:
                order = Order.objects.get(id=order_id)
                if 'status' in request.data:
                    order.status = request.data['status']
                    order.save()
                serializer = OrderSerializer(order)
                return Response(serializer.data, status=status.HTTP_200_OK)
            except Order.DoesNotExist:
                return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)

except ImportError:
    AdminOrderListView = None
    AdminOrderDetailView = None


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
                if 'status' in request.data and request.data['status'] == 'resolved':
                    from django.utils import timezone as tz
                    dispute.resolved_at = tz.now()
                    dispute.resolved_by = request.user
                dispute.save()
                return Response(DisputeSerializer(dispute).data)
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
# ============================================

try:
    from services.models import Transaction as ServiceTransaction

    class AdminServiceTransactionListView(generics.ListAPIView):
        """GET /api/admin/service-transactions/ — payout escrow records."""
        permission_classes = [IsAdminUser]

        def list(self, request, *args, **kwargs):
            qs = ServiceTransaction.objects.all().select_related('vendor', 'order').order_by('-created_at')
            tx_status = request.query_params.get('status')
            if tx_status:
                qs = qs.filter(status=tx_status)
            search = request.query_params.get('search')
            if search:
                qs = qs.filter(
                    Q(vendor__username__icontains=search) |
                    Q(order__reference__icontains=search)
                )
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
            for t in qs:
                data.append({
                    'id': t.id,
                    'vendor_id': t.vendor.id,
                    'vendor': t.vendor.username,
                    'business_name': getattr(t.vendor, 'business_name', None),
                    'order_id': t.order.id if t.order else None,
                    'order_reference': t.order.reference if t.order else None,
                    'amount': str(t.amount),
                    'status': t.status,
                    'created_at': t.created_at.isoformat(),
                    'released_at': t.released_at.isoformat() if t.released_at else None,
                    'withdrawn_at': t.withdrawn_at.isoformat() if t.withdrawn_at else None,
                })
            return Response(data)

    class AdminServiceTransactionDetailView(APIView):
        """PATCH /api/admin/service-transactions/{id}/ — release or mark withdrawn."""
        permission_classes = [IsAdminUser]

        def patch(self, request, tx_id):
            try:
                from django.utils import timezone as tz
                t = ServiceTransaction.objects.select_related('vendor').get(id=tx_id)
                new_status = request.data.get('status')
                if new_status == 'released' and t.status == 'in_escrow':
                    t.status = 'released'
                    t.released_at = tz.now()
                    t.vendor.wallet_balance = (t.vendor.wallet_balance or 0) + t.amount
                    t.vendor.save()
                    t.save()
                elif new_status == 'withdrawn' and t.status == 'released':
                    t.status = 'withdrawn'
                    t.withdrawn_at = tz.now()
                    t.save()
                return Response({'id': t.id, 'status': t.status})
            except ServiceTransaction.DoesNotExist:
                return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

except ImportError:
    AdminServiceTransactionListView = None
    AdminServiceTransactionDetailView = None


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
            cats = Category.objects.all().order_by('title')
            data = []
            for c in cats:
                data.append({
                    'id': c.id,
                    'title': c.title,
                    'slug': c.slug,
                    'image': c.image,
                    'campus': c.campus,
                    'listing_count': c.listings.count(),
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
            try:
                cat = Category.objects.create(title=title, slug=slug, campus=campus, image=image or None)
                return Response({'id': cat.id, 'title': cat.title, 'slug': cat.slug, 'campus': cat.campus, 'image': cat.image}, status=status.HTTP_201_CREATED)
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
                    cat.campus = request.data['campus']
                if 'image' in request.data:
                    cat.image = request.data['image'] or None
                cat.save()
                return Response({'id': cat.id, 'title': cat.title, 'slug': cat.slug, 'campus': cat.campus, 'image': cat.image})
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

except ImportError:
    AdminCartListView = None


# ============================================
# CONVERSATION / CHAT OVERSIGHT
# ============================================

try:
    from chat.models import Conversation, Message as ChatMessage

    class AdminConversationListView(APIView):
        """GET /api/admin/conversations/ — all conversations."""
        permission_classes = [IsAdminUser]

        def get(self, request):
            qs = Conversation.objects.all().select_related(
                'buyer', 'seller', 'listing'
            ).order_by('-updated_at')

            search = request.query_params.get('search')
            if search:
                qs = qs.filter(
                    Q(buyer__username__icontains=search) |
                    Q(seller__username__icontains=search) |
                    Q(listing__title__icontains=search)
                )

            campus = request.query_params.get('campus')
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

except ImportError:
    AdminConversationListView = None
    AdminConversationDetailView = None


# ============================================
# BROADCAST MESSAGING
# ============================================

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

        recipients = User.objects.filter(is_active=True)

        if school:
            if school == 'pau':
                recipients = recipients.filter(
                    Q(school__iexact='pau') | Q(school='') | Q(school__isnull=True)
                )
            else:
                recipients = recipients.filter(school__iexact=school)

        if user_type in ('student', 'vendor'):
            recipients = recipients.filter(user_type=user_type)

        sent = 0
        for user in recipients.iterator():
            try:
                send_notification(
                    recipient=user,
                    notification_type='admin_message',
                    title=title,
                    message=message,
                    action_url='',
                )
                sent += 1
            except Exception:
                pass

        return Response({'sent': sent})
