from django.core.management.base import BaseCommand
from django.utils import timezone
from django.core.cache import cache
from datetime import timedelta
from cart.models import CartItem


class Command(BaseCommand):
    help = 'Delete cart items whose 10-minute reservation has expired'

    def handle(self, *args, **options):
        cutoff = timezone.now() - timedelta(seconds=600)
        expired = CartItem.objects.filter(reserved_at__lt=cutoff).select_related('listing')
        count = 0
        for item in expired:
            rkey = f'reserved:{item.listing_id}'
            if cache.get(rkey) == item.user_id:
                cache.delete(rkey)
            item.delete()
            count += 1
        self.stdout.write(self.style.SUCCESS(f'Cleared {count} expired reservation(s).'))
