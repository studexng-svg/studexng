# scheduler.py
import logging
from apscheduler.schedulers.background import BackgroundScheduler
from django_apscheduler.jobstores import DjangoJobStore
from django.utils import timezone
from datetime import timedelta

logger = logging.getLogger(__name__)


def send_booking_reminders():
    """
    Runs every minute. Finds bookings happening in exactly 5 minutes
    and exactly at the scheduled time, then notifies the vendor.
    """
    try:
        from orders.models import Booking
        from notifications.models import Notification

        now = timezone.localtime(timezone.now())
        today = now.date()

        # Get all paid/confirmed bookings scheduled for today
        todays_bookings = Booking.objects.filter(
            scheduled_date=today,
            status__in=["confirmed", "paid"],
        ).select_related("buyer", "listing", "listing__vendor")

        for booking in todays_bookings:
            # Parse the scheduled time — format is "2:00 PM", "3:30 PM" etc.
            try:
                from datetime import datetime
                scheduled_dt = datetime.strptime(
                    f"{booking.scheduled_date} {booking.scheduled_time}",
                    "%Y-%m-%d %I:%M %p"
                )
                # Make timezone-aware
                import pytz
                from django.conf import settings as django_settings
                tz = pytz.timezone(getattr(django_settings, 'TIME_ZONE', 'Africa/Lagos'))
                scheduled_dt = tz.localize(scheduled_dt)
            except Exception as e:
                logger.warning(f"Could not parse booking time for booking {booking.id}: {e}")
                continue

            diff_minutes = (scheduled_dt - timezone.now()).total_seconds() / 60
            vendor = booking.listing.vendor
            buyer = booking.buyer

            # 5-minute warning to vendor
            if 4 <= diff_minutes <= 6:
                already_notified = Notification.objects.filter(
                    recipient=vendor,
                    notification_type="booking_reminder_5min",
                    action_url=f"/vendor/dashboard?booking={booking.id}",
                ).exists()
                if not already_notified:
                    Notification.objects.create(
                        recipient=vendor,
                        notification_type="booking_reminder_5min",
                        title=f"⏰ 5 Minutes — {booking.listing.title}",
                        message=(
                            f"Your booking with {buyer.username} for "
                            f'"{booking.listing.title}" starts in 5 minutes! '
                            f"Get ready."
                        ),
                        action_url=f"/vendor/dashboard?booking={booking.id}",
                    )
                    logger.info(f"Sent 5-min reminder to vendor {vendor.username} for booking {booking.id}")

            # On-time notification to vendor
            elif -1 <= diff_minutes <= 1:
                already_notified = Notification.objects.filter(
                    recipient=vendor,
                    notification_type="booking_time_now",
                    action_url=f"/vendor/dashboard?booking={booking.id}",
                ).exists()
                if not already_notified:
                    Notification.objects.create(
                        recipient=vendor,
                        notification_type="booking_time_now",
                        title=f"🔔 It's Time — {booking.listing.title}",
                        message=(
                            f"It's time for your booking with {buyer.username} "
                            f'for "{booking.listing.title}". '
                            f"Scheduled: {booking.scheduled_time}."
                        ),
                        action_url=f"/vendor/dashboard?booking={booking.id}",
                    )
                    logger.info(f"Sent on-time reminder to vendor {vendor.username} for booking {booking.id}")

    except Exception as e:
        logger.error(f"Booking reminder job failed: {e}", exc_info=True)


def start():
    scheduler = BackgroundScheduler()
    scheduler.add_jobstore(DjangoJobStore(), "default")
    scheduler.add_job(
        send_booking_reminders,
        "interval",
        minutes=1,
        id="booking_reminders",
        replace_existing=True,
        jobstore="default",
    )
    logger.info("Scheduler started — booking reminders active.")
    scheduler.start()