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

        # Send FCM push notification to all registered devices
        try:
            import firebase_admin
            from firebase_admin import messaging as fcm_messaging
            if not firebase_admin._apps:
                from firebase_admin import credentials as fb_cred
                from django.conf import settings as django_settings
                import os
                sa_path = os.path.join(django_settings.BASE_DIR, '..', 'firebase_service_account.json')
                fb_cred_obj = fb_cred.Certificate(sa_path)
                firebase_admin.initialize_app(fb_cred_obj)
            from notifications.models import FCMToken
            tokens = list(FCMToken.objects.filter(user=recipient).values_list('token', flat=True))
            if tokens:
                fcm_msg = fcm_messaging.MulticastMessage(
                    notification=fcm_messaging.Notification(title=title, body=message),
                    tokens=tokens,
                    data={'action_url': action_url or ''},
                )
                response = fcm_messaging.send_each_for_multicast(fcm_msg)
                if response.failure_count > 0:
                    invalid = [tokens[i] for i, r in enumerate(response.responses) if not r.success]
                    if invalid:
                        FCMToken.objects.filter(token__in=invalid).delete()
        except Exception:
            pass  # FCM failure must never break the main flow

        return n
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"send_notification failed: {e}")
        return None