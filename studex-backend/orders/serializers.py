# orders/serializers.py
from rest_framework import serializers
from .models import Order
from services.serializers import ListingSerializer

class OrderSerializer(serializers.ModelSerializer):
    listing = ListingSerializer(read_only=True)
    listing_id = serializers.IntegerField(write_only=True)
    buyer = serializers.ReadOnlyField(source='buyer.username')

    class Meta:
        model = Order
        fields = ['id', 'reference', 'listing', 'listing_id', 'amount', 'status', 'created_at', 'paid_at']
        read_only_fields = ['reference', 'amount', 'status', 'created_at', 'paid_at']

    def create(self, validated_data):
        listing_id = validated_data.pop('listing_id')
        listing = Listing.objects.get(id=listing_id)
        
        # Basic validation
        if not listing.is_available:
            raise serializers.ValidationError("This listing is no longer available.")
        
        # Create order
        order = Order.objects.create(
            buyer=self.context['request'].user,
            listing=listing,
            amount=listing.price,
            **validated_data
        )
        
        # Create transaction in escrow
        from services.models import Transaction
        Transaction.objects.create(
            vendor=listing.vendor,
            order=order,
            amount=listing.price,
            status='in_escrow'
        )
        
        return order