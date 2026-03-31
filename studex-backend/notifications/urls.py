# notifications/urls.py
from django.urls import path
from . import views

urlpatterns = [
    # Real-time SSE stream — browser keeps this open permanently
    path('stream/', views.sse_stream, name='notification-stream'),

    # REST endpoints
    path('', views.my_notifications, name='my-notifications'),
    path('<int:notification_id>/read/', views.mark_notification_read, name='mark-read'),
    path('mark-all-read/', views.mark_all_read, name='mark-all-read'),
]