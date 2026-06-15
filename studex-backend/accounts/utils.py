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
            cache.set(dedup_key, 1, timeout=30)
        except Exception:
            pass  # Cache down — proceed without dedup rather than dropping the notification

        from notifications.models import Notification
        n = Notification.objects.create(
            recipient=recipient,
            notification_type=notification_type,
            title=title,
            message=message,
            action_url=action_url,
            is_admin_notification=bool(getattr(recipient, 'is_staff', False)),
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

        # ── FCM / Expo push to all registered devices ───────────────────────
        try:
            from notifications.models import FCMToken
            tokens = list(FCMToken.objects.filter(user=recipient).values_list('token', flat=True))
            logger.debug(f"[push] Tokens for user {recipient.id}: {tokens}")
            if tokens:
                expo_tokens = [t for t in tokens if t.startswith("ExponentPushToken[")]
                fcm_tokens  = [t for t in tokens if not t.startswith("ExponentPushToken[")]

                # Expo push tokens → Expo push relay (https://exp.host/--/api/v2/push/send)
                if expo_tokens:
                    print(f"[push] Sending to Expo tokens: {expo_tokens}")
                    import httpx
                    resp = httpx.post(
                        "https://exp.host/--/api/v2/push/send",
                        json=[
                            {
                                "to": token,
                                "title": title,
                                "body": message,
                                "data": {"action_url": action_url or ""},
                                "sound": "default",
                                "priority": "high",
                            }
                            for token in expo_tokens
                        ],
                        headers={"Accept": "application/json", "Content-Type": "application/json"},
                        timeout=10,
                    )
                    print(f"[push] Expo API response {resp.status_code}: {resp.text[:300]}")

                # Raw FCM tokens → firebase_admin (web push tokens)
                if fcm_tokens:
                    print(f"[push] Sending to FCM tokens: {fcm_tokens}")
                    import firebase_admin
                    from firebase_admin import messaging as fcm_messaging
                    if not firebase_admin._apps:
                        from studex.firebase_admin_init import initialize_firebase
                        initialize_firebase()
                    fcm_msg = fcm_messaging.MulticastMessage(
                        notification=fcm_messaging.Notification(title=title, body=message),
                        tokens=fcm_tokens,
                        data={'action_url': action_url or ''},
                    )
                    response = fcm_messaging.send_each_for_multicast(fcm_msg)
                    if response.failure_count > 0:
                        invalid = [fcm_tokens[i] for i, r in enumerate(response.responses) if not r.success]
                        if invalid:
                            FCMToken.objects.filter(token__in=invalid).delete()
        except Exception as e:
            logger.error(f"[push] Push delivery failed: {e}", exc_info=True)

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
