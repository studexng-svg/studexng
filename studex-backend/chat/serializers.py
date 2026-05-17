# chat/serializers.py
from rest_framework import serializers
from .models import Conversation, Message


class MessageSerializer(serializers.ModelSerializer):
    sender_username = serializers.CharField(source='sender.username', read_only=True)
    is_mine = serializers.SerializerMethodField()
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = [
            'id', 'conversation', 'sender', 'sender_username',
            'message_type', 'content', 'image', 'image_url',
            'offer_amount', 'offer_status',
            'is_read', 'read_at', 'created_at', 'is_mine'
        ]
        read_only_fields = ['id', 'sender', 'read_at', 'created_at']

    def get_is_mine(self, obj):
        request = self.context.get('request')
        return request and obj.sender == request.user

    def get_image_url(self, obj):
        """Returns the best available image URL"""
        return obj.get_image_url()


class ConversationSerializer(serializers.ModelSerializer):
    buyer_username = serializers.CharField(source='buyer.username', read_only=True)
    seller_username = serializers.CharField(source='seller.username', read_only=True)
    listing_title = serializers.CharField(source='listing.title', read_only=True)
    listing_image = serializers.ImageField(source='listing.image', read_only=True)
    unread_count = serializers.SerializerMethodField()
    other_user = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = [
            'id', 'buyer', 'buyer_username', 'seller', 'seller_username',
            'listing', 'listing_title', 'listing_image',
            'last_message', 'last_message_at', 'unread_count',
            'other_user', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'last_message', 'last_message_at', 'created_at', 'updated_at']

    def get_unread_count(self, obj):
        request = self.context.get('request')
        if not request:
            return 0
        return obj.messages.filter(is_read=False).exclude(sender=request.user).exclude(deleted_for=request.user).count()

    def get_other_user(self, obj):
        request = self.context.get('request')
        if not request:
            return None
        from django.utils import timezone
        from datetime import timedelta
        other = obj.seller if obj.buyer == request.user else obj.buyer
        is_online = (
            other.last_seen is not None and
            timezone.now() - other.last_seen < timedelta(minutes=3)
        )
        return {
            'id': other.id,
            'username': other.username,
            'last_seen': other.last_seen.isoformat() if other.last_seen else None,
            'is_online': is_online,
        }