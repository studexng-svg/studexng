# loyalty/urls.py
from django.urls import path
from . import views

urlpatterns = [
    path('status/', views.loyalty_status, name='loyalty-status'),
    path('repeat-check/', views.repeat_booking_check, name='repeat-check'),
    path('earn/', views.earn_points, name='earn-points'),
]