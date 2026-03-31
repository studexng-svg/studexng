# notifications/views.py
import json
import time
import threading
from django.http import StreamingHttpResponse
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import AccessToken
from rest_framework_simplejwt.exceptions import TokenError


# ─── In-memory SSE subscriber registry ───────────────────────────────────────
# Maps user_id → list of queue objects (one per open browser tab/connection)
# Thread-safe because Python's GIL protects dict operations, and we use a lock
# for the list mutations.

_subscribers: dict[int, list] = {}
_lock = threading.Lock()


def _add_subscriber(user_id: int, queue: list):
    with _lock:
        if user_id not in _subscribers:
            _subscribers[user_id] = []
        _subscribers[user_id].append(queue)


def _remove_subscriber(user_id: int, queue: list):
    with _lock:
        if user_id in _subscribers:
            try:
                _subscribers[user_id].remove(queue)
            except ValueError:
                pass
            if not _subscribers[user_id]:
                del _subscribers[user_id]


def push_notification_to_user(user_id: int, payload: dict):
    """
    Call this from anywhere in Django to instantly push a notification
    to all open browser tabs for a given user via SSE.
    payload should be a dict that matches the notification shape the
    frontend expects: {id, type, title, message, action_url, created_at}
    """
    with _lock:
        queues = list(_subscribers.get(user_id, []))

    data = f"data: {json.dumps(payload)}\n\n"
    for q in queues:
        q.append(data)


# ─── SSE Stream Endpoint ──────────────────────────────────────────────────────

def sse_stream(request):
    """
    GET /api/notifications/stream/?token=<access_token>

    Server-Sent Events endpoint. The browser opens ONE persistent connection
    here and receives push events in real time — exactly like how Claude
    streams its responses. Auth is via query param because EventSource API
    in browsers cannot send custom headers.
    """
    # Authenticate via token query param (SSE can't set headers)
    token_str = request.GET.get("token", "")
    if not token_str:
        def denied():
            yield "data: {\"error\": \"unauthorized\"}\n\n"
        return StreamingHttpResponse(denied(), content_type="text/event-stream", status=401)

    try:
        token = AccessToken(token_str)
        user_id = token["user_id"]
    except (TokenError, KeyError):
        def denied():
            yield "data: {\"error\": \"invalid_token\"}\n\n"
        return StreamingHttpResponse(denied(), content_type="text/event-stream", status=401)

    # Each connection gets its own event queue (a plain list used as a buffer)
    queue = []
    _add_subscriber(user_id, queue)

    # Send any unread notifications immediately on connect
    try:
        from notifications.models import Notification
        unread = Notification.objects.filter(
            recipient_id=user_id, is_read=False
        ).order_by("-created_at")[:10]
        for n in unread:
            queue.append(f"data: {json.dumps(_serialize_notification(n))}\n\n")
    except Exception:
        pass

    def event_generator():
        try:
            # Send a heartbeat comment every 25s to keep the connection alive
            # (Render, Cloudflare, nginx all close idle connections after ~30s)
            last_heartbeat = time.time()

            while True:
                # Drain queue
                while queue:
                    yield queue.pop(0)

                # Heartbeat
                now = time.time()
                if now - last_heartbeat >= 25:
                    yield ": heartbeat\n\n"
                    last_heartbeat = now

                time.sleep(0.3)  # poll interval — 300ms latency max

        except GeneratorExit:
            pass
        finally:
            _remove_subscriber(user_id, queue)

    response = StreamingHttpResponse(
        event_generator(),
        content_type="text/event-stream",
    )
    response["Cache-Control"] = "no-cache"
    response["X-Accel-Buffering"] = "no"   # tells nginx not to buffer SSE
    response["Access-Control-Allow-Origin"] = "*"
    return response


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


# ─── REST endpoints ───────────────────────────────────────────────────────────

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
        n.save()
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