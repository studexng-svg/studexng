# services/models.py
from django.db import models
from django.contrib.auth import get_user_model
from studex.validators import validate_image

User = get_user_model()


class Category(models.Model):
    title = models.CharField(max_length=100, unique=True)
    slug = models.SlugField(max_length=100, unique=True)
    image = models.ImageField(
        upload_to='categories/',
        blank=True, null=True,
        validators=[validate_image]
    )

    def __str__(self):
        return self.title

    class Meta:
        verbose_name_plural = "Categories"
        ordering = ['title']


class Listing(models.Model):
    """Product or service posted by a verified vendor"""

    LISTING_TYPE_CHOICES = (
        ('service', 'Service'),
        ('product', 'Product'),
        ('food', 'Food'),
    )

    vendor = models.ForeignKey(User, on_delete=models.CASCADE, related_name='listings')
    category = models.ForeignKey(Category, on_delete=models.CASCADE, related_name='listings')
    title = models.CharField(max_length=200)
    description = models.TextField()
    price = models.DecimalField(max_digits=10, decimal_places=2)
    listing_type = models.CharField(
        max_length=10,
        choices=LISTING_TYPE_CHOICES,
        default='service',
        help_text="Type of listing — affects inventory tracking"
    )
    image = models.ImageField(
        upload_to='listings/',
        blank=True, null=True,
        validators=[validate_image]
    )
    is_available = models.BooleanField(
        default=False,
        help_text="Admin must tick this to make listing visible in shop"
    )

    # ── Inventory (for food/product vendors) ──────────────────────────────────
    track_inventory = models.BooleanField(
        default=False,
        help_text="Enable stock tracking (recommended for food and physical products)"
    )
    stock_quantity = models.PositiveIntegerField(
        default=0,
        help_text="Current stock. Auto-marks unavailable when it reaches 0."
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.title} by {self.vendor.username}"

    def reduce_stock(self, quantity=1):
        """
        Called when an order is placed. Reduces stock and auto-deactivates
        the listing if stock hits zero. Notifies vendor if sold out.
        """
        if not self.track_inventory:
            return
        self.stock_quantity = max(0, self.stock_quantity - quantity)
        sold_out = self.stock_quantity == 0
        if sold_out:
            self.is_available = False
        self.save()
        if sold_out:
            try:
                from notifications.models import Notification
                Notification.objects.create(
                    recipient=self.vendor,
                    notification_type='new_listing',
                    title=f'⚠️ "{self.title}" is sold out!',
                    message=(
                        f'Your listing "{self.title}" has sold out and has been automatically '
                        f'marked as unavailable. Restock and update your quantity to make it live again.'
                    ),
                    action_url='/vendor/dashboard',
                )
            except Exception:
                pass

    def restock(self, quantity):
        """Called when vendor restocks. Re-activates listing if it was out of stock."""
        if not self.track_inventory:
            return
        self.stock_quantity += quantity
        if self.stock_quantity > 0 and not self.is_available:
            self.is_available = True
        self.save()

    class Meta:
        verbose_name = "Product/Service Listing"
        verbose_name_plural = "Product/Service Listings"
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['category']),
            models.Index(fields=['is_available']),
            models.Index(fields=['vendor']),
            models.Index(fields=['listing_type']),
        ]


class Transaction(models.Model):
    STATUS_CHOICES = (
        ('in_escrow', 'In Escrow'),
        ('released', 'Released to Wallet'),
        ('withdrawn', 'Withdrawn to Bank'),
    )

    vendor = models.ForeignKey(User, on_delete=models.CASCADE, related_name='transactions')
    order = models.OneToOneField(
        'orders.Order',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='transaction'
    )
    amount = models.DecimalField(max_digits=10, decimal_places=2)
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