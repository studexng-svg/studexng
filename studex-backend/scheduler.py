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
    from accounts.utils import send_notification

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
            already_vendor = Notification.objects.filter(
                recipient=booking.listing.vendor,
                notification_type="booking_reminder_5min",
                created_at__date=now_date,
            ).exists()
            if not already_vendor:
                send_notification(
                    recipient=booking.listing.vendor,
                    notification_type="booking_reminder_5min",
                    title=f"Booking in 5 minutes — {booking.listing.title}",
                    message=(
                        f"Your booking with {booking.buyer.username} for "
                        f'"{booking.listing.title}" starts at {booking.scheduled_time}. '
                        f"Get ready!"
                    ),
                    action_url="/vendor/dashboard",
                    send_email=False,
                )
            already_buyer = Notification.objects.filter(
                recipient=booking.buyer,
                notification_type="booking_reminder_5min",
                created_at__date=now_date,
            ).exists()
            if not already_buyer:
                send_notification(
                    recipient=booking.buyer,
                    notification_type="booking_reminder_5min",
                    title="Your booking starts in 5 minutes!",
                    message=(
                        f'"{booking.listing.title}" with {booking.listing.vendor.username} '
                        f"starts at {booking.scheduled_time}. Head over now!"
                    ),
                    action_url="/account/bookings",
                    send_email=False,
                )

        for booking in Booking.objects.filter(
            scheduled_date=now_date,
            scheduled_time=now_time,
            status__in=["confirmed", "paid"],
        ).select_related("buyer", "listing__vendor"):
            already_vendor = Notification.objects.filter(
                recipient=booking.listing.vendor,
                notification_type="booking_time_now",
                created_at__date=now_date,
            ).exists()
            if not already_vendor:
                send_notification(
                    recipient=booking.listing.vendor,
                    notification_type="booking_time_now",
                    title=f"Booking starting now — {booking.listing.title}",
                    message=(
                        f"{booking.buyer.username}'s appointment for "
                        f'"{booking.listing.title}" is starting right now.'
                    ),
                    action_url="/vendor/dashboard",
                    send_email=False,
                )
            already_buyer = Notification.objects.filter(
                recipient=booking.buyer,
                notification_type="booking_time_now",
                created_at__date=now_date,
            ).exists()
            if not already_buyer:
                send_notification(
                    recipient=booking.buyer,
                    notification_type="booking_time_now",
                    title="Your booking is starting now!",
                    message=(
                        f'Your appointment for "{booking.listing.title}" '
                        f"with {booking.listing.vendor.username} is starting right now."
                    ),
                    action_url="/account/bookings",
                    send_email=False,
                )

    except Exception as e:
        logger.error(f"Booking reminder error: {e}", exc_info=True)


# ─────────────────────────────────────────────────────────────────────────────
# JOB 2: Auto-complete orders — midnight daily (WAT)
# ─────────────────────────────────────────────────────────────────────────────

def auto_release_orders():
    """
    Auto-completes orders stuck in seller_completed for 24 h+ with no buyer
    confirmation and no open dispute, and triggers the same vendor payout that
    OrderViewSet.confirm() would have (the vendor did the work — a buyer who
    just goes silent shouldn't cost the vendor their payout).
    Idempotent: auto_released=True prevents double-processing.
    """
    from django.db import transaction as db_tx
    from orders.models import Order
    from accounts.utils import send_notification
    from payments.models import PaymentTransaction
    from payments.views import trigger_vendor_payout

    cutoff = timezone.now() - timedelta(hours=24)

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

            # Same payout trigger as OrderViewSet.confirm() — outside the lock,
            # same as the view does, since it's an external API call.
            try:
                txn = PaymentTransaction.objects.filter(
                    reference=order.reference, status="success"
                ).first()
                if txn and not txn.transfer_reference:
                    trigger_vendor_payout(txn, order.listing.title)
            except Exception as pe:
                logger.warning(f"Auto-release payout trigger failed for order {order.id}: {pe}")

            send_notification(
                recipient=order.listing.vendor,
                notification_type='order_auto_released',
                title='Order automatically completed',
                message=(
                    f'Order {order.reference} was automatically marked complete '
                    f'after 24 hours with no buyer response.'
                ),
                action_url='/vendor/dashboard',
            )
            send_notification(
                recipient=order.buyer,
                notification_type='order_auto_released',
                title='Order automatically completed',
                message=(
                    f'Your order {order.reference} was automatically marked complete '
                    f'after 24 hours. Raise a dispute if you have any issues.'
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

        # Deduct any outstanding VendorDebt before retrying — a retry must not
        # bypass debt collection just because it takes a different code path
        # from the normal confirm()-triggered payout. See payments/models.py
        # VendorDebt and payments/views.py trigger_vendor_payout.
        from payments.views import settle_vendor_debt, record_payout_audit
        remaining_amount, debt_settled = settle_vendor_debt(txn.seller, txn.seller_amount)
        if debt_settled > 0:
            logger.info(
                f"retry_failed_transfers: settled ₦{debt_settled} of outstanding debt for "
                f"{txn.seller.username} from retry payout on txn {txn.reference}"
            )
        if remaining_amount <= 0:
            txn.transfer_reference = f"DEBT-OFFSET-{txn.reference}"
            txn.transfer_status = "offset_by_debt"
            txn.save(update_fields=['transfer_reference', 'transfer_status'])
            logger.info(
                f"retry_failed_transfers: retry payout for txn {txn.reference} fully "
                f"absorbed by outstanding debt for {txn.seller.username} — no transfer sent"
            )
            record_payout_audit(txn, 0)
            continue

        retry_n = txn.transfer_retry_count + 1
        # Use a suffixed reference so Paystack treats this as a distinct transfer
        # from any previous failed attempt.
        retry_ref = f"PAYOUT-{txn.reference}-R{retry_n}"

        payload = {
            'source': 'balance',
            'amount': int(remaining_amount * 100),
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
                record_payout_audit(txn, remaining_amount)
            else:
                txn.transfer_retry_count = retry_n
                txn.transfer_status = 'failed'
                txn.save(update_fields=['transfer_retry_count', 'transfer_status'])
                logger.error(
                    f"retry_failed_transfers: retry #{retry_n} failed for txn {txn.reference} "
                    f"— {res.status_code}: {res_json}"
                )
                record_payout_audit(txn, 0, transfer_status='failed', transfer_reference='')

                if retry_n >= MAX_TRANSFER_RETRIES:
                    _alert_admin_transfer_failure(txn)

        except Exception as e:
            txn.transfer_retry_count += 1
            txn.save(update_fields=['transfer_retry_count'])
            logger.error(
                f"retry_failed_transfers: exception on retry #{retry_n} for txn {txn.reference}: {e}",
                exc_info=True,
            )
            record_payout_audit(txn, 0, transfer_status='failed', transfer_reference='')
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

def pick_vendor_of_month_for_campus(campus, month_start, month_end):
    """
    Picks the best vendor for a single campus and month. Returns True if a winner
    was found and saved, False if the campus already had a pick or no vendors qualified.
    """
    from django.contrib.auth import get_user_model
    from django.db.models import Count, Q, Avg, ExpressionWrapper, F, DurationField
    from orders.models import Order
    from services.models import VendorOfTheMonth
    from accounts.utils import send_notification

    User = get_user_model()

    if VendorOfTheMonth.objects.filter(month=month_start, campus=campus).exists():
        logger.info(f"pick_vendor_of_month: already picked for {campus.upper()} {month_start.strftime('%B %Y')}")
        return False

    vendors = (
        User.objects
        .filter(is_verified_vendor=True, school=campus)
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
        .filter(monthly_orders__gt=0)
    )

    best_vendor = None
    best_score  = -1
    best_stats  = {}

    for vendor in vendors:
        completed       = vendor.monthly_orders
        profile         = getattr(vendor, 'profile', None)
        avg_rating      = float(getattr(profile, 'rating', 0) or 0)
        completion_rate = float(getattr(profile, 'completion_rate', 0) or 0)

        score = completed * 5 + avg_rating * 10 + completion_rate * 0.5

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

        def beats(s=score, c=completed, r=avg_rating, t=avg_secs):
            if s != best_score:
                return s > best_score
            if c != best_stats.get('total_orders', 0):
                return c > best_stats.get('total_orders', 0)
            if r != best_stats.get('avg_rating', 0):
                return r > best_stats.get('avg_rating', 0)
            best_t = best_stats.get('avg_completion_seconds')
            if t is not None and best_t is not None:
                return t < best_t
            return t is not None

        if best_vendor is None or beats():
            best_score  = score
            best_vendor = vendor
            best_stats  = {
                'total_orders':           completed,
                'avg_rating':             avg_rating,
                'completion_rate':        completion_rate,
                'avg_completion_seconds': avg_secs,
            }

    if not best_vendor:
        logger.info(f"pick_vendor_of_month: no qualifying vendor for {campus.upper()} (no completed orders last month)")
        return False

    VendorOfTheMonth.objects.create(
        vendor=best_vendor,
        month=month_start,
        campus=campus,
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
            send_email=False,
        )
    except Exception as ne:
        logger.warning(f"pick_vendor_of_month: notification failed for {campus}: {ne}")

    logger.info(
        f"pick_vendor_of_month: {best_vendor.username} wins {campus.upper()} {month_start.strftime('%B %Y')} "
        f"(score={best_score:.1f}, orders={best_stats['total_orders']}, "
        f"rating={best_stats['avg_rating']}, completion={best_stats['completion_rate']}%)"
    )
    return True


def pick_vendor_of_month():
    """
    Runs on the 1st of each month. Picks one Vendor of the Month per campus
    based on completed orders, avg rating, and completion rate from the previous month.
    Idempotent — skips campuses that already have a pick for the month.
    """
    from datetime import date

    today = date.today()

    if today.month == 1:
        month_start = date(today.year - 1, 12, 1)
        month_end   = date(today.year, 1, 1)
    else:
        month_start = date(today.year, today.month - 1, 1)
        month_end   = date(today.year, today.month, 1)

    for campus in _CAMPUSES:
        pick_vendor_of_month_for_campus(campus, month_start, month_end)


# ─────────────────────────────────────────────────────────────────────────────
# JOB 6 & 7: Groq AI notification broadcasts — per campus
# Students: Mon / Wed / Fri at 10:00 WAT
# Vendors:  Tue / Thu / Sat at 10:00 WAT
# ─────────────────────────────────────────────────────────────────────────────

_CAMPUSES = ('pau', 'futo', 'imsu')


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
# JOB 8: Post-order rating prompt — every 30 min
# ─────────────────────────────────────────────────────────────────────────────

def prompt_rating_reviews():
    """
    2 hours after a buyer confirms delivery, send an in-app prompt to rate the vendor.
    Runs every 30 min; checks a 30-min window so no order is missed or double-prompted.
    """
    from orders.models import Order
    from notifications.models import Notification
    from accounts.utils import send_notification

    window_end   = timezone.now() - timedelta(hours=2)
    window_start = window_end - timedelta(minutes=30)

    orders = Order.objects.filter(
        status='completed',
        buyer_confirmed_at__gte=window_start,
        buyer_confirmed_at__lt=window_end,
    ).select_related('buyer', 'listing__vendor')

    prompted = 0
    for order in orders:
        already = Notification.objects.filter(
            recipient=order.buyer,
            notification_type='rate_vendor',
            action_url=f'/account/orders/{order.id}',
        ).exists()
        if already:
            continue
        try:
            vendor_name = (
                getattr(order.listing.vendor, 'business_name', None)
                or order.listing.vendor.username
            )
            send_notification(
                recipient=order.buyer,
                notification_type='rate_vendor',
                title='How was your order?',
                message=(
                    f'You just got "{order.listing.title}" from {vendor_name}. '
                    f'Leave a quick rating to help other students!'
                ),
                action_url=f'/account/orders/{order.id}',
                send_email=False,
            )
            prompted += 1
        except Exception as e:
            logger.warning(f"prompt_rating_reviews: failed for order {order.id}: {e}")

    if prompted:
        logger.info(f"prompt_rating_reviews: sent {prompted} rating prompt(s)")


# ─────────────────────────────────────────────────────────────────────────────
# JOB 9: Lunch notification — weekdays 12:30 WAT
# ─────────────────────────────────────────────────────────────────────────────

def send_lunch_notifications():
    """
    At 12:30 WAT on weekdays, nudge students who have previously ordered food
    to check out food listings on their campus. In-app only, no email.
    """
    from django.contrib.auth import get_user_model
    from orders.models import Order
    from accounts.utils import send_notification

    User = get_user_model()

    food_orderer_ids = (
        Order.objects
        .filter(
            status__in=['paid', 'preparing', 'ready', 'completed'],
            listing__category__slug='food',
        )
        .values_list('buyer_id', flat=True)
        .distinct()
    )

    students = (
        User.objects
        .filter(
            id__in=food_orderer_ids,
            user_type='student',
            is_active=True,
        )
        .only('id', 'school')
    )

    lunch_messages = [
        ("It's lunch o'clock! 🍽️", "Quick, check what food vendors are serving on campus today!"),
        ("Hungry? Let's fix that 🔥", "Your favourite campus food vendors are ready to take your order."),
        ("Lunch break loading... 🍛", "Don't go hungry! Browse food vendors near you on StudEx."),
    ]

    import random
    title, message = random.choice(lunch_messages)

    sent = 0
    for student in students.iterator():
        campus = getattr(student, 'school', 'pau') or 'pau'
        try:
            send_notification(
                recipient=student,
                notification_type='ai_tip',
                title=title,
                message=message,
                action_url=f'/categories/food?campus={campus}',
                send_email=False,
            )
            sent += 1
        except Exception as e:
            logger.warning(f"send_lunch_notifications: failed for user {student.id}: {e}")

    if sent:
        logger.info(f"send_lunch_notifications: sent to {sent} student(s)")


# ─────────────────────────────────────────────────────────────────────────────
# JOB 10: Daily vendor digest — 8am WAT every day
# ─────────────────────────────────────────────────────────────────────────────

def send_vendor_daily_digest():
    """
    At 8am WAT, send every active verified vendor a daily push:
    - Vendors WITH listings  → stats (pending bookings + weekly earnings)
    - Vendors WITHOUT listings → nudge to create their first listing
    In-app + FCM push only, no email.
    """
    from django.contrib.auth import get_user_model
    from django.db.models import Sum
    from orders.models import Order, Booking
    from services.models import Listing
    from accounts.utils import send_notification

    User = get_user_model()
    week_ago = timezone.now() - timedelta(days=7)

    vendors = (
        User.objects
        .filter(is_verified_vendor=True, is_active=True)
        .only('id', 'username')
    )

    sent = 0
    for vendor in vendors.iterator():
        try:
            has_listings = Listing.objects.filter(vendor=vendor).exists()

            if not has_listings:
                send_notification(
                    recipient=vendor,
                    notification_type='ai_tip',
                    title='Your store is empty — let\'s change that!',
                    message=(
                        'You\'re a verified vendor but you haven\'t posted any listings yet. '
                        'Add your first service or product now and start getting orders from students on campus!'
                    ),
                    action_url='/vendor/dashboard/listings',
                    send_email=False,
                )
            else:
                pending_bookings = Booking.objects.filter(
                    listing__vendor=vendor,
                    status='pending',
                ).count()

                week_orders = Order.objects.filter(
                    listing__vendor=vendor,
                    status__in=['paid', 'preparing', 'ready', 'completed'],
                    created_at__gte=week_ago,
                )
                week_count    = week_orders.count()
                week_earnings = week_orders.aggregate(total=Sum('amount'))['total'] or 0

                parts = []
                if pending_bookings:
                    plural = 's' if pending_bookings > 1 else ''
                    parts.append(f"{pending_bookings} pending booking{plural} waiting for your response")
                if week_count:
                    plural = 's' if week_count > 1 else ''
                    parts.append(f"{week_count} order{plural} this week (₦{int(week_earnings):,} earned)")

                if not parts:
                    message = "No new activity yet today — keep your listings fresh to attract orders!"
                else:
                    message = " · ".join(parts) + ". Log in to stay on top of things."

                send_notification(
                    recipient=vendor,
                    notification_type='ai_tip',
                    title='📊 Your Daily StudEx Update',
                    message=message,
                    action_url='/vendor/dashboard',
                    send_email=False,
                )

            sent += 1
        except Exception as e:
            logger.warning(f"send_vendor_daily_digest: failed for vendor {vendor.id}: {e}")

    if sent:
        logger.info(f"send_vendor_daily_digest: sent to {sent} vendor(s)")


# ─────────────────────────────────────────────────────────────────────────────
# JOB 11: Pending booking nudge — every 30 min
# ─────────────────────────────────────────────────────────────────────────────

def nudge_pending_booking_vendors():
    """
    Every 30 min: if a vendor has a booking that has been pending for 2–2.5 h
    with no response, send a push reminder. Idempotent per booking.
    """
    from orders.models import Booking
    from notifications.models import Notification
    from accounts.utils import send_notification

    window_end   = timezone.now() - timedelta(hours=2)
    window_start = window_end - timedelta(minutes=30)

    bookings = Booking.objects.filter(
        status='pending',
        created_at__gte=window_start,
        created_at__lt=window_end,
    ).select_related('listing__vendor', 'buyer')

    nudged = 0
    for booking in bookings:
        nudge_url = f'/vendor/dashboard?nudge={booking.id}'
        already = Notification.objects.filter(
            recipient=booking.listing.vendor,
            notification_type='booking_reminder',
            action_url=nudge_url,
        ).exists()
        if already:
            continue
        try:
            send_notification(
                recipient=booking.listing.vendor,
                notification_type='booking_reminder',
                title='Booking waiting for your response!',
                message=(
                    f'{booking.buyer.username} booked "{booking.listing.title}" '
                    f'for {booking.scheduled_date}. Please confirm or decline on your dashboard.'
                ),
                action_url=nudge_url,
                send_email=False,
            )
            nudged += 1
        except Exception as e:
            logger.warning(f"nudge_pending_booking_vendors: failed for booking {booking.id}: {e}")

    if nudged:
        logger.info(f"nudge_pending_booking_vendors: sent {nudged} nudge(s)")


# ─────────────────────────────────────────────────────────────────────────────
# JOB 12: Buyer daily nudge — weekdays 9am WAT
# ─────────────────────────────────────────────────────────────────────────────

def send_buyer_daily_nudge():
    """
    At 9am WAT on weekdays, nudge buyers who have ordered in the last 30 days.
    Personalized to their most-ordered category if one exists.
    Idempotent per day via action_url ref=daily.
    """
    import random
    from django.contrib.auth import get_user_model
    from django.db.models import Count
    from orders.models import Order
    from notifications.models import Notification
    from accounts.utils import send_notification

    User = get_user_model()
    now = timezone.now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month_ago = now - timedelta(days=30)

    active_buyer_ids = (
        Order.objects
        .filter(
            status__in=['paid', 'preparing', 'ready', 'completed'],
            created_at__gte=month_ago,
        )
        .values_list('buyer_id', flat=True)
        .distinct()
    )

    buyers = User.objects.filter(id__in=active_buyer_ids, is_active=True).only('id', 'school')

    general_messages = [
        ("What's on campus today? 👀", "Check out the latest listings from vendors around you on StudEx."),
        ("Campus marketplace is live 🛍️", "Food, fashion, laundry and more — see what vendors have for you today."),
        ("Good morning! Start your day right 🌅", "Browse services from verified campus vendors, all in one place."),
    ]

    sent = 0
    for buyer in buyers.iterator():
        try:
            campus = getattr(buyer, 'school', 'pau') or 'pau'

            already = Notification.objects.filter(
                recipient=buyer,
                notification_type='ai_tip',
                action_url__contains='ref=daily',
                created_at__gte=today_start,
            ).exists()
            if already:
                continue

            fav = (
                Order.objects
                .filter(
                    buyer=buyer,
                    status__in=['paid', 'preparing', 'ready', 'completed'],
                    created_at__gte=month_ago,
                )
                .values('listing__category__slug', 'listing__category__title')
                .annotate(cnt=Count('id'))
                .order_by('-cnt')
                .first()
            )

            if fav and fav['listing__category__slug']:
                slug        = fav['listing__category__slug']
                cat_title   = fav['listing__category__title'] or slug.replace('-', ' ').title()
                title       = f"{cat_title} vendors are ready for you! 🔥"
                message     = f"You love ordering {cat_title.lower()} — check what's available on campus today."
                action_url  = f'/category/{slug}?campus={campus}&ref=daily'
            else:
                title, message = random.choice(general_messages)
                action_url = f'/home?ref=daily'

            send_notification(
                recipient=buyer,
                notification_type='ai_tip',
                title=title,
                message=message,
                action_url=action_url,
                send_email=False,
            )
            sent += 1
        except Exception as e:
            logger.warning(f"send_buyer_daily_nudge: failed for user {buyer.id}: {e}")

    if sent:
        logger.info(f"send_buyer_daily_nudge: sent to {sent} buyer(s)")


# ─────────────────────────────────────────────────────────────────────────────
# JOB 13: Buyer re-engagement nudge — 5pm WAT daily
# ─────────────────────────────────────────────────────────────────────────────

def send_buyer_reengagement_nudge():
    """
    At 5pm WAT daily, nudge buyers whose last order was 5-14 days ago.
    Idempotent per day via action_url ref=reengaged.
    """
    import random
    from django.contrib.auth import get_user_model
    from django.db.models import Max
    from orders.models import Order
    from notifications.models import Notification
    from accounts.utils import send_notification

    User = get_user_model()
    now = timezone.now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    window_end   = now - timedelta(days=5)
    window_start = now - timedelta(days=14)

    buyer_ids = (
        Order.objects
        .filter(status__in=['paid', 'preparing', 'ready', 'completed'])
        .values('buyer_id')
        .annotate(last_order=Max('created_at'))
        .filter(last_order__gte=window_start, last_order__lt=window_end)
        .values_list('buyer_id', flat=True)
    )

    buyers = User.objects.filter(id__in=buyer_ids, is_active=True).only('id', 'school')

    messages = [
        ("Missing you on StudEx! 👋", "It's been a while — come see what your campus vendors have been up to."),
        ("Your campus vendors are waiting 🛍️", "Haven't ordered in a few days? Check what's new on StudEx today."),
        ("Back to campus life 🎓", "Plenty of food, laundry, fashion and more waiting for you on StudEx."),
    ]

    sent = 0
    for buyer in buyers.iterator():
        try:
            campus = getattr(buyer, 'school', 'pau') or 'pau'

            already = Notification.objects.filter(
                recipient=buyer,
                notification_type='ai_tip',
                action_url__contains='ref=reengaged',
                created_at__gte=today_start,
            ).exists()
            if already:
                continue

            title, message = random.choice(messages)
            send_notification(
                recipient=buyer,
                notification_type='ai_tip',
                title=title,
                message=message,
                action_url=f'/categories?campus={campus}&ref=reengaged',
                send_email=False,
            )
            sent += 1
        except Exception as e:
            logger.warning(f"send_buyer_reengagement_nudge: failed for user {buyer.id}: {e}")

    if sent:
        logger.info(f"send_buyer_reengagement_nudge: sent to {sent} buyer(s)")


# ─────────────────────────────────────────────────────────────────────────────
# JOB 14: Escrow reconciliation — every hour
# ─────────────────────────────────────────────────────────────────────────────

def run_escrow_reconciliation():
    """
    Verifies Paystack's actual account balance against what StudEx's own
    records say should be held. See payments/reconciliation.py for the full
    implementation — this is just the scheduled trigger. Any failure here
    (e.g. Paystack API unreachable) is logged, not raised, so one bad tick
    doesn't take down the scheduler process.
    """
    from payments.reconciliation import run_reconciliation
    try:
        run_reconciliation()
    except Exception as e:
        logger.error(f"run_escrow_reconciliation: reconciliation run failed: {e}", exc_info=True)


# ─────────────────────────────────────────────────────────────────────────────
# JOB 15: Recover stuck refund claims — every 5 min
# ─────────────────────────────────────────────────────────────────────────────

STUCK_REFUND_MINUTES = 10


def recover_stuck_refunds():
    """
    Safety net for refund_payment()'s row-lock claim (see payments/views.py).
    A transaction only sits in status="refund_pending" for the duration of a
    single Paystack API call (≤15s timeout) — refund_payment() itself reverts
    it to "success" on any failure, and the refund.failed webhook reverts it
    too. The only way a row stays stuck longer than that is a crashed/killed
    worker process between the claim and the Paystack call finishing, in
    which case no code path is left to release it. Anything still pending
    past a generous grace window is reverted here so it isn't refund-locked
    forever, with a warning so an admin can check whether Paystack actually
    processed it (the refund.processed webhook would have already caught
    that and moved it to "refunded" if so).
    """
    from payments.models import PaymentTransaction

    cutoff = timezone.now() - timedelta(minutes=STUCK_REFUND_MINUTES)
    stuck = PaymentTransaction.objects.filter(status="refund_pending", updated_at__lte=cutoff)

    count = 0
    for txn in stuck:
        txn.status = "success"
        txn.save(update_fields=["status"])
        logger.warning(
            f"recover_stuck_refunds: {txn.reference} was stuck in refund_pending "
            f"for over {STUCK_REFUND_MINUTES} min — reverted to success. "
            f"Verify with Paystack whether the refund actually went through."
        )
        count += 1

    if count:
        logger.info(f"recover_stuck_refunds: recovered {count} stuck refund claim(s).")


# ─────────────────────────────────────────────────────────────────────────────
# JOB 16: Generate today's delivery batches from active templates — 00:10 WAT
# Phase 1 — Food Commerce Engine, Step 4 (Delivery Batch Reservation).
# ─────────────────────────────────────────────────────────────────────────────

def generate_daily_delivery_batches():
    """
    Creates today's DeliveryBatch row for every active BatchTemplate whose
    days_of_week includes today's weekday (Africa/Lagos calendar day).
    Editing a template only changes what future days generate — never
    retroactively touches an already-generated DeliveryBatch (see
    delivery.models.BatchTemplate).

    Idempotent: get_or_create keyed on (vendor, template, batch_date) — the
    same tuple DeliveryBatch's own unique_together enforces — so a duplicate
    run (a server restart, a manual re-trigger) never double-creates a batch
    or resets one an admin has already same-day-overridden.
    """
    from datetime import datetime, timedelta as _timedelta
    from delivery.models import BatchTemplate, DeliveryBatch

    now_lagos = datetime.now(LAGOS_TZ)
    today = now_lagos.date()
    weekday = today.weekday()

    created = 0
    for template in BatchTemplate.objects.filter(is_active=True):
        if weekday not in (template.days_of_week or []):
            continue
        try:
            delivery_dt = datetime.combine(today, template.delivery_time, tzinfo=LAGOS_TZ)
            cutoff_dt = delivery_dt - _timedelta(minutes=template.cutoff_offset_minutes)
            _, was_created = DeliveryBatch.objects.get_or_create(
                vendor=template.vendor, template=template, batch_date=today,
                defaults={
                    'campus': template.campus,
                    'display_name': template.display_name,
                    'delivery_time': delivery_dt,
                    'cutoff_time': cutoff_dt,
                    'max_orders': template.max_orders,
                    'status': 'open',
                },
            )
            if was_created:
                created += 1
        except Exception as e:
            logger.error(f"generate_daily_delivery_batches: failed for template {template.id}: {e}", exc_info=True)

    if created:
        logger.info(f"generate_daily_delivery_batches: created {created} batch(es) for {today}.")


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
        name="Auto-complete seller_completed orders after 24 h",
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

    # Every hour
    scheduler.add_job(
        run_escrow_reconciliation,
        trigger=IntervalTrigger(hours=1),
        id="escrow_reconciliation",
        name="Reconcile Paystack balance against internal escrow records",
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

    # Every 30 min — rate vendor prompt (2 h after buyer confirms delivery)
    scheduler.add_job(
        prompt_rating_reviews,
        trigger=IntervalTrigger(minutes=30),
        id='prompt_rating_reviews',
        name='Post-order rating prompt (every 30 min)',
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )

    # Weekdays 12:30 WAT — lunch notification for food-ordering students
    scheduler.add_job(
        send_lunch_notifications,
        trigger=CronTrigger(day_of_week='mon-fri', hour=12, minute=30, timezone=LAGOS_TZ),
        id='send_lunch_notifications',
        name='Lunch notification — food-ordering students (Mon-Fri 12:30 WAT)',
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )

    # 8:00 WAT daily — vendor daily digest (pending bookings + weekly earnings)
    scheduler.add_job(
        send_vendor_daily_digest,
        trigger=CronTrigger(hour=8, minute=0, timezone=LAGOS_TZ),
        id='send_vendor_daily_digest',
        name='Vendor daily digest — 8:00 WAT',
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )

    # Every 30 min — nudge vendors with bookings pending for 2+ hours
    scheduler.add_job(
        nudge_pending_booking_vendors,
        trigger=IntervalTrigger(minutes=30),
        id='nudge_pending_booking_vendors',
        name='Pending booking vendor nudge (every 30 min)',
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )

    # Mon-Fri 9:00 WAT — personalized buyer morning nudge
    scheduler.add_job(
        send_buyer_daily_nudge,
        trigger=CronTrigger(day_of_week='mon-fri', hour=9, minute=0, timezone=LAGOS_TZ),
        id='send_buyer_daily_nudge',
        name='Buyer daily discovery nudge (Mon-Fri 09:00 WAT)',
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )

    # 5pm WAT daily — re-engage buyers silent for 5-14 days
    scheduler.add_job(
        send_buyer_reengagement_nudge,
        trigger=CronTrigger(hour=17, minute=0, timezone=LAGOS_TZ),
        id='send_buyer_reengagement_nudge',
        name='Buyer re-engagement nudge (17:00 WAT daily)',
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )

    # Every 5 min — release any refund claim stuck past its grace window
    scheduler.add_job(
        recover_stuck_refunds,
        trigger=IntervalTrigger(minutes=5),
        id='recover_stuck_refunds',
        name='Recover refund_pending transactions stuck beyond grace window (5 min)',
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )

    # 00:10 WAT daily — generate today's delivery batches from active templates
    scheduler.add_job(
        generate_daily_delivery_batches,
        trigger=CronTrigger(hour=0, minute=10, timezone=LAGOS_TZ),
        id='generate_daily_delivery_batches',
        name="Generate today's DeliveryBatch rows from active BatchTemplates (00:10 WAT)",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )

    try:
        scheduler.start()
        logger.info(
            "Scheduler started: booking_reminders (60s), "
            "auto_release_orders (midnight), auto_cancel_pending_orders (midnight), "
            "retry_failed_transfers (1h), escrow_reconciliation (1h), "
            "groq_notify_students (Mon/Wed/Fri 10:00 per campus), groq_notify_vendors (Tue/Thu/Sat 10:00 per campus), "
            "prompt_rating_reviews (30 min), send_lunch_notifications (Mon-Fri 12:30 WAT), "
            "send_vendor_daily_digest (08:00 WAT), nudge_pending_booking_vendors (30 min), "
            "send_buyer_daily_nudge (Mon-Fri 09:00 WAT), send_buyer_reengagement_nudge (17:00 WAT), "
            "recover_stuck_refunds (5 min), generate_daily_delivery_batches (00:10 WAT)."
        )
    except Exception as e:
        logger.error(f"Failed to start scheduler: {e}", exc_info=True)
