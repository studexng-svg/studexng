# accounts/utils.py
# Shared utility functions used across views, admin, signals etc.


def send_notification(recipient, notification_type, title, message, action_url=None):
    """
    Create a notification for a user. Fails silently so it never
    breaks the main action if something goes wrong.
    """
    try:
        from notifications.models import Notification
        Notification.objects.create(
            recipient=recipient,
            notification_type=notification_type,
            title=title,
            message=message,
            action_url=action_url or '',
        )
    except Exception:
        pass