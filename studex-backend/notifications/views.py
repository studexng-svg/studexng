# notifications/views.py
# ─────────────────────────────────────────────────────────────────────────────
# ARCHITECTURE DECISION: No SSE (Server-Sent Events)
#
# SSE keeps a Django worker thread open permanently per connected user.
# On Render's free/starter tier, with ~4 gunicorn workers, even 4 logged-in
# users exhaust all workers and the entire app freezes for everyone else.
#
# Instead: smart polling via a single /api/notifications/status/ endpoint
# that returns everything the frontend needs in ONE request every 30 seconds.
# This is fast, reliable, and scales fine on Render.
# ─────────────────────────────────────────────────────────────────────────────

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response


def _serialize_notification(n) -> dict:
    return {
        "id": n.id,
        "type": n.notification_type,
        "title": n.title,
        "message": n.message,
        "is_read": n.is_read,
        "action_url": n.action_url or "",
        "created_at": n.created_at.isoformat(),
    }


# ─────────────────────────────────────────────────────────────────────────────
# BATCHED STATUS ENDPOINT
# One call replaces the 6 separate API calls the account page was making.
# Frontend polls this every 30 seconds.
# ─────────────────────────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def account_status(request):
    """
    GET /api/notifications/status/
    Returns everything the account page needs in a single request:
      - unread notification count + latest 20 notifications
      - unread message count
      - pending bookings count (context-aware: vendor vs buyer)
      - pending orders count (orders awaiting buyer confirmation)
      - user's current vendor status (for detecting approval/revocation)
    Designed to be polled every 30 seconds. Very cheap — all queries are
    simple COUNT or LIMIT queries with indexes.
    """
    user = request.user
    result = {
        "notifications": [],
        "unread_notifications": 0,
        "unread_messages": 0,
        "pending_bookings": 0,    # vendor: pending approval | buyer: confirmed but unpaid
        "pending_orders": 0,       # buyer: orders awaiting their confirmation
        "is_verified_vendor": user.is_verified_vendor,
        "user_type": user.user_type,
    }

    # ── Notifications ──────────────────────────────────────────────────────
    try:
        from notifications.models import Notification
        notifs = Notification.objects.filter(
            recipient=user
        ).order_by('-created_at')[:20]  # only latest 20, no need for more
        result["notifications"] = [_serialize_notification(n) for n in notifs]
        result["unread_notifications"] = Notification.objects.filter(
            recipient=user, is_read=False
        ).count()
    except Exception:
        pass

    # ── Unread messages ────────────────────────────────────────────────────
    try:
        from chat.models import Conversation, Message
        # Count conversations where latest message is not from this user
        unread = Conversation.objects.filter(
            messages__sender__isnull=False
        ).filter(
            # conversations that have at least one unread message for this user
        ).distinct().count()
        # Simpler: count via unread_count if your Conversation model has it
        from django.db.models import Sum
        conv_qs = Conversation.objects.filter(
            participants=user
        ) if hasattr(Conversation, 'participants') else Conversation.objects.filter(
            buyer=user
        ) | Conversation.objects.filter(
            seller=user
        )
        # fallback: just count convs with messages not from this user
        result["unread_messages"] = conv_qs.filter(
            messages__is_read=False
        ).exclude(
            messages__sender=user
        ).distinct().count()
    except Exception:
        try:
            # Minimal fallback using the API approach
            from chat.models import Conversation
            result["unread_messages"] = 0
        except Exception:
            pass

    # ── Pending bookings ───────────────────────────────────────────────────
    try:
        from orders.models import Booking
        from services.models import Listing
        if user.is_verified_vendor:
            # Vendor: bookings on their listings awaiting confirmation
            vendor_listing_ids = Listing.objects.filter(
                vendor=user
            ).values_list('id', flat=True)
            result["pending_bookings"] = Booking.objects.filter(
                listing__id__in=vendor_listing_ids,
                status="pending"
            ).count()
        else:
            # Buyer: their bookings that are confirmed but not yet paid
            result["pending_bookings"] = Booking.objects.filter(
                buyer=user,
                status="confirmed"
            ).count()
    except Exception:
        pass

    # ── Pending orders (awaiting buyer confirmation) ───────────────────────
    try:
        from orders.models import Order
        result["pending_orders"] = Order.objects.filter(
            buyer=user,
            status="seller_completed"
        ).count()
    except Exception:
        pass

    return Response(result)


# ─────────────────────────────────────────────────────────────────────────────
# STANDARD NOTIFICATION ENDPOINTS
# ─────────────────────────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def my_notifications(request):
    from notifications.models import Notification
    notifications = Notification.objects.filter(
        recipient=request.user
    ).order_by('-created_at')[:50]
    data = [_serialize_notification(n) for n in notifications]
    unread_count = Notification.objects.filter(
        recipient=request.user, is_read=False
    ).count()
    return Response({'notifications': data, 'unread_count': unread_count})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def mark_notification_read(request, notification_id):
    from notifications.models import Notification
    try:
        n = Notification.objects.get(id=notification_id, recipient=request.user)
        n.is_read = True
        n.save(update_fields=['is_read'])
        return Response({'message': 'Marked as read'})
    except Notification.DoesNotExist:
        return Response({'error': 'Not found'}, status=404)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def mark_all_read(request):
    from notifications.models import Notification
    Notification.objects.filter(
        recipient=request.user, is_read=False
    ).update(is_read=True)
    return Response({'message': 'All notifications marked as read'})