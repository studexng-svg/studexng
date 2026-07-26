# studex/notifications.py
"""
Central notification helper for StudEx.
All functions route through send_notification() which handles:
  - DB record
  - Expo/FCM push to phone (the only genuinely instant path)
  - Email (Resend → Brevo fallback)
No SSE/live push to open web tabs — deliberately rejected, see the
architecture decision at the top of notifications/views.py. Those clients
pick up new notifications via 30s polling instead.
"""
import logging
from accounts.utils import send_notification

logger = logging.getLogger(__name__)


def notify_admin_new_listing(listing):
    """Called when a vendor creates a new listing — admin must mark it available."""
    try:
        from django.contrib.auth import get_user_model
        User = get_user_model()
        for admin in User.objects.filter(is_staff=True):
            send_notification(
                recipient=admin,
                notification_type='new_listing',
                title=f'New Listing Needs Approval — {listing.title}',
                message=(
                    f'Vendor "{listing.vendor.username}" submitted a new listing: '
                    f'"{listing.title}" priced at ₦{listing.price}. '
                    f'Go to Admin → Listings to mark it as available.'
                ),
                action_url=f'/admin/listings/{listing.id}',
                send_email=False,
            )
    except Exception as e:
        logger.warning(f"notify_admin_new_listing failed: {e}")


def notify_admin_new_order(order, buyer, vendor, amount, description):
    """
    Called whenever a paid order is created — every checkout path (single-
    listing Paystack, vendor-scoped cart/menu checkout, full loyalty-credits
    payment) must call this, same as they already notify the buyer and
    vendor. `description` is a short human string identifying what was
    bought (a listing title, or "N item(s)" for a multi-line cart order).
    """
    try:
        from django.contrib.auth import get_user_model
        User = get_user_model()
        for admin in User.objects.filter(is_staff=True):
            send_notification(
                recipient=admin,
                notification_type='admin_new_order',
                title=f'New Paid Order — ₦{amount:,.0f}',
                message=(
                    f'{buyer.username} paid ₦{amount:,.0f} for {description} '
                    f'from "{vendor.username}".'
                ),
                action_url=f'/admin/orders/{order.id}',
                send_email=False,
            )
    except Exception as e:
        logger.warning(f"notify_admin_new_order failed: {e}")


def notify_admin_new_application(application):
    """Called when a user submits a vendor application."""
    try:
        from django.contrib.auth import get_user_model
        User = get_user_model()
        for admin in User.objects.filter(is_staff=True):
            send_notification(
                recipient=admin,
                notification_type='vendor_application',
                title=f'New Vendor Application — {application.user.username}',
                message=(
                    f'User "{application.user.username}" ({application.user.email}) '
                    f'has submitted a vendor application and is awaiting approval.'
                ),
                action_url=f'/admin/seller-approvals/{application.id}',
                send_email=False,
            )
    except Exception as e:
        logger.warning(f"notify_admin_new_application failed: {e}")


def notify_user_vendor_approved(user):
    """Called when admin ticks is_verified_vendor = True."""
    try:
        send_notification(
            recipient=user,
            notification_type='vendor_approved',
            title='Your Vendor Account Has Been Approved!',
            message=(
                f'Congratulations {user.username}! Your application to become a vendor '
                f'on StudEx has been approved. You can now create listings, receive bookings, '
                f'and set up your bank account for payouts.'
            ),
            action_url='/seller',
        )
    except Exception as e:
        logger.warning(f"notify_user_vendor_approved failed: {e}")


def notify_user_vendor_revoked(user):
    """Called when admin unticks is_verified_vendor."""
    try:
        send_notification(
            recipient=user,
            notification_type='vendor_revoked',
            title='Your Vendor Account Has Been Deactivated',
            message=(
                f'Hi {user.username}, your vendor account on StudEx has been deactivated '
                f'by an administrator. Your listings are no longer visible to buyers. '
                f'Please contact support if you believe this is a mistake.'
            ),
            action_url='/account',
        )
    except Exception as e:
        logger.warning(f"notify_user_vendor_revoked failed: {e}")


def notify_vendor_listing_approved(listing):
    """Called when admin marks a listing as is_available=True."""
    try:
        send_notification(
            recipient=listing.vendor,
            notification_type='listing_approved',
            title=f'Your listing "{listing.title}" is now live!',
            message=(
                f'Great news! Your listing "{listing.title}" priced at ₦{listing.price} '
                f'has been approved and is now visible to buyers in the shop.'
            ),
            action_url='/seller',
        )
    except Exception as e:
        logger.warning(f"notify_vendor_listing_approved failed: {e}")


def notify_vendor_listing_deactivated(listing):
    """Called when admin marks a listing as unavailable (is_available=False)."""
    try:
        send_notification(
            recipient=listing.vendor,
            notification_type='listing_deactivated',
            title=f'Your listing "{listing.title}" has been deactivated',
            message=(
                f'Your listing "{listing.title}" has been marked unavailable by an administrator '
                f'and is no longer visible to buyers. Please contact support if you have questions.'
            ),
            action_url='/seller',
        )
    except Exception as e:
        logger.warning(f"notify_vendor_listing_deactivated failed: {e}")


def notify_vendor_listing_deleted(vendor, listing_title):
    """Called when admin deletes a listing."""
    try:
        send_notification(
            recipient=vendor,
            notification_type='listing_deleted',
            title=f'Your listing "{listing_title}" has been deleted',
            message=(
                f'Your listing "{listing_title}" has been permanently deleted by an administrator. '
                f'If you believe this was a mistake, please contact support.'
            ),
            action_url='/seller',
        )
    except Exception as e:
        logger.warning(f"notify_vendor_listing_deleted failed: {e}")
