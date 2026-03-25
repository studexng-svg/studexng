# accounts/models.py
from django.contrib.auth.models import AbstractUser
from django.db import models
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver
from studex.validators import validate_image


class User(AbstractUser):
    USER_TYPE_CHOICES = (('student', 'Student'), ('vendor', 'Vendor'))

    firebase_uid = models.CharField(max_length=255, unique=True, null=True, blank=True, db_index=True)
    email = models.EmailField(unique=True, null=True, blank=True)
    phone = models.CharField(max_length=15, blank=True, null=True)
    user_type = models.CharField(max_length=10, choices=USER_TYPE_CHOICES, default='student')
    matric_number = models.CharField(max_length=50, blank=True, null=True)
    hostel = models.CharField(max_length=100, blank=True, null=True)
    business_name = models.CharField(max_length=200, blank=True, null=True)
    is_verified_vendor = models.BooleanField(default=False)
    bio = models.TextField(blank=True, null=True)
    profile_image = models.ImageField(upload_to='profiles/', blank=True, null=True, default='profiles/default.jpg', validators=[validate_image])
    wallet_balance = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    USERNAME_FIELD = 'username'
    REQUIRED_FIELDS = ['email']

    def __str__(self):
        return f"{self.username} ({self.email})"


class Profile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    whatsapp = models.CharField(max_length=15, blank=True, null=True)
    instagram = models.CharField(max_length=100, blank=True, null=True)
    total_orders = models.IntegerField(default=0)
    total_sales = models.IntegerField(default=0)
    rating = models.DecimalField(max_digits=3, decimal_places=2, default=0.00)
    total_reviews = models.IntegerField(default=0)
    notifications_enabled = models.BooleanField(default=True)
    email_notifications = models.BooleanField(default=True)
    loyalty_credits = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    completed_order_count = models.IntegerField(default=0)
    profile_bonus_eligible = models.BooleanField(default=False, help_text="User gets 5% off first order after completing profile")
    profile_bonus_used = models.BooleanField(default=False, help_text="Whether the 5% discount has been used")
    BADGE_CHOICES = (('none', 'No Badge'), ('rising', 'Rising Vendor'), ('trusted', 'Trusted Vendor'), ('top', 'Top Vendor'))
    vendor_badge = models.CharField(max_length=20, choices=BADGE_CHOICES, default='none')
    completion_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0.00)
    on_platform_sales = models.IntegerField(default=0)
    disclaimer_accepted = models.BooleanField(default=False)
    disclaimer_accepted_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.user.username}'s Profile"


class SellerApplication(models.Model):
    STATUS_CHOICES = (('pending', 'Pending Review'), ('approved', 'Approved'), ('rejected', 'Rejected'))

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='seller_application')

    # ✅ PRIMARY: Cloudinary URLs — persistent across Render deploys
    id_front_url = models.URLField(max_length=500, blank=True, default='', help_text="Cloudinary URL for front of ID card")
    id_back_url = models.URLField(max_length=500, blank=True, default='', help_text="Cloudinary URL for back of ID card")

    # Fallback ImageFields for local dev only — empty in production
    id_front = models.ImageField(upload_to='seller_verification/id_front/', null=True, blank=True)
    id_back = models.ImageField(upload_to='seller_verification/id_back/', null=True, blank=True)

    business_age_confirmed = models.BooleanField(default=False)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    submitted_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='reviewed_applications')
    notes = models.TextField(blank=True, null=True)

    def __str__(self):
        return f"{self.user.username} - {self.get_status_display()}"

    def get_id_front_url(self):
        return self.id_front_url or (self.id_front.url if self.id_front else None)

    def get_id_back_url(self):
        return self.id_back_url or (self.id_back.url if self.id_back else None)


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