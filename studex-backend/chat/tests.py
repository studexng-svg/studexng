"""
Test suite for chat app - conversations, messages, offers
"""
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient, APITestCase
from rest_framework import status
from decimal import Decimal

from accounts.models import User
from services.models import Category, Listing
from chat.models import Conversation, Message


class ConversationModelTests(TestCase):
    """Test Conversation model functionality"""

    def setUp(self):
        # Create buyer and seller
        self.buyer = User.objects.create_user(
            username='buyer',
            email='buyer@pau.edu.ng',
            password='pass123'
        )

        self.seller = User.objects.create_user(
            username='seller',
            email='seller@pau.edu.ng',
            password='pass123',
            user_type='vendor',
            is_verified_vendor=True
        )

        # Create listing
        self.category = Category.objects.create(
            title='Food',
            slug='food'
        )

        self.listing = Listing.objects.create(
            vendor=self.seller,
            category=self.category,
            title='Jollof Rice',
            description='Delicious jollof rice',
            price=Decimal('1000.00')
        )

    def test_create_conversation(self):
        """Test creating a conversation"""
        conversation = Conversation.objects.create(
            buyer=self.buyer,
            seller=self.seller,
            listing=self.listing
        )

        self.assertEqual(conversation.buyer, self.buyer)
        self.assertEqual(conversation.seller, self.seller)
        self.assertEqual(conversation.listing, self.listing)
        self.assertIsNotNone(conversation.created_at)

    def test_conversation_str_method(self):
        """Test Conversation string representation"""
        conversation = Conversation.objects.create(
            buyer=self.buyer,
            seller=self.seller,
            listing=self.listing
        )

        self.assertIn(self.buyer.username, str(conversation))
        self.assertIn(self.seller.username, str(conversation))
        self.assertIn(self.listing.title, str(conversation))

    def test_conversation_unique_together(self):
        """Test conversation unique constraint"""
        Conversation.objects.create(
            buyer=self.buyer,
            seller=self.seller,
            listing=self.listing
        )

        # Try to create duplicate
        with self.assertRaises(Exception):
            Conversation.objects.create(
                buyer=self.buyer,
                seller=self.seller,
                listing=self.listing
            )

    def test_conversation_ordering(self):
        """Test conversations ordered by updated_at descending"""
        conv1 = Conversation.objects.create(
            buyer=self.buyer,
            seller=self.seller,
            listing=self.listing
        )

        # Create second listing and conversation
        listing2 = Listing.objects.create(
            vendor=self.seller,
            category=self.category,
            title='Fried Rice',
            description='Delicious fried rice',
            price=Decimal('1200.00')
        )

        conv2 = Conversation.objects.create(
            buyer=self.buyer,
            seller=self.seller,
            listing=listing2
        )

        conversations = Conversation.objects.all()
        self.assertEqual(conversations[0], conv2)  # Newest first
        self.assertEqual(conversations[1], conv1)

    def test_conversation_last_message_fields(self):
        """Test conversation last_message tracking fields"""
        conversation = Conversation.objects.create(
            buyer=self.buyer,
            seller=self.seller,
            listing=self.listing
        )

        self.assertEqual(conversation.last_message, '')
        self.assertIsNone(conversation.last_message_at)


class MessageModelTests(TestCase):
    """Test Message model functionality"""

    def setUp(self):
        # Create buyer and seller
        self.buyer = User.objects.create_user(
            username='buyer',
            email='buyer@pau.edu.ng',
            password='pass123'
        )

        self.seller = User.objects.create_user(
            username='seller',
            email='seller@pau.edu.ng',
            password='pass123',
            user_type='vendor',
            is_verified_vendor=True
        )

        # Create listing
        self.category = Category.objects.create(
            title='Food',
            slug='food'
        )

        self.listing = Listing.objects.create(
            vendor=self.seller,
            category=self.category,
            title='Jollof Rice',
            description='Delicious jollof rice',
            price=Decimal('1000.00')
        )

        # Create conversation
        self.conversation = Conversation.objects.create(
            buyer=self.buyer,
            seller=self.seller,
            listing=self.listing
        )

    def test_create_text_message(self):
        """Test creating a text message"""
        message = Message.objects.create(
            conversation=self.conversation,
            sender=self.buyer,
            message_type='text',
            content='Hello, is this available?'
        )

        self.assertEqual(message.conversation, self.conversation)
        self.assertEqual(message.sender, self.buyer)
        self.assertEqual(message.message_type, 'text')
        self.assertEqual(message.content, 'Hello, is this available?')
        self.assertFalse(message.is_read)

    def test_create_offer_message(self):
        """Test creating an offer message"""
        message = Message.objects.create(
            conversation=self.conversation,
            sender=self.buyer,
            message_type='offer',
            content='I would like to offer ₦800',
            offer_amount=Decimal('800.00'),
            offer_status='pending'
        )

        self.assertEqual(message.message_type, 'offer')
        self.assertEqual(message.offer_amount, Decimal('800.00'))
        self.assertEqual(message.offer_status, 'pending')

    def test_create_system_message(self):
        """Test creating a system message"""
        message = Message.objects.create(
            conversation=self.conversation,
            sender=self.seller,
            message_type='system',
            content='Offer has been accepted'
        )

        self.assertEqual(message.message_type, 'system')

    def test_message_str_method(self):
        """Test Message string representation"""
        message = Message.objects.create(
            conversation=self.conversation,
            sender=self.buyer,
            content='Test message'
        )

        self.assertIn(self.buyer.username, str(message))
        self.assertIn(str(self.conversation.id), str(message))

    def test_message_default_unread(self):
        """Test message is unread by default"""
        message = Message.objects.create(
            conversation=self.conversation,
            sender=self.buyer,
            content='Test message'
        )

        self.assertFalse(message.is_read)
        self.assertIsNone(message.read_at)

    def test_message_mark_as_read(self):
        """Test marking message as read"""
        message = Message.objects.create(
            conversation=self.conversation,
            sender=self.buyer,
            content='Test message'
        )

        message.is_read = True
        message.read_at = timezone.now()
        message.save()

        self.assertTrue(message.is_read)
        self.assertIsNotNone(message.read_at)

    def test_message_updates_conversation(self):
        """Test message creation updates conversation"""
        message = Message.objects.create(
            conversation=self.conversation,
            sender=self.buyer,
            content='Hello, is this available?'
        )

        # Refresh conversation from db
        self.conversation.refresh_from_db()

        self.assertIn('Hello', self.conversation.last_message)
        self.assertIsNotNone(self.conversation.last_message_at)

    def test_message_ordering(self):
        """Test messages ordered by created_at ascending"""
        msg1 = Message.objects.create(
            conversation=self.conversation,
            sender=self.buyer,
            content='First message'
        )

        msg2 = Message.objects.create(
            conversation=self.conversation,
            sender=self.seller,
            content='Second message'
        )

        messages = Message.objects.all()
        self.assertEqual(messages[0], msg1)  # Oldest first
        self.assertEqual(messages[1], msg2)

    def test_offer_status_choices(self):
        """Test offer status options"""
        statuses = ['pending', 'accepted', 'rejected', 'expired']

        for status_choice in statuses:
            message = Message.objects.create(
                conversation=self.conversation,
                sender=self.buyer,
                message_type='offer',
                content=f'Offer with status {status_choice}',
                offer_amount=Decimal('800.00'),
                offer_status=status_choice
            )
            self.assertEqual(message.offer_status, status_choice)
            message.delete()


class ConversationAPITests(APITestCase):
    """Test Conversation API endpoints"""

    def setUp(self):
        self.client = APIClient()

        # Create buyer and seller
        self.buyer = User.objects.create_user(
            username='buyer',
            email='buyer@pau.edu.ng',
            password='pass123'
        )

        self.seller = User.objects.create_user(
            username='seller',
            email='seller@pau.edu.ng',
            password='pass123',
            user_type='vendor',
            is_verified_vendor=True
        )

        # Create third user (not participant)
        self.other_user = User.objects.create_user(
            username='other',
            email='other@pau.edu.ng',
            password='pass123'
        )

        # Create listing
        self.category = Category.objects.create(
            title='Food',
            slug='food'
        )

        self.listing = Listing.objects.create(
            vendor=self.seller,
            category=self.category,
            title='Jollof Rice',
            description='Delicious jollof rice',
            price=Decimal('1000.00')
        )

        # Create conversation
        self.conversation = Conversation.objects.create(
            buyer=self.buyer,
            seller=self.seller,
            listing=self.listing
        )

        self.conversation_url = '/api/chat/conversations/'

    def test_list_conversations_unauthenticated(self):
        """Test listing conversations fails without authentication"""
        response = self.client.get(self.conversation_url)
        self.assertIn(response.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

    def test_list_conversations_as_buyer(self):
        """Test buyer sees their conversations"""
        self.client.force_authenticate(user=self.buyer)

        response = self.client.get(self.conversation_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(response.data), 1)

    def test_list_conversations_as_seller(self):
        """Test seller sees their conversations"""
        self.client.force_authenticate(user=self.seller)

        response = self.client.get(self.conversation_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(response.data), 1)

    def test_list_conversations_non_participant(self):
        """Test non-participant sees no conversations"""
        self.client.force_authenticate(user=self.other_user)

        response = self.client.get(self.conversation_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 0)

    def test_retrieve_conversation_as_participant(self):
        """Test participant can retrieve conversation"""
        self.client.force_authenticate(user=self.buyer)

        response = self.client.get(f'{self.conversation_url}{self.conversation.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['id'], self.conversation.id)

    def test_retrieve_conversation_marks_as_read(self):
        """Test retrieving conversation marks messages as read"""
        # Create unread message from seller
        Message.objects.create(
            conversation=self.conversation,
            sender=self.seller,
            content='Hello from seller',
            is_read=False
        )

        # Buyer retrieves conversation
        self.client.force_authenticate(user=self.buyer)
        response = self.client.get(f'{self.conversation_url}{self.conversation.id}/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Check message is marked as read
        message = Message.objects.get(conversation=self.conversation)
        self.assertTrue(message.is_read)
        self.assertIsNotNone(message.read_at)

    def test_unread_count_endpoint(self):
        """Test getting unread message count"""
        # Create unread messages from seller
        Message.objects.create(
            conversation=self.conversation,
            sender=self.seller,
            content='Message 1',
            is_read=False
        )

        Message.objects.create(
            conversation=self.conversation,
            sender=self.seller,
            content='Message 2',
            is_read=False
        )

        # Buyer checks unread count
        self.client.force_authenticate(user=self.buyer)
        response = self.client.get(f'{self.conversation_url}unread_count/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['unread_count'], 2)


class MessageAPITests(APITestCase):
    """Test Message API endpoints"""

    def setUp(self):
        self.client = APIClient()

        # Create buyer and seller
        self.buyer = User.objects.create_user(
            username='buyer',
            email='buyer@pau.edu.ng',
            password='pass123'
        )

        self.seller = User.objects.create_user(
            username='seller',
            email='seller@pau.edu.ng',
            password='pass123',
            user_type='vendor',
            is_verified_vendor=True
        )

        # Create listing
        self.category = Category.objects.create(
            title='Food',
            slug='food'
        )

        self.listing = Listing.objects.create(
            vendor=self.seller,
            category=self.category,
            title='Jollof Rice',
            description='Delicious jollof rice',
            price=Decimal('1000.00')
        )

        # Create conversation
        self.conversation = Conversation.objects.create(
            buyer=self.buyer,
            seller=self.seller,
            listing=self.listing
        )

        self.message_url = '/api/chat/messages/'

    def test_send_message_unauthenticated(self):
        """Test sending message fails without authentication"""
        message_data = {
            'listing_id': self.listing.id,
            'recipient_id': self.seller.id,
            'content': 'Hello'
        }

        response = self.client.post(f'{self.message_url}send/', message_data)
        self.assertIn(response.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

    def test_send_text_message(self):
        """Test sending a text message"""
        self.client.force_authenticate(user=self.buyer)

        message_data = {
            'listing_id': self.listing.id,
            'recipient_id': self.seller.id,
            'content': 'Is this available?',
            'message_type': 'text'
        }

        response = self.client.post(f'{self.message_url}send/', message_data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('data', response.data)

    def test_send_offer_message(self):
        """Test sending an offer message"""
        self.client.force_authenticate(user=self.buyer)

        message_data = {
            'listing_id': self.listing.id,
            'recipient_id': self.seller.id,
            'content': 'I would like to offer',
            'message_type': 'offer',
            'offer_amount': '800.00'
        }

        response = self.client.post(f'{self.message_url}send/', message_data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        # Check message created with offer
        message = Message.objects.get(id=response.data['data']['id'])
        self.assertEqual(message.message_type, 'offer')
        self.assertEqual(message.offer_amount, Decimal('800.00'))
        self.assertEqual(message.offer_status, 'pending')

    def test_send_offer_without_amount_fails(self):
        """Test sending offer without amount fails"""
        self.client.force_authenticate(user=self.buyer)

        message_data = {
            'listing_id': self.listing.id,
            'recipient_id': self.seller.id,
            'content': 'I would like to offer',
            'message_type': 'offer'
            # Missing offer_amount
        }

        response = self.client.post(f'{self.message_url}send/', message_data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_mark_message_as_read(self):
        """Test marking message as read"""
        # Create message from seller
        message = Message.objects.create(
            conversation=self.conversation,
            sender=self.seller,
            content='Hello from seller',
            is_read=False
        )

        # Buyer marks as read
        self.client.force_authenticate(user=self.buyer)
        response = self.client.patch(f'{self.message_url}{message.id}/mark_read/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Check message is read
        message.refresh_from_db()
        self.assertTrue(message.is_read)
        self.assertIsNotNone(message.read_at)

    def test_cannot_mark_own_message_as_read(self):
        """Test sender cannot mark their own message as read"""
        # Create message from buyer
        message = Message.objects.create(
            conversation=self.conversation,
            sender=self.buyer,
            content='Hello from buyer'
        )

        # Buyer tries to mark their own message as read
        self.client.force_authenticate(user=self.buyer)
        response = self.client.patch(f'{self.message_url}{message.id}/mark_read/')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class OfferNegotiationTests(APITestCase):
    """Test offer negotiation functionality"""

    def setUp(self):
        self.client = APIClient()

        # Create buyer and seller
        self.buyer = User.objects.create_user(
            username='buyer',
            email='buyer@pau.edu.ng',
            password='pass123'
        )

        self.seller = User.objects.create_user(
            username='seller',
            email='seller@pau.edu.ng',
            password='pass123',
            user_type='vendor',
            is_verified_vendor=True
        )

        # Create listing
        self.category = Category.objects.create(
            title='Food',
            slug='food'
        )

        self.listing = Listing.objects.create(
            vendor=self.seller,
            category=self.category,
            title='Jollof Rice',
            description='Delicious jollof rice',
            price=Decimal('1000.00')
        )

        # Create conversation
        self.conversation = Conversation.objects.create(
            buyer=self.buyer,
            seller=self.seller,
            listing=self.listing
        )

        # Create offer message
        self.offer = Message.objects.create(
            conversation=self.conversation,
            sender=self.buyer,
            message_type='offer',
            content='I would like to offer ₦800',
            offer_amount=Decimal('800.00'),
            offer_status='pending'
        )

        self.message_url = '/api/chat/messages/'

    def test_seller_accepts_offer(self):
        """Test seller can accept an offer"""
        self.client.force_authenticate(user=self.seller)

        response = self.client.patch(f'{self.message_url}{self.offer.id}/accept_offer/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Check offer status updated
        self.offer.refresh_from_db()
        self.assertEqual(self.offer.offer_status, 'accepted')

        # Check system message created
        system_messages = Message.objects.filter(
            conversation=self.conversation,
            message_type='system'
        )
        self.assertEqual(system_messages.count(), 1)
        self.assertIn('accepted', system_messages.first().content)

    def test_seller_rejects_offer(self):
        """Test seller can reject an offer"""
        self.client.force_authenticate(user=self.seller)

        response = self.client.patch(f'{self.message_url}{self.offer.id}/reject_offer/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Check offer status updated
        self.offer.refresh_from_db()
        self.assertEqual(self.offer.offer_status, 'rejected')

        # Check system message created
        system_messages = Message.objects.filter(
            conversation=self.conversation,
            message_type='system'
        )
        self.assertEqual(system_messages.count(), 1)
        self.assertIn('rejected', system_messages.first().content)

    def test_buyer_cannot_accept_own_offer(self):
        """Test buyer cannot accept their own offer"""
        self.client.force_authenticate(user=self.buyer)

        response = self.client.patch(f'{self.message_url}{self.offer.id}/accept_offer/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_cannot_accept_non_offer_message(self):
        """Test cannot accept a non-offer message"""
        # Create text message
        text_message = Message.objects.create(
            conversation=self.conversation,
            sender=self.buyer,
            message_type='text',
            content='Hello'
        )

        self.client.force_authenticate(user=self.seller)
        response = self.client.patch(f'{self.message_url}{text_message.id}/accept_offer/')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class ConversationCreationTests(TestCase):
    """Test conversation creation and management"""

    def setUp(self):
        # Create users
        self.buyer = User.objects.create_user(
            username='buyer',
            email='buyer@pau.edu.ng',
            password='pass123'
        )

        self.seller = User.objects.create_user(
            username='seller',
            email='seller@pau.edu.ng',
            password='pass123',
            user_type='vendor',
            is_verified_vendor=True
        )

        # Create listing
        self.category = Category.objects.create(
            title='Food',
            slug='food'
        )

        self.listing = Listing.objects.create(
            vendor=self.seller,
            category=self.category,
            title='Jollof Rice',
            description='Delicious jollof rice',
            price=Decimal('1000.00')
        )

    def test_get_or_create_conversation(self):
        """Test getting or creating a conversation"""
        # First call creates
        conv1, created1 = Conversation.objects.get_or_create(
            buyer=self.buyer,
            seller=self.seller,
            listing=self.listing
        )

        self.assertTrue(created1)

        # Second call gets existing
        conv2, created2 = Conversation.objects.get_or_create(
            buyer=self.buyer,
            seller=self.seller,
            listing=self.listing
        )

        self.assertFalse(created2)
        self.assertEqual(conv1.id, conv2.id)

    def test_multiple_conversations_different_listings(self):
        """Test user can have multiple conversations for different listings"""
        # Create first conversation
        conv1 = Conversation.objects.create(
            buyer=self.buyer,
            seller=self.seller,
            listing=self.listing
        )

        # Create second listing and conversation
        listing2 = Listing.objects.create(
            vendor=self.seller,
            category=self.category,
            title='Fried Rice',
            description='Delicious fried rice',
            price=Decimal('1200.00')
        )

        conv2 = Conversation.objects.create(
            buyer=self.buyer,
            seller=self.seller,
            listing=listing2
        )

        # Check both conversations exist
        conversations = Conversation.objects.filter(buyer=self.buyer)
        self.assertEqual(conversations.count(), 2)


class UnreadMessageTests(TestCase):
    """Test unread message tracking"""

    def setUp(self):
        # Create users
        self.buyer = User.objects.create_user(
            username='buyer',
            email='buyer@pau.edu.ng',
            password='pass123'
        )

        self.seller = User.objects.create_user(
            username='seller',
            email='seller@pau.edu.ng',
            password='pass123',
            user_type='vendor',
            is_verified_vendor=True
        )

        # Create listing
        self.category = Category.objects.create(
            title='Food',
            slug='food'
        )

        self.listing = Listing.objects.create(
            vendor=self.seller,
            category=self.category,
            title='Jollof Rice',
            description='Delicious jollof rice',
            price=Decimal('1000.00')
        )

        # Create conversation
        self.conversation = Conversation.objects.create(
            buyer=self.buyer,
            seller=self.seller,
            listing=self.listing
        )

    def test_count_unread_messages(self):
        """Test counting unread messages"""
        # Create unread messages from seller
        Message.objects.create(
            conversation=self.conversation,
            sender=self.seller,
            content='Message 1',
            is_read=False
        )

        Message.objects.create(
            conversation=self.conversation,
            sender=self.seller,
            content='Message 2',
            is_read=False
        )

        # Count unread messages for buyer
        unread = Message.objects.filter(
            conversation=self.conversation,
            is_read=False
        ).exclude(sender=self.buyer).count()

        self.assertEqual(unread, 2)

    def test_exclude_own_messages_from_unread(self):
        """Test user's own messages are not counted as unread"""
        # Create messages from both users
        Message.objects.create(
            conversation=self.conversation,
            sender=self.buyer,
            content='From buyer',
            is_read=False
        )

        Message.objects.create(
            conversation=self.conversation,
            sender=self.seller,
            content='From seller',
            is_read=False
        )

        # Count unread for buyer (should exclude their own)
        unread_for_buyer = Message.objects.filter(
            conversation=self.conversation,
            is_read=False
        ).exclude(sender=self.buyer).count()

        self.assertEqual(unread_for_buyer, 1)


class MessageQueryTests(TestCase):
    """Test message filtering and queries"""

    def setUp(self):
        # Create users
        self.buyer = User.objects.create_user(
            username='buyer',
            email='buyer@pau.edu.ng',
            password='pass123'
        )

        self.seller = User.objects.create_user(
            username='seller',
            email='seller@pau.edu.ng',
            password='pass123',
            user_type='vendor',
            is_verified_vendor=True
        )

        # Create listing
        self.category = Category.objects.create(
            title='Food',
            slug='food'
        )

        self.listing = Listing.objects.create(
            vendor=self.seller,
            category=self.category,
            title='Jollof Rice',
            description='Delicious jollof rice',
            price=Decimal('1000.00')
        )

        # Create conversation
        self.conversation = Conversation.objects.create(
            buyer=self.buyer,
            seller=self.seller,
            listing=self.listing
        )

    def test_filter_messages_by_type(self):
        """Test filtering messages by type"""
        # Create different message types
        Message.objects.create(
            conversation=self.conversation,
            sender=self.buyer,
            message_type='text',
            content='Text message'
        )

        Message.objects.create(
            conversation=self.conversation,
            sender=self.buyer,
            message_type='offer',
            content='Offer message',
            offer_amount=Decimal('800.00'),
            offer_status='pending'
        )

        Message.objects.create(
            conversation=self.conversation,
            sender=self.seller,
            message_type='system',
            content='System message'
        )

        # Filter by type
        text_messages = Message.objects.filter(message_type='text')
        offer_messages = Message.objects.filter(message_type='offer')
        system_messages = Message.objects.filter(message_type='system')

        self.assertEqual(text_messages.count(), 1)
        self.assertEqual(offer_messages.count(), 1)
        self.assertEqual(system_messages.count(), 1)

    def test_filter_messages_by_conversation(self):
        """Test filtering messages by conversation"""
        # Create messages in this conversation
        Message.objects.create(
            conversation=self.conversation,
            sender=self.buyer,
            content='Message 1'
        )

        Message.objects.create(
            conversation=self.conversation,
            sender=self.seller,
            content='Message 2'
        )

        messages = Message.objects.filter(conversation=self.conversation)
        self.assertEqual(messages.count(), 2)

    def test_filter_offers_by_status(self):
        """Test filtering offers by status"""
        # Create offers with different statuses
        Message.objects.create(
            conversation=self.conversation,
            sender=self.buyer,
            message_type='offer',
            content='Pending offer',
            offer_amount=Decimal('800.00'),
            offer_status='pending'
        )

        Message.objects.create(
            conversation=self.conversation,
            sender=self.buyer,
            message_type='offer',
            content='Accepted offer',
            offer_amount=Decimal('900.00'),
            offer_status='accepted'
        )

        # Filter by status
        pending_offers = Message.objects.filter(
            message_type='offer',
            offer_status='pending'
        )

        accepted_offers = Message.objects.filter(
            message_type='offer',
            offer_status='accepted'
        )

        self.assertEqual(pending_offers.count(), 1)
        self.assertEqual(accepted_offers.count(), 1)
