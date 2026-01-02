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
            'is_available', 'category', 'vendor', 'vendor_business',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['vendor', 'vendor_business', 'created_at', 'updated_at']

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