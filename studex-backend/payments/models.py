

# Create your models here.
# payments/models.py
from django.db import models
from django.conf import settings


class SellerBankAccount(models.Model):
    """Stores seller's bank account for Paystack subaccount and payouts."""
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="bank_account")
    bank_code = models.CharField(max_length=20)
    bank_name = models.CharField(max_length=100)
    account_number = models.CharField(max_length=20)
    account_name = models.CharField(max_length=200)
    # Paystack registers each seller as a subaccount for split payments
    paystack_subaccount_code = models.CharField(max_length=100, blank=True, null=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.username} - {self.bank_name} {self.account_number}"


class PaymentTransaction(models.Model):
    """Logs every payment for refund tracking and audit."""
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

    buyer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="payments")
    seller = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="received_payments")
    reference = models.CharField(max_length=200, unique=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    seller_amount = models.DecimalField(max_digits=12, decimal_places=2)   # 70%
    platform_amount = models.DecimalField(max_digits=12, decimal_places=2) # 30%
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    order_type = models.CharField(max_length=20, choices=ORDER_TYPE_CHOICES, default="product")

    # Buyer details stored for refund (Paystack refunds back to original method automatically)
    buyer_email = models.EmailField()
    buyer_name = models.CharField(max_length=200, blank=True)

    # Linked order (set after order creation)
    order_id = models.IntegerField(null=True, blank=True)

    # Paystack data
    paystack_response = models.JSONField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.reference} - ₦{self.amount} ({self.status})"