# services/models.py
from django.db import models
from django.contrib.auth import get_user_model

User = get_user_model()

class Category(models.Model):
    title = models.CharField(max_length=100, unique=True)
    slug = models.SlugField(max_length=100, unique=True)
    image = models.ImageField(upload_to='categories/', blank=True, null=True)

    def __str__(self):
        return self.title

    class Meta:
        verbose_name_plural = "Categories"
        ordering = ['title']


class Listing(models.Model):
    """Product or service posted by a verified vendor"""
    vendor = models.ForeignKey(User, on_delete=models.CASCADE, related_name='listings')
    category = models.ForeignKey(Category, on_delete=models.CASCADE, related_name='listings')
    title = models.CharField(max_length=200, help_text="e.g., Jollof Rice + Chicken, Gel Nails")
    description = models.TextField(help_text="Full description of the product/service")
    price = models.DecimalField(max_digits=10, decimal_places=2, help_text="Price in NGN")
    image = models.ImageField(upload_to='listings/', blank=True, null=True, help_text="Main product image")
    is_available = models.BooleanField(default=True, help_text="Uncheck if sold out or paused")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.title} by {self.vendor.username}"

    class Meta:
        verbose_name = "Product/Service Listing"
        verbose_name_plural = "Product/Service Listings"
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['category']),
            models.Index(fields=['is_available']),
            models.Index(fields=['vendor']),
        ]


# NEW: Transaction model for payouts — now linked to Order
class Transaction(models.Model):
    STATUS_CHOICES = (
        ('in_escrow', 'In Escrow'),
        ('released', 'Released to Wallet'),
        ('withdrawn', 'Withdrawn to Bank'),
    )

    vendor = models.ForeignKey(User, on_delete=models.CASCADE, related_name='transactions')
    order = models.OneToOneField(
        'orders.Order',  # ← String reference to avoid circular import
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='transaction'
    )
    amount = models.DecimalField(max_digits=10, decimal_places=2, help_text="Amount in NGN")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='in_escrow')
    created_at = models.DateTimeField(auto_now_add=True)
    released_at = models.DateTimeField(null=True, blank=True)
    withdrawn_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"₦{self.amount} - {self.get_status_display()} ({self.vendor.username})"

    class Meta:
        verbose_name = "Payout Transaction"
        verbose_name_plural = "Payout Transactions"
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['vendor']),
            models.Index(fields=['status']),
        ]