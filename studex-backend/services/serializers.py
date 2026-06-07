# services/serializers.py
from rest_framework import serializers
from .models import Category, Listing, Transaction, Deal
from django.contrib.auth import get_user_model

User = get_user_model()


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ['id', 'title', 'slug', 'image']
        read_only_fields = ['id']


class VendorSerializer(serializers.Serializer):
    """Minimal vendor info needed by frontend - includes id for chat"""
    id = serializers.IntegerField(source='pk')
    username = serializers.CharField()
    business_name = serializers.SerializerMethodField()

    def get_business_name(self, obj):
        profile = getattr(obj, 'profile', None)
        return profile.business_name if profile and hasattr(profile, 'business_name') else None


class ListingVendorSerializer(serializers.ModelSerializer):
    """Vendor serializer for listing detail — includes profile stats."""
    vendor_badge = serializers.CharField(source='profile.vendor_badge', default=None)
    completion_rate = serializers.DecimalField(source='profile.completion_rate', max_digits=5, decimal_places=2, default=0)
    rating = serializers.DecimalField(source='profile.rating', max_digits=3, decimal_places=2, default=0)
    total_reviews = serializers.IntegerField(source='profile.total_reviews', default=0)
    profile = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'business_name', 'hostel', 'vendor_badge', 'completion_rate', 'rating', 'total_reviews', 'profile']

    def get_profile(self, obj):
        try:
            p = obj.profile
            return {
                'available_days': p.available_days or [],
                'opening_time': p.opening_time.strftime('%H:%M') if p.opening_time else None,
                'closing_time': p.closing_time.strftime('%H:%M') if p.closing_time else None,
            }
        except Exception:
            return {'available_days': [], 'opening_time': None, 'closing_time': None}


class ListingSerializer(serializers.ModelSerializer):
    vendor = ListingVendorSerializer(read_only=True)
    vendor_is_verified = serializers.ReadOnlyField(source='vendor.is_verified_vendor')
    category = serializers.SlugRelatedField(
        slug_field='slug',
        queryset=Category.objects.all(),
        help_text="Category slug (e.g., 'food', 'nails')"
    )
    image = serializers.SerializerMethodField()
    image2 = serializers.SerializerMethodField()
    image3 = serializers.SerializerMethodField()
    image4 = serializers.SerializerMethodField()
    image5 = serializers.SerializerMethodField()
    image_upload = serializers.CharField(required=False, allow_null=True, allow_blank=True, write_only=True, source='image')
    is_reserved = serializers.SerializerMethodField()
    campus = serializers.CharField(source='vendor.school', read_only=True, default='')

    class Meta:
        model = Listing
        fields = [
            'id', 'title', 'description', 'price',
            'image', 'image2', 'image3', 'image4', 'image5', 'image_upload',
            'is_available', 'listing_type', 'track_inventory', 'stock_quantity',
            'is_reserved',
            'category', 'vendor', 'vendor_is_verified',
            'campus',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['vendor', 'vendor_is_verified', 'created_at', 'updated_at']

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Expand category slug into a full object for frontend consumption.
        # Writes still use SlugRelatedField (slug string) as before.
        cat = instance.category
        if cat:
            data['category'] = {'id': cat.id, 'title': cat.title, 'slug': cat.slug}
        return data

    def get_is_reserved(self, obj):
        if not (obj.track_inventory and obj.stock_quantity == 1):
            return False
        from django.core.cache import cache
        return cache.get(f'reserved:{obj.pk}') is not None

    def _resolve_image(self, url):
        if not url:
            return None
        img = str(url)
        if img.startswith('http'):
            return img
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(f'/media/{img}')
        return f'/media/{img}'

    def get_image(self, obj):
        return self._resolve_image(obj.image)

    def get_image2(self, obj):
        return self._resolve_image(obj.image2)

    def get_image3(self, obj):
        return self._resolve_image(obj.image3)

    def get_image4(self, obj):
        return self._resolve_image(obj.image4)

    def get_image5(self, obj):
        return self._resolve_image(obj.image5)

    def validate_image(self, value):
        # If it's already a URL string, just return it
        if isinstance(value, str):
            return value
        return value

    def validate(self, data):
        request = self.context.get('request')
        if not request:
            return data  # nested/read-only usage — skip write validation
        user = request.user
        if not user.is_verified_vendor:
            raise serializers.ValidationError("You must be a verified vendor to post listings.")
        return data


class TransactionSerializer(serializers.ModelSerializer):
    buyer_name = serializers.CharField(source='order.buyer.username', read_only=True)
    service_name = serializers.CharField(source='order.listing.title', read_only=True)
    order_reference = serializers.CharField(source='order.reference', read_only=True)

    class Meta:
        model = Transaction
        fields = [
            'id', 'order_reference', 'amount', 'status',
            'created_at', 'released_at', 'withdrawn_at',
            'buyer_name', 'service_name'
        ]
        read_only_fields = ['id', 'created_at', 'released_at', 'withdrawn_at']


class DealSerializer(serializers.ModelSerializer):
    listing_id = serializers.IntegerField()
    discounted_price = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Deal
        fields = ['id', 'listing_id', 'discount_percent', 'discounted_price', 'is_active', 'created_at']
        read_only_fields = ['id', 'created_at']

    def get_discounted_price(self, obj):
        return float(obj.discounted_price)


class DealDetailSerializer(serializers.ModelSerializer):
    listing = ListingSerializer(read_only=True)
    discounted_price = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Deal
        fields = ['id', 'listing', 'discount_percent', 'discounted_price', 'is_active', 'created_at']
        read_only_fields = ['id', 'created_at']

    def get_discounted_price(self, obj):
        return float(obj.discounted_price)


