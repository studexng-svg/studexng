from django.db import models
from django.contrib.auth import get_user_model
from services.models import Listing

User = get_user_model()


class Conversation(models.Model):
    """Represents a chat conversation between a buyer and a seller about a listing"""
    buyer = models.ForeignKey(User, on_delete=models.CASCADE, related_name='buyer_conversations')
    seller = models.ForeignKey(User, on_delete=models.CASCADE, related_name='seller_conversations')
    listing = models.ForeignKey(Listing, on_delete=models.CASCADE, related_name='conversations')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Track last message for quick access
    last_message = models.TextField(blank=True)
    last_message_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-updated_at']
        unique_together = ['buyer', 'seller', 'listing']
        verbose_name = "Conversation"
        verbose_name_plural = "Conversations"
        indexes = [
            models.Index(fields=['-updated_at']),
            models.Index(fields=['buyer', 'seller']),
        ]

    def __str__(self):
        return f"Conversation: {self.buyer.username} <-> {self.seller.username} about {self.listing.title}"


class Message(models.Model):
    """Represents a single message in a conversation"""
    MESSAGE_TYPE_CHOICES = (
        ('text', 'Text Message'),
        ('offer', 'Price Offer'),
        ('system', 'System Message'),
    )

    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name='messages')
    sender = models.ForeignKey(User, on_delete=models.CASCADE, related_name='sent_messages')

    message_type = models.CharField(max_length=20, choices=MESSAGE_TYPE_CHOICES, default='text')
    content = models.TextField()

    # For price offers
    offer_amount = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    offer_status = models.CharField(
        max_length=20,
        choices=(
            ('pending', 'Pending'),
            ('accepted', 'Accepted'),
            ('rejected', 'Rejected'),
            ('expired', 'Expired'),
        ),
        null=True,
        blank=True
    )

    # Track read status
    is_read = models.BooleanField(default=False)
    read_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['created_at']
        verbose_name = "Message"
        verbose_name_plural = "Messages"
        indexes = [
            models.Index(fields=['conversation', 'created_at']),
            models.Index(fields=['sender']),
            models.Index(fields=['-created_at']),
        ]

    def __str__(self):
        return f"Message from {self.sender.username} in {self.conversation.id}"

    def save(self, *args, **kwargs):
        # Update conversation's last_message when a new message is created
        super().save(*args, **kwargs)

        # Update conversation timestamps
        self.conversation.last_message = self.content[:100]  # Store first 100 chars
        self.conversation.last_message_at = self.created_at
        self.conversation.save(update_fields=['last_message', 'last_message_at', 'updated_at'])
