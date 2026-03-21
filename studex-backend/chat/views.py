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
        conversation = self.get_object()
        msgs = conversation.messages.select_related('sender').order_by('created_at')

        msgs.filter(is_read=False).exclude(sender=request.user).update(
            is_read=True, read_at=timezone.now()
        )

        serializer = MessageSerializer(msgs, many=True, context={'request': request})
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

        # Upload image to Cloudinary if available
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
                # Fall back to local storage
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

        # Update conversation last message
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
        ).select_related('sender', 'conversation')