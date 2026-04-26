# reviews/models.py
from django.db import models
from django.contrib.auth import get_user_model
from django.core.validators import MinValueValidator, MaxValueValidator

User = get_user_model()


class Review(models.Model):
    order = models.OneToOneField(
        'orders.Order', on_delete=models.CASCADE,
        related_name='review'
    )
    reviewer = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name='reviews_given'
    )
    vendor = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name='reviews_received'
    )
    listing = models.ForeignKey(
        'services.Listing', on_delete=models.CASCADE, related_name='reviews'
    )
    rating = models.IntegerField(validators=[MinValueValidator(1), MaxValueValidator(5)])
    comment = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = "Review"
        verbose_name_plural = "Reviews"

    def __str__(self):
        return f"{self.reviewer.username} → {self.vendor.username} ({self.rating}★)"


class AppFeedback(models.Model):
    FEEDBACK_TYPE_CHOICES = [
        ('buyer', 'Buyer Feedback'),
        ('vendor', 'Vendor Feedback'),
    ]
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    feedback_type = models.CharField(max_length=20, choices=FEEDBACK_TYPE_CHOICES, default='buyer')
    rating = models.IntegerField(choices=[(i, i) for i in range(1, 6)], null=True, blank=True)
    comment = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.feedback_type} feedback from {self.user} - {self.rating}★"

    class Meta:
        ordering = ['-created_at']