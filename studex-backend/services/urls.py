# services/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CategoryViewSet, ListingViewSet, TransactionViewSet
from .views import ChangePasswordView

router = DefaultRouter()
router.register(r'categories', CategoryViewSet, basename='category')
router.register(r'listings', ListingViewSet, basename='listing')
router.register(r'transactions', TransactionViewSet, basename='transaction')


urlpatterns = [
    path('', include(router.urls)),
    path('auth/change-password/', ChangePasswordView.as_view(), name='change-password'),
]