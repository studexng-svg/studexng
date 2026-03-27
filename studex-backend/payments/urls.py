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
    path("preview/", views.preview_price, name="preview-price"),   # ← NEW


    # Paystack webhook — register this URL in Paystack Dashboard → Settings → Webhooks
    # Full URL to enter: https://yourdomain.com/api/payments/webhook/
    path("webhook/", views.flutterwave_webhook, name="flutterwave-webhook"),
]