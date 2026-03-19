# wallet/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import WalletViewSet, BankAccountViewSet, EscrowViewSet, get_banks
from .webhooks import paystack_webhook

router = DefaultRouter()
router.register(r'', WalletViewSet, basename='wallet')        # was r'wallet' → now r''
router.register(r'escrow', EscrowViewSet, basename='escrow')

urlpatterns = [
    path('', include(router.urls)),
    path('bank-account/', BankAccountViewSet.as_view({         # was wallet/bank-account/ → now bank-account/
        'get': 'detail',
        'post': 'detail',
        'put': 'detail'
    }), name='bank-account'),
    path('banks/', get_banks, name='get-banks'),
    path('webhooks/paystack/', paystack_webhook, name='paystack-webhook'),
]