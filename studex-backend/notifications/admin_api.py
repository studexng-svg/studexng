from django.contrib.admin.views.decorators import staff_member_required
from django.http import JsonResponse
from django.utils.timezone import now
from django.views.decorators.http import require_POST

from .models import Notification


def _time_ago(dt):
    diff = now() - dt
    s = int(diff.total_seconds())
    if s < 60:
        return 'just now'
    if s < 3600:
        return f'{s // 60}m ago'
    if s < 86400:
        return f'{s // 3600}h ago'
    return f'{s // 86400}d ago'


@staff_member_required
def admin_notifications(request):
    qs = Notification.objects.filter(
        is_admin_notification=True,
        recipient__isnull=True,
    ).order_by('-created_at')[:30]

    unread_count = Notification.objects.filter(
        is_admin_notification=True,
        recipient__isnull=True,
        is_read=False,
    ).count()

    return JsonResponse({
        'unread_count': unread_count,
        'notifications': [
            {
                'id': n.pk,
                'type': n.notification_type,
                'title': n.title,
                'message': n.message,
                'is_read': n.is_read,
                'action_url': n.action_url or '',
                'time_ago': _time_ago(n.created_at),
            }
            for n in qs
        ],
    })


@staff_member_required
@require_POST
def mark_notifications_read(request, notification_id=None):
    qs = Notification.objects.filter(
        is_admin_notification=True,
        recipient__isnull=True,
        is_read=False,
    )
    if notification_id:
        qs = qs.filter(pk=notification_id)
    qs.update(is_read=True)
    return JsonResponse({'status': 'ok'})
