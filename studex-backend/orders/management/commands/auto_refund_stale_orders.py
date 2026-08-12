from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = (
        "Warn vendors of, then auto-refund, a self-fulfilled marketplace "
        "order that's sat 'paid' past orders.models.AutoRefundSettings.hours "
        "(default 72h) with no seller_completed. Service bookings and "
        "food/batched-delivery orders are never touched — see scheduler."
        "auto_refund_stale_paid_orders for the full scoping rationale."
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

        from scheduler import warn_vendors_of_pending_auto_refund, auto_refund_stale_paid_orders
        self.stdout.write("Running warn_vendors_of_pending_auto_refund...")
        warn_vendors_of_pending_auto_refund()
        self.stdout.write(self.style.SUCCESS("warn_vendors_of_pending_auto_refund done."))

        self.stdout.write("Running auto_refund_stale_paid_orders...")
        auto_refund_stale_paid_orders()
        self.stdout.write(self.style.SUCCESS("auto_refund_stale_paid_orders done."))

    def _dry_run(self):
        from django.utils import timezone
        from datetime import timedelta
        from orders.models import Order, AutoRefundSettings

        now = timezone.now()
        hours = AutoRefundSettings.get().hours

        def qs(cutoff_hours, warned_flag):
            cutoff = now - timedelta(hours=cutoff_hours)
            return (
                Order.objects
                .filter(
                    status='paid', paid_at__lte=cutoff, **{warned_flag: False},
                    delivery_slot__isnull=True, listing__listing_type='product',
                )
                .filter(delivery__isnull=True)
                .exclude(disputes__status__in=['open', 'under_review'])
            )

        to_warn = qs(hours / 2, 'vendor_timeout_warned')
        self.stdout.write(f"[DRY RUN] Would warn {to_warn.count()} vendor(s) (halfway = {hours / 2}h):")
        for o in to_warn:
            self.stdout.write(f"  - Order {o.reference} (paid_at={o.paid_at})")

        to_refund = qs(hours, 'vendor_timeout_refunded')
        self.stdout.write(f"[DRY RUN] Would auto-refund {to_refund.count()} order(s) ({hours}h window):")
        for o in to_refund:
            self.stdout.write(f"  - Order {o.reference} (paid_at={o.paid_at})")
