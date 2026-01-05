# wallet/models.py
from django.db import models
from django.contrib.auth import get_user_model

User = get_user_model()

class Wallet(models.Model):
    """User's wallet with balance and account details"""
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='wallet')
    balance = models.DecimalField(max_digits=15, decimal_places=2, default=0.00)
    
    # For Paystack/payment gateway
    account_number = models.CharField(max_length=20, blank=True, null=True)
    bank_code = models.CharField(max_length=10, blank=True, null=True)
    bank_name = models.CharField(max_length=100, blank=True, null=True)
    account_holder_name = models.CharField(max_length=200, blank=True, null=True)
    
    # For blockchain (we'll add contract address later)
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
    
    # Payment reference (from Paystack, bank transfer, etc.)
    reference = models.CharField(max_length=255, blank=True, null=True, unique=True)
    
    # Blockchain tx hash
    blockchain_tx_hash = models.CharField(max_length=255, blank=True, null=True)
    
    # Related order (if payment for order)
    order = models.ForeignKey('orders.Order', on_delete=models.SET_NULL, null=True, blank=True, related_name='wallet_transactions')
    
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


class EscrowTransaction(models.Model):
    """Escrow for order payments"""
    STATUS_CHOICES = [
        ('held', 'Held in Escrow'),
        ('released_to_seller', 'Released to Seller'),
        ('refunded', 'Refunded to Buyer'),
        ('disputed', 'Under Dispute'),
    ]

    order = models.OneToOneField('orders.Order', on_delete=models.CASCADE, related_name='escrow')
    buyer = models.ForeignKey(User, on_delete=models.CASCADE, related_name='escrow_as_buyer')
    seller = models.ForeignKey(User, on_delete=models.CASCADE, related_name='escrow_as_seller')
    
    # Amounts
    total_amount = models.DecimalField(max_digits=15, decimal_places=2)  # Amount buyer pays
    seller_amount = models.DecimalField(max_digits=15, decimal_places=2)  # What seller gets (after our cut)
    platform_fee = models.DecimalField(max_digits=15, decimal_places=2)  # Our cut
    
    status = models.CharField(max_length=50, choices=STATUS_CHOICES, default='held')
    
    # Blockchain details
    blockchain_contract_address = models.CharField(max_length=255, blank=True, null=True)
    blockchain_tx_hash = models.CharField(max_length=255, blank=True, null=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    released_at = models.DateTimeField(null=True, blank=True)
    refunded_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"Escrow - Order {self.order.id} - {self.status}"

    class Meta:
        verbose_name = "Escrow Transaction"
        verbose_name_plural = "Escrow Transactions"
        indexes = [
            models.Index(fields=['buyer', 'seller']),
            models.Index(fields=['status']),
        ]


class BankAccount(models.Model):
    """Bank accounts for withdrawal (for Paystack/bank transfers)"""
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='bank_account')
    account_number = models.CharField(max_length=20)
    bank_code = models.CharField(max_length=10)
    bank_name = models.CharField(max_length=100)
    account_holder_name = models.CharField(max_length=200)
    is_verified = models.BooleanField(default=False)
    
    # Paystack recipient code for transfers
    paystack_recipient_code = models.CharField(max_length=255, blank=True, null=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.username} - {self.account_number}"

    class Meta:
        verbose_name = "Bank Account"
        verbose_name_plural = "Bank Accounts"