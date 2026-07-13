# services/views.py
from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework.pagination import PageNumberPagination
from django.db.models import Q
from django.core.cache import cache
from .models import Category, Listing, Transaction, VendorOfTheMonth
from .serializers import CategorySerializer, ListingSerializer, TransactionSerializer
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated


def _invalidate_listing_cache(campus):
    for ps in ['20', '50', '100', '200', '500']:
        cache.delete(f'listings_{campus}_{ps}')


class ListingPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 500


class PreviewPriceView(APIView):
    """
    POST /api/services/preview-price/ {payout_amount} -> {payout_amount, platform_fee, price}
    Lets the vendor listing form show "buyer pays ₦X" live without duplicating the
    fee formula in the frontend — payments.pricing stays the only place it's computed.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from decimal import Decimal, InvalidOperation
        from payments.pricing import calculate_final_price

        raw = request.data.get('payout_amount')
        try:
            payout_amount = Decimal(str(raw))
        except (InvalidOperation, TypeError):
            return Response({"error": "payout_amount must be a number."}, status=400)
        if payout_amount <= 0:
            return Response({"error": "payout_amount must be greater than zero."}, status=400)

        price = calculate_final_price(payout_amount)
        return Response({
            "payout_amount": float(payout_amount),
            "platform_fee": float(price - payout_amount),
            "price": float(price),
        })


class WalletBalanceView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        balance = getattr(request.user, 'wallet_balance', 0)
        return Response({"balance": balance})


class WalletFundView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        amount = request.data.get('amount', 0)
        if not amount:
            return Response({"detail": "Amount required"}, status=400)
        if not hasattr(user, 'wallet_balance'):
            user.wallet_balance = 0
        user.wallet_balance += int(amount)
        return Response({"new_balance": user.wallet_balance})


def upload_to_cloudinary(image_file, folder='studex/listings'):
    """Upload image directly to Cloudinary, bypassing django-cloudinary-storage."""
    try:
        import cloudinary.uploader
        result = cloudinary.uploader.upload(
            image_file,
            folder=folder,
            transformation=[{'quality': 'auto', 'fetch_format': 'auto'}]
        )
        return result.get('secure_url', '')
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"Cloudinary upload failed: {e}")
        return None


class CategoryViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        user = self.request.user
        campus = 'pau'
        if user.is_authenticated:
            user_school = (getattr(user, 'school', '') or '').lower()
            if user_school in ('pau', 'futo', 'imsu'):
                campus = user_school
            # Users with no school (admins) can use the campus query param
            campus_param = self.request.query_params.get('campus', '').lower()
            if campus_param in ('pau', 'futo', 'imsu') and (not user_school or user_school not in ('pau', 'futo', 'imsu')):
                campus = campus_param
        else:
            campus_param = self.request.query_params.get('campus', '').lower()
            if campus_param in ('pau', 'futo', 'imsu'):
                campus = campus_param
        return Category.objects.filter(**{f'is_{campus}': True}).order_by('title')

    def list(self, request, *args, **kwargs):
        user = request.user
        if user.is_authenticated:
            campus = (getattr(user, 'school', '') or 'pau').lower()
            if campus not in ('pau', 'futo', 'imsu'):
                campus_param = request.query_params.get('campus', '').lower()
                campus = campus_param if campus_param in ('pau', 'futo', 'imsu') else 'pau'
        else:
            campus_param = request.query_params.get('campus', '').lower()
            campus = campus_param if campus_param in ('pau', 'futo', 'imsu') else 'pau'

        cache_key = f'categories_{campus}'
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)
        response = super().list(request, *args, **kwargs)
        cache.set(cache_key, response.data, 300)  # 5 minutes — categories rarely change
        return response


class ListingViewSet(viewsets.ModelViewSet):
    queryset = Listing.objects.all()
    serializer_class = ListingSerializer
    pagination_class = ListingPagination
    filterset_fields = ['is_available']
    search_fields = ['title', 'description', 'vendor__username', 'vendor__business_name']
    ordering_fields = ['price', 'created_at', 'title']
    ordering = ['-created_at']

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            permission_classes = [AllowAny]
        else:
            permission_classes = [permissions.IsAuthenticated]
        return [perm() for perm in permission_classes]

    def list(self, request, *args, **kwargs):
        # Never cache staff requests (they see unavailable listings too)
        # Never cache filtered/search queries — those are too varied to key efficiently
        if (request.user.is_authenticated and request.user.is_staff
                or request.query_params.get('search')
                or request.query_params.get('vendor_username')
                or request.query_params.get('category')):
            return super().list(request, *args, **kwargs)

        user = request.user
        if user.is_authenticated:
            campus = (getattr(user, 'school', '') or 'pau').lower()
        else:
            campus_param = request.query_params.get('campus', '').lower()
            campus = campus_param if campus_param in ('pau', 'futo', 'imsu') else 'pau'

        page_size = request.query_params.get('page_size', '20')
        cache_key = f'listings_{campus}_{page_size}'
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)
        response = super().list(request, *args, **kwargs)
        cache.set(cache_key, response.data, 60)  # 1 minute
        return response

    def get_queryset(self):
        user = self.request.user

        # Public vendor profile filter — bypass all other logic
        vendor_username = self.request.query_params.get('vendor_username')
        if vendor_username:
            qs = Listing.objects.filter(vendor__username__iexact=vendor_username, is_available=True)
            return qs.select_related('vendor', 'category').prefetch_related('vendor__profile', 'variants')

        # For retrieve/update/delete — no campus filter so any listing is accessible
        # by ID regardless of which campus the requester is on (fixes SSR 404 for FUTO listings)
        if self.action != 'list':
            return Listing.objects.all().select_related('vendor', 'category').prefetch_related('vendor__profile', 'variants')

        # List action only — campus-scoped listings
        campus = 'pau'
        if user.is_authenticated:
            campus = (getattr(user, 'school', '') or 'pau').lower()
            # Staff (admin) can override campus via query param
            if user.is_staff:
                campus_param = self.request.query_params.get('campus', campus).lower()
                if campus_param in ('pau', 'futo', 'imsu'):
                    campus = campus_param
        else:
            campus_param = self.request.query_params.get('campus', '').lower()
            if campus_param in ('pau', 'futo', 'imsu'):
                campus = campus_param

        # Staff see all listings regardless of availability; others see only available
        if user.is_authenticated and user.is_staff:
            qs = Listing.objects.filter(campus=campus)
        else:
            qs = Listing.objects.filter(campus=campus, is_available=True)

        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(
                Q(title__icontains=search) |
                Q(description__icontains=search) |
                Q(vendor__username__icontains=search) |
                Q(vendor__business_name__icontains=search)
            )

        category_param = self.request.query_params.get('category')
        if category_param:
            if category_param.isdigit():
                qs = qs.filter(category__id=category_param)
            else:
                qs = qs.filter(category__slug=category_param)

        return qs.select_related('vendor', 'category').prefetch_related('vendor__profile', 'variants')

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.vendor != request.user and not request.user.is_staff:
            return Response({"error": "You do not have permission to edit this listing."}, status=403)
        # Vendors cannot change is_available — only admin can via Django Admin
        if 'is_available' in request.data and not request.user.is_staff:
            try:
                if hasattr(request.data, '_mutable'):
                    request.data._mutable = True
                request.data.pop('is_available')
            except Exception:
                pass
        return super().update(request, *args, **kwargs)

    def perform_update(self, serializer):
        extra = {}
        for slot in ['image', 'image2', 'image3', 'image4', 'image5']:
            f = self.request.FILES.get(slot)
            if f:
                url = upload_to_cloudinary(f, folder='studex/listings')
                if url:
                    extra[slot] = url
        instance = serializer.save(**extra)
        _invalidate_listing_cache(instance.campus)

    def perform_create(self, serializer):
        extra = {}
        for slot in ['image', 'image2', 'image3', 'image4', 'image5']:
            f = self.request.FILES.get(slot)
            if f:
                url = upload_to_cloudinary(f, folder='studex/listings')
                if url:
                    extra[slot] = url
        campus = (getattr(self.request.user, 'school', '') or 'pau').lower()
        listing = serializer.save(
            vendor=self.request.user,
            is_available=False,
            campus=campus,
            **extra,
        )
        _invalidate_listing_cache(campus)
        # Notify admin that a new listing needs review and approval
        try:
            from studex.notifications import notify_admin_new_listing
            notify_admin_new_listing(listing)
        except Exception:
            pass

    def perform_destroy(self, instance):
        campus = instance.campus
        super().perform_destroy(instance)
        _invalidate_listing_cache(campus)


class TransactionViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = TransactionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        # Use is_verified_vendor, not user_type
        if self.request.user.user_type != 'vendor':
            return Transaction.objects.none()
        return Transaction.objects.filter(vendor=self.request.user)


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        old_password = request.data.get("old_password")
        new_password = request.data.get("new_password")

        if not old_password or not new_password:
            return Response({"error": "Missing fields"}, status=400)

        if not user.check_password(old_password):
            return Response({"error": "Old password incorrect"}, status=400)

        user.set_password(new_password)
        user.save()
        return Response({"message": "Password updated successfully"})


class VendorOfMonthView(APIView):
    """GET /api/services/vendor-of-month/ — returns the current vendor of the month."""
    permission_classes = [AllowAny]

    def get(self, request):
        try:
            campus = (request.query_params.get('campus') or 'futo').lower()
            votm = VendorOfTheMonth.objects.select_related(
                'vendor', 'vendor__profile'
            ).filter(campus=campus).first()
            if not votm or not votm.vendor:
                return Response(None)

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

            return Response({
                'id': vendor.id,
                'username': vendor.username,
                'business_name': vendor.business_name or vendor.username,
                'profile_picture': pic,
                'rating': float(getattr(profile, 'rating', 0) or 0),
                'total_reviews': int(getattr(profile, 'total_reviews', 0) or 0),
                'vendor_badge': getattr(profile, 'vendor_badge', 'none') or 'none',
                'month': votm.month.strftime('%B %Y'),
                'total_orders': votm.total_orders,
                'completion_rate': votm.completion_rate,
                'campus': votm.campus,
            })
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"VendorOfMonthView error: {e}", exc_info=True)
            return Response(None)


class VendorOfMonthHistoryView(APIView):
    """GET /api/services/vendor-of-month/history/ — all past VOTM winners, newest first."""
    permission_classes = [AllowAny]

    def _profile_pic(self, vendor, request):
        img = getattr(vendor, 'profile_image', None)
        if not img:
            return None
        name = getattr(img, 'name', None)
        if not name or name == 'profiles/default.jpg':
            return None
        if name.startswith('http'):
            return name
        try:
            url = img.url
            return url if url.startswith('http') else request.build_absolute_uri(url)
        except Exception:
            return None

    def get(self, request):
        try:
            entries = VendorOfTheMonth.objects.select_related(
                'vendor', 'vendor__profile'
            ).order_by('-month')

            results = []
            for entry in entries:
                vendor = entry.vendor
                if not vendor:
                    continue
                profile = getattr(vendor, 'profile', None)
                results.append({
                    'month': entry.month.strftime('%B %Y'),
                    'month_key': entry.month.strftime('%Y-%m'),
                    'username': vendor.username,
                    'business_name': vendor.business_name or vendor.username,
                    'profile_picture': self._profile_pic(vendor, request),
                    'rating': float(getattr(profile, 'rating', 0) or 0),
                    'total_reviews': int(getattr(profile, 'total_reviews', 0) or 0),
                    'vendor_badge': getattr(profile, 'vendor_badge', 'none') or 'none',
                    'total_orders': entry.total_orders,
                    'completion_rate': entry.completion_rate,
                    'is_manual_override': entry.is_manual_override,
                })
            return Response(results)
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"VendorOfMonthHistoryView error: {e}", exc_info=True)
            return Response([])


class DealsListView(APIView):
    """GET /api/services/deals/ - Active admin deals + vendor-discounted listings merged."""
    permission_classes = [AllowAny]

    def get(self, request):
        from services.models import Deal, Listing
        from services.serializers import DealDetailSerializer, ListingSerializer
        from decimal import Decimal

        campus = request.query_params.get('campus')

        # ── Admin-created deals ───────────────────────────────────────────────
        admin_qs = Deal.objects.filter(is_active=True).select_related(
            'listing__vendor__profile', 'listing__category'
        ).order_by('-created_at')
        if campus:
            admin_qs = admin_qs.filter(listing__campus__iexact=campus)

        admin_data = DealDetailSerializer(admin_qs, many=True).data
        admin_listing_ids = {d['listing']['id'] for d in admin_data}
        for d in admin_data:
            d['source'] = 'admin'

        # ── Vendor-set discounts (listings not already in an admin deal) ──────
        vendor_qs = Listing.objects.filter(
            discount_percent__gt=0, is_available=True
        ).exclude(id__in=admin_listing_ids).select_related(
            'vendor__profile', 'category'
        )
        if campus:
            vendor_qs = vendor_qs.filter(campus__iexact=campus)

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
                'is_active': True,
                'created_at': listing.updated_at.isoformat() if listing.updated_at else None,
                'source': 'vendor',
            })

        return Response(list(admin_data) + vendor_data)