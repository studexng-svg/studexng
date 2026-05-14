# notifications/admin_notify.py
# Triggered on every new admin notification — sends email via Resend
# and FCM push to all staff users' registered devices.

from django.db.models.signals import post_save
from django.dispatch import receiver


@receiver(post_save, sender='notifications.Notification')
def on_admin_notification_created(sender, instance, created, **kwargs):
    if not created or not instance.is_admin_notification:
        return
    _send_admin_email(instance)
    _send_admin_fcm(instance)


def _send_admin_email(notification):
    try:
        from django.conf import settings
        import resend

        api_key = getattr(settings, 'RESEND_API_KEY', '')
        admin_email = getattr(settings, 'ADMIN_EMAIL', '')
        if not api_key or not admin_email:
            return

        resend.api_key = api_key

        backend_url = getattr(settings, 'BACKEND_BASE_URL', 'https://studex-backend-v2.onrender.com')
        action_url = notification.action_url or ''
        full_url = f"{backend_url}{action_url}" if action_url else ''

        btn_html = (
            f'<a href="{full_url}" style="display:inline-block;margin-top:16px;'
            f'background:linear-gradient(135deg,#0d9488,#7c3aed);color:#fff;'
            f'padding:10px 22px;border-radius:8px;text-decoration:none;font-weight:600;">'
            f'View in Admin &rarr;</a>'
        ) if full_url else ''

        resend.Emails.send({
            "from": "StudEx <noreply@studex.com.ng>",
            "to": [admin_email],
            "subject": f"[StudEx Admin] {notification.title}",
            "html": (
                f'<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">'
                f'<p style="color:#7c3aed;font-size:12px;font-weight:700;letter-spacing:.1em;'
                f'text-transform:uppercase;margin:0 0 6px;">StudEx Admin</p>'
                f'<h2 style="color:#111;margin:0 0 12px;">{notification.title}</h2>'
                f'<p style="color:#374151;line-height:1.6;margin:0;">{notification.message}</p>'
                f'{btn_html}'
                f'<hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0 16px;">'
                f'<p style="color:#9ca3af;font-size:12px;margin:0;">You received this because you are a StudEx admin.</p>'
                f'</div>'
            ),
        })
    except Exception:
        pass


def _send_admin_fcm(notification):
    try:
        import firebase_admin
        from firebase_admin import messaging as fcm

        if not firebase_admin._apps:
            from studex.firebase_admin_init import initialize_firebase
            initialize_firebase()
        if not firebase_admin._apps:
            return

        from notifications.models import FCMToken
        tokens = list(
            FCMToken.objects.filter(user__is_staff=True).values_list('token', flat=True)
        )
        if not tokens:
            return

        msg = fcm.MulticastMessage(
            notification=fcm.Notification(
                title=notification.title,
                body=notification.message,
            ),
            data={
                'action_url': notification.action_url or '',
                'type': notification.notification_type,
            },
            android=fcm.AndroidConfig(
                priority='high',
                notification=fcm.AndroidNotification(sound='default'),
            ),
            apns=fcm.APNSConfig(
                payload=fcm.APNSPayload(aps=fcm.Aps(sound='default')),
            ),
            tokens=tokens,
        )

        response = fcm.send_each_for_multicast(msg)

        # Clean up tokens that FCM says are no longer valid
        if response.failure_count > 0:
            invalid = [tokens[i] for i, r in enumerate(response.responses) if not r.success]
            if invalid:
                FCMToken.objects.filter(token__in=invalid).delete()

    except Exception:
        pass
