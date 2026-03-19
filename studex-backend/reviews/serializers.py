# reviews/serializers.py
from rest_framework import serializers
from .models import Review


class ReviewSerializer(serializers.ModelSerializer):
    reviewer_username = serializers.CharField(source='reviewer.username', read_only=True)
    listing_title = serializers.CharField(source='listing.title', read_only=True)

    class Meta:
        model = Review
        fields = [
            'id', 'order', 'reviewer', 'reviewer_username',
            'vendor', 'listing', 'listing_title',
            'rating', 'comment', 'created_at'
        ]
        read_only_fields = ['id', 'reviewer', 'vendor', 'listing', 'created_at']

    def validate_order(self, order):
        request = self.context['request']
        if order.buyer != request.user:
            raise serializers.ValidationError("You can only review your own orders.")
        if order.status != 'completed':
            raise serializers.ValidationError("You can only review completed orders.")
        if hasattr(order, 'review'):
            raise serializers.ValidationError("You have already reviewed this order.")
        return order

    def create(self, validated_data):
        order = validated_data['order']
        validated_data['reviewer'] = self.context['request'].user
        validated_data['vendor'] = order.listing.vendor
        validated_data['listing'] = order.listing
        return super().create(validated_data)