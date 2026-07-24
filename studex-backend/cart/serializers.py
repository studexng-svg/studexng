from rest_framework import serializers
from .models import CartItem


class CartItemAddonSerializer(serializers.Serializer):
    """Read-only nested view of a cart line's selected add-ons (Phase 1 — Food Commerce Engine, Step 3)."""
    id = serializers.IntegerField(source='addon.id')
    name = serializers.CharField(source='addon.name')
    price_delta = serializers.DecimalField(source='price_delta_at_add_time', max_digits=10, decimal_places=2)


class CartItemSerializer(serializers.ModelSerializer):
    listing_id = serializers.IntegerField(source='listing.id', read_only=True)
    title = serializers.CharField(source='listing.title', read_only=True)
    price = serializers.DecimalField(
        source='listing.price', max_digits=10, decimal_places=2, read_only=True
    )
    img = serializers.SerializerMethodField()
    stock_quantity = serializers.IntegerField(source='listing.stock_quantity', read_only=True, allow_null=True)
    is_single_stock = serializers.SerializerMethodField()
    deal_discount_percent = serializers.SerializerMethodField()
    effective_price = serializers.SerializerMethodField()
    # Phase 1 — Food Commerce Engine, Step 3: a cart can hold lines from
    # several vendors at once (checkout itself is what's vendor-scoped — see
    # payments/cart_checkout.py) — these let the frontend group cart display
    # by vendor and identify which vendor_id to pass to checkout.
    vendor_id = serializers.IntegerField(source='listing.vendor_id', read_only=True)
    vendor_username = serializers.CharField(source='listing.vendor.username', read_only=True)
    selected_addons = CartItemAddonSerializer(many=True, read_only=True)

    class Meta:
        model = CartItem
        fields = [
            'id', 'listing_id', 'title',
            'price', 'effective_price', 'deal_discount_percent',
            'img', 'quantity', 'reserved_at', 'stock_quantity', 'is_single_stock',
            'vendor_id', 'vendor_username', 'addon_signature', 'selected_addons',
        ]

    def get_img(self, obj):
        return obj.listing.image or ''

    def get_is_single_stock(self, obj):
        return bool(obj.listing.track_inventory and (obj.listing.stock_quantity or 0) == 1)

    def get_deal_discount_percent(self, obj):
        try:
            deal = obj.listing.deal
            if deal.is_active:
                return deal.discount_percent
        except Exception:
            pass
        return 0

    def get_effective_price(self, obj):
        try:
            deal = obj.listing.deal
            if deal.is_active:
                return float(deal.discounted_price)
        except Exception:
            pass
        return float(obj.listing.price)
