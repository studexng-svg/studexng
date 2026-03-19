# studex/notifications.py
"""
Central notification helper for StudEx.
Creates Notification records in the database.
- Admin notifications appear in Django Admin → Notifications
- User notifications appear on the user's account page
"""
import logging

logger = logging.getLogger(__name__)


def notify_admin_new_listing(listing):
    """Called when a vendor creates a new listing — admin must mark it available."""
    try:
        from notifications.models import Notification
        from django.contrib.auth import get_user_model
        User = get_user_model()

        # Notify all superusers/staff
        admins = User.objects.filter(is_staff=True)
        for admin in admins:
            Notification.objects.create(
                recipient=admin,
                is_admin_notification=True,
                notification_type='new_listing',
                title=f'New Listing Needs Approval — {listing.title}',
                message=(
                    f'Vendor "{listing.vendor.username}" has submitted a new listing:\n'
                    f'"{listing.title}" priced at ₦{listing.price}.\n'
                    f'Go to Admin → Services → Listings to mark it as available.'
                ),
                action_url=f'/admin/services/listing/{listing.id}/change/',
            )
        logger.info(f"[StudEx] Admin notified: new listing '{listing.title}' by {listing.vendor.username}")
    except Exception as e:
        logger.warning(f"notify_admin_new_listing failed: {e}")


def notify_admin_new_application(application):
    """Called when a user submits a vendor application."""
    try:
        from notifications.models import Notification
        from django.contrib.auth import get_user_model
        User = get_user_model()

        admins = User.objects.filter(is_staff=True)
        for admin in admins:
            Notification.objects.create(
                recipient=admin,
                is_admin_notification=True,
                notification_type='vendor_application',
                title=f'New Vendor Application — {application.user.username}',
                message=(
                    f'User "{application.user.username}" ({application.user.email}) '
                    f'has submitted a vendor application and is awaiting approval.\n'
                    f'Go to Admin → Accounts → Seller Applications to review, '
                    f'then tick "Is Verified Vendor" on their account to activate.'
                ),
                action_url=f'/admin/accounts/sellerapplication/{application.id}/change/',
            )
        logger.info(f"[StudEx] Admin notified: vendor application from {application.user.username}")
    except Exception as e:
        logger.warning(f"notify_admin_new_application failed: {e}")


def notify_user_vendor_approved(user):
    """Called when admin ticks is_verified_vendor = True."""
    try:
        from notifications.models import Notification
        Notification.objects.create(
            recipient=user,
            is_admin_notification=False,
            notification_type='vendor_approved',
            title='🎉 Your Vendor Account Has Been Approved!',
            message=(
                f'Congratulations {user.username}! Your application to become a vendor '
                f'on StudEx has been approved. You can now access your Vendor Hub, '
                f'create listings, receive bookings, and set up your bank account for payouts.'
            ),
            action_url='/account',
        )
        logger.info(f"[StudEx] Vendor approval notification created for {user.username}")
    except Exception as e:
        logger.warning(f"notify_user_vendor_approved failed: {e}")


def notify_user_vendor_revoked(user):
    """Called when admin unticks is_verified_vendor."""
    try:
        from notifications.models import Notification
        Notification.objects.create(
            recipient=user,
            is_admin_notification=False,
            notification_type='vendor_revoked',
            title='Your Vendor Account Has Been Deactivated',
            message=(
                f'Hi {user.username}, your vendor account on StudEx has been deactivated '
                f'by an administrator. Your listings are no longer visible to buyers. '
                f'Please contact support if you believe this is a mistake.'
            ),
            action_url='/account',
        )
        logger.info(f"[StudEx] Vendor revocation notification created for {user.username}")
    except Exception as e:
        logger.warning(f"notify_user_vendor_revoked failed: {e}")


def notify_vendor_listing_approved(listing):
    """Called when admin marks a listing as is_available=True."""
    try:
        from notifications.models import Notification
        Notification.objects.create(
            recipient=listing.vendor,
            is_admin_notification=False,
            notification_type='new_listing',
            title=f'✅ Your listing "{listing.title}" is now live!',
            message=(
                f'Great news! Your listing "{listing.title}" priced at ₦{listing.price} '
                f'has been approved by admin and is now visible to buyers in the shop.'
            ),
            action_url='/vendor/dashboard',
        )
        logger.info(f"[StudEx] Vendor {listing.vendor.username} notified: listing '{listing.title}' approved")
    except Exception as e:
        logger.warning(f"notify_vendor_listing_approved failed: {e}")


def notify_vendor_listing_approved(listing):
    """Called when admin marks a listing as available (is_available=True)."""
    try:
        from notifications.models import Notification
        Notification.objects.create(
            recipient=listing.vendor,
            is_admin_notification=False,
            notification_type='new_listing',
            title=f'✅ Your listing "{listing.title}" is now live!',
            message=(
                f'Great news! Your listing "{listing.title}" has been reviewed and approved by admin. '
                f'It is now visible to buyers in the shop.'
            ),
            action_url='/vendor/dashboard',
        )
        logger.info(f"[StudEx] Vendor {listing.vendor.username} notified: listing '{listing.title}' approved")
    except Exception as e:
        logger.warning(f"notify_vendor_listing_approved failed: {e}")


def notify_vendor_listing_deactivated(listing):
    """Called when admin marks a listing as unavailable (is_available=False)."""
    try:
        from notifications.models import Notification
        Notification.objects.create(
            recipient=listing.vendor,
            is_admin_notification=False,
            notification_type='new_listing',
            title=f'⚠️ Your listing "{listing.title}" has been deactivated',
            message=(
                f'Your listing "{listing.title}" has been marked unavailable by an administrator '
                f'and is no longer visible to buyers. Please contact support if you have questions.'
            ),
            action_url='/vendor/dashboard',
        )
        logger.info(f"[StudEx] Vendor {listing.vendor.username} notified: listing '{listing.title}' deactivated")
    except Exception as e:
        logger.warning(f"notify_vendor_listing_deactivated failed: {e}")


def notify_vendor_listing_deleted(vendor, listing_title):
    """Called when admin deletes a listing."""
    try:
        from notifications.models import Notification
        Notification.objects.create(
            recipient=vendor,
            is_admin_notification=False,
            notification_type='new_listing',
            title=f'🗑️ Your listing "{listing_title}" has been deleted',
            message=(
                f'Your listing "{listing_title}" has been permanently deleted by an administrator. '
                f'If you believe this was a mistake, please contact support.'
            ),
            action_url='/vendor/dashboard',
        )
        logger.info(f"[StudEx] Vendor {vendor.username} notified: listing '{listing_title}' deleted")
    except Exception as e:
        logger.warning(f"notify_vendor_listing_deleted failed: {e}")
        