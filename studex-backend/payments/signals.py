import threading
from django.db.models.signals import pre_save, post_save
from django.dispatch import receiver

_prev_payment_status = {}
_prev_status_lock = threading.Lock()


@receiver(pre_save, sender='payments.PaymentTransaction')
def cache_payment_status(sender, instance, **kwargs):
    if instance.pk:
        try:
            status = sender.objects.values_list('status', flat=True).get(pk=instance.pk)
            with _prev_status_lock:
                _prev_payment_status[instance.pk] = status
        except sender.DoesNotExist:
            pass


@receiver(post_save, sender='payments.SellerBankAccount')
def notify_admin_bank_account(sender, instance, created, **kwargs):
    if not created:
        return
    try:
        from notifications.models import Notification
        name = instance.user.get_full_name() or instance.user.username
        Notification.objects.create(
            recipient=None,
            is_admin_notification=True,
            notification_type='bank_account_added',
            title='Bank Account Added',
            message=f'{name} added a {instance.bank_name} account ({instance.account_name}).',
            action_url=f'/admin/payments/sellerbankaccount/{instance.pk}/change/',
        )
    except Exception:
        pass


@receiver(post_save, sender='payments.PaymentTransaction')
def notify_admin_payment(sender, instance, created, **kwargs):
    with _prev_status_lock:
        prev = _prev_payment_status.pop(instance.pk, None)
    if instance.status != 'success':
        return
    if not created and prev == 'success':
        return
    try:
        from notifications.models import Notification
        amount = f'₦{int(instance.amount):,}'
        buyer = instance.buyer_name or (instance.buyer.get_full_name() if instance.buyer else 'customer')
        Notification.objects.create(
            recipient=None,
            is_admin_notification=True,
            notification_type='payment_received',
            title='Payment Completed',
            message=f'{amount} payment by {buyer} was successful (ref: {instance.reference}).',
            action_url=f'/admin/payments/paymenttransaction/{instance.pk}/change/',
        )
    except Exception:
        pass
