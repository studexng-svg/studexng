# chat/models.py
from django.db import models
from django.conf import settings


class Conversation(models.Model):
    buyer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='buyer_conversations')
    seller = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='seller_conversations')
    listing = models.ForeignKey('services.Listing', on_delete=models.SET_NULL, null=True, blank=True)
    last_message = models.TextField(blank=True, default='')
    last_message_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('buyer', 'seller', 'listing')
        ordering = ['-updated_at']

    def __str__(self):
        return f"{self.buyer.username} ↔ {self.seller.username} ({self.listing})"


class Message(models.Model):
    MESSAGE_TYPES = [
        ('text', 'Text'),
        ('image', 'Image'),
        ('offer', 'Offer'),
    ]

    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name='messages')
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='sent_messages')
    message_type = models.CharField(max_length=20, choices=MESSAGE_TYPES, default='text')
    content = models.TextField(blank=True, default='')
    image = models.ImageField(upload_to='chat_images/', null=True, blank=True)
    image_url = models.URLField(blank=True, default='')  # For Cloudinary URL
    offer_amount = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    offer_status = models.CharField(max_length=20, default='pending', blank=True)
    is_read = models.BooleanField(default=False)
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f"Message from {self.sender.username} in conversation {self.conversation.id}"

    def get_image_url(self):
        """Returns Cloudinary URL if available, otherwise Django media URL"""
        if self.image_url:
            return self.image_url
        if self.image:
            return self.image.url
        return None