# services/views.py
from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from .models import Category, Listing, Transaction
from .serializers import CategorySerializer, ListingSerializer, TransactionSerializer
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated


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


class ListingViewSet(viewsets.ModelViewSet):
    queryset = Listing.objects.all()
    serializer_class = ListingSerializer
    filterset_fields = ['is_available', 'vendor']
    search_fields = ['title', 'description', 'vendor__username', 'vendor__business_name']
    ordering_fields = ['price', 'created_at', 'title']
    ordering = ['-created_at']

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            permission_classes = [AllowAny]
        else:
            permission_classes = [permissions.IsAuthenticated]
        return [perm() for perm in permission_classes]

    def get_queryset(self):
        queryset = self.queryset

        # Filter by category slug or ID
        category_param = self.request.query_params.get('category', None)
        if category_param:
            if category_param.isdigit():
                queryset = queryset.filter(category__id=category_param)
            else:
                queryset = queryset.filter(category__slug=category_param)

        # Verified vendors see ONLY their own listings (vendor dashboard)
        # Everyone else (buyers, guests, students) sees only available listings from all vendors
        if self.request.user.is_authenticated and self.request.user.user_type == 'vendor':
            return queryset.filter(vendor=self.request.user)

        return queryset.filter(is_available=True)

    def update(self, request, *args, **kwargs):
        image_file = request.FILES.get('image')
        if image_file:
            image_url = upload_to_cloudinary(image_file, folder='studex/listings')
            if image_url:
                # Inject the Cloudinary URL into the request data
                data = request.data.copy() if hasattr(request.data, 'copy') else dict(request.data)
                data['image'] = image_url
                request._full_data = data
        # Vendors cannot change is_available — only admin can via Django Admin
        if 'is_available' in request.data and not request.user.is_staff:
            request.data._mutable = True if hasattr(request.data, '_mutable') else None
            try:
                request.data.pop('is_available')
            except Exception:
                pass
        return super().update(request, *args, **kwargs)

    def perform_create(self, serializer):
        image_url = None
        image_file = self.request.FILES.get('image')
        if image_file:
            image_url = upload_to_cloudinary(image_file, folder='studex/listings')
        listing = serializer.save(
            vendor=self.request.user,
            is_available=False,
            image=image_url or ''
        )
        # Notify admin that a new listing needs review and approval
        try:
            from studex.notifications import notify_admin_new_listing
            notify_admin_new_listing(listing)
        except Exception:
            pass


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