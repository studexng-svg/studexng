# chat/serializers.py
from rest_framework import serializers
from .models import Conversation, Message
from django.contrib.auth import get_user_model

User = get_user_model()


class UserMinimalSerializer(serializers.ModelSerializer):
    """Minimal user data for chat"""
    class Meta:
        model = User
        fields = ['id', 'username', 'email']


class MessageSerializer(serializers.ModelSerializer):
    sender_username = serializers.ReadOnlyField(source='sender.username')

    class Meta:
        model = Message
        fields = [
            'id', 'conversation', 'sender', 'sender_username',
            'message_type', 'content', 'offer_amount', 'offer_status',
            'is_read', 'read_at', 'created_at', 'updated_at'
        ]
        read_only_fields = ['sender', 'is_read', 'read_at', 'created_at', 'updated_at']

    def create(self, validated_data):
        validated_data['sender'] = self.context['request'].user
        return super().create(validated_data)


class ConversationSerializer(serializers.ModelSerializer):
    buyer_details = UserMinimalSerializer(source='buyer', read_only=True)
    seller_details = UserMinimalSerializer(source='seller', read_only=True)
    listing_title = serializers.ReadOnlyField(source='listing.title')
    listing_price = serializers.ReadOnlyField(source='listing.price')
    unread_count = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = [
            'id', 'buyer', 'buyer_details', 'seller', 'seller_details',
            'listing', 'listing_title', 'listing_price',
            'last_message', 'last_message_at', 'unread_count',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['buyer', 'last_message', 'last_message_at', 'created_at', 'updated_at']

    def get_unread_count(self, obj):
        """Get count of unread messages for the current user"""
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return 0

        # Count messages not sent by current user and not read
        return obj.messages.filter(is_read=False).exclude(sender=request.user).count()


class ConversationDetailSerializer(ConversationSerializer):
    """Extended conversation with recent messages"""
    messages = MessageSerializer(many=True, read_only=True)

    class Meta(ConversationSerializer.Meta):
        fields = ConversationSerializer.Meta.fields + ['messages']


class SendMessageSerializer(serializers.Serializer):
    """Serializer for sending a message"""
    conversation_id = serializers.IntegerField(required=False, allow_null=True)
    listing_id = serializers.IntegerField(required=True)
    recipient_id = serializers.IntegerField(required=True)
    content = serializers.CharField(required=True)
    message_type = serializers.ChoiceField(choices=Message.MESSAGE_TYPE_CHOICES, default='text')
    offer_amount = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, allow_null=True)

    def validate(self, data):
        # If message_type is 'offer', offer_amount must be provided
        if data.get('message_type') == 'offer' and not data.get('offer_amount'):
            raise serializers.ValidationError("offer_amount is required for offer messages")

        return data

    def create(self, validated_data):
        from services.models import Listing

        request = self.context['request']
        sender = request.user

        listing_id = validated_data['listing_id']
        recipient_id = validated_data['recipient_id']

        # Get or create conversation
        try:
            listing = Listing.objects.get(id=listing_id)
            recipient = User.objects.get(id=recipient_id)
        except (Listing.DoesNotExist, User.DoesNotExist):
            raise serializers.ValidationError("Invalid listing or recipient")

        # Determine buyer and seller
        if sender == listing.vendor:
            buyer = recipient
            seller = sender
        else:
            buyer = sender
            seller = listing.vendor

        # Get or create conversation
        conversation, created = Conversation.objects.get_or_create(
            buyer=buyer,
            seller=seller,
            listing=listing
        )

        # Create message
        message = Message.objects.create(
            conversation=conversation,
            sender=sender,
            content=validated_data['content'],
            message_type=validated_data.get('message_type', 'text'),
            offer_amount=validated_data.get('offer_amount'),
            offer_status='pending' if validated_data.get('message_type') == 'offer' else None
        )

        return message
