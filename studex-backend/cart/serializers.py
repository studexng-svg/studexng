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

    class Meta:
        model = CartItem
        fields = ['id', 'listing_id', 'title', 'price', 'img', 'quantity', 'reserved_at', 'stock_quantity', 'is_single_stock']

    def get_img(self, obj):
        return obj.listing.image or ''

    def get_is_single_stock(self, obj):
        return bool(obj.listing.track_inventory and (obj.listing.stock_quantity or 0) == 1)
