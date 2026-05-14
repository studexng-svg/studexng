from django.db.models.signals import post_save
from django.dispatch import receiver


@receiver(post_save, sender='orders.Order')
def notify_admin_new_order(sender, instance, created, **kwargs):
    if not created:
        return
    try:
        from notifications.models import Notification
        amount = f'₦{int(instance.amount):,}'
        buyer = instance.buyer.get_full_name() or instance.buyer.username
        Notification.objects.create(
            recipient=None,
            is_admin_notification=True,
            notification_type='order_confirmed',
            title='New Order Created',
            message=f'{buyer} placed an order for {amount} (#{instance.reference}).',
            action_url=f'/admin/orders/order/{instance.pk}/change/',
        )
    except Exception:
        pass
