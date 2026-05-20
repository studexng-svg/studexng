# accounts/utils.py
"""
send_notification — creates a DB notification AND instantly pushes it
to any open browser tabs via SSE, FCM, and email.

Deduplication: identical notifications to the same recipient within 60 seconds
are silently dropped — prevents duplicates from signals, retries, or double-calls.
"""
import hashlib
import logging

logger = logging.getLogger(__name__)


def _dedup_key(recipient_id, notification_type, title):
    h = hashlib.md5(f"{notification_type}:{title}".encode()).hexdigest()[:12]
    return f"notif_dedup:{recipient_id}:{h}"


def send_notification(
    recipient,
    notification_type: str,
    title: str,
    message: str,
    action_url: str = "",
    send_email: bool = True,
):
    """
    Creates a Notification record and immediately pushes it via SSE, FCM, and email.

    Args:
        recipient:          User instance
        notification_type:  String slug e.g. 'new_order', 'order_update'
        title:              Short heading shown in the toast / push
        message:            Body text
        action_url:         Optional deep-link URL
        send_email:         Set False for admin-only notifications to skip email
    """
    try:
        # ── Deduplication ────────────────────────────────────────────────────
        # Drop duplicate notifications fired within 60 s (signals, retries, etc.)
        try:
            from django.core.cache import cache
            dedup_key = _dedup_key(recipient.id, notification_type, title)
            if cache.get(dedup_key):
                logger.debug(f"[notify] Duplicate suppressed for user {recipient.id}: {title}")
                return None
            cache.set(dedup_key, 1, timeout=60)
        except Exception:
            pass  # Cache down — proceed without dedup rather than dropping the notification

        from notifications.models import Notification
        n = Notification.objects.create(
            recipient=recipient,
            notification_type=notification_type,
            title=title,
            message=message,
            action_url=action_url,
        )

        # ── SSE real-time push ───────────────────────────────────────────────
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
            pass

        # ── FCM push to all registered devices ──────────────────────────────
        try:
            import firebase_admin
            from firebase_admin import messaging as fcm_messaging
            if not firebase_admin._apps:
                from studex.firebase_admin_init import initialize_firebase
                initialize_firebase()
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
            pass

        # ── Email (Resend → Brevo fallback) ──────────────────────────────────
        # Skipped for admin-facing notifications (send_email=False)
        if send_email:
            try:
                from studex.email import send_notification_email
                send_notification_email(recipient, title, message, action_url)
            except Exception:
                pass

        return n
    except Exception as e:
        logger.error(f"send_notification failed: {e}")
        return None
