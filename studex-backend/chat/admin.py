from django.contrib import admin
from .models import Conversation, Message


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = ['id', 'buyer', 'seller', 'listing', 'last_message_at', 'created_at']
    list_filter = ['created_at', 'updated_at']
    search_fields = ['buyer__username', 'seller__username', 'listing__title']
    readonly_fields = ['created_at', 'updated_at', 'last_message', 'last_message_at']
    ordering = ['-updated_at']


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ['id', 'conversation', 'sender', 'message_type', 'is_read', 'created_at']
    list_filter = ['message_type', 'is_read', 'offer_status', 'created_at']
    search_fields = ['sender__username', 'content']
    readonly_fields = ['created_at', 'updated_at', 'read_at']
    ordering = ['-created_at']
