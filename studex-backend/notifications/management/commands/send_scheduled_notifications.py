from django.core.management.base import BaseCommand, CommandError


JOBS = {
    "booking_reminders": "send_booking_reminders",
    "vendor_digest": "send_vendor_daily_digest",
    "buyer_nudge": "send_buyer_daily_nudge",
    "buyer_reengagement": "send_buyer_reengagement_nudge",
    "lunch": "send_lunch_notifications",
    "rating_prompts": "prompt_rating_reviews",
    "pending_bookings": "nudge_pending_booking_vendors",
    "groq_students": "groq_notify_students",
    "groq_vendors": "groq_notify_vendors",
    "vendor_of_month": "pick_vendor_of_month",
    "auto_release": "auto_release_orders",
    "auto_cancel": "auto_cancel_pending_orders",
}


class Command(BaseCommand):
    help = (
        "Run a scheduled notification job on demand. "
        f"Available jobs: {', '.join(JOBS)}"
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "job",
            choices=list(JOBS.keys()),
            help="Which job to run",
        )

    def handle(self, *args, **options):
        job_key = options["job"]
        fn_name = JOBS[job_key]

        try:
            import scheduler as sched_module
            fn = getattr(sched_module, fn_name)
        except AttributeError:
            raise CommandError(f"Function '{fn_name}' not found in scheduler.py")

        self.stdout.write(f"Running {job_key} ({fn_name})...")
        fn()
        self.stdout.write(self.style.SUCCESS(f"Done: {job_key}"))
