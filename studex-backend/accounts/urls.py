from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView
from . import views
from .views import SellerApplicationViewSet, ForgotPasswordView, ResetPasswordView
from .views import check_profile_completion, check_username, send_otp, verify_otp
from .views import VendorDetailView, cookie_token_refresh, heartbeat

# Router for Seller Application endpoints
router = DefaultRouter()
router.register(r'seller/applications', SellerApplicationViewSet, basename='seller-application')

urlpatterns = [
    # Auth endpoints
    path('register/', views.register_user, name='register'),
    path('login/', views.login_user, name='login'),
    path('logout/', views.logout_user, name='logout'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('token/cookie-refresh/', cookie_token_refresh, name='cookie_token_refresh'),

    # ✅ Username availability check — used by signup form
    path('check-username/', check_username, name='check-username'),

    # OTP email verification — used by signup flow
    path('send-otp/', send_otp, name='send-otp'),
    path('verify-otp/', verify_otp, name='verify-otp'),

    # Profile endpoints
    path('profile/', views.get_user_profile, name='profile'),
    path('profile/update/', views.update_user_profile, name='profile-update'),
    path('profile/check-completion/', check_profile_completion),
    path('forgot-password/', ForgotPasswordView.as_view(), name='forgot-password'),
    path('reset-password/', ResetPasswordView.as_view(), name='reset-password'),
    path('me/', views.me, name='me'),
    path('heartbeat/', heartbeat, name='heartbeat'),

    # Seller verification endpoints (via router)
    # Generates:
    #   GET/POST   /api/auth/seller/applications/
    #   GET        /api/auth/seller/applications/{id}/
    #   POST       /api/auth/seller/applications/{id}/approve/
    #   POST       /api/auth/seller/applications/{id}/reject/
    #   POST       /api/auth/seller/applications/revoke/{user_id}/
    path('', include(router.urls)),

    # Public vendor list + detail
    path('vendors/', views.VendorListView.as_view(), name='vendor-list'),
    path('vendors/<str:username>/', VendorDetailView.as_view(), name='vendor-detail'),
]