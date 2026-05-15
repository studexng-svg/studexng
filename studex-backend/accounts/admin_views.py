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

            # Update profile if needed
            if 'profile' in request.data:
                profile = user.profile
                if 'is_verified_vendor' in request.data['profile']:
                    profile.is_verified_vendor = request.data['profile']['is_verified_vendor']
                    profile.save()

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
