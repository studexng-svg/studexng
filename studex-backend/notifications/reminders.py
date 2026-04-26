# notifications/reminders.py
"""
Booking reminder system — runs as a lightweight background thread inside
Django. No Celery required. Wakes up every 60 seconds, finds bookings
that are coming up, and sends push notifications at:
  - 30 minutes before
  - 15 minutes before
  - 10 minutes before
  -  5 minutes before
  -  0 minutes (exact appointment time)

Both the customer (buyer) AND the vendor receive each reminder.

Reminders include the booking location so the message reads:
  "You have a Nail Art appointment at Cedar in 30 minutes"
"""

import threading
import time
import logging
from datetime import timedelta, datetime, date

logger = logging.getLogger(__name__)

# Reminder intervals in minutes — checked in order
REMINDER_INTERVALS = [30, 15, 10, 5, 0]

# How many seconds either side of the target time counts as "hit"
# (60s window handles the 60s sleep interval + drift)
WINDOW_SECONDS = 60

_thread_started = False
_thread_lock = threading.Lock()


def _get_booking_datetime(booking) -> datetime | None:
    """Combine booking.scheduled_date + booking.scheduled_time into a timezone-aware datetime."""
    try:
        from django.utils import timezone
        import pytz

        sdate: date = booking.scheduled_date
        stime_str: str = booking.scheduled_time  # e.g. "9:00 AM" or "14:30"

        # Parse the time string — handle both 12h and 24h formats
        for fmt in ("%I:%M %p", "%H:%M", "%I:%M%p"):
            try:
                parsed_time = datetime.strptime(stime_str.strip().upper(), fmt.upper())
                break
            except ValueError:
                continue
        else:
            return None

        naive_dt = datetime(
            sdate.year, sdate.month, sdate.day,
            parsed_time.hour, parsed_time.minute
        )
        # Make timezone-aware using Django's current timezone
        return timezone.make_aware(naive_dt)
    except Exception as e:
        logger.warning(f"Could not parse booking datetime: {e}")
        return None


def _reminder_key(booking_id: int, minutes: int) -> str:
    return f"reminder:{booking_id}:{minutes}"


def _has_sent(sent_set: set, booking_id: int, minutes: int) -> bool:
    return _reminder_key(booking_id, minutes) in sent_set


def _mark_sent(sent_set: set, booking_id: int, minutes: int):
    sent_set.add(_reminder_key(booking_id, minutes))


def _build_message(booking, minutes: int, is_vendor: bool) -> tuple[str, str]:
    """Returns (title, message) for a reminder notification."""
    from django.utils import timezone as tz

    service_name = getattr(booking.listing, "title", "your appointment")
    location = (getattr(booking, "location", "") or "").strip()
    location_str = f" at {location}" if location else ""

    if minutes == 0:
        time_str = "NOW"
        if is_vendor:
            title = "⏰ Appointment Starting Now!"
            message = f"Your booking for {service_name}{location_str} is starting right now. Your customer should be there."
        else:
            title = "⏰ Your Appointment is Now!"
            message = f"Your {service_name} appointment{location_str} is starting now. Head over!"
    else:
        time_str = f"in {minutes} minutes"
        if is_vendor:
            title = f"📅 Booking in {minutes} minutes"
            message = f"You have a {service_name} booking{location_str} {time_str}. Get ready for your customer."
        else:
            title = f"📅 Appointment in {minutes} minutes"
            message = f"You have a {service_name} appointment{location_str} {time_str}. Don't be late!"

    return title, message


def _run_reminder_loop():
    """Main reminder loop — runs forever in a background thread."""
    from django.utils import timezone

    # In-memory set of (booking_id, minutes) reminders already sent this cycle.
    # We persist this across loop iterations so we don't double-send.
    # It's cleared for a booking once its date has passed.
    sent_set: set = set()

    logger.info("📅 Booking reminder thread started.")

    while True:
        try:
            _check_and_send_reminders(sent_set, timezone)
        except Exception as e:
            logger.error(f"Reminder loop error: {e}", exc_info=True)

        time.sleep(60)  # check every 60 seconds


def _check_and_send_reminders(sent_set: set, timezone):
    """Single pass — find upcoming bookings and fire reminders as needed."""
    # Import here to avoid AppRegistry issues at module import time
    from orders.models import Booking  # adjust import path if your model is elsewhere
    from accounts.utils import send_notification

    now = timezone.now()

    # Only look at confirmed bookings scheduled in the next 35 minutes or less
    # (the max interval we care about is 30 min — we add a 5min buffer)
    window_end = now + timedelta(minutes=35)
    window_start = now - timedelta(seconds=WINDOW_SECONDS)  # slight lookback for drift

    # Fetch bookings whose date/time falls within our interest window.
    # We fetch a broader set and filter in Python because time is stored as CharField.
    upcoming = Booking.objects.filter(
        status__in=["confirmed", "paid", "pending"],
        scheduled_date__gte=now.date(),
        scheduled_date__lte=window_end.date(),
    ).select_related("listing", "listing__vendor", "buyer")

    for booking in upcoming:
        appt_dt = _get_booking_datetime(booking)
        if appt_dt is None:
            continue

        # Skip past appointments (more than 1 min ago)
        if appt_dt < now - timedelta(minutes=1):
            continue

        for minutes in REMINDER_INTERVALS:
            target_dt = appt_dt - timedelta(minutes=minutes)

            # Is right now within the ±WINDOW_SECONDS of the target?
            diff = abs((now - target_dt).total_seconds())
            if diff > WINDOW_SECONDS:
                continue

            # Have we already sent this reminder?
            if _has_sent(sent_set, booking.id, minutes):
                continue

            _mark_sent(sent_set, booking.id, minutes)

            # ── Notify the buyer ─────────────────────────────────────────
            try:
                buyer = booking.buyer
                c_title, c_message = _build_message(booking, minutes, is_vendor=False)
                send_notification(
                    recipient=buyer,
                    notification_type="booking_reminder",
                    title=c_title,
                    message=c_message,
                    action_url="/account/bookings",
                )
            except Exception as e:
                logger.error(f"Failed to send customer reminder for booking {booking.id}: {e}")

            # ── Notify the vendor ────────────────────────────────────────
            try:
                vendor = booking.listing.vendor
                v_title, v_message = _build_message(booking, minutes, is_vendor=True)
                send_notification(
                    recipient=vendor,
                    notification_type="booking_reminder",
                    title=v_title,
                    message=v_message,
                    action_url="/seller/bookings",
                )
            except Exception as e:
                logger.error(f"Failed to send vendor reminder for booking {booking.id}: {e}")

            logger.info(
                f"Reminder sent — booking #{booking.id}, {minutes}min mark, "
                f"buyer: {booking.buyer.username}, "
                f"vendor: {booking.listing.vendor.username}"
            )

    # Clean up sent_set entries for bookings whose date has long passed
    # (prevents unbounded memory growth over time)
    stale_prefix_check = now - timedelta(hours=2)
    # We don't have easy access to clear per-booking here without re-querying,
    # so we just cap the set size to prevent runaway growth
    if len(sent_set) > 10000:
        sent_set.clear()
        logger.info("Reminder sent_set cleared (size limit reached).")


def start_reminder_thread():
    """
    Call this once from your Django AppConfig.ready() to start the background
    reminder thread. Safe to call multiple times — only starts once.
    """
    global _thread_started
    with _thread_lock:
        if _thread_started:
            return
        _thread_started = True

    t = threading.Thread(target=_run_reminder_loop, daemon=True, name="BookingReminderThread")
    t.start()
    logger.info("BookingReminderThread launched.")