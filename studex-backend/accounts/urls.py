# accounts/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView
from . import views
from .views import SellerApplicationViewSet, ForgotPasswordView, ResetPasswordView
from .views import check_profile_completion

# Router for Seller Application endpoints
router = DefaultRouter()
router.register(r'seller/applications', SellerApplicationViewSet, basename='seller-application')

urlpatterns = [
    # Auth endpoints
    path('register/', views.register_user, name='register'),
    path('login/', views.login_user, name='login'),
    path('logout/', views.logout_user, name='logout'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),

    # Profile endpoints
    path('profile/', views.get_user_profile, name='profile'),
    path('profile/update/', views.update_user_profile, name='profile-update'),
    path('profile/check-completion/', check_profile_completion),
    path('forgot-password/', ForgotPasswordView.as_view(), name='forgot-password'),
    path('reset-password/', ResetPasswordView.as_view(), name='reset-password'),
    path('me/', views.me, name='me'),

    # Seller verification endpoints (via router)
    # Includes: /seller/applications/ (list/create)
    # And:      /seller/applications/{id}/approve/
    #           /seller/applications/{id}/reject/
    path('', include(router.urls)),
]