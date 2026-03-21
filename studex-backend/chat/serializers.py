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
        return obj.messages.filter(is_read=False).exclude(sender=request.user).count()

    def get_other_user(self, obj):
        request = self.context.get('request')
        if not request:
            return None
        if obj.buyer == request.user:
            return {'id': obj.seller.id, 'username': obj.seller.username}
        return {'id': obj.buyer.id, 'username': obj.buyer.username}