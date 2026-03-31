# payments/models.py
from django.db import models
from django.conf import settings


class SellerBankAccount(models.Model):
    """Stores seller's bank account for Flutterwave payouts."""
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="bank_account"
    )
    bank_code = models.CharField(max_length=20)
    bank_name = models.CharField(max_length=100)
    account_number = models.CharField(max_length=20)
    account_name = models.CharField(max_length=200)
    # Flutterwave subaccount ID — kept for reference but no longer used for splits
    flw_subaccount_id = models.CharField(max_length=100, blank=True, null=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.username} - {self.bank_name} {self.account_number}"


class PaymentTransaction(models.Model):
    """
    Logs every payment for audit and refund tracking.

    New pricing model (NO split payments):
    ─────────────────────────────────────
    buyer pays:  listing_price + service_charge (₦200) - discount_amount
    vendor gets: listing_price (their full price, paid by StudEx manually)
    platform keeps: service_charge - discount_amount (min ₦0)

    discount_amount: profile-completion 5% discount, capped at service_charge (₦200).
                     Comes entirely from the platform fee — vendor is unaffected.
    """
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("success", "Success"),
        ("failed", "Failed"),
        ("refunded", "Refunded"),
    ]
    ORDER_TYPE_CHOICES = [
        ("product", "Product"),
        ("service", "Service"),
    ]

    buyer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, related_name="payments"
    )
    seller = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, related_name="received_payments"
    )
    reference = models.CharField(max_length=200, unique=True)

    # Flutterwave's numeric transaction ID — required for refunds
    flw_transaction_id = models.BigIntegerField(null=True, blank=True)

    # Amount buyer actually paid (listing_price + service_charge - discount)
    amount = models.DecimalField(max_digits=12, decimal_places=2)

    # Vendor's full listing price — what StudEx owes the vendor
    seller_amount = models.DecimalField(max_digits=12, decimal_places=2)

    # ₦200 flat service charge added to every booking
    service_charge = models.DecimalField(max_digits=10, decimal_places=2, default=200)

    # Discount applied from platform fee (5% of listing price, capped at service_charge)
    # Vendor is NOT affected — discount comes from platform revenue only
    discount_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    # Net platform revenue = service_charge - discount_amount
    platform_amount = models.DecimalField(max_digits=12, decimal_places=2)

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    order_type = models.CharField(max_length=20, choices=ORDER_TYPE_CHOICES, default="product")

    buyer_email = models.EmailField()
    buyer_name = models.CharField(max_length=200, blank=True)
    order_id = models.IntegerField(null=True, blank=True)

    flw_response = models.JSONField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.reference} - ₦{self.amount} ({self.status})"