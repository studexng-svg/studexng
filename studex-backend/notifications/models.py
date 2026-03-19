# notifications/models.py
from django.db import models
from django.conf import settings


class Notification(models.Model):
    TYPE_CHOICES = (
        ('vendor_application', 'New Vendor Application'),
        ('new_listing', 'New Listing Needs Approval'),
        ('vendor_approved', 'Vendor Account Approved'),
        ('vendor_revoked', 'Vendor Account Deactivated'),
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
        ordering = ['-created_at']
        verbose_name = "Notification"
        verbose_name_plural = "Notifications"