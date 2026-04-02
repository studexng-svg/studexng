# notifications/urls.py
from django.urls import path
from . import views

urlpatterns = [
    # Single batched endpoint — replaces SSE + 6 separate account page calls
    # Frontend polls this every 30 seconds
    path('status/', views.account_status, name='account-status'),

    # Standard notification REST endpoints
    path('', views.my_notifications, name='my-notifications'),
    path('<int:notification_id>/read/', views.mark_notification_read, name='mark-read'),
    path('read-all/', views.mark_all_read, name='mark-all-read'),
]