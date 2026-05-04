from rest_framework import serializers
from .models import CartItem


class CartItemSerializer(serializers.ModelSerializer):
    listing_id = serializers.IntegerField(source='listing.id', read_only=True)
    title = serializers.CharField(source='listing.title', read_only=True)
    price = serializers.DecimalField(
        source='listing.price', max_digits=10, decimal_places=2, read_only=True
    )
    img = serializers.SerializerMethodField()

    class Meta:
        model = CartItem
        fields = ['id', 'listing_id', 'title', 'price', 'img', 'quantity']

    def get_img(self, obj):
        return obj.listing.image or ''
