# chat/views.py
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from django.db.models import Q, Count, Max
from .models import Conversation, Message
from .serializers import (
    ConversationSerializer,
    ConversationDetailSerializer,
    MessageSerializer,
    SendMessageSerializer
)


class ConversationViewSet(viewsets.ModelViewSet):
    queryset = Conversation.objects.all()
    serializer_class = ConversationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        """Return conversations where user is either buyer or seller"""
        user = self.request.user
        return self.queryset.filter(
            Q(buyer=user) | Q(seller=user)
        ).distinct()

    def get_serializer_class(self):
        """Use detailed serializer for retrieve action"""
        if self.action == 'retrieve':
            return ConversationDetailSerializer
        return ConversationSerializer

    def retrieve(self, request, *args, **kwargs):
        """Get conversation details with messages"""
        conversation = self.get_object()

        # Mark messages as read for the current user
        Message.objects.filter(
            conversation=conversation,
            is_read=False
        ).exclude(sender=request.user).update(
            is_read=True,
            read_at=timezone.now()
        )

        serializer = self.get_serializer(conversation)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def unread_count(self, request):
        """Get total unread message count for current user"""
        user = request.user

        # Count all unread messages in user's conversations
        total_unread = Message.objects.filter(
            Q(conversation__buyer=user) | Q(conversation__seller=user),
            is_read=False
        ).exclude(sender=user).count()

        return Response({'unread_count': total_unread})


class MessageViewSet(viewsets.ModelViewSet):
    queryset = Message.objects.all()
    serializer_class = MessageSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        """Return messages from user's conversations"""
        user = self.request.user
        return self.queryset.filter(
            Q(conversation__buyer=user) | Q(conversation__seller=user)
        ).distinct()

    @action(detail=False, methods=['post'])
    def send(self, request):
        """Send a message (creates conversation if needed)"""
        serializer = SendMessageSerializer(data=request.data, context={'request': request})

        if serializer.is_valid():
            try:
                message = serializer.save()

                return Response({
                    'message': 'Message sent successfully',
                    'data': MessageSerializer(message).data
                }, status=status.HTTP_201_CREATED)

            except Exception as e:
                return Response({
                    'error': str(e)
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['patch'])
    def mark_read(self, request, pk=None):
        """Mark a message as read"""
        message = self.get_object()

        # Only recipient can mark as read
        if message.sender == request.user:
            return Response(
                {'error': 'Cannot mark your own message as read'},
                status=status.HTTP_400_BAD_REQUEST
            )

        message.is_read = True
        message.read_at = timezone.now()
        message.save()

        return Response({
            'message': 'Message marked as read',
            'data': MessageSerializer(message).data
        })

    @action(detail=True, methods=['patch'])
    def accept_offer(self, request, pk=None):
        """Accept a price offer"""
        message = self.get_object()

        # Only seller can accept offers
        conversation = message.conversation
        if request.user != conversation.seller:
            return Response(
                {'error': 'Only the seller can accept offers'},
                status=status.HTTP_403_FORBIDDEN
            )

        # Must be an offer message
        if message.message_type != 'offer':
            return Response(
                {'error': 'This is not an offer message'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Update offer status
        message.offer_status = 'accepted'
        message.save()

        # Create system message
        Message.objects.create(
            conversation=conversation,
            sender=request.user,
            message_type='system',
            content=f'Offer of ₦{message.offer_amount} has been accepted!'
        )

        return Response({
            'message': 'Offer accepted',
            'data': MessageSerializer(message).data
        })

    @action(detail=True, methods=['patch'])
    def reject_offer(self, request, pk=None):
        """Reject a price offer"""
        message = self.get_object()

        # Only seller can reject offers
        conversation = message.conversation
        if request.user != conversation.seller:
            return Response(
                {'error': 'Only the seller can reject offers'},
                status=status.HTTP_403_FORBIDDEN
            )

        # Must be an offer message
        if message.message_type != 'offer':
            return Response(
                {'error': 'This is not an offer message'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Update offer status
        message.offer_status = 'rejected'
        message.save()

        # Create system message
        Message.objects.create(
            conversation=conversation,
            sender=request.user,
            message_type='system',
            content=f'Offer of ₦{message.offer_amount} has been rejected.'
        )

        return Response({
            'message': 'Offer rejected',
            'data': MessageSerializer(message).data
        })
