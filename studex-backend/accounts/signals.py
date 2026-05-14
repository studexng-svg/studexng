from django.db.models.signals import post_save
from django.dispatch import receiver


@receiver(post_save, sender='accounts.SellerApplication')
def notify_admin_seller_application(sender, instance, created, **kwargs):
    if not created:
        return
    try:
        from notifications.models import Notification
        name = instance.user.get_full_name() or instance.user.username
        Notification.objects.create(
            recipient=None,
            is_admin_notification=True,
            notification_type='vendor_application',
            title='New Seller Application',
            message=f'{name} submitted a seller verification application.',
            action_url=f'/admin/accounts/sellerapplication/{instance.pk}/change/',
        )
    except Exception:
        pass
