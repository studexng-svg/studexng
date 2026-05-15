# studex/urls.py
import os
from django.http import JsonResponse
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from services.views import WalletBalanceView
from notifications.admin_api import admin_notifications, mark_notifications_read


def maintenance_check(request):
    is_maintenance = os.environ.get("MAINTENANCE_MODE", "false").lower() == "true"
    return JsonResponse({
        "maintenance": is_maintenance,
        "message": os.environ.get("MAINTENANCE_MESSAGE", "We're upgrading StudEx for you. We'll be back shortly."),
    })


urlpatterns = [
    path('api/health/maintenance/', maintenance_check, name='maintenance-check'),
    path('studex-ops/', admin.site.urls),
    path('api/auth/', include('accounts.urls')),
    path('api/admin/', include('accounts.admin_urls')),
    path('api/services/', include('services.urls')),
    path('api/orders/', include('orders.urls')),
    path('api/payments/', include('payments.urls')),
    path('api/chat/', include('chat.urls')),
    path('api/reviews/', include('reviews.urls')),
    path('api/loyalty/', include('loyalty.urls')),
    path('api/notifications/', include('notifications.urls')),
    path('api/cart/', include('cart.urls')),
    path('api/wishlist/', include('wishlist.urls')),
    path('api/wallet/balance/', WalletBalanceView.as_view(), name='wallet-balance'),

    # Admin notification bell
    path('api/admin-notifications/', admin_notifications, name='admin-notifications'),
    path('api/admin-notifications/mark-read/', mark_notifications_read, name='admin-notifications-mark-all'),
    path('api/admin-notifications/mark-read/<int:notification_id>/', mark_notifications_read, name='admin-notifications-mark-one'),
]

# ← NEW: Serve media files during development (DEBUG = True)
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)