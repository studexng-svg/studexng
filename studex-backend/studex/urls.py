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


# ─────────────────────────────────────────────────────────────────────────────
# API versioning (Blocker 7 — Phase 0 Architecture Hardening)
#
# Every endpoint below is registered under BOTH `api/` (legacy, unversioned —
# kept permanently for the web frontend and mobile app already hardcoded to
# these paths) and `api/v1/` (canonical, versioned — the path new client
# work should target). Both prefixes resolve to the exact same view
# classes/functions via the same `api_patterns` list: this is a pure
# additive routing change, not a behavior change. v1 is not a fork of
# today's behavior — it *is* today's behavior, reachable under a name that
# can be safely superseded later without breaking anyone already on it.
#
# When a future change needs to break the v1 contract, add a new `api/v2/`
# block pointing at whatever new views/serializers that needs, and leave
# `api/` + `api/v1/` untouched — clients on either path never see the
# break. `api/` is a permanent alias, not a deprecated path with a removal
# date — do not remove it.
# ─────────────────────────────────────────────────────────────────────────────

api_patterns = [
    path('auth/', include('accounts.urls')),
    path('admin/', include('accounts.admin_urls')),
    path('services/', include('services.urls')),
    path('orders/', include('orders.urls')),
    path('payments/', include('payments.urls')),
    path('chat/', include('chat.urls')),
    path('reviews/', include('reviews.urls')),
    path('loyalty/', include('loyalty.urls')),
    path('notifications/', include('notifications.urls')),
    path('cart/', include('cart.urls')),
    path('wishlist/', include('wishlist.urls')),
    path('delivery/', include('delivery.urls')),
    path('vendor/', include('customers.urls')),
    path('wallet/balance/', WalletBalanceView.as_view(), name='wallet-balance'),

    # Admin notification bell
    path('admin-notifications/', admin_notifications, name='admin-notifications'),
    path('admin-notifications/mark-read/', mark_notifications_read, name='admin-notifications-mark-all'),
    path('admin-notifications/mark-read/<int:notification_id>/', mark_notifications_read, name='admin-notifications-mark-one'),
]

urlpatterns = [
    path('api/health/maintenance/', maintenance_check, name='maintenance-check'),
    path('studex-portal-9f3a2/', admin.site.urls),

    path('api/', include(api_patterns)),      # legacy unversioned alias — permanent, never remove
    path('api/v1/', include(api_patterns)),   # canonical versioned path — target this for new work
]

# ← NEW: Serve media files during development (DEBUG = True)
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)