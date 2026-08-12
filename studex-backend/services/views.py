# services/views.py
from rest_framework import viewsets, permissions, generics
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework.pagination import PageNumberPagination
from django.db.models import Q, ProtectedError
from django.core.cache import cache
from .models import Category, Listing, Transaction, VendorOfTheMonth, SearchQuery
from .serializers import CategorySerializer, ListingSerializer, TransactionSerializer
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated


def invalidate_listing_cache(campus):
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

        from payments.settlement import get_vendor_type
        campus = (getattr(request.user, 'school', '') or '').lower()
        price = calculate_final_price(payout_amount, campus=campus, vendor_type=get_vendor_type(request.user))
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
        search_term = request.query_params.get('search', '').strip()

        # Never cache staff requests (they see unavailable listings too)
        # Never cache filtered/search queries — those are too varied to key efficiently
        if (request.user.is_authenticated and request.user.is_staff
                or search_term
                or request.query_params.get('vendor_username')
                or request.query_params.get('category')):
            response = super().list(request, *args, **kwargs)
            if search_term:
                self._log_search(request, search_term, response)
            return response

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

    def _log_search(self, request, term, response):
        # Analytics-only — must never break the actual search response.
        try:
            results_count = response.data.get('count') if isinstance(response.data, dict) else None
            SearchQuery.objects.create(
                query=term.lower()[:200],
                user=request.user if request.user.is_authenticated else None,
                results_count=results_count or 0,
            )
        except Exception:
            pass

    def get_queryset(self):
        user = self.request.user

        # Public vendor profile filter — bypass all other logic
        vendor_username = self.request.query_params.get('vendor_username')
        if vendor_username:
            qs = Listing.objects.filter(vendor__username__iexact=vendor_username)
            is_owner = user.is_authenticated and user.username.lower() == vendor_username.lower()
            if not (is_owner or (user.is_authenticated and user.is_staff)):
                # Public storefront visitors (and other vendors) only ever see
                # approved listings; the vendor viewing their own dashboard
                # needs to see pending ones too so they can track approval status.
                qs = qs.filter(is_available=True)
            return qs.select_related('vendor', 'category', 'vendor__vendor__vendor_type').prefetch_related('vendor__profile', 'variants')

        # For retrieve/update/delete — no campus filter so any listing is accessible
        # by ID regardless of which campus the requester is on (fixes SSR 404 for FUTO listings)
        if self.action != 'list':
            return Listing.objects.all().select_related('vendor', 'category', 'vendor__vendor__vendor_type').prefetch_related('vendor__profile', 'variants')

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

        # Store/menu vendors (Vendor.vendor_type.supports_menu_ordering — same
        # relationship chain get_vendor_type() in payments/settlement.py reads)
        # are discoverable only via their own vendor profile page (the
        # vendor_username branch above) or the Restaurants strip on /home —
        # never through general browsing, category chips, or search, all of
        # which flow through this branch. Excluded at the query level, not
        # just hidden client-side.
        qs = qs.exclude(vendor__vendor__vendor_type__supports_menu_ordering=True)

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

        return qs.select_related('vendor', 'category', 'vendor__vendor__vendor_type').prefetch_related('vendor__profile', 'variants')

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
        invalidate_listing_cache(instance.campus)

    def perform_create(self, serializer):
        extra = {}
        for slot in ['image', 'image2', 'image3', 'image4', 'image5']:
            f = self.request.FILES.get(slot)
            if f:
                url = upload_to_cloudinary(f, folder='studex/listings')
                if url:
                    extra[slot] = url

        # A menu-ordering vendor's (Store's) listings are always food/dish
        # photos, shown prominently in the buyer-facing menu — never
        # optional, unlike a plain marketplace listing. Enforced here, not
        # just in the kitchen dashboard form, since the raw upload never
        # passes through ListingSerializer.validate() (image files are
        # pulled straight from request.FILES above, not serializer data).
        from payments.settlement import get_vendor_type
        vendor_type = get_vendor_type(self.request.user)
        if vendor_type and vendor_type.supports_menu_ordering and 'image' not in extra:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'image': 'A photo is required.'})

        campus = (getattr(self.request.user, 'school', '') or 'pau').lower()
        listing = serializer.save(
            vendor=self.request.user,
            is_available=False,
            campus=campus,
            **extra,
        )
        invalidate_listing_cache(campus)
        # Notify admin that a new listing needs review and approval
        try:
            from studex.notifications import notify_admin_new_listing
            notify_admin_new_listing(listing)
        except Exception:
            pass

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.vendor != request.user and not request.user.is_staff:
            return Response({"error": "You do not have permission to delete this listing."}, status=403)
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            # OrderItem.listing is on_delete=PROTECT (orders/models.py) — any
            # listing with real order history (every menu/cart-checkout item
            # that's ever sold) can't be hard-deleted, since Order.listing
            # itself is CASCADE and would silently wipe that order history
            # out from under the buyer/vendor/admin. Direct the vendor to the
            # existing non-destructive alternative instead (MenuItem.is_hidden
            # /is_archived for a menu item, is_available toggle for others).
            return Response({
                "error": (
                    "This item has existing orders and can't be deleted — "
                    "hide or archive it instead so buyers stop seeing it, "
                    "without losing your order history."
                )
            }, status=400)

    def perform_destroy(self, instance):
        campus = instance.campus
        super().perform_destroy(instance)
        invalidate_listing_cache(campus)


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
        from payments.settlement import get_vendor_type
        try:
            campus = (request.query_params.get('campus') or 'futo').lower()
            votm = VendorOfTheMonth.objects.select_related(
                'vendor', 'vendor__profile', 'vendor__vendor__vendor_type'
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

            vt = get_vendor_type(vendor)

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
                'is_menu_vendor': bool(vt and vt.supports_menu_ordering),
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
        from payments.settlement import get_vendor_type
        try:
            entries = VendorOfTheMonth.objects.select_related(
                'vendor', 'vendor__profile', 'vendor__vendor__vendor_type'
            ).order_by('-month')

            results = []
            for entry in entries:
                vendor = entry.vendor
                if not vendor:
                    continue
                profile = getattr(vendor, 'profile', None)
                vt = get_vendor_type(vendor)
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
                    'is_menu_vendor': bool(vt and vt.supports_menu_ordering),
                })
            return Response(results)
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"VendorOfMonthHistoryView error: {e}", exc_info=True)
            return Response([])


class HeroSlideListView(generics.ListAPIView):
    """GET /api/services/hero-slides/ — active hero slides, admin-uploaded, in display order.

    Powers the home feed hero's slideshow (HomePageClient.tsx). No campus filter —
    an uploaded hero image is a platform-wide visual, not campus-scoped content.
    """
    permission_classes = [AllowAny]
    pagination_class = None

    def get_queryset(self):
        from services.models import HeroSlide
        return HeroSlide.objects.filter(is_active=True).order_by('display_order', 'created_at')

    def get_serializer_class(self):
        from services.serializers import HeroSlideSerializer
        return HeroSlideSerializer


class DealsListView(APIView):
    """GET /api/services/deals/ - Active admin deals + vendor-discounted listings merged."""
    permission_classes = [AllowAny]

    def get(self, request):
        from services.models import Deal, Listing
        from services.serializers import DealDetailSerializer, ListingSerializer

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

        from payments.pricing import apply_vendor_discount
        from payments.settlement import get_vendor_type
        vendor_data = []
        for listing in vendor_qs:
            serialized = dict(ListingSerializer(listing).data)
            discount = listing.discount_percent
            _, _, discounted_price = apply_vendor_discount(
                listing.payout_amount, discount, price=listing.price,
                campus=listing.campus, vendor_type=get_vendor_type(listing.vendor),
            )
            discounted = float(discounted_price)
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


# ─────────────────────────────────────────────────────────────────────────────
# Phase 1 — Food Commerce Engine: menu management (Step 2)
#
# Every ViewSet below is gated by CanManageMenu (services/permissions.py —
# accounts.VendorType.supports_menu_ordering) and scoped by get_queryset to
# rows the requesting vendor actually owns. There is no code path here that
# checks `vendor_type.name == 'food'` — a future Bakery/Grocery/Pharmacy
# VendorType gets this exact same management layer for free the moment an
# admin flips its supports_menu_ordering flag (Step 1).
# ─────────────────────────────────────────────────────────────────────────────

from .models import MenuCategory, MenuItem, AddonGroup, Addon
from .serializers import (
    MenuCategorySerializer, MenuItemSerializer, AddonGroupSerializer, AddonSerializer, ReorderSerializer,
)
from .permissions import CanManageMenu


class ReorderMixin:
    """
    Shared bulk drag-and-drop reordering for any ViewSet whose model has a
    `display_order` field. Only ever touches rows already returned by
    get_queryset — i.e. only the requesting vendor's own rows — so passing
    another vendor's id in the payload silently has no effect rather than
    leaking whether that id exists.
    """
    @action(detail=False, methods=['post'])
    def reorder(self, request):
        serializer = ReorderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        items = serializer.validated_data['items']

        owned_ids = set(self.get_queryset().values_list('id', flat=True))
        model = self.get_queryset().model
        to_update = []
        for entry in items:
            if entry['id'] not in owned_ids:
                continue
            obj = model(pk=entry['id'], display_order=entry['display_order'])
            to_update.append(obj)
        model.objects.bulk_update(to_update, ['display_order'])

        return Response(self.get_serializer(self.get_queryset(), many=True).data)


class MenuCategoryViewSet(ReorderMixin, viewsets.ModelViewSet):
    """
    /api/v1/services/menu-categories/ — a vendor's own menu sections.
    Requires VendorType.supports_menu_ordering=True.
    """
    serializer_class = MenuCategorySerializer
    permission_classes = [IsAuthenticated, CanManageMenu]

    def get_queryset(self):
        return MenuCategory.objects.filter(vendor=self.request.user)

    def perform_create(self, serializer):
        serializer.save(vendor=self.request.user)


class MenuItemViewSet(viewsets.ModelViewSet):
    """
    /api/v1/services/menu-items/ — the catalog-detail extension for one of
    the vendor's own Listings (services.models.MenuItem). `Listing` itself
    is managed via the existing ListingViewSet, completely unchanged — this
    only manages the Phase 1 extension row (allergens, prep time, category,
    seasonality, hidden/archived, availability window).

    Deliberately does NOT use ReorderMixin: MenuItem has no display_order
    field of its own — ordering within a category is a MenuCategory-level
    concern (and, within a category, an AddonGroup/Addon-level concern for
    their own children). Adding the mixin here would register a `reorder`
    action that crashes the instant it's called.
    """
    serializer_class = MenuItemSerializer
    permission_classes = [IsAuthenticated, CanManageMenu]

    def get_queryset(self):
        return (
            MenuItem.objects.filter(listing__vendor=self.request.user)
            .select_related('listing', 'menu_category')
            .prefetch_related('addon_groups__addons')
        )


class AddonGroupViewSet(ReorderMixin, viewsets.ModelViewSet):
    """/api/v1/services/addon-groups/ — customization prompts on the vendor's own menu items."""
    serializer_class = AddonGroupSerializer
    permission_classes = [IsAuthenticated, CanManageMenu]

    def get_queryset(self):
        return (
            AddonGroup.objects.filter(menu_item__listing__vendor=self.request.user)
            .select_related('menu_item__listing')
            .prefetch_related('addons')
        )


class AddonViewSet(ReorderMixin, viewsets.ModelViewSet):
    """/api/v1/services/addons/ — individual selectable options within an add-on group."""
    serializer_class = AddonSerializer
    permission_classes = [IsAuthenticated, CanManageMenu]

    def get_queryset(self):
        return Addon.objects.filter(group__menu_item__listing__vendor=self.request.user).select_related(
            'group__menu_item__listing',
        )