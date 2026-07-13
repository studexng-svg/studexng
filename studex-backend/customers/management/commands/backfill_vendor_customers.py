from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Backfill customers.VendorCustomer from all historically completed orders"

    def handle(self, *args, **options):
        from orders.models import Order
        from customers.services import recompute_vendor_customer

        pairs = (
            Order.objects
            .filter(status='completed')
            .values_list('listing__vendor_id', 'buyer_id')
            .distinct()
        )
        total = pairs.count()
        self.stdout.write(f"Backfilling {total} vendor-customer pairs...")

        done = skipped = 0
        for vendor_id, buyer_id in pairs:
            if not vendor_id or not buyer_id:
                skipped += 1
                continue
            recompute_vendor_customer(vendor_id, buyer_id)
            done += 1

        self.stdout.write(self.style.SUCCESS(
            f"Done: {done} vendor-customer pairs backfilled, {skipped} skipped (no vendor/buyer)"
        ))
