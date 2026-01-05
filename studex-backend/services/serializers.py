# services/serializers.py
from rest_framework import serializers
from .models import Category, Listing, Transaction  # ← Added Transaction


class CategorySerializer(serializers.ModelSerializer):
    """Serializer for Category model"""
    class Meta:
        model = Category
        fields = ['id', 'title', 'slug', 'image']
        read_only_fields = ['id']


class ListingSerializer(serializers.ModelSerializer):
    """Serializer for vendor product/service listings"""
    vendor = serializers.ReadOnlyField(source='vendor.username')
    vendor_business = serializers.ReadOnlyField(source='vendor.business_name')
    vendor_is_verified = serializers.ReadOnlyField(source='vendor.is_verified_vendor')  # CRITICAL FIX: Display verified badge
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
            'is_available', 'category', 'vendor', 'vendor_business', 'vendor_is_verified',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['vendor', 'vendor_business', 'vendor_is_verified', 'created_at', 'updated_at']

    def validate_image(self, value):
        """Validate image file size and format"""
        if value:
            # CRITICAL FIX: Max file size 5MB
            max_size = 5 * 1024 * 1024  # 5MB in bytes
            if value.size > max_size:
                raise serializers.ValidationError(
                    f"Image file too large. Maximum size is 5MB. Your file is {value.size / (1024 * 1024):.2f}MB."
                )

            # CRITICAL FIX: Check file format
            allowed_formats = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
            content_type = getattr(value, 'content_type', '')
            if content_type and content_type not in allowed_formats:
                raise serializers.ValidationError(
                    f"Invalid image format '{content_type}'. Only JPG, PNG, and WebP are allowed."
                )

            # Additional check: validate file extension
            import os
            ext = os.path.splitext(value.name)[1].lower() if value.name else ''
            allowed_extensions = ['.jpg', '.jpeg', '.png', '.webp']
            if ext and ext not in allowed_extensions:
                raise serializers.ValidationError(
                    f"Invalid file extension '{ext}'. Only .jpg, .jpeg, .png, and .webp are allowed."
                )

        return value

    def validate(self, data):
        user = self.context['request'].user

        # Only vendors can create listings
        if user.user_type != 'vendor':
            raise serializers.ValidationError("Only vendors can create listings.")

        # Only verified vendors can create listings
        if not user.is_verified_vendor:
            raise serializers.ValidationError("You must be a verified vendor to post listings.")

        return data


# NEW: Transaction Serializer for payouts
class TransactionSerializer(serializers.ModelSerializer):
    """Serializer for vendor payout transactions"""
    buyer_name = serializers.CharField(source='order.buyer.username', read_only=True)
    service_name = serializers.CharField(source='order.listing.title', read_only=True)
    order_reference = serializers.CharField(source='order.reference', read_only=True)

    class Meta:
        model = Transaction
        fields = [
            'id',
            'order_reference',
            'amount',
            'status',
            'created_at',
            'released_at',
            'withdrawn_at',
            'buyer_name',
            'service_name'
        ]
        read_only_fields = ['id', 'created_at', 'released_at', 'withdrawn_at']