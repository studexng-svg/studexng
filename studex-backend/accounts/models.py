from django.contrib.auth.models import AbstractUser
from django.db import models
from django.db.models.signals import post_save
from django.dispatch import receiver


class User(AbstractUser):
    """Custom User model for StudEx"""

    USER_TYPE_CHOICES = (
        ('student', 'Student'),
        ('vendor', 'Vendor'),
    )

    # Firebase Authentication (NEW - FOR LAUNCH)
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

    # Use username as primary login field (Firebase UID based)
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

    def __str__(self):
        return f"{self.user.username}'s Profile"

    class Meta:
        verbose_name = "Profile"
        verbose_name_plural = "Profiles"


# Seller Application Model — real document verification
class SellerApplication(models.Model):
    STATUS_CHOICES = (
        ('pending', 'Pending Review'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
    )

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='seller_application')
    id_document = models.FileField(upload_to='seller_verification/id/', help_text="Student ID card")
    admission_letter = models.FileField(upload_to='seller_verification/admission/', help_text="Admission letter or proof of enrollment")
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


# Automatically create and save Profile when a User is created/updated
@receiver(post_save, sender=User)
def create_user_profile(sender, instance, created, **kwargs):
    if created:
        Profile.objects.get_or_create(user=instance)


@receiver(post_save, sender=User)
def save_user_profile(sender, instance, **kwargs):
    if hasattr(instance, 'profile'):
        instance.profile.save()