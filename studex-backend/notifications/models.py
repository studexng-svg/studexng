# notifications/models.py
from django.db import models
from django.conf import settings


class Notification(models.Model):
    TYPE_CHOICES = (
        ('vendor_application', 'New Vendor Application'),
        ('new_listing', 'New Listing Needs Approval'),
        ('listing_approved', 'Listing Approved by Admin'),
        ('vendor_approved', 'Vendor Account Approved'),
        ('vendor_revoked', 'Vendor Account Deactivated'),
        ('new_booking_request', 'New Booking Request'),
        ('booking_paid', 'Booking Paid'),
        ('order_confirmed', 'Order Confirmed by Buyer'),
        ('booking_reminder_5min', 'Booking Starting in 5 Minutes'),
        ('booking_time_now', 'Booking Time Now'),
        ('booking_confirmed', 'Booking Confirmed by Vendor'),
        ('booking_cancelled', 'Booking Cancelled'),
        ('payment_received', 'Payment Received'),
        ('order_completed', 'Order Completed'),
        ('seller_approved', 'Seller Application Approved'),
        ('seller_rejected', 'Seller Application Rejected'),
        ('seller_revoked', 'Seller Status Revoked'),
        ('message', 'New Message'),
        ('admin_message', 'Message from Admin'),
        ('bank_account_added', 'Bank Account Added'),
        ('ai_tip', 'AI Tip / Engagement Message'),
        ('rate_vendor', 'Rate Your Vendor'),
        ('order_auto_released', 'Order Auto-Released'),
        ('new_order', 'New Order Received'),
        ('order_placed', 'Order Placed'),
        ('order_cancelled', 'Order Cancelled'),
        ('payout_failed', 'Payout Failed'),
        ('vendor_of_month', 'Vendor of the Month'),
        ('badge_upgrade', 'Vendor Badge Upgrade'),
        ('welcome', 'Welcome'),
        ('admin_new_order', 'New Paid Order (Admin)'),
    )

    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='notifications',
        null=True, blank=True,
    )
    is_admin_notification = models.BooleanField(default=False)
    notification_type = models.CharField(max_length=30, choices=TYPE_CHOICES)
    title = models.CharField(max_length=200)
    message = models.TextField()
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    action_url = models.CharField(max_length=500, blank=True, null=True)

    def __str__(self):
        target = self.recipient.username if self.recipient else "Admin"
        return f"[{self.get_notification_type_display()}] → {target}"

    class Meta:
        indexes = [
            models.Index(fields=['recipient', 'is_read']),
            models.Index(fields=['recipient', '-created_at']),
        ]
        ordering = ['-created_at']
        verbose_name = "Notification"
        verbose_name_plural = "Notifications"


class PlatformSettings(models.Model):
    """Singleton settings row — always pk=1. Use PlatformSettings.get()."""
    grok_notifications_enabled = models.BooleanField(
        default=True,
        help_text="When off, the scheduled Groq AI broadcasts are silently skipped.",
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Platform Settings"
        verbose_name_plural = "Platform Settings"

    def __str__(self):
        status = "ON" if self.grok_notifications_enabled else "OFF"
        return f"Platform Settings (AI broadcasts: {status})"

    @classmethod
    def get(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


class GrokNotificationLog(models.Model):
    AUDIENCE_CHOICES = (
        ('students', 'Students'),
        ('vendors', 'Vendors'),
        ('all', 'All Users'),
    )
    audience = models.CharField(max_length=20, choices=AUDIENCE_CHOICES)
    school = models.CharField(max_length=20, blank=True, default='')
    title = models.CharField(max_length=200)
    message = models.TextField()
    sent_count = models.IntegerField(default=0)
    triggered_by = models.CharField(max_length=20, default='scheduler')
    grok_model = models.CharField(max_length=50, default='grok-3-mini')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"[{self.audience}] {self.title} → {self.sent_count} sent"

    class Meta:
        ordering = ['-created_at']
        verbose_name = "Grok Notification Log"


class FCMToken(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='fcm_tokens',
    )
    token = models.CharField(max_length=500, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user.username} FCM token"