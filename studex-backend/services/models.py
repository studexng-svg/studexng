# services/models.py
from django.db import models
from django.contrib.auth import get_user_model

User = get_user_model()


class Category(models.Model):
    title = models.CharField(max_length=100, unique=True)
    slug = models.SlugField(max_length=100, unique=True)
    image = models.URLField(max_length=500, blank=True, null=True)
    campus = models.CharField(
        max_length=20,
        default='pau',
        choices=[('pau', 'PAU'), ('futo', 'FUTO'), ('imsu', 'IMSU'), ('all', 'All Campuses')],
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
    image = models.URLField(max_length=500, blank=True, null=True)
    image2 = models.URLField(max_length=500, blank=True, null=True)
    image3 = models.URLField(max_length=500, blank=True, null=True)
    image4 = models.URLField(max_length=500, blank=True, null=True)
    image5 = models.URLField(max_length=500, blank=True, null=True)
    campus = models.CharField(
        max_length=20,
        default='pau',
        choices=[('pau', 'PAU'), ('futo', 'FUTO'), ('imsu', 'IMSU')],
        help_text="Set automatically from vendor's school on creation",
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
                from accounts.utils import send_notification
                send_notification(
                    recipient=self.vendor,
                    notification_type='sold_out',
                    title=f'"{self.title}" is sold out!',
                    message=(
                        f'Your listing "{self.title}" has sold out and has been automatically '
                        f'marked as unavailable. Restock and update your quantity to make it live again.'
                    ),
                    action_url='/seller',
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
            models.Index(fields=['campus']),
            models.Index(fields=['campus', 'is_available']),
            models.Index(fields=['-created_at']),
            models.Index(fields=['campus', '-created_at']),
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


class VendorOfTheMonth(models.Model):
    """
    Stores the winning vendor for each month.
    Picked automatically on the 1st of each month by the scheduler,
    based on completed orders, rating, and completion rate from the previous month.
    Admin can also set a manual override from the Django admin.
    """
    vendor = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True,
        related_name='vendor_of_month_awards',
    )
    month = models.DateField(help_text="First day of the month this award covers")
    score = models.FloatField(default=0)
    total_orders = models.IntegerField(default=0)
    avg_rating = models.FloatField(default=0)
    completion_rate = models.FloatField(default=0)
    is_manual_override = models.BooleanField(default=False)
    nominated_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-month']
        unique_together = ['month']
        verbose_name = "Vendor of the Month"
        verbose_name_plural = "Vendors of the Month"

    def __str__(self):
        vendor_name = self.vendor.username if self.vendor else "Unknown"
        return f"{vendor_name} — {self.month.strftime('%B %Y')}"


class Deal(models.Model):
    """Admin-controlled discount deals for listings"""
    listing = models.OneToOneField(
        Listing, on_delete=models.CASCADE, related_name='deal'
    )
    discount_percent = models.IntegerField(
        help_text="Discount percentage (0-100)",
        default=0
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = "Deal"
        verbose_name_plural = "Deals"

    def __str__(self):
        return f"{self.listing.title} — {self.discount_percent}% off"

    @property
    def discounted_price(self):
        from decimal import Decimal
        discount_amount = self.listing.price * Decimal(self.discount_percent) / 100
        return self.listing.price - discount_amount