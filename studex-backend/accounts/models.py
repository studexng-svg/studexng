# accounts/models.py
from django.contrib.auth.models import AbstractUser
from django.db import models
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver
from studex.validators import validate_image, validate_document, validate_id_document
from accounts.fields import EncryptedCharField


def _raw_storage():
    """Use RawMediaCloudinaryStorage when Cloudinary is configured so that
    document uploads (PDF, DOCX) preserve their file extension in the URL.
    Falls back to default storage in local dev."""
    from django.conf import settings
    if getattr(settings, '_use_cloudinary', False):
        from cloudinary_storage.storage import RawMediaCloudinaryStorage
        return RawMediaCloudinaryStorage()
    from django.core.files.storage import default_storage
    return default_storage


class User(AbstractUser):
    """Custom User model for StudEx"""

    USER_TYPE_CHOICES = (
        ('student', 'Student'),
        ('vendor', 'Vendor'),
        ('rider', 'Rider'),
    )

    firebase_uid = models.CharField(
        max_length=255,
        unique=True,
        null=True,
        blank=True,
        db_index=True,
    )

    email = models.EmailField(unique=True, null=True, blank=True)
    phone = models.CharField(max_length=15, blank=True, null=True)

    user_type = models.CharField(
        max_length=10,
        choices=USER_TYPE_CHOICES,
        default='student',
    )

    matric_number = models.CharField(max_length=50, blank=True, null=True)
    nin = EncryptedCharField(max_length=200, blank=True, null=True)
    VERIFICATION_TYPE_CHOICES = [
        ('matric', 'Matric Number'),
        ('nin', 'NIN'),
    ]
    verification_type = models.CharField(
        max_length=10,
        choices=VERIFICATION_TYPE_CHOICES,
        blank=True,
        null=True,
    )
    hostel = models.CharField(max_length=100, blank=True, null=True)
    school = models.CharField(max_length=20, blank=True, null=True)

    business_name = models.CharField(max_length=200, blank=True, null=True)
    is_verified_vendor = models.BooleanField(default=False)

    bio = models.TextField(blank=True, null=True)
    profile_image = models.ImageField(
        upload_to='profiles/',
        blank=True,
        null=True,
        max_length=500,
        validators=[validate_image],
    )

    wallet_balance = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)

    last_seen = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    USERNAME_FIELD = 'username'
    REQUIRED_FIELDS = ['email']

    def __str__(self):
        return f"{self.username} ({self.email})"


class Profile(models.Model):
    """Extended profile information"""

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')

    whatsapp = models.CharField(max_length=15, blank=True, null=True)
    instagram = models.CharField(max_length=100, blank=True, null=True)

    total_orders = models.IntegerField(default=0)
    total_sales = models.IntegerField(default=0)
    rating = models.DecimalField(max_digits=3, decimal_places=2, default=0.00)
    total_reviews = models.IntegerField(default=0)

    notifications_enabled = models.BooleanField(default=True)
    email_notifications = models.BooleanField(default=True)

    # EXISTING LOYALTY
    loyalty_credits = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    completed_order_count = models.IntegerField(default=0)

    # PROFILE COMPLETION DISCOUNT
    profile_bonus_eligible = models.BooleanField(
        default=False,
        help_text="User gets 5% off first order after completing profile"
    )
    profile_bonus_used = models.BooleanField(
        default=False,
        help_text="Whether the 5% discount has been used"
    )

    # Vendor badges
    BADGE_CHOICES = (
        ('none', 'No Badge'),
        ('rising', 'Rising Vendor'),
        ('trusted', 'Trusted Vendor'),
        ('top', 'Top Vendor'),
    )

    vendor_badge = models.CharField(max_length=20, choices=BADGE_CHOICES, default='none')
    completion_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0.00)
    on_platform_sales = models.IntegerField(default=0)

    disclaimer_accepted = models.BooleanField(default=False)
    disclaimer_accepted_at = models.DateTimeField(null=True, blank=True)

    # Active hours
    available_days = models.JSONField(default=list, blank=True)  # e.g. ["Mon","Tue","Wed","Thu","Fri"]
    opening_time = models.TimeField(null=True, blank=True)       # e.g. 09:00
    closing_time = models.TimeField(null=True, blank=True)       # e.g. 18:00

    # Additional profile fields
    date_of_birth = models.DateField(null=True, blank=True)
    gender = models.CharField(max_length=20, blank=True, null=True)  # e.g. "Male", "Female", "Prefer not to say"
    department = models.CharField(max_length=100, blank=True, null=True)
    level = models.CharField(max_length=20, blank=True, null=True)  # e.g. "100", "200", "300", "400"

    def __str__(self):
        return f"{self.user.username}'s Profile"


class SellerApplication(models.Model):
    STATUS_CHOICES = (
        ('pending', 'Pending Review'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
    )

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='seller_application')

    # Option A: both sides of student ID card (images or PDFs)
    id_front = models.FileField(
        upload_to='seller_verification/id_front/',
        storage=_raw_storage,
        validators=[validate_id_document],
        help_text="Front of student ID card (JPG, PNG, or PDF)",
        blank=True, null=True,
    )
    id_back = models.FileField(
        upload_to='seller_verification/id_back/',
        storage=_raw_storage,
        validators=[validate_id_document],
        help_text="Back of student ID card (JPG, PNG, or PDF)",
        blank=True, null=True,
    )
    # Option B: admission letter / proof of enrollment (PDF or image)
    admission_letter = models.FileField(
        upload_to='seller_verification/admission/',
        storage=_raw_storage,
        validators=[validate_document],
        help_text="Admission letter or proof of enrollment (PDF, JPG, PNG)",
        blank=True, null=True,
    )
    # Option C: NIN document (slip or card scan)
    nin_document = models.FileField(
        upload_to='seller_verification/nin/',
        storage=_raw_storage,
        validators=[validate_id_document],
        help_text="NIN slip or NIN card (JPG, PNG, or PDF)",
        blank=True, null=True,
    )

    business_age_confirmed = models.BooleanField(default=False)

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')

    submitted_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='reviewed_applications'
    )
    notes = models.TextField(blank=True, null=True)

    def __str__(self):
        return f"{self.user.username} - {self.get_status_display()}"

    def clean(self):
        from django.core.exceptions import ValidationError
        has_id_card = self.id_front and self.id_back
        has_letter = bool(self.admission_letter)
        has_nin = bool(self.nin_document)
        if not has_id_card and not has_letter and not has_nin:
            raise ValidationError(
                "Upload either both sides of your ID card, an admission letter, or your NIN document."
            )

    def id_front_url(self):
        if self.id_front:
            return self.id_front.url
        return None

    def id_back_url(self):
        if self.id_back:
            return self.id_back.url
        return None

    def admission_letter_url(self):
        if self.admission_letter:
            return self.admission_letter.url
        return None


class VendorType(models.Model):
    """
    Configuration point for a category of vendor (Food, Beauty, Laundry,
    Retail, ...). Deliberately its own table rather than a plain CharField
    choice on Vendor — future operational config that varies by vendor
    category (batch delivery support, weather-suspension eligibility, etc.)
    has a natural home here without another schema migration. See
    payments/settlement.py for how settlement_trigger is consumed; nothing
    else on this model is read by application code yet.

    Vendor.vendor_type is nullable, and every consumer of settlement_trigger
    treats "no vendor type assigned" as SETTLEMENT_TRIGGER_BUYER_CONFIRMATION
    (today's global behavior) — assigning a vendor type is a strict opt-in,
    never a change to any vendor's existing payout behavior.
    """
    SETTLEMENT_TRIGGER_CHOICES = (
        ('buyer_confirmation', 'Buyer Confirmation / Auto-Release'),
        ('pickup_verification', 'Rider Pickup Verification'),
    )

    name = models.SlugField(max_length=50, unique=True)
    display_name = models.CharField(max_length=100)
    settlement_trigger = models.CharField(
        max_length=30, choices=SETTLEMENT_TRIGGER_CHOICES, default='buyer_confirmation',
    )
    # Capability flags (Phase 1 — Food Commerce Engine). Each gates an
    # entire optional subsystem behind a checkbox, not a hardcoded
    # `vendor_type.name == 'food'` check anywhere in application code — the
    # same "config lives on VendorType, not in code" principle
    # settlement_trigger already established. A future VendorType (Bakery,
    # Grocery, Pharmacy, ...) adopts either capability by flipping one field
    # here; no migration, no deploy.
    supports_menu_ordering = models.BooleanField(
        default=False,
        help_text="Vendors of this type can build a menu (categories, items, add-ons) instead of plain listings.",
    )
    supports_batched_delivery = models.BooleanField(
        default=False,
        help_text="Vendors of this type can use scheduled Delivery Batches with capacity limits.",
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['display_name']
        verbose_name = "Vendor Type"
        verbose_name_plural = "Vendor Types"

    def __str__(self):
        return self.display_name


class Vendor(models.Model):
    """Dedicated vendor record — single source of truth for verification status."""

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='vendor')
    is_verified = models.BooleanField(default=True)
    vendor_type = models.ForeignKey(
        VendorType, on_delete=models.SET_NULL, null=True, blank=True, related_name='vendors',
    )

    verified_at = models.DateTimeField(null=True, blank=True)
    verified_by = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='vendors_approved',
    )

    unverified_at = models.DateTimeField(null=True, blank=True)
    unverified_by = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='vendors_unverified',
    )
    unverification_reason = models.TextField(blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        status = 'Verified' if self.is_verified else 'Unverified'
        return f"{self.user.username} — {status} Vendor"


class AdminChatSession(models.Model):
    """Persisted admin AI chat sessions accessible via history."""
    title = models.CharField(max_length=200)
    messages = models.JSONField(default=list)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        app_label = 'accounts'

    def __str__(self):
        return f"AdminChat: {self.title[:60]}"


# SIGNALS

@receiver(post_save, sender=User)
def create_user_profile(sender, instance, created, **kwargs):
    if created:
        Profile.objects.get_or_create(user=instance)


@receiver(post_save, sender=User)
def save_user_profile(sender, instance, **kwargs):
    if hasattr(instance, 'profile'):
        instance.profile.save()


@receiver(post_save, sender=Vendor)
def sync_user_from_vendor(sender, instance, **kwargs):
    """Keep User.is_verified_vendor and listing visibility in sync with Vendor.is_verified."""
    from services.models import Listing
    User.objects.filter(pk=instance.user_id).update(
        is_verified_vendor=instance.is_verified,
        user_type='vendor' if instance.is_verified else 'student',
    )
    Listing.objects.filter(vendor_id=instance.user_id).update(
        is_available=instance.is_verified,
    )


@receiver(pre_save, sender=User)
def sync_listings_on_vendor_status_change(sender, instance, **kwargs):
    if not instance.pk:
        return

    try:
        old = User.objects.get(pk=instance.pk)
    except User.DoesNotExist:
        return

    if old.is_verified_vendor == instance.is_verified_vendor:
        return

    from services.models import Listing

    if instance.is_verified_vendor:
        instance.user_type = 'vendor'
        Listing.objects.filter(vendor=instance).update(is_available=True)
    else:
        instance.user_type = 'student'
        Listing.objects.filter(vendor=instance).update(is_available=False)