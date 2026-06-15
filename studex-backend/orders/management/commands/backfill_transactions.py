from django.core.management.base import BaseCommand
from django.utils import timezone


class Command(BaseCommand):
    help = "Backfill services.Transaction from existing paid/completed orders"

    def handle(self, *args, **options):
        from orders.models import Order
        from services.models import Transaction

        PAYOUT_STATUSES = ['paid', 'seller_completed', 'completed']
        orders = (
            Order.objects
            .filter(status__in=PAYOUT_STATUSES)
            .select_related('listing__vendor')
            .exclude(transaction__isnull=False)  # skip already-linked
        )
        total = orders.count()
        self.stdout.write(f"Backfilling {total} orders...")

        created = updated = skipped = 0
        for order in orders:
            if not order.listing_id or not order.listing.vendor_id:
                skipped += 1
                continue
            listing = order.listing
            vendor = listing.vendor

            txn, was_created = Transaction.objects.get_or_create(
                order=order,
                defaults={
                    'vendor': vendor,
                    'amount': listing.price,
                    'status': 'in_escrow',
                }
            )
            if was_created:
                created += 1
            else:
                updated += 1

            if order.status == 'completed' and txn.status == 'in_escrow':
                txn.status = 'released'
                txn.released_at = order.buyer_confirmed_at or timezone.now()
                txn.save(update_fields=['status', 'released_at'])

        self.stdout.write(self.style.SUCCESS(
            f"Done: {created} created, {updated} already existed, {skipped} skipped (no listing/vendor)"
        ))
