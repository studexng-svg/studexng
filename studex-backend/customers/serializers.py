# customers/serializers.py
from rest_framework import serializers
from .models import VendorCustomer


def get_profile_picture(user):
    """
    Same Cloudinary-URL-resolution logic as orders.serializers.OrderSerializer.
    get_buyer_profile_picture — duplicated here (not imported) because that method
    is bound to a `self.context['request']` serializer instance; kept identical on
    purpose so both stay in sync if the resolution logic ever changes.
    """
    try:
        img = user.profile_image
        if not img:
            return None
        name = getattr(img, 'name', None)
        if not name or name == 'profiles/default.jpg':
            return None
        if name.startswith('http'):
            return name
        return img.url
    except Exception:
        return None


class VendorCustomerSerializer(serializers.ModelSerializer):
    customer_username = serializers.CharField(source='customer.username', read_only=True)
    customer_name = serializers.SerializerMethodField()
    customer_profile_picture = serializers.SerializerMethodField()
    favorite_listing_title = serializers.CharField(source='favorite_listing.title', read_only=True, default=None)
    favorite_category_title = serializers.CharField(source='favorite_category.title', read_only=True, default=None)
    customer_lifetime_value = serializers.DecimalField(source='total_amount_spent', max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = VendorCustomer
        fields = [
            'id', 'customer', 'customer_username', 'customer_name', 'customer_profile_picture',
            'first_purchase_at', 'last_purchase_at',
            'total_completed_orders', 'total_amount_spent', 'average_order_value',
            'total_successful_bookings', 'customer_lifetime_value',
            'favorite_listing', 'favorite_listing_title', 'favorite_category', 'favorite_category_title',
        ]

    def get_customer_name(self, obj):
        return obj.customer.get_full_name() or obj.customer.username

    def get_customer_profile_picture(self, obj):
        picture = get_profile_picture(obj.customer)
        if not picture:
            return None
        request = self.context.get('request')
        if picture.startswith('http'):
            return picture
        return request.build_absolute_uri(picture) if request else picture


class VendorCustomerOrderHistorySerializer(serializers.Serializer):
    """A single order in a vendor-customer pair's history — read-only, no order data duplicated."""
    id = serializers.IntegerField()
    reference = serializers.CharField()
    listing_title = serializers.CharField(source='listing.title')
    amount = serializers.DecimalField(max_digits=10, decimal_places=2)
    status = serializers.CharField()
    created_at = serializers.DateTimeField()
