from rest_framework import serializers
from .models import CartItem


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

    class Meta:
        model = CartItem
        fields = [
            'id', 'listing_id', 'title',
            'price', 'effective_price', 'deal_discount_percent',
            'img', 'quantity', 'reserved_at', 'stock_quantity', 'is_single_stock',
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
