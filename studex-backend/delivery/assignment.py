# delivery/assignment.py
"""
Automatic rider assignment (Phase 2 simplification) — replaces the
previous fully-manual flow where an admin had to open every order and
pick a rider + a fixed CampusPickupPoint one at a time before a rider saw
anything. The moment a slotted order is paid for, the least-busy active
rider is assigned automatically; the rider sees the buyer's own typed
delivery_location directly (Order.delivery_location) instead of a fixed
pickup point picked by an admin — no manual step in between.

An admin can still reassign a rider by hand via the Order admin inline
(delivery.admin.DeliveryAssignmentInline) for the rare case that needs it
(a rider goes offline mid-shift, etc.) — this only removes the requirement
that *every* order needs that manual step before a rider can act on it.

Called after the Order (and its DeliverySlot reservation, if any) has
already committed — never inside that same transaction.atomic() block,
since this sends a push notification (an external call), and this
codebase's convention throughout is external calls only happen after
commit (see payments.views.trigger_vendor_payout, orders.views.confirm).
"""
import logging

from django.contrib.auth import get_user_model
from django.db.models import Count, Q

logger = logging.getLogger(__name__)


def _pick_least_busy_rider(campus):
    """
    Restricted to riders whose registered campus (accounts.models.User.school
    — the same field an admin sets per rider from /admin/users/<id>, and the
    only "coverage area" this codebase's location model supports; see
    services.models.Listing.campus / delivery.models.CampusPickupPoint.
    CAMPUS_CHOICES for the same 3-value taxonomy everywhere else) matches the
    order's own campus. Before this filter existed, a FUTO order could
    auto-assign to a PAU-based rider — least-busy globally, with no regard
    for whether they could physically reach it.
    """
    User = get_user_model()
    return (
        User.objects.filter(user_type='rider', is_active=True, school__iexact=campus)
        .annotate(active_count=Count(
            'deliveries', filter=Q(deliveries__status__in=['assigned', 'picked_up', 'at_pickup_point']),
        ))
        .order_by('active_count', 'id')
        .first()
    )


def auto_assign_rider(order):
    """
    Creates a DeliveryAssignment for `order` with the least-busy currently
    active rider covering the order's campus (order.listing.campus — see
    _pick_least_busy_rider), using order.delivery_location directly — no
    CampusPickupPoint required or set. No-op (returns None, logs a
    warning) if there's no active rider covering that campus at all; an
    admin can still assign one manually afterward (delivery.views.
    AdminAssignRiderView). Never raises — a failure here must never surface
    as a checkout failure, same convention as every other post-creation
    side effect in verify_cart_payment.
    """
    from delivery.models import DeliveryAssignment

    try:
        campus = order.listing.campus
        rider = _pick_least_busy_rider(campus)
        if not rider:
            logger.warning(f"auto_assign_rider: no active {campus} rider available for order {order.id}")
            return None

        assignment, created = DeliveryAssignment.objects.get_or_create(
            order=order, defaults={'rider': rider, 'delivery_slot': order.delivery_slot},
        )
        if not created:
            return assignment

        try:
            from accounts.utils import send_notification
            destination = order.delivery_location or "see the order for details"
            send_notification(
                recipient=rider,
                notification_type='order',
                title='New Delivery Assignment',
                message=(
                    f'You have been assigned to deliver order #{order.reference}. '
                    f'Collect from "@{order.listing.vendor.username}" and deliver to: {destination}.'
                ),
                action_url='/rider',
                send_email=False,
            )
        except Exception as e:
            logger.warning(f"auto_assign_rider: rider notification failed for order {order.id}: {e}")

        return assignment
    except Exception as e:
        logger.error(f"auto_assign_rider failed for order {order.id}: {e}", exc_info=True)
        return None
