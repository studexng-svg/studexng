from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = (
        "Auto-complete orders stuck in seller_completed for 48 h+ "
        "and cancel unpaid orders older than 24 h."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help="Print what would happen without making any changes.",
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']

        if dry_run:
            self._dry_run()
            return

        from scheduler import auto_release_orders, auto_cancel_pending_orders
        self.stdout.write("Running auto_release_orders...")
        auto_release_orders()
        self.stdout.write(self.style.SUCCESS("auto_release_orders done."))

        self.stdout.write("Running auto_cancel_pending_orders...")
        auto_cancel_pending_orders()
        self.stdout.write(self.style.SUCCESS("auto_cancel_pending_orders done."))

    def _dry_run(self):
        from django.utils import timezone
        from datetime import timedelta
        from orders.models import Order

        now = timezone.now()

        release_cutoff = now - timedelta(hours=48)
        to_release = Order.objects.filter(
            status='seller_completed',
            seller_completed_at__lte=release_cutoff,
            auto_released=False,
        ).exclude(disputes__status__in=['open', 'under_review'])
        self.stdout.write(f"[DRY RUN] Would auto-complete {to_release.count()} order(s):")
        for o in to_release:
            self.stdout.write(f"  - Order {o.reference} (seller_completed_at={o.seller_completed_at})")

        cancel_cutoff = now - timedelta(hours=24)
        to_cancel = Order.objects.filter(status='pending', created_at__lte=cancel_cutoff)
        self.stdout.write(f"[DRY RUN] Would cancel {to_cancel.count()} pending order(s):")
        for o in to_cancel:
            self.stdout.write(f"  - Order {o.reference} (created_at={o.created_at})")
