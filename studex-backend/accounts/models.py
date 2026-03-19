from django.contrib.auth.models import AbstractUser
from django.db import models
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver
from studex.validators import validate_image, validate_document


class User(AbstractUser):
    """Custom User model for StudEx"""

    USER_TYPE_CHOICES = (
        ('student', 'Student'),
        ('vendor', 'Vendor'),
    )

    # Firebase Authentication
    firebase_uid = models.CharField(
        max_length=255,
        unique=True,
        null=True,
        blank=True,
        db_index=True,
        help_text="Firebase UID for authentication"
    )

    # Basic Info
    email = models.EmailField(
        unique=True,
        null=True,
        blank=True,
        db_index=True,
        help_text="User email address",
    )
    phone = models.CharField(max_length=15, blank=True, null=True, help_text="Optional phone number")
    user_type = models.CharField(
        max_length=10,
        choices=USER_TYPE_CHOICES,
        default='student',
        help_text="Student can buy items, Vendor can sell items",
    )

    # Student-specific fields
    matric_number = models.CharField(
        max_length=50,
        blank=True,
        null=True,
        help_text="Optional matric number (uniqueness enforced in serializer if needed)",
    )
    hostel = models.CharField(max_length=100, blank=True, null=True, help_text="Hostel or campus location")

    # Vendor-specific fields
    business_name = models.CharField(max_length=200, blank=True, null=True, help_text="Business or shop name")
    is_verified_vendor = models.BooleanField(
        default=False,
        help_text="Check to approve this vendor (admin only)",
    )

    # Profile
    bio = models.TextField(blank=True, null=True, help_text="Short bio or description")
    profile_image = models.ImageField(
        upload_to='profiles/',
        blank=True,
        null=True,
        default='profiles/default.jpg',
        help_text="Profile picture",
        validators=[validate_image],
    )

    # Wallet
    wallet_balance = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0.00,
        help_text="Current wallet balance in NGN",
    )

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    USERNAME_FIELD = 'username'
    REQUIRED_FIELDS = ['email']

    def __str__(self):
        return f"{self.username} ({self.email})"

    class Meta:
        ordering = ['-created_at']
        verbose_name = "User"
        verbose_name_plural = "Users"
        indexes = [
            models.Index(fields=['email']),
            models.Index(fields=['user_type']),
            models.Index(fields=['is_verified_vendor']),
            models.Index(fields=['firebase_uid']),
        ]


class Profile(models.Model):
    """Extended profile information"""

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')

    # Additional contact
    whatsapp = models.CharField(max_length=15, blank=True, null=True, help_text="WhatsApp number")
    instagram = models.CharField(max_length=100, blank=True, null=True, help_text="Instagram handle")

    # Stats
    total_orders = models.IntegerField(default=0, help_text="Total orders placed (for buyers)")
    total_sales = models.IntegerField(default=0, help_text="Total sales made (for vendors)")
    rating = models.DecimalField(max_digits=3, decimal_places=2, default=0.00, help_text="Average rating out of 5.00")
    total_reviews = models.IntegerField(default=0, help_text="Number of reviews received")

    # Preferences
    notifications_enabled = models.BooleanField(default=True, help_text="Receive push/email notifications")
    email_notifications = models.BooleanField(default=True, help_text="Receive email updates")

    # ─── Loyalty Credits (Buyers) ────────────────────────────────
    loyalty_credits = models.DecimalField(
        max_digits=10, decimal_places=2, default=0.00,
        help_text="Redeemable credits earned from completed orders (₦100 per 5 orders)"
    )
    completed_order_count = models.IntegerField(
        default=0,
        help_text="Total completed on-platform orders (for loyalty tracking)"
    )

    # ─── Vendor Badges & Ranking ─────────────────────────────────
    BADGE_CHOICES = (
        ('none', 'No Badge'),
        ('rising', 'Rising Vendor'),
        ('trusted', 'Trusted Vendor'),
        ('top', 'Top Vendor'),
    )
    vendor_badge = models.CharField(
        max_length=20, choices=BADGE_CHOICES, default='none',
        help_text="Auto-assigned badge based on completed on-platform orders"
    )
    completion_rate = models.DecimalField(
        max_digits=5, decimal_places=2, default=0.00,
        help_text="% of paid orders marked completed (used for search ranking)"
    )
    on_platform_sales = models.IntegerField(
        default=0,
        help_text="Total completed on-platform orders (for vendor badge)"
    )

    # ─── Platform Disclaimer ─────────────────────────────────────
    disclaimer_accepted = models.BooleanField(
        default=False,
        help_text="User accepted the offline transaction disclaimer"
    )
    disclaimer_accepted_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.user.username}'s Profile"

    class Meta:
        verbose_name = "Profile"
        verbose_name_plural = "Profiles"


class SellerApplication(models.Model):
    STATUS_CHOICES = (
        ('pending', 'Pending Review'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
    )

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='seller_application')
    id_document = models.FileField(
        upload_to='seller_verification/id/',
        help_text="Student ID card",
        validators=[validate_image]
    )
    admission_letter = models.FileField(
        upload_to='seller_verification/admission/',
        help_text="Admission letter or proof of enrollment",
        validators=[validate_document]
    )
    business_age_confirmed = models.BooleanField(default=False, help_text="Confirmed selling on campus for 6+ months")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    submitted_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='reviewed_seller_applications')
    notes = models.TextField(blank=True, null=True, help_text="Admin notes (e.g., reason for rejection)")

    def __str__(self):
        return f"{self.user.username} - {self.get_status_display()}"

    class Meta:
        verbose_name = "Seller Application"
        verbose_name_plural = "Seller Applications"
        ordering = ['-submitted_at']


# ─────────────────────────────────────────────────────────────────────────────
# SIGNALS
# ─────────────────────────────────────────────────────────────────────────────

@receiver(post_save, sender=User)
def create_user_profile(sender, instance, created, **kwargs):
    if created:
        Profile.objects.get_or_create(user=instance)


@receiver(post_save, sender=User)
def save_user_profile(sender, instance, **kwargs):
    if hasattr(instance, 'profile'):
        instance.profile.save()


@receiver(pre_save, sender=User)
def sync_listings_on_vendor_status_change(sender, instance, **kwargs):
    """
    When an admin changes is_verified_vendor on a User:
      - Ticked ON  → restore all that vendor's listings to is_available=True
      - Ticked OFF → set all that vendor's listings to is_available=False
                     (they are unlicensed to sell until re-approved)

    Uses pre_save to compare old vs new value so we only act when it changes.
    Importing Listing here (inside the function) avoids circular import issues.
    """
    if not instance.pk:
        return  # New user being created — no listings yet

    try:
        old = User.objects.get(pk=instance.pk)
    except User.DoesNotExist:
        return

    old_verified = old.is_verified_vendor
    new_verified = instance.is_verified_vendor

    # Only act when the value actually changed
    if old_verified == new_verified:
        return

    from services.models import Listing  # local import to avoid circular dependency

    if new_verified:
        # Admin approved → promote to vendor + restore listings
        instance.user_type = 'vendor'
        Listing.objects.filter(vendor=instance).update(is_available=True)
    else:
        # Admin revoked → demote back to student + deactivate listings
        instance.user_type = 'student'
        Listing.objects.filter(vendor=instance).update(is_available=False)