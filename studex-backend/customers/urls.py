# customers/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import VendorCustomerViewSet

router = DefaultRouter()
router.register(r'customers', VendorCustomerViewSet, basename='vendor-customer')

urlpatterns = [
    path('', include(router.urls)),
]
