# services/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CategoryViewSet, ListingViewSet, TransactionViewSet  # ← Added TransactionViewSet

# Create router and register all viewsets
router = DefaultRouter()
router.register(r'categories', CategoryViewSet, basename='category')
router.register(r'listings', ListingViewSet, basename='listing')
router.register(r'transactions', TransactionViewSet, basename='transaction')  # ← NEW: Payouts API

urlpatterns = [
    path('', include(router.urls)),
]