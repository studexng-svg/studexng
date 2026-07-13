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


@receiver(post_save, sender='orders.Order')
def sync_payout_transaction(sender, instance, **kwargs):
    """Keep services.Transaction in sync with Order status changes."""
    PAYOUT_STATUSES = {'paid', 'seller_completed', 'completed'}
    if instance.status not in PAYOUT_STATUSES:
        return
    if not instance.listing_id:
        return
    try:
        from services.models import Transaction
        from django.utils import timezone

        listing = instance.listing
        vendor = listing.vendor
        if not vendor:
            return

        txn, _ = Transaction.objects.get_or_create(
            order=instance,
            defaults={
                'vendor': vendor,
                'amount': listing.price,
                'status': 'in_escrow',
            }
        )

        if instance.status == 'completed' and txn.status == 'in_escrow':
            txn.status = 'released'
            txn.released_at = instance.buyer_confirmed_at or timezone.now()
            txn.save(update_fields=['status', 'released_at'])
    except Exception:
        pass


@receiver(post_save, sender='orders.Order')
def update_vendor_customer_stats(sender, instance, **kwargs):
    """
    Keep customers.VendorCustomer in sync whenever an order reaches 'completed'.
    Signal-based (not just hooked into OrderViewSet.confirm()) because there are
    multiple paths to 'completed' — buyer confirm, the scheduler's auto-release,
    and admin force-complete actions — and all of them must update this stat.
    """
    if instance.status != 'completed' or not instance.listing_id:
        return
    try:
        from customers.services import recompute_vendor_customer
        recompute_vendor_customer(instance.listing.vendor_id, instance.buyer_id)
    except Exception:
        pass
