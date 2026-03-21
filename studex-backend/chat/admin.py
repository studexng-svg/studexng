from django.contrib import admin
from django.utils import timezone
from django.utils.html import format_html
from .models import Conversation, Message


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = [
        'id', 'buyer', 'seller', 'listing',
        'unread_count', 'message_preview', 'last_message_at', 'created_at'
    ]
    list_filter = ['created_at']
    search_fields = ['buyer__username', 'seller__username', 'listing__title']
    readonly_fields = ['created_at', 'updated_at', 'last_message', 'last_message_at']
    ordering = ['-updated_at']
    date_hierarchy = 'created_at'
    list_per_page = 30

    fieldsets = (
        ('Participants', {
            'fields': ('buyer', 'seller', 'listing')
        }),
        ('Latest Activity', {
            'fields': ('last_message', 'last_message_at')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )

    actions = ['mark_all_messages_read']

    def unread_count(self, obj):
        count = obj.messages.filter(is_read=False).count()
        if count > 0:
            return format_html(
                '<span style="background-color: red; color: white; padding: 2px 8px; border-radius: 10px; font-weight: bold;">{}</span>',
                count
            )
        return '0'
    unread_count.short_description = 'Unread'

    def message_preview(self, obj):
        if obj.last_message:
            preview = obj.last_message[:50]
            return f"{preview}..." if len(obj.last_message) > 50 else preview
        return "No messages yet"
    message_preview.short_description = 'Last Message Preview'

    def mark_all_messages_read(self, request, queryset):
        total = 0
        for conversation in queryset:
            updated = conversation.messages.filter(is_read=False).update(
                is_read=True, read_at=timezone.now()
            )
            total += updated
        self.message_user(request, f"{total} message(s) marked as read across {queryset.count()} conversation(s).")
    mark_all_messages_read.short_description = "Mark all messages as read"


class MessageInline(admin.TabularInline):
    model = Message
    extra = 0
    can_delete = False
    fields = ('sender', 'content', 'message_type', 'is_read', 'created_at')
    readonly_fields = ('sender', 'content', 'message_type', 'is_read', 'created_at')
    max_num = 10


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = [
        'id', 'get_conversation_id', 'sender', 'message_type',
        'content_preview', 'colored_read_status', 'offer_status', 'created_at'
    ]
    list_filter = ['message_type', 'is_read', 'offer_status', 'created_at']
    search_fields = ['sender__username', 'content', 'conversation__id']
    readonly_fields = ['created_at', 'read_at']  # removed updated_at — not on Message model
    ordering = ['-created_at']
    date_hierarchy = 'created_at'
    list_per_page = 50

    fieldsets = (
        ('Message Details', {
            'fields': ('conversation', 'sender', 'message_type', 'content', 'image', 'image_url')
        }),
        ('Offer Details', {
            'fields': ('offer_amount', 'offer_status'),
            'classes': ('collapse',)
        }),
        ('Read Status', {
            'fields': ('is_read', 'read_at')
        }),
        ('Timestamps', {
            'fields': ('created_at',),
            'classes': ('collapse',)
        }),
    )

    actions = ['mark_as_read', 'mark_as_unread']

    def get_conversation_id(self, obj):
        return f"Conv #{obj.conversation.id}"
    get_conversation_id.short_description = 'Conversation'

    def content_preview(self, obj):
        if obj.image_url or (obj.image and obj.message_type == 'image'):
            return "📷 Image"
        if obj.content:
            preview = obj.content[:60]
            return f"{preview}..." if len(obj.content) > 60 else preview
        return "(No content)"
    content_preview.short_description = 'Content'

    def colored_read_status(self, obj):
        if obj.is_read:
            return format_html('<span style="color: green; font-weight: bold;">✓ READ</span>')
        return format_html('<span style="color: orange; font-weight: bold;">● UNREAD</span>')
    colored_read_status.short_description = 'Status'

    def mark_as_read(self, request, queryset):
        updated = queryset.filter(is_read=False).update(is_read=True, read_at=timezone.now())
        self.message_user(request, f"{updated} message(s) marked as read.")
    mark_as_read.short_description = "Mark as read"

    def mark_as_unread(self, request, queryset):
        updated = queryset.filter(is_read=True).update(is_read=False, read_at=None)
        self.message_user(request, f"{updated} message(s) marked as unread.")
    mark_as_unread.short_description = "Mark as unread"