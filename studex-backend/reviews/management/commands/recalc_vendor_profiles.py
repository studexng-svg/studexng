from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.db.models import Avg, Count

User = get_user_model()


class Command(BaseCommand):
    help = 'Backfill rating, total_reviews, and completion_rate for all vendors from live data'

    def handle(self, *args, **options):
        from reviews.models import Review
        from orders.models import Order

        vendors = User.objects.filter(is_verified_vendor=True).select_related('profile')
        updated = 0

        for vendor in vendors:
            try:
                profile = vendor.profile
            except Exception:
                continue

            # Rating + total reviews
            stats = Review.objects.filter(vendor=vendor).aggregate(
                avg_rating=Avg('rating'),
                total_reviews=Count('id'),
            )
            profile.rating = round(stats['avg_rating'] or 0, 2)
            profile.total_reviews = stats['total_reviews']

            # Completion rate
            vendor_orders = Order.objects.filter(listing__vendor=vendor)
            completed_count = vendor_orders.filter(status='completed').count()
            finalized_count = vendor_orders.filter(
                status__in=['completed', 'cancelled', 'disputed']
            ).count()
            profile.completion_rate = round(
                (completed_count / finalized_count * 100), 2
            ) if finalized_count > 0 else 0

            profile.save(update_fields=['rating', 'total_reviews', 'completion_rate'])
            updated += 1
            self.stdout.write(
                f'  {vendor.username}: rating={profile.rating}, '
                f'reviews={profile.total_reviews}, completion={profile.completion_rate}%'
            )

        self.stdout.write(self.style.SUCCESS(f'\nDone. Updated {updated} vendor profile(s).'))
