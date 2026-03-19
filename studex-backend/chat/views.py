# chat/views.py
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from django.db.models import Q
from .models import Conversation, Message
from .serializers import ConversationSerializer, MessageSerializer
import logging

logger = logging.getLogger(__name__)


class ConversationViewSet(viewsets.ModelViewSet):
    serializer_class = ConversationSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ['get', 'post', 'head', 'options']

    def get_queryset(self):
        user = self.request.user
        return Conversation.objects.filter(
            Q(buyer=user) | Q(seller=user)
        ).select_related('buyer', 'seller', 'listing').order_by('-updated_at')

    def create(self, request, *args, **kwargs):
        print("REQUEST DATA:", request.data)
        """Start or retrieve a conversation about a listing"""
        listing_id = request.data.get('listing_id')
        seller_id = request.data.get('seller_id')

        if not listing_id or not seller_id:
            return Response({'error': 'listing_id and seller_id are required'}, status=400)

        from services.models import Listing
        from django.contrib.auth import get_user_model
        User = get_user_model()

        try:
            listing = Listing.objects.get(id=listing_id)
            seller = User.objects.get(id=seller_id)
        except (Listing.DoesNotExist, User.DoesNotExist):
            return Response({'error': 'Listing or seller not found'}, status=404)

        if request.user == seller:
            return Response({'error': 'You cannot message yourself'}, status=400)

        conversation, created = Conversation.objects.get_or_create(
            buyer=request.user,
            seller=seller,
            listing=listing,
        )

        serializer = self.get_serializer(conversation)
        return Response(serializer.data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    @action(detail=True, methods=['get'])
    def messages(self, request, pk=None):
        """GET /api/chat/conversations/{id}/messages/"""
        conversation = self.get_object()
        msgs = conversation.messages.select_related('sender').order_by('created_at')

        # Mark all unread messages from other user as read
        msgs.filter(is_read=False).exclude(sender=request.user).update(
            is_read=True, read_at=timezone.now()
        )

        serializer = MessageSerializer(msgs, many=True, context={'request': request})
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def send(self, request, pk=None):
        """POST /api/chat/conversations/{id}/send/"""
        conversation = self.get_object()

        # Verify user belongs to this conversation
        if request.user not in [conversation.buyer, conversation.seller]:
            return Response({'error': 'Not a participant'}, status=403)

        content = request.data.get('content', '').strip()
        if not content:
            return Response({'error': 'Message content is required'}, status=400)

        message = Message.objects.create(
            conversation=conversation,
            sender=request.user,
            content=content,
            message_type=request.data.get('message_type', 'text'),
        )

        serializer = MessageSerializer(message, context={'request': request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class MessageViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = MessageSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        return Message.objects.filter(
            Q(conversation__buyer=user) | Q(conversation__seller=user)
        ).select_related('sender', 'conversation')