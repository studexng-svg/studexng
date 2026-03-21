# services/serializers.py
from rest_framework import serializers
from .models import Category, Listing, Transaction


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


class ListingSerializer(serializers.ModelSerializer):
    vendor = VendorSerializer(read_only=True)
    vendor_is_verified = serializers.ReadOnlyField(source='vendor.is_verified_vendor')
    category = serializers.SlugRelatedField(
        slug_field='slug',
        queryset=Category.objects.all(),
        help_text="Category slug (e.g., 'food', 'nails')"
    )
    image = serializers.SerializerMethodField()
    image_upload = serializers.CharField(required=False, allow_null=True, allow_blank=True, write_only=True, source='image')

    class Meta:
        model = Listing
        fields = [
            'id', 'title', 'description', 'price', 'image',
            'is_available', 'listing_type', 'track_inventory', 'stock_quantity',
            'category', 'vendor', 'vendor_is_verified',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['vendor', 'vendor_is_verified', 'created_at', 'updated_at']

    def get_image(self, obj):
        """Return image URL as-is — could be Cloudinary URL or local path."""
        if not obj.image:
            return None
        img = str(obj.image)
        if img.startswith('http'):
            return img
        # Local file — prepend media URL
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(f'/media/{img}')
        return f'/media/{img}'

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