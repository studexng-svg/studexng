from django.core.management.base import BaseCommand
from django.utils import timezone
from accounts.models import User, Vendor


class Command(BaseCommand):
    help = "Create missing Vendor records for all users with is_verified_vendor=True"

    def handle(self, *args, **options):
        verified_users = User.objects.filter(is_verified_vendor=True)
        created = 0
        skipped = 0

        for user in verified_users:
            _, was_created = Vendor.objects.get_or_create(
                user=user,
                defaults={
                    "is_verified": True,
                    "verified_at": timezone.now(),
                },
            )
            if was_created:
                created += 1
            else:
                skipped += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Done. Created {created} Vendor record(s), {skipped} already existed."
            )
        )
