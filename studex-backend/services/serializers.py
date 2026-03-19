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
    image = serializers.ImageField(required=False, allow_null=True)

    class Meta:
        model = Listing
        fields = [
            'id', 'title', 'description', 'price', 'image',
            'is_available', 'listing_type', 'track_inventory', 'stock_quantity',
            'category', 'vendor', 'vendor_is_verified',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['vendor', 'vendor_is_verified', 'created_at', 'updated_at']

    def validate_image(self, value):
        if value:
            max_size = 5 * 1024 * 1024
            if value.size > max_size:
                raise serializers.ValidationError(
                    f"Image file too large. Maximum size is 5MB. Your file is {value.size / (1024 * 1024):.2f}MB."
                )
            allowed_formats = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
            content_type = getattr(value, 'content_type', '')
            if content_type and content_type not in allowed_formats:
                raise serializers.ValidationError(
                    f"Invalid image format '{content_type}'. Only JPG, PNG, and WebP are allowed."
                )
            import os
            ext = os.path.splitext(value.name)[1].lower() if value.name else ''
            allowed_extensions = ['.jpg', '.jpeg', '.png', '.webp']
            if ext and ext not in allowed_extensions:
                raise serializers.ValidationError(
                    f"Invalid file extension '{ext}'. Only .jpg, .jpeg, .png, and .webp are allowed."
                )
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