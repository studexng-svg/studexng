# orders/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import OrderViewSet, DisputeViewSet

router = DefaultRouter()
router.register(r'orders', OrderViewSet, basename='order')
router.register(r'disputes', DisputeViewSet, basename='dispute')

urlpatterns = [
    path('', include(router.urls)),
]