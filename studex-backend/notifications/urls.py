# notifications/urls.py
from django.urls import path
from . import views

urlpatterns = [
    path('', views.my_notifications, name='my-notifications'),
    path('<int:notification_id>/read/', views.mark_notification_read, name='mark-read'),
    path('read-all/', views.mark_all_read, name='mark-all-read'),
]