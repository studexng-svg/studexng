# studex-backend/scheduler.py
import logging
from datetime import timedelta
from zoneinfo import ZoneInfo

from django.utils import timezone
from django_apscheduler.jobstores import DjangoJobStore
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

logger = logging.getLogger(__name__)

LAGOS_TZ = ZoneInfo("Africa/Lagos")

MAX_TRANSFER_RETRIES = 3


# ─────────────────────────────────────────────────────────────────────────────
# JOB 1: Booking reminders — every 60 s
# ─────────────────────────────────────────────────────────────────────────────

def send_booking_reminders():
    """Notify vendors + buyers 5 min before bookings and right at start time."""
    from datetime import datetime
    from notifications.models import Notification

    try:
        from orders.models import Booking

        now_lagos = datetime.now(LAGOS_TZ)
        now_date  = now_lagos.date()
        now_time  = now_lagos.strftime("%H:%M")
        five_min  = (now_lagos + timedelta(minutes=5)).strftime("%H:%M")

        for booking in Booking.objects.filter(
            scheduled_date=now_date,
            scheduled_time=five_min,
            status__in=["confirmed", "paid"],
        ).select_related("buyer", "listing__vendor"):
            Notification.objects.get_or_create(
                recipient=booking.listing.vendor,
                notification_type="booking_reminder_5min",
                title=f"Booking in 5 minutes — {booking.listing.title}",
                message=(
                    f"Your booking with {booking.buyer.username} for "
                    f'"{booking.listing.title}" starts at {booking.scheduled_time}. '
                    f"Get ready!"
                ),
                action_url="/vendor/dashboard",
            )
            Notification.objects.get_or_create(
                recipient=booking.buyer,
                notification_type="booking_reminder_5min",
                title="Your booking starts in 5 minutes!",
                message=(
                    f'"{booking.listing.title}" with {booking.listing.vendor.username} '
                    f"starts at {booking.scheduled_time}. Head over now!"
                ),
                action_url="/account/bookings",
            )

        for booking in Booking.objects.filter(
            scheduled_date=now_date,
            scheduled_time=now_time,
            status__in=["confirmed", "paid"],
        ).select_related("buyer", "listing__vendor"):
            Notification.objects.get_or_create(
                recipient=booking.listing.vendor,
                notification_type="booking_time_now",
                title=f"Booking starting now — {booking.listing.title}",
                message=(
                    f"{booking.buyer.username}'s appointment for "
                    f'"{booking.listing.title}" is starting right now.'
                ),
                action_url="/vendor/dashboard",
            )
            Notification.objects.get_or_create(
                recipient=booking.buyer,
                notification_type="booking_time_now",
                title="Your booking is starting now!",
                message=(
                    f'Your appointment for "{booking.listing.title}" '
                    f"with {booking.listing.vendor.username} is starting now."
                ),
                action_url="/account/bookings",
            )

    except Exception as e:
        logger.error(f"Booking reminder error: {e}", exc_info=True)


# ─────────────────────────────────────────────────────────────────────────────
# JOB 2: Auto-complete orders — midnight daily (WAT)
# ─────────────────────────────────────────────────────────────────────────────

def auto_release_orders():
    """
    Auto-completes orders stuck in seller_completed for 48 h+ with no buyer
    confirmation and no open dispute. Vendor was already paid via Paystack
    Transfer at order time — this just closes the order record.
    Idempotent: auto_released=True prevents double-processing.
    """
    from django.db import transaction as db_tx
    from orders.models import Order
    from accounts.utils import send_notification

    cutoff = timezone.now() - timedelta(hours=48)

    stale = (
        Order.objects
        .filter(
            status='seller_completed',
            seller_completed_at__lte=cutoff,
            auto_released=False,
        )
        .exclude(disputes__status__in=['open', 'under_review'])
        .select_related('buyer', 'listing__vendor')
    )

    released = 0
    for order in stale:
        try:
            with db_tx.atomic():
                # Re-check inside the lock — another process may have beat us
                locked = Order.objects.select_for_update().get(pk=order.pk)
                if locked.auto_released or locked.status != 'seller_completed':
                    continue
                locked.status = 'completed'
                locked.auto_released = True
                locked.buyer_confirmed_at = timezone.now()
                locked.save(update_fields=['status', 'auto_released', 'buyer_confirmed_at'])

            send_notification(
                recipient=order.listing.vendor,
                notification_type='order_auto_released',
                title='Order automatically completed',
                message=(
                    f'Order {order.reference} was automatically marked complete '
                    f'after 48 hours with no buyer response.'
                ),
                action_url='/vendor/dashboard',
            )
            send_notification(
                recipient=order.buyer,
                notification_type='order_auto_released',
                title='Order automatically completed',
                message=(
                    f'Your order {order.reference} was automatically marked complete '
                    f'after 48 hours. Raise a dispute if you have any issues.'
                ),
                action_url='/account/orders',
            )
            released += 1

        except Exception as e:
            logger.error(f"Auto-release failed for order {order.id}: {e}", exc_info=True)

    if released:
        logger.info(f"Auto-released {released} order(s).")


# ─────────────────────────────────────────────────────────────────────────────
# JOB 3: Auto-cancel unpaid orders — midnight daily (WAT)
# ─────────────────────────────────────────────────────────────────────────────

def auto_cancel_pending_orders():
    """
    Cancels orders stuck in 'pending' (unpaid) for 24 h+. Notifies buyer.
    Idempotent: only touches status='pending' rows.
    """
    from orders.models import Order
    from accounts.utils import send_notification

    cutoff = timezone.now() - timedelta(hours=24)

    stale = Order.objects.filter(
        status='pending',
        created_at__lte=cutoff,
    ).select_related('buyer', 'listing')

    cancelled = 0
    for order in stale:
        try:
            updated = Order.objects.filter(pk=order.pk, status='pending').update(status='cancelled')
            if not updated:
                continue  # another process already handled it

            send_notification(
                recipient=order.buyer,
                notification_type='order_cancelled',
                title='Order cancelled — payment not received',
                message=(
                    f'Your order {order.reference} for "{order.listing.title}" '
                    f'was cancelled because payment was not completed within 24 hours.'
                ),
                action_url='/account/orders',
            )
            cancelled += 1

        except Exception as e:
            logger.error(f"Auto-cancel failed for order {order.id}: {e}", exc_info=True)

    if cancelled:
        logger.info(f"Auto-cancelled {cancelled} pending order(s).")


# ─────────────────────────────────────────────────────────────────────────────
# JOB 4: Retry failed vendor transfers — every hour
# ─────────────────────────────────────────────────────────────────────────────

def retry_failed_transfers():
    """
    Finds PaymentTransaction rows where the Paystack payout to the vendor has
    failed or was never sent, and retries up to MAX_TRANSFER_RETRIES times.

    Idempotent: uses transfer_retry_count to cap attempts and a per-retry
    reference suffix (PAYOUT-{ref}-R{n}) so Paystack never double-pays.

    On exhausting retries, sends an email alert to the admin.
    """
    import requests
    from django.conf import settings
    from django.db.models import Q
    from payments.models import PaymentTransaction

    secret_key = (getattr(settings, 'PAYSTACK_SECRET_KEY', '') or '').strip()
    if not secret_key:
        logger.error("retry_failed_transfers: PAYSTACK_SECRET_KEY not configured")
        return

    headers = {
        'Authorization': f'Bearer {secret_key}',
        'Content-Type': 'application/json',
    }
    paystack_base = 'https://api.paystack.co'

    # Candidates: success payment, no confirmed payout, retries still available
    candidates = PaymentTransaction.objects.filter(
        status='success',
        transfer_retry_count__lt=MAX_TRANSFER_RETRIES,
    ).filter(
        Q(transfer_status='failed') |
        Q(transfer_status='reversed') |
        Q(transfer_reference='') |
        Q(transfer_reference__isnull=True),
    ).select_related('seller')

    for txn in candidates:
        if not txn.seller:
            continue  # deleted vendor — skip

        try:
            from payments.models import SellerBankAccount
            bank = SellerBankAccount.objects.get(user=txn.seller)
        except Exception:
            logger.warning(
                f"retry_failed_transfers: no bank account for {txn.seller.username} "
                f"(txn {txn.reference}) — skipping"
            )
            continue

        recipient_code = bank.paystack_recipient_code
        if not recipient_code:
            logger.warning(
                f"retry_failed_transfers: no recipient_code for {txn.seller.username} "
                f"(txn {txn.reference}) — skipping"
            )
            continue

        retry_n = txn.transfer_retry_count + 1
        # Use a suffixed reference so Paystack treats this as a distinct transfer
        # from any previous failed attempt.
        retry_ref = f"PAYOUT-{txn.reference}-R{retry_n}"

        payload = {
            'source': 'balance',
            'amount': int(txn.seller_amount * 100),
            'recipient': recipient_code,
            'reason': f"StudEx payout retry #{retry_n} — order #{txn.order_id}",
            'reference': retry_ref,
        }

        try:
            res = requests.post(
                f'{paystack_base}/transfer',
                headers=headers,
                json=payload,
                timeout=15,
            )
            res_json = res.json()

            if res.status_code in [200, 201] and res_json.get('status'):
                transfer_data = res_json.get('data', {})
                txn.transfer_reference = transfer_data.get('reference', retry_ref)
                txn.transfer_status = transfer_data.get('status', 'pending')
                txn.transfer_retry_count = retry_n
                txn.save(update_fields=['transfer_reference', 'transfer_status', 'transfer_retry_count'])
                logger.info(
                    f"retry_failed_transfers: retry #{retry_n} succeeded for txn {txn.reference} "
                    f"— Paystack ref {txn.transfer_reference}, status {txn.transfer_status}"
                )
            else:
                txn.transfer_retry_count = retry_n
                txn.transfer_status = 'failed'
                txn.save(update_fields=['transfer_retry_count', 'transfer_status'])
                logger.error(
                    f"retry_failed_transfers: retry #{retry_n} failed for txn {txn.reference} "
                    f"— {res.status_code}: {res_json}"
                )

                if retry_n >= MAX_TRANSFER_RETRIES:
                    _alert_admin_transfer_failure(txn)

        except Exception as e:
            txn.transfer_retry_count += 1
            txn.save(update_fields=['transfer_retry_count'])
            logger.error(
                f"retry_failed_transfers: exception on retry #{retry_n} for txn {txn.reference}: {e}",
                exc_info=True,
            )
            if txn.transfer_retry_count >= MAX_TRANSFER_RETRIES:
                _alert_admin_transfer_failure(txn)


def _alert_admin_transfer_failure(txn):
    """Sends an email to the admin when a transfer has exhausted all retries."""
    try:
        from studex.email import send_email
        from django.conf import settings

        admin_email = getattr(settings, 'ADMIN_EMAIL', 'studex.ng@gmail.com')
        seller_name  = txn.seller.username if txn.seller else 'Unknown (deleted)'
        seller_email = txn.seller.email    if txn.seller else 'N/A'

        html = f'''
            <div style="font-family:DM Sans,sans-serif;max-width:560px;margin:0 auto;padding:32px;">
                <h2 style="color:#DC2626;">Vendor Payout Failed — Manual Action Required</h2>
                <p>A vendor transfer has failed after <strong>{MAX_TRANSFER_RETRIES} automated retry attempts</strong>
                   and requires manual intervention.</p>
                <table style="border-collapse:collapse;width:100%;margin-top:16px;">
                    <tr><td style="padding:8px;border:1px solid #E5E7EB;font-weight:600;">Transaction Ref</td><td style="padding:8px;border:1px solid #E5E7EB;">{txn.reference}</td></tr>
                    <tr><td style="padding:8px;border:1px solid #E5E7EB;font-weight:600;">Order ID</td><td style="padding:8px;border:1px solid #E5E7EB;">#{txn.order_id}</td></tr>
                    <tr><td style="padding:8px;border:1px solid #E5E7EB;font-weight:600;">Vendor</td><td style="padding:8px;border:1px solid #E5E7EB;">{seller_name} ({seller_email})</td></tr>
                    <tr><td style="padding:8px;border:1px solid #E5E7EB;font-weight:600;">Amount Owed</td><td style="padding:8px;border:1px solid #E5E7EB;">₦{txn.seller_amount:,.2f}</td></tr>
                    <tr><td style="padding:8px;border:1px solid #E5E7EB;font-weight:600;">Last Transfer Ref</td><td style="padding:8px;border:1px solid #E5E7EB;">{txn.transfer_reference or 'N/A'}</td></tr>
                    <tr><td style="padding:8px;border:1px solid #E5E7EB;font-weight:600;">Retry Count</td><td style="padding:8px;border:1px solid #E5E7EB;">{txn.transfer_retry_count}</td></tr>
                </table>
                <p style="margin-top:24px;color:#6B7280;font-size:14px;">
                    Please log in to the Django admin or Paystack dashboard and process this payout manually.
                </p>
            </div>
        '''
        send_email(
            to=admin_email,
            subject=f'[ACTION REQUIRED] Vendor payout failed after {MAX_TRANSFER_RETRIES} retries',
            html=html,
            _async=False,
        )
        logger.info(f"Admin transfer-failure alert sent for txn {txn.reference}")
    except Exception as e:
        logger.error(f"Failed to send admin transfer-failure email for txn {txn.reference}: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# JOB 5: Pick vendor of the month — 1st of each month at 00:05 WAT
# ─────────────────────────────────────────────────────────────────────────────

def pick_vendor_of_month():
    """
    Runs on the 1st of each month. Scores all verified vendors based on
    their completed orders, avg rating, and completion rate from the previous
    month, then creates a VendorOfTheMonth record for the winner.
    Idempotent — skips if a record for the previous month already exists.
    """
    from datetime import date
    from django.contrib.auth import get_user_model
    from orders.models import Order
    from services.models import VendorOfTheMonth
    from accounts.utils import send_notification

    User = get_user_model()
    today = date.today()

    # The award covers the previous calendar month
    if today.month == 1:
        month_start = date(today.year - 1, 12, 1)
        month_end   = date(today.year, 1, 1)
    else:
        month_start = date(today.year, today.month - 1, 1)
        month_end   = date(today.year, today.month, 1)

    if VendorOfTheMonth.objects.filter(month=month_start).exists():
        logger.info(f"pick_vendor_of_month: already picked for {month_start.strftime('%B %Y')}")
        return

    from django.db.models import Count, Q, Avg, ExpressionWrapper, F, DurationField

    # Single query: annotate each vendor with their completed order count for the month
    vendors = (
        User.objects
        .filter(is_verified_vendor=True)
        .select_related('profile')
        .annotate(
            monthly_orders=Count(
                'listing__orders',
                filter=Q(
                    listing__orders__status='completed',
                    listing__orders__created_at__date__gte=month_start,
                    listing__orders__created_at__date__lt=month_end,
                )
            )
        )
        .filter(monthly_orders__gt=0)  # skip vendors with no sales that month
    )

    best_vendor = None
    best_score  = -1
    best_stats  = {}

    for vendor in vendors:
        completed       = vendor.monthly_orders
        profile         = getattr(vendor, 'profile', None)
        avg_rating      = float(getattr(profile, 'rating', 0) or 0)
        completion_rate = float(getattr(profile, 'completion_rate', 0) or 0)

        # Weighted score: orders drive most of it, rating and completion fine-tune
        score = completed * 5 + avg_rating * 10 + completion_rate * 0.5

        # Average seconds from paid_at → seller_completed_at (lower = faster)
        avg_time_result = Order.objects.filter(
            listing__vendor=vendor,
            status__in=['completed', 'seller_completed'],
            created_at__date__gte=month_start,
            created_at__date__lt=month_end,
            seller_completed_at__isnull=False,
            paid_at__isnull=False,
        ).aggregate(
            avg_time=Avg(ExpressionWrapper(
                F('seller_completed_at') - F('paid_at'),
                output_field=DurationField(),
            ))
        )
        avg_secs = (
            avg_time_result['avg_time'].total_seconds()
            if avg_time_result['avg_time'] else None
        )

        # Determine whether this vendor beats the current leader
        def beats(s=score, c=completed, r=avg_rating, t=avg_secs):
            if s != best_score:
                return s > best_score
            # Tie on score — tiebreaker 1: more completed orders
            if c != best_stats.get('total_orders', 0):
                return c > best_stats.get('total_orders', 0)
            # Tiebreaker 2: higher rating
            if r != best_stats.get('avg_rating', 0):
                return r > best_stats.get('avg_rating', 0)
            # Tiebreaker 3: faster average completion time
            best_t = best_stats.get('avg_completion_seconds')
            if t is not None and best_t is not None:
                return t < best_t
            return t is not None  # has timing data; current best does not

        if best_vendor is None or beats():
            best_score  = score
            best_vendor = vendor
            best_stats  = {
                'total_orders':          completed,
                'avg_rating':            avg_rating,
                'completion_rate':       completion_rate,
                'avg_completion_seconds': avg_secs,
            }

    if not best_vendor:
        logger.info("pick_vendor_of_month: no qualifying vendor found (no completed orders last month)")
        return

    VendorOfTheMonth.objects.create(
        vendor=best_vendor,
        month=month_start,
        score=best_score,
        total_orders=best_stats['total_orders'],
        avg_rating=best_stats['avg_rating'],
        completion_rate=best_stats['completion_rate'],
    )

    try:
        send_notification(
            recipient=best_vendor,
            notification_type='vendor_of_month',
            title='🏆 You are Vendor of the Month!',
            message=(
                f'Congratulations {best_vendor.username}! You have been selected as '
                f'Vendor of the Month for {month_start.strftime("%B %Y")} based on '
                f'your sales, ratings, and reliability. '
                f'Your profile is now featured on the StudEx home page!'
            ),
            action_url='/seller',
        )
    except Exception as ne:
        logger.warning(f"pick_vendor_of_month: notification failed: {ne}")

    logger.info(
        f"pick_vendor_of_month: {best_vendor.username} wins {month_start.strftime('%B %Y')} "
        f"(score={best_score:.1f}, orders={best_stats['total_orders']}, "
        f"rating={best_stats['avg_rating']}, completion={best_stats['completion_rate']}%)"
    )


# ─────────────────────────────────────────────────────────────────────────────
# JOB 6 & 7: Groq AI notification broadcasts — per campus
# Students: Mon / Wed / Fri at 10:00 WAT
# Vendors:  Tue / Thu / Sat at 10:00 WAT
# ─────────────────────────────────────────────────────────────────────────────

_CAMPUSES = ('pau', 'futo')


def groq_notify_students():
    """Broadcast AI-generated student tips — separate message per campus."""
    try:
        from notifications.models import PlatformSettings
        if not PlatformSettings.get().grok_notifications_enabled:
            logger.info('AI notifications disabled — skipping groq_notify_students')
            return
        from groq_notifications import send_groq_notifications
        for school in _CAMPUSES:
            send_groq_notifications(audience='students', school=school, triggered_by='scheduler')
    except Exception as e:
        logger.error(f'groq_notify_students failed: {e}', exc_info=True)


def groq_notify_vendors():
    """Broadcast AI-generated vendor tips — separate message per campus."""
    try:
        from notifications.models import PlatformSettings
        if not PlatformSettings.get().grok_notifications_enabled:
            logger.info('AI notifications disabled — skipping groq_notify_vendors')
            return
        from groq_notifications import send_groq_notifications
        for school in _CAMPUSES:
            send_groq_notifications(audience='vendors', school=school, triggered_by='scheduler')
    except Exception as e:
        logger.error(f'groq_notify_vendors failed: {e}', exc_info=True)


# ─────────────────────────────────────────────────────────────────────────────
# Scheduler bootstrap — called by StudexConfig.ready()
# ─────────────────────────────────────────────────────────────────────────────

def start():
    scheduler = BackgroundScheduler(timezone=LAGOS_TZ)
    scheduler.add_jobstore(DjangoJobStore(), "default")

    # Every 60 seconds
    scheduler.add_job(
        send_booking_reminders,
        trigger=IntervalTrigger(seconds=60),
        id="booking_reminders",
        name="Send booking reminders",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )

    # Midnight WAT daily
    scheduler.add_job(
        auto_release_orders,
        trigger=CronTrigger(hour=0, minute=0, timezone=LAGOS_TZ),
        id="auto_release_orders",
        name="Auto-complete seller_completed orders after 48 h",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )

    # Midnight WAT daily
    scheduler.add_job(
        auto_cancel_pending_orders,
        trigger=CronTrigger(hour=0, minute=0, timezone=LAGOS_TZ),
        id="auto_cancel_pending_orders",
        name="Auto-cancel unpaid orders after 24 h",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )

    # Every hour
    scheduler.add_job(
        retry_failed_transfers,
        trigger=IntervalTrigger(hours=1),
        id="retry_failed_transfers",
        name="Retry failed vendor Paystack transfers (max 3 attempts)",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )

    # 1st of each month at 00:05 WAT — Vendor of the Month
    scheduler.add_job(
        pick_vendor_of_month,
        trigger=CronTrigger(day=1, hour=0, minute=5, timezone=LAGOS_TZ),
        id='pick_vendor_of_month',
        name='Pick Vendor of the Month (1st of month 00:05 WAT)',
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )

    # Mon / Wed / Fri 10:00 WAT — Groq AI tips for students (per campus)
    scheduler.add_job(
        groq_notify_students,
        trigger=CronTrigger(day_of_week='mon,wed,fri', hour=10, minute=0, timezone=LAGOS_TZ),
        id='groq_notify_students',
        name='Groq AI tip — students (Mon/Wed/Fri 10:00 WAT)',
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )

    # Tue / Thu / Sat 10:00 WAT — Groq AI tips for vendors (per campus)
    scheduler.add_job(
        groq_notify_vendors,
        trigger=CronTrigger(day_of_week='tue,thu,sat', hour=10, minute=0, timezone=LAGOS_TZ),
        id='groq_notify_vendors',
        name='Groq AI tip — vendors (Tue/Thu/Sat 10:00 WAT)',
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )

    try:
        scheduler.start()
        logger.info(
            "Scheduler started: booking_reminders (60s), "
            "auto_release_orders (midnight), auto_cancel_pending_orders (midnight), "
            "retry_failed_transfers (1h), "
            "groq_notify_students (Mon/Wed/Fri 10:00 per campus), groq_notify_vendors (Tue/Thu/Sat 10:00 per campus)."
        )
    except Exception as e:
        logger.error(f"Failed to start scheduler: {e}", exc_info=True)
