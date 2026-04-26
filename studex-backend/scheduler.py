# studex-backend/scheduler.py  (leave it here — it imports from multiple apps)
#
# FIX: replaced `import pytz` with `from zoneinfo import ZoneInfo`
# zoneinfo is built into Python 3.9+ — no pip install needed.
#
# If you need pytz elsewhere: pip install pytz  OR  add pytz to requirements.txt

import logging
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo          # ✅ replaces pytz — built into Python 3.9+

from django.utils import timezone
from django_apscheduler.jobstores import DjangoJobStore
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger

logger = logging.getLogger(__name__)

LAGOS_TZ = ZoneInfo("Africa/Lagos")   # ✅ replaces pytz.timezone("Africa/Lagos")


def send_booking_reminders():
    """
    Runs every minute. Sends notifications to vendors + buyers for bookings
    starting in ~5 minutes and at the exact start time.
    """
    try:
        from orders.models import Booking
        from notifications.models import Notification

        now_lagos = datetime.now(LAGOS_TZ)        # ✅ replaces datetime.now(lagos_tz)
        now_date = now_lagos.date()
        now_time = now_lagos.strftime("%H:%M")

        # ── 5-minute warning ───────────────────────────────────────────────
        five_min_ahead = (now_lagos + timedelta(minutes=5)).strftime("%H:%M")

        upcoming = Booking.objects.filter(
            scheduled_date=now_date,
            scheduled_time=five_min_ahead,
            status__in=["confirmed", "paid"],
        ).select_related("buyer", "listing", "listing__vendor")

        for booking in upcoming:
            # Notify vendor
            Notification.objects.get_or_create(
                recipient=booking.listing.vendor,
                notification_type="booking_reminder_5min",
                title=f"⏰ Booking in 5 minutes — {booking.listing.title}",
                message=(
                    f"Your booking with {booking.buyer.username} for "
                    f'"{booking.listing.title}" starts at {booking.scheduled_time}. '
                    f"Get ready!"
                ),
                action_url="/vendor/dashboard",
            )
            # Notify buyer
            Notification.objects.get_or_create(
                recipient=booking.buyer,
                notification_type="booking_reminder_5min",
                title=f"⏰ Your booking starts in 5 minutes!",
                message=(
                    f'"{booking.listing.title}" with {booking.listing.vendor.username} '
                    f"starts at {booking.scheduled_time}. Head over now!"
                ),
                action_url="/account/bookings",
            )

        # ── At booking time ────────────────────────────────────────────────
        starting_now = Booking.objects.filter(
            scheduled_date=now_date,
            scheduled_time=now_time,
            status__in=["confirmed", "paid"],
        ).select_related("buyer", "listing", "listing__vendor")

        for booking in starting_now:
            Notification.objects.get_or_create(
                recipient=booking.listing.vendor,
                notification_type="booking_time_now",
                title=f"🟢 Booking starting now — {booking.listing.title}",
                message=(
                    f"{booking.buyer.username}'s appointment for "
                    f'"{booking.listing.title}" is starting right now.'
                ),
                action_url="/vendor/dashboard",
            )
            Notification.objects.get_or_create(
                recipient=booking.buyer,
                notification_type="booking_time_now",
                title="🟢 Your booking is starting now!",
                message=(
                    f'Your appointment for "{booking.listing.title}" '
                    f"with {booking.listing.vendor.username} is starting now."
                ),
                action_url="/account/bookings",
            )

    except Exception as e:
        logger.error(f"Booking reminder error: {e}", exc_info=True)


def start_scheduler():
    """
    Call this from your Django AppConfig.ready() to start the background scheduler.
    It runs send_booking_reminders every 60 seconds.
    """
    try:
        scheduler = BackgroundScheduler(timezone=LAGOS_TZ)
        scheduler.add_jobstore(DjangoJobStore(), "default")
        scheduler.add_job(
            send_booking_reminders,
            trigger=IntervalTrigger(seconds=60),
            id="booking_reminders",
            name="Send booking reminders",
            replace_existing=True,
            max_instances=1,
            coalesce=True,
        )
        scheduler.start()
        logger.info("Booking reminder scheduler started.")
    except Exception as e:
        logger.error(f"Failed to start scheduler: {e}", exc_info=True)