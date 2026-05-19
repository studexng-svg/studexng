from django.contrib import admin
from .models import Notification, FCMToken, PlatformSettings, GrokNotificationLog


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ['recipient', 'notification_type', 'title', 'is_read', 'is_admin_notification', 'created_at']
    list_filter = ['notification_type', 'is_read', 'is_admin_notification', 'created_at']
    search_fields = ['recipient__username', 'recipient__email', 'title', 'message']
    readonly_fields = ['recipient', 'notification_type', 'title', 'message', 'action_url', 'is_admin_notification', 'created_at']
    ordering = ['-created_at']

    def has_add_permission(self, request):
        return False


@admin.register(FCMToken)
class FCMTokenAdmin(admin.ModelAdmin):
    list_display = ['user', 'created_at']
    search_fields = ['user__username', 'user__email']
    readonly_fields = ['user', 'token', 'created_at']

    def has_add_permission(self, request):
        return False


@admin.register(PlatformSettings)
class PlatformSettingsAdmin(admin.ModelAdmin):
    list_display = ['__str__', 'grok_notifications_enabled', 'updated_at']
    readonly_fields = ['updated_at']

    def has_add_permission(self, request):
        return not PlatformSettings.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(GrokNotificationLog)
class GrokNotificationLogAdmin(admin.ModelAdmin):
    list_display = ['title', 'audience', 'school', 'sent_count', 'triggered_by', 'created_at']
    list_filter = ['audience', 'triggered_by']
    readonly_fields = ['audience', 'school', 'title', 'message', 'sent_count', 'triggered_by', 'grok_model', 'created_at']
    ordering = ['-created_at']

    def has_add_permission(self, request):
        return False
