# services/models.py
from django.db import models
from django.contrib.auth import get_user_model

User = get_user_model()


class Category(models.Model):
    title = models.CharField(max_length=100, unique=True)
    slug = models.SlugField(max_length=100, unique=True)
    image = models.URLField(max_length=500, blank=True, null=True)
    is_pau  = models.BooleanField(default=False, verbose_name='PAU')
    is_futo = models.BooleanField(default=False, verbose_name='FUTO')
    is_imsu = models.BooleanField(default=False, verbose_name='IMSU')

    def __str__(self):
        return self.title

    @property
    def campus_display(self):
        names = [n for flag, n in [(self.is_pau, 'PAU'), (self.is_futo, 'FUTO'), (self.is_imsu, 'IMSU')] if flag]
        return ', '.join(names) if names else '—'

    class Meta:
        verbose_name_plural = "Categories"
        ordering = ['title']


class Subcategory(models.Model):
    category = models.ForeignKey(Category, on_delete=models.CASCADE, related_name='subcategories')
    title = models.CharField(max_length=100)
    slug = models.SlugField(max_length=100)

    class Meta:
        unique_together = ('category', 'slug')
        ordering = ['title']
        indexes = [models.Index(fields=['category', 'slug'])]
        verbose_name_plural = "Subcategories"

    def __str__(self):
        return f"{self.category.title} → {self.title}"


class Listing(models.Model):
    """Product or service posted by a verified vendor"""

    LISTING_TYPE_CHOICES = (
        ('service', 'Service'),
        ('product', 'Product'),
    )

    vendor = models.ForeignKey(User, on_delete=models.CASCADE, related_name='listings')
    category = models.ForeignKey(Category, on_delete=models.CASCADE, related_name='listings')
    # Nullable only for pre-migration legacy rows (backfilled by a data migration);
    # required at the serializer level for every new/edited listing going forward.
    # PROTECT so a subcategory can never be deleted out from under live listings.
    subcategory = models.ForeignKey(Subcategory, on_delete=models.PROTECT, null=True, blank=True, related_name='listings')
    title = models.CharField(max_length=200)
    description = models.TextField()
    # The amount the vendor asked to receive — the only price field vendors edit
    # directly. Nullable only because existing rows get backfilled by a migration;
    # required for every new/edited listing at the serializer level.
    payout_amount = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    # Buyer-facing all-inclusive price = payout_amount + platform fee (see
    # payments/pricing.py). Computed automatically — no longer vendor-writable.
    price = models.DecimalField(max_digits=10, decimal_places=2)
    # When set, payout_amount/price represent a per-unit rate (e.g. ₦500 per
    # cloth) rather than a flat listing price. Booking.quantity carries how
    # many units the buyer wants; the actual charge and vendor payout are
    # computed fresh at booking time from payout_amount * quantity, not by
    # multiplying the flat `price` (see payments/views.py).
    is_per_unit = models.BooleanField(default=False)
    unit_label = models.CharField(max_length=50, blank=True, default='')
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

    discount_percent = models.IntegerField(
        default=0,
        help_text="Vendor-set discount percentage (0 = no discount, 1-100 for a sale)"
    )

    CONDITION_CHOICES = (
        ('new', 'Brand New'),
        ('fairly_used', 'Fairly Used'),
        ('refurbished', 'Refurbished'),
    )
    brand = models.CharField(max_length=100, blank=True, default='')
    condition = models.CharField(
        max_length=20, choices=CONDITION_CHOICES, blank=True, default='',
        help_text="Condition of the item (mainly for physical products)"
    )
    delivery_time = models.CharField(
        max_length=100, blank=True, default='',
        help_text="Estimated delivery or completion time, e.g. '15-20 mins', '1-2 days'"
    )
    tags = models.CharField(
        max_length=300, blank=True, default='',
        help_text="Comma-separated keywords, e.g. 'Authentic, Handmade, Express'"
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
                    send_email=False,
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


class ListingVariant(models.Model):
    """
    A named, differently-priced option under one listing (e.g. "Washing Only" /
    "Washing & Ironing" under a single Laundry listing) — so a buyer picks a
    variant instead of the vendor having to create 3 separate listings.
    unit_label/is_per_unit stay on the parent Listing (shared across variants);
    only payout_amount (and its computed price) varies per variant.
    """
    listing = models.ForeignKey(Listing, on_delete=models.CASCADE, related_name='variants')
    title = models.CharField(max_length=100)
    payout_amount = models.DecimalField(max_digits=10, decimal_places=2)
    # Computed the same way as Listing.price (payments/pricing.calculate_final_price).
    price = models.DecimalField(max_digits=10, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['id']

    def __str__(self):
        return f"{self.listing.title} — {self.title}"


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
    CAMPUS_CHOICES = [('pau', 'PAU'), ('futo', 'FUTO'), ('imsu', 'IMSU')]

    vendor = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True,
        related_name='vendor_of_month_awards',
    )
    month = models.DateField(help_text="First day of the month this award covers")
    campus = models.CharField(max_length=10, choices=CAMPUS_CHOICES, default='futo')
    score = models.FloatField(default=0)
    total_orders = models.IntegerField(default=0)
    avg_rating = models.FloatField(default=0)
    completion_rate = models.FloatField(default=0)
    is_manual_override = models.BooleanField(default=False)
    nominated_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-month']
        unique_together = ['month', 'campus']
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