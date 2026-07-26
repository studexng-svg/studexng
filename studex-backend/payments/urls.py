# payments/urls.py
from django.urls import path
from . import views

urlpatterns = [
    path("initialize/", views.initialize_payment, name="initialize-payment"),
    # Phase 1 — Food Commerce Engine, Step 3: vendor-scoped multi-item cart checkout.
    path("initialize-cart/", views.initialize_cart_payment, name="initialize-cart-payment"),
    path("verify-cart/", views.verify_cart_payment, name="verify-cart-payment"),
    path("seller/transactions/", views.seller_transactions, name="seller-transactions"),
    path("seller/bank-account/", views.seller_bank_account, name="seller-bank-account"),
    path("verify-bank-account/", views.verify_bank_account, name="verify-bank-account"),
    path("verify/", views.verify_payment, name="verify-payment"),
    path("refund/", views.refund_payment, name="refund-payment"),
    path("seller/earnings/", views.seller_earnings, name="seller-earnings"),

    # Paystack webhook — register this URL in Paystack Dashboard → Settings → Webhooks
    # Full URL to enter: https://studex-backend-v2.onrender.com/api/payments/webhook/
    path("webhook/", views.paystack_webhook, name="paystack-webhook"),
    path("check-status/", views.check_payment_status, name="check-payment-status"),
    path("banks/", views.get_banks, name="get-banks"),
    path("preview-price/", views.preview_price, name="preview-price"),
    path("preview-addon-price/", views.preview_addon_price, name="preview-addon-price"),
    path("pay-with-credits/", views.pay_with_credits, name="pay-with-credits"),
]