# notifications/views.py
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def my_notifications(request):
    from notifications.models import Notification
    notifications = Notification.objects.filter(
        recipient=request.user
    ).order_by('-created_at')[:50]

    data = [{
        'id': n.id,
        'type': n.notification_type,
        'title': n.title,
        'message': n.message,
        'is_read': n.is_read,
        'action_url': n.action_url,
        'created_at': n.created_at.isoformat(),
    } for n in notifications]

    unread_count = Notification.objects.filter(recipient=request.user, is_read=False).count()
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
    Notification.objects.filter(recipient=request.user, is_read=False).update(is_read=True)
    return Response({'message': 'All notifications marked as read'})