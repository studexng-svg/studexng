# payments/models.py
from decimal import Decimal
from django.db import models
from django.conf import settings


class PricingSettings(models.Model):
    """
    Singleton (always pk=1, same pattern as notifications.PlatformSettings) holding
    the admin-configurable platform fee percentage. See payments/pricing.py for the
    one shared pricing service that reads this — nothing else should hardcode the rate.
    """
    service_fee_percent = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("8.00"))
    updated_at = models.DateTimeField(auto_now=True)

    @classmethod
    def get(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Pricing Settings (fee: {self.service_fee_percent}%)"


class SellerBankAccount(models.Model):
    """Stores seller's bank account for Paystack payouts."""
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="bank_account"
    )
    bank_code = models.CharField(max_length=20)
    bank_name = models.CharField(max_length=100)
    account_number = models.CharField(max_length=20)
    account_name = models.CharField(max_length=200)
    # Paystack subaccount code — format: ACCT_xxxxxxxxxx (kept for backwards compatibility)
    paystack_subaccount_code = models.CharField(max_length=100, blank=True, null=True)
    # Paystack transfer recipient code — format: RCP_xxx (used for instant vendor payouts)
    paystack_recipient_code = models.CharField(max_length=100, blank=True, null=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.username} - {self.bank_name} {self.account_number}"


class PaymentTransaction(models.Model):
    """
    Logs every payment for audit and refund tracking.

    Pricing model:
    ─────────────────────────────────────
    buyer pays:  listing_price + service_charge - discount_amount
    vendor gets: listing_price (their full price, paid by StudEx manually)
    platform keeps: service_charge - discount_amount (min ₦0)

    service_charge: 8% of listing price (covers platform margin + Paystack processing fee), minimum ₦100, maximum ₦3,500.
    discount_amount: profile-completion 5% discount applied to listing price.
                     Comes entirely from the platform fee — vendor is unaffected.
    paystack_charge_fee: Paystack's inbound processing fee absorbed by StudEx (1.5% + ₦100 flat if checkout ≥ ₦2,500).
    transfer_fee: Paystack's outbound transfer fee charged to StudEx when paying vendor (₦10/₦25/₦50 by tier).
    net_platform_amount (computed): service_charge - discount_amount - paystack_charge_fee - transfer_fee = actual cash profit.
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

    # Paystack transaction ID — used for refunds
    paystack_transaction_id = models.BigIntegerField(null=True, blank=True)

    # Amount buyer actually paid (listing_price + service_charge - discount), in naira
    amount = models.DecimalField(max_digits=12, decimal_places=2)

    # Vendor's full listing price — what StudEx owes the vendor
    seller_amount = models.DecimalField(max_digits=12, decimal_places=2)

    # 8% service charge (min ₦50, max ₦3,500) — set explicitly on every new record
    service_charge = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    # Discount applied from platform fee (5% of listing price, capped at service_charge)
    # Vendor is NOT affected — discount comes from platform revenue only
    discount_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    # Net platform revenue = service_charge - discount_amount
    platform_amount = models.DecimalField(max_digits=12, decimal_places=2)

    # Total deal discount applied at checkout (vendor absorbs this — they receive deal price, not full price)
    deal_discount_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    # Paystack inbound charge fee StudEx absorbed (1.5% + ₦100 flat if checkout ≥ ₦2,500, max ₦2,000)
    paystack_charge_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    # Paystack outbound transfer fee deducted from StudEx balance when paying vendor (₦10/₦25/₦50)
    transfer_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    order_type = models.CharField(max_length=20, choices=ORDER_TYPE_CHOICES, default="product")

    buyer_email = models.EmailField()
    buyer_name = models.CharField(max_length=200, blank=True)
    order_id = models.IntegerField(null=True, blank=True)

    paystack_response = models.JSONField(null=True, blank=True)

    # Populated after a Transfer API call to pay out the vendor
    transfer_reference = models.CharField(max_length=200, blank=True, null=True)
    transfer_status = models.CharField(max_length=50, blank=True, null=True)
    transfer_retry_count = models.IntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.reference} - ₦{self.amount} ({self.status})"
