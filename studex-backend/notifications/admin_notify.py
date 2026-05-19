# notifications/admin_notify.py
# Triggered on every new admin notification — sends email via Resend
# and FCM push to all staff users' registered devices.

from django.db.models.signals import post_save
from django.dispatch import receiver


@receiver(post_save, sender='notifications.Notification')
def on_admin_notification_created(sender, instance, created, **kwargs):
    if not created or not instance.is_admin_notification:
        return
    _send_admin_fcm(instance)


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
