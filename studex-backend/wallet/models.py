# wallet/models.py
from django.db import models
from django.contrib.auth import get_user_model

User = get_user_model()


class Wallet(models.Model):
    """User's wallet — balance and linked bank info for display purposes only.
    Actual payments and payouts are handled by Flutterwave."""
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='wallet')
    balance = models.DecimalField(max_digits=15, decimal_places=2, default=0.00)

    account_number = models.CharField(max_length=20, blank=True, null=True)
    bank_code = models.CharField(max_length=10, blank=True, null=True)
    bank_name = models.CharField(max_length=100, blank=True, null=True)
    account_holder_name = models.CharField(max_length=200, blank=True, null=True)

    blockchain_address = models.CharField(max_length=255, blank=True, null=True, unique=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.username}'s Wallet - Balance: ₦{self.balance}"

    class Meta:
        verbose_name = "User Wallet"
        verbose_name_plural = "User Wallets"


class WalletTransaction(models.Model):
    TRANSACTION_TYPE = [
        ('credit', 'Credit'),
        ('debit', 'Debit'),
    ]
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('success', 'Success'),
        ('failed', 'Failed'),
    ]

    wallet = models.ForeignKey(Wallet, on_delete=models.CASCADE, related_name='transactions')
    type = models.CharField(max_length=20, choices=TRANSACTION_TYPE)
    amount = models.DecimalField(max_digits=15, decimal_places=2)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    description = models.CharField(max_length=255)

    # Payment reference (from Flutterwave or bank transfer)
    reference = models.CharField(max_length=255, blank=True, null=True, unique=True)

    blockchain_tx_hash = models.CharField(max_length=255, blank=True, null=True)

    order = models.ForeignKey(
        'orders.Order', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='wallet_transactions'
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.wallet.user.username} - {self.type} ₦{self.amount}"

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['wallet', '-created_at']),
            models.Index(fields=['status']),
        ]


# ── ESCROW IS DEPRECATED ────────────────────────────────────────────────────
# EscrowTransaction is kept here only to avoid breaking existing migrations.
# It is no longer created anywhere in the codebase.
# Flutterwave handles split payments and vendor payouts directly.
# You can safely delete this model and run a migration once you've confirmed
# there are no rows in the escrowtransaction table:
#   python manage.py dbshell
#   SELECT COUNT(*) FROM wallet_escrowtransaction;
# ────────────────────────────────────────────────────────────────────────────
class EscrowTransaction(models.Model):
    STATUS_CHOICES = [
        ('held', 'Held'),
        ('released_to_seller', 'Released to Seller'),
        ('refunded', 'Refunded to Buyer'),
        ('disputed', 'Under Dispute'),
    ]

    order = models.OneToOneField('orders.Order', on_delete=models.CASCADE, related_name='escrow')
    buyer = models.ForeignKey(User, on_delete=models.CASCADE, related_name='escrow_as_buyer')
    seller = models.ForeignKey(User, on_delete=models.CASCADE, related_name='escrow_as_seller')

    total_amount = models.DecimalField(max_digits=15, decimal_places=2)
    seller_amount = models.DecimalField(max_digits=15, decimal_places=2)
    platform_fee = models.DecimalField(max_digits=15, decimal_places=2)

    status = models.CharField(max_length=50, choices=STATUS_CHOICES, default='held')

    blockchain_contract_address = models.CharField(max_length=255, blank=True, null=True)
    blockchain_tx_hash = models.CharField(max_length=255, blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)
    released_at = models.DateTimeField(null=True, blank=True)
    refunded_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"[DEPRECATED] Escrow - Order {self.order.id} - {self.status}"

    class Meta:
        verbose_name = "Escrow Transaction (Deprecated)"
        verbose_name_plural = "Escrow Transactions (Deprecated)"


# ── BANK ACCOUNT IS DEPRECATED ──────────────────────────────────────────────
# This model is superseded by payments.SellerBankAccount which stores the
# Flutterwave subaccount ID. Kept here only to avoid breaking migrations.
# ────────────────────────────────────────────────────────────────────────────
class BankAccount(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='bank_account')
    account_number = models.CharField(max_length=20)
    bank_code = models.CharField(max_length=10)
    bank_name = models.CharField(max_length=100)
    account_holder_name = models.CharField(max_length=200)
    is_verified = models.BooleanField(default=False)

    # Legacy field — no longer used. Flutterwave subaccount is in payments.SellerBankAccount
    flw_recipient_code = models.CharField(max_length=255, blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"[DEPRECATED] {self.user.username} - {self.account_number}"

    class Meta:
        verbose_name = "Bank Account (Deprecated)"
        verbose_name_plural = "Bank Accounts (Deprecated)"