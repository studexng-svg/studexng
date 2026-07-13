# chat/views.py
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from django.db.models import Q
from django.conf import settings as django_settings
from datetime import timedelta
from .models import Conversation, Message, BlockedMessageAttempt
from .serializers import ConversationSerializer, MessageSerializer
import json
import logging
import re

logger = logging.getLogger(__name__)

# "Delete for everyone" is only allowed within this short window.
# Kept tight so bad actors cannot delete scam evidence before a buyer files a dispute.
DELETE_FOR_EVERYONE_LIMIT_MINUTES = 10

# ─── Contact-info / off-platform detection ──────────────────────────────────
# Patterns live in contracts/contact_patterns.json (repo root) — the single source
# of truth shared with the frontend's pre-submit check. Edit the JSON, not this file.
_CONTACT_PATTERNS_PATH = django_settings.BASE_DIR.parent / 'contracts' / 'contact_patterns.json'


def _load_contact_pattern_categories():
    with open(_CONTACT_PATTERNS_PATH, encoding='utf-8') as f:
        data = json.load(f)
    categories = []
    for cat in data['categories']:
        message = data['contact_info_message'] if cat['reason'] == 'contact_info' else data['off_platform_message']
        compiled = [re.compile(p, re.IGNORECASE) for p in cat['patterns']]
        categories.append({'key': cat['key'], 'reason': cat['reason'], 'message': message, 'patterns': compiled})
    return categories


_CONTACT_CATEGORIES = _load_contact_pattern_categories()


def _has_suspicious_content(content: str):
    """
    Returns (message, reason) if content looks like contact-info sharing or
    off-platform payment solicitation; otherwise returns (None, None).
    """
    for category in _CONTACT_CATEGORIES:
        for pattern in category['patterns']:
            if pattern.search(content):
                return category['message'], category['reason']
    return None, None


class ConversationViewSet(viewsets.ModelViewSet):
    serializer_class = ConversationSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ['get', 'post', 'delete', 'head', 'options']

    # Order/Booking statuses that count as "paid enough" to unlock chat history.
    UNLOCKED_ORDER_STATUSES = {'paid', 'seller_completed', 'completed', 'disputed'}
    # Once the order is fully completed (buyer confirmed, payout released), the chat
    # expires permanently — history stays visible to the two participants and to
    # admin, but no new messages can be sent.
    EXPIRED_ORDER_STATUSES = {'completed'}

    def _is_unlocked(self, conversation):
        return conversation.order_id is not None and conversation.order.status in self.UNLOCKED_ORDER_STATUSES

    def _is_expired(self, conversation):
        return conversation.order_id is not None and conversation.order.status in self.EXPIRED_ORDER_STATUSES

    def get_queryset(self):
        user = self.request.user
        return Conversation.objects.filter(
            Q(buyer=user) | Q(seller=user)
        ).filter(
            Q(listing__isnull=True) | Q(listing__campus__iexact=user.school)
        ).select_related('buyer', 'seller', 'listing', 'order').order_by('-updated_at')

    def create(self, request, *args, **kwargs):
        """
        Chat is payment-gated: a conversation can only be created for a listing
        where the requesting buyer already has a qualifying (paid+) order. Vendors
        wire this up automatically via for_order/for_booking after payment succeeds —
        this direct path exists only as a fallback lookup, not a way to bypass payment.
        """
        listing_id = request.data.get('listing_id')
        seller_id = request.data.get('seller_id')

        if not listing_id or not seller_id:
            return Response({'error': 'listing_id and seller_id are required'}, status=400)

        from services.models import Listing
        from orders.models import Order
        from django.contrib.auth import get_user_model
        User = get_user_model()

        try:
            listing = Listing.objects.get(id=listing_id)
            seller = User.objects.get(id=seller_id)
        except (Listing.DoesNotExist, User.DoesNotExist):
            return Response({'error': 'Listing or seller not found'}, status=404)

        if request.user == seller:
            return Response({'error': 'You cannot message yourself'}, status=400)

        if listing.campus and request.user.school and listing.campus.lower() != request.user.school.lower():
            return Response({'error': 'You can only message vendors from your campus.'}, status=403)

        qualifying_order = Order.objects.filter(
            buyer=request.user, listing=listing, status__in=self.UNLOCKED_ORDER_STATUSES
        ).order_by('-paid_at').first()

        if qualifying_order is None:
            BlockedMessageAttempt.objects.create(sender=request.user, reason='unpaid')
            return Response(
                {'error': 'Chat becomes available after payment to protect both buyers and vendors.'},
                status=403,
            )

        conversation, created = Conversation.objects.get_or_create(
            buyer=request.user,
            seller=seller,
            listing=listing,
            defaults={'order': qualifying_order},
        )
        if conversation.order_id != qualifying_order.id:
            conversation.order = qualifying_order
            conversation.save(update_fields=['order'])

        serializer = self.get_serializer(conversation)
        return Response(serializer.data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='typing')
    def typing(self, request, pk=None):
        """
        POST /api/chat/conversations/<id>/typing/
        Stores a typing timestamp in cache for 6 seconds.
        GET /api/chat/conversations/<id>/typing/ returns whether the other user is typing.
        """
        conversation = self.get_object()
        from django.core.cache import cache
        cache.set(f'typing_{conversation.id}_{request.user.id}', True, 6)
        return Response({'ok': True})

    @action(detail=True, methods=['get'], url_path='typing')
    def typing_status(self, request, pk=None):
        conversation = self.get_object()
        user = request.user
        other = conversation.seller if user == conversation.buyer else conversation.buyer
        from django.core.cache import cache
        is_typing = bool(cache.get(f'typing_{conversation.id}_{other.id}'))
        return Response({'is_typing': is_typing})

    @action(detail=False, methods=['post'], url_path='for-order')
    def for_order(self, request):
        """
        POST /api/chat/conversations/for-order/
        Vendor-side: get or create the conversation for a paid order.
        """
        order_id = request.data.get('order_id')
        if not order_id:
            return Response({'error': 'order_id is required'}, status=400)
        try:
            from orders.models import Order
            order = Order.objects.select_related('buyer', 'listing', 'listing__vendor').get(id=order_id)
        except Exception:
            return Response({'error': 'Order not found'}, status=404)

        if order.listing.vendor != request.user and order.buyer != request.user:
            return Response({'error': 'Not a participant in this order'}, status=403)

        conversation, _ = Conversation.objects.get_or_create(
            buyer=order.buyer,
            seller=order.listing.vendor,
            listing=order.listing,
            defaults={'order': order},
        )
        if conversation.order_id != order.id:
            conversation.order = order
            conversation.save(update_fields=['order'])
        serializer = self.get_serializer(conversation)
        return Response(serializer.data)

    @action(detail=False, methods=['post'], url_path='for-booking')
    def for_booking(self, request):
        """
        POST /api/chat/conversations/for-booking/
        Get or create the conversation for a booking. The conversation only unlocks
        once a qualifying (paid+) Order exists for the same buyer+listing — a booking
        on its own (pending/cancelled/vendor_declined) does not unlock chat.
        """
        booking_id = request.data.get('booking_id')
        if not booking_id:
            return Response({'error': 'booking_id is required'}, status=400)
        try:
            from orders.models import Booking, Order
            booking = Booking.objects.select_related('buyer', 'listing', 'listing__vendor').get(id=booking_id)
        except Exception:
            return Response({'error': 'Booking not found'}, status=404)

        if booking.listing.vendor != request.user and booking.buyer != request.user:
            return Response({'error': 'Not a participant in this booking'}, status=403)

        qualifying_order = Order.objects.filter(
            buyer=booking.buyer, listing=booking.listing, status__in=self.UNLOCKED_ORDER_STATUSES
        ).order_by('-paid_at').first()

        conversation, _ = Conversation.objects.get_or_create(
            buyer=booking.buyer,
            seller=booking.listing.vendor,
            listing=booking.listing,
            defaults={'order': qualifying_order},
        )
        if qualifying_order and conversation.order_id != qualifying_order.id:
            conversation.order = qualifying_order
            conversation.save(update_fields=['order'])
        serializer = self.get_serializer(conversation)
        return Response(serializer.data)

    def destroy(self, request, *args, **kwargs):
        conversation = self.get_object()
        if self._is_expired(conversation):
            return Response(
                {'error': 'This chat has ended and is kept for order history — it can no longer be deleted.'},
                status=403,
            )
        conversation.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

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

        if not self._is_unlocked(conversation):
            BlockedMessageAttempt.objects.create(
                sender=request.user, conversation=conversation, reason='unpaid',
                attempted_content=request.data.get('content', '')[:250],
            )
            return Response(
                {'error': 'Chat becomes available after payment to protect both buyers and vendors.'},
                status=403,
            )

        if self._is_expired(conversation):
            BlockedMessageAttempt.objects.create(
                sender=request.user, conversation=conversation, reason='expired',
                attempted_content=request.data.get('content', '')[:250],
            )
            return Response(
                {'error': 'This chat has ended — the order was completed and payment released.'},
                status=403,
            )

        content = request.data.get('content', '').strip()
        image = request.FILES.get('image')

        if not content and not image:
            return Response({'error': 'Message content or image is required'}, status=400)

        if len(content) > 250:
            return Response({'error': 'Messages are limited to 250 characters.'}, status=400)

        if content:
            warning, reason = _has_suspicious_content(content)
            if warning:
                BlockedMessageAttempt.objects.create(
                    sender=request.user, conversation=conversation, reason=reason, attempted_content=content[:250],
                )
                return Response({'error': warning}, status=400)

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

        # Notify the other participant (SSE + FCM + email)
        recipient = conversation.seller if request.user == conversation.buyer else conversation.buyer
        try:
            from accounts.utils import send_notification
            from notifications.models import FCMToken
            tokens = list(FCMToken.objects.filter(user=recipient).values_list('token', flat=True))
            for token in tokens:
                token_type = "expo" if token.startswith("ExponentPushToken[") else "fcm"
                print(f"[chat push] Sending to token: {token}")
                print(f"[chat push] Token type: {token_type}")
            preview = '📷 Image' if image else (content[:60] + ('...' if len(content) > 60 else ''))
            send_notification(
                recipient=recipient,
                notification_type='message',
                title=f'New message from {request.user.username}',
                message=preview,
                action_url=f'/chat/{conversation.id}',
                send_email=False,
            )
        except Exception:
            pass

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
            latest = conv.messages.order_by('-created_at').first()
            if latest:
                conv.last_message = '📷 Image' if latest.message_type == 'image' else latest.content[:100]
                conv.last_message_at = latest.created_at
            else:
                conv.last_message = ''
                conv.last_message_at = None
            conv.save(update_fields=['last_message', 'last_message_at'])
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

        # Block deletion on conversations that have a paid order — preserves dispute evidence
        conv = message.conversation
        try:
            from orders.models import Order as _Order
            if _Order.objects.filter(
                buyer=conv.buyer,
                listing=conv.listing,
                status__in=['paid', 'seller_completed', 'completed', 'disputed'],
            ).exists():
                return Response(
                    {'error': 'Messages cannot be deleted on orders that have been paid.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
        except Exception:
            pass

        # Check time limit
        time_limit = timezone.now() - timedelta(minutes=DELETE_FOR_EVERYONE_LIMIT_MINUTES)
        if message.created_at < time_limit:
            return Response(
                {'error': f'You can only delete messages sent within the last {DELETE_FOR_EVERYONE_LIMIT_MINUTES} minutes'},
                status=status.HTTP_400_BAD_REQUEST
            )

        conv = message.conversation

        # ✅ Hard delete
        message.delete()

        # Update conversation's last_message to the new latest message (or clear it)
        latest = conv.messages.order_by('-created_at').first()
        if latest:
            conv.last_message = '📷 Image' if latest.message_type == 'image' else latest.content[:100]
            conv.last_message_at = latest.created_at
        else:
            conv.last_message = ''
            conv.last_message_at = None
        conv.save(update_fields=['last_message', 'last_message_at'])

        # Clean up the notification sent for this message so recipient isn't misled
        try:
            from notifications.models import Notification
            recipient = conv.seller if user == conv.buyer else conv.buyer
            Notification.objects.filter(
                recipient=recipient,
                notification_type='message',
                action_url=f'/chat/{conv.id}',
                is_read=False,
            ).delete()
        except Exception:
            pass

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