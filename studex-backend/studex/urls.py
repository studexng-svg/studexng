# studex/urls.py
from django.http import JsonResponse

from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static  # ← NEW: Import for media serving

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/', include('accounts.urls')),      # Auth endpoints (login, register, profile)
    path('api/admin/', include('accounts.admin_urls')),  # Admin-only endpoints (dashboard, user management)
    path('api/services/', include('services.urls')),  # Services endpoints (categories, listings)
    path('api/orders/', include('orders.urls')),      # Orders endpoints
    path('api/payments/', include('payments.urls')),   # payment endpoints
    path('api/chat/', include('chat.urls')),         # Chat/messaging endpoints
    path('api/reviews/', include('reviews.urls')),
    path('api/loyalty/', include('loyalty.urls')),
    path('api/notifications/', include('notifications.urls')),
]

# ← NEW: Serve media files during development (DEBUG = True)
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)