# studex/urls.py
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static  # ← NEW: Import for media serving

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/', include('accounts.urls')),  # Auth endpoints
    path('api/', include('services.urls')),       # Services endpoints (categories, etc.)
    path('api/', include('orders.urls')),
]

# ← NEW: Serve media files during development (DEBUG = True)
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)