# payments/urls.py
from django.urls import path
from . import views

urlpatterns = [
    path("seller/transactions/", views.seller_transactions, name="seller-transactions"),
    path("seller/bank-account/", views.seller_bank_account, name="seller-bank-account"),
    path("verify-bank-account/", views.verify_bank_account, name="verify-bank-account"),
    path("verify/", views.verify_payment, name="verify-payment"),
    path("refund/", views.refund_payment, name="refund-payment"),
    path("seller/earnings/", views.seller_earnings, name="seller-earnings"),

    # Flutterwave webhook — register this URL in Flutterwave Dashboard → Settings → Webhooks
    # Full URL to enter: https://studex-backend-v2.onrender.com/api/payments/webhook/
    path("webhook/", views.flutterwave_webhook, name="flutterwave-webhook"),
    path("check-status/", views.check_payment_status, name="check-payment-status"),
    path("banks/", views.get_banks, name="get-banks"),
    path("preview-price/", views.preview_price, name="preview-price"),
]