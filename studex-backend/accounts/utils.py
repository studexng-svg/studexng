# accounts/utils.py
"""
send_notification — creates a DB notification AND instantly pushes it
to any open browser tabs via SSE. This is the single function to call
from anywhere in the codebase whenever you want to notify a user.
"""


def send_notification(
    recipient,
    notification_type: str,
    title: str,
    message: str,
    action_url: str = "",
):
    """
    Creates a Notification record and immediately pushes it to the
    recipient's open browser connections via SSE (real-time).

    Args:
        recipient:          User instance
        notification_type:  String slug e.g. 'welcome', 'booking_reminder'
        title:              Short bold heading shown in the toast
        message:            Body text
        action_url:         Optional URL the user navigates to on click
    """
    try:
        from notifications.models import Notification
        n = Notification.objects.create(
            recipient=recipient,
            notification_type=notification_type,
            title=title,
            message=message,
            action_url=action_url,
        )

        # Push to any open SSE connections immediately
        try:
            from notifications.views import push_notification_to_user
            push_notification_to_user(recipient.id, {
                "id": n.id,
                "type": n.notification_type,
                "title": n.title,
                "message": n.message,
                "is_read": False,
                "action_url": n.action_url or "",
                "created_at": n.created_at.isoformat(),
            })
        except Exception:
            pass  # SSE push failure must never break the main flow

        return n
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"send_notification failed: {e}")
        return None