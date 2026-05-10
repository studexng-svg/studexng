# studex/urls.py
from django.http import JsonResponse

from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from services.views import WalletBalanceView

urlpatterns = [
    path('admin/', admin.site.urls),
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
]

# ← NEW: Serve media files during development (DEBUG = True)
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)