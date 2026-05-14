from django.db.models.signals import post_save
from django.dispatch import receiver


@receiver(post_save, sender='services.Listing')
def notify_admin_new_listing(sender, instance, created, **kwargs):
    if not created:
        return
    try:
        from notifications.models import Notification
        name = instance.vendor.get_full_name() or instance.vendor.username
        Notification.objects.create(
            recipient=None,
            is_admin_notification=True,
            notification_type='new_listing',
            title='New Listing Added',
            message=f'{name} listed "{instance.title}" — needs approval.',
            action_url=f'/admin/services/listing/{instance.pk}/change/',
        )
    except Exception:
        pass
