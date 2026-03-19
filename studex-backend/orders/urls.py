# orders/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import OrderViewSet, DisputeViewSet
from .views import BookingViewSet

router = DefaultRouter()
router.register(r'orders', OrderViewSet, basename='order')
router.register(r'disputes', DisputeViewSet, basename='dispute')
router.register(r'bookings', BookingViewSet, basename='booking')


urlpatterns = [
    path('', include(router.urls)),
]