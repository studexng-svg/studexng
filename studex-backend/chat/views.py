# chat/views.py
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from django.db.models import Q
from datetime import timedelta
from .models import Conversation, Message
from .serializers import ConversationSerializer, MessageSerializer
import logging

logger = logging.getLogger(__name__)

# "Delete for everyone" is only allowed within this time window (like WhatsApp ~60hrs)
DELETE_FOR_EVERYONE_LIMIT_HOURS = 60


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
        """Returns messages, excluding ones deleted for this user."""
        conversation = self.get_object()
        msgs = conversation.messages.select_related('sender').exclude(
            deleted_for=request.user  # ✅ hide messages deleted for this user
        ).order_by('created_at')

        msgs.filter(is_read=False).exclude(sender=request.user).update(
            is_read=True, read_at=timezone.now()
        )

        serializer = MessageSerializer(msgs, many=True, context={'request': request})
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def pinned(self, request, pk=None):
        """Returns pinned messages, excluding ones deleted for this user."""
        conversation = self.get_object()
        pinned_msgs = conversation.messages.filter(
            is_pinned=True,
        ).exclude(
            deleted_for=request.user
        ).select_related('sender').order_by('-pinned_at')
        serializer = MessageSerializer(pinned_msgs, many=True, context={'request': request})
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def send(self, request, pk=None):
        conversation = self.get_object()

        if request.user not in [conversation.buyer, conversation.seller]:
            return Response({'error': 'Not a participant'}, status=403)

        content = request.data.get('content', '').strip()
        image = request.FILES.get('image')

        if not content and not image:
            return Response({'error': 'Message content or image is required'}, status=400)

        message_type = 'image' if image else request.data.get('message_type', 'text')
        image_url = ''

        if image:
            try:
                import cloudinary.uploader
                result = cloudinary.uploader.upload(
                    image,
                    folder='studex/chat_images',
                    transformation=[{'quality': 'auto', 'fetch_format': 'auto'}]
                )
                image_url = result.get('secure_url', '')
                if not content:
                    content = '📷 Image'
            except Exception as e:
                logger.warning(f"Cloudinary upload failed, saving locally: {e}")
                message = Message.objects.create(
                    conversation=conversation,
                    sender=request.user,
                    content=content or '📷 Image',
                    message_type='image',
                    image=image,
                )
                conversation.last_message = '📷 Image'
                conversation.last_message_at = timezone.now()
                conversation.save()
                serializer = MessageSerializer(message, context={'request': request})
                return Response(serializer.data, status=status.HTTP_201_CREATED)

        message = Message.objects.create(
            conversation=conversation,
            sender=request.user,
            content=content,
            message_type=message_type,
            image_url=image_url,
        )

        conversation.last_message = '📷 Image' if image else content[:100]
        conversation.last_message_at = timezone.now()
        conversation.save()

        serializer = MessageSerializer(message, context={'request': request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class MessageViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = MessageSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        return Message.objects.filter(
            Q(conversation__buyer=user) | Q(conversation__seller=user)
        ).exclude(
            deleted_for=user  # ✅ never return messages deleted for this user
        ).select_related('sender', 'conversation')

    @action(detail=True, methods=['post'])
    def delete_for_me(self, request, pk=None):
        """
        POST /api/chat/messages/{id}/delete_for_me/
        Hides the message for the requesting user only.
        If ALL conversation participants have deleted for themselves → hard delete.
        """
        message = self.get_object()
        user = request.user
        conv = message.conversation

        # Add this user to deleted_for
        message.deleted_for.add(user)

        # Check if ALL participants have deleted for themselves
        participants = {conv.buyer_id, conv.seller_id}
        deleted_for_ids = set(message.deleted_for.values_list('id', flat=True))

        if participants.issubset(deleted_for_ids):
            # ✅ Both sides deleted — hard delete the row
            message.delete()
            return Response({'success': True, 'deleted': 'hard', 'message': 'Message fully deleted'})

        return Response({'success': True, 'deleted': 'for_me', 'message': 'Message deleted for you'})

    @action(detail=True, methods=['post'])
    def delete_for_everyone(self, request, pk=None):
        """
        POST /api/chat/messages/{id}/delete_for_everyone/
        Hard-deletes the message for ALL participants.
        Only the sender can do this, and only within DELETE_FOR_EVERYONE_LIMIT_HOURS.
        """
        message = self.get_object()
        user = request.user

        # Only sender can delete for everyone
        if message.sender != user:
            return Response(
                {'error': 'Only the sender can delete a message for everyone'},
                status=status.HTTP_403_FORBIDDEN
            )

        # Check time limit
        time_limit = timezone.now() - timedelta(hours=DELETE_FOR_EVERYONE_LIMIT_HOURS)
        if message.created_at < time_limit:
            return Response(
                {'error': f'You can only delete messages sent within the last {DELETE_FOR_EVERYONE_LIMIT_HOURS} hours'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # ✅ Hard delete
        message.delete()
        return Response({'success': True, 'deleted': 'for_everyone', 'message': 'Message deleted for everyone'})

    @action(detail=True, methods=['patch'])
    def edit_message(self, request, pk=None):
        """
        PATCH /api/chat/messages/{id}/edit_message/
        Only sender can edit. Images cannot be edited.
        """
        message = self.get_object()

        if message.sender != request.user:
            return Response({'error': 'You can only edit your own messages'}, status=status.HTTP_403_FORBIDDEN)

        if message.message_type == 'image':
            return Response({'error': 'Image messages cannot be edited'}, status=status.HTTP_400_BAD_REQUEST)

        new_content = request.data.get('content', '').strip()
        if not new_content:
            return Response({'error': 'Content cannot be empty'}, status=status.HTTP_400_BAD_REQUEST)

        message.content = new_content
        message.is_edited = True
        message.edited_at = timezone.now()
        message.save()

        serializer = MessageSerializer(message, context={'request': request})
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def pin_message(self, request, pk=None):
        """
        POST /api/chat/messages/{id}/pin_message/
        Toggle pin. Both participants can pin/unpin.
        """
        message = self.get_object()
        user = request.user
        conv = message.conversation

        if user not in [conv.buyer, conv.seller]:
            return Response({'error': 'Not a participant'}, status=status.HTTP_403_FORBIDDEN)

        if message.is_pinned:
            message.is_pinned = False
            message.pinned_at = None
            message.pinned_by = None
            message.save()
            return Response({'success': True, 'is_pinned': False, 'message': 'Message unpinned'})
        else:
            message.is_pinned = True
            message.pinned_at = timezone.now()
            message.pinned_by = user
            message.save()
            serializer = MessageSerializer(message, context={'request': request})
            return Response({'success': True, 'is_pinned': True, 'message': 'Message pinned', 'data': serializer.data})