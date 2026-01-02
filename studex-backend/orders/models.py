# orders/models.py
from django.db import models
from django.contrib.auth import get_user_model
from services.models import Listing

User = get_user_model()

class Order(models.Model):
    STATUS_CHOICES = (
        ('pending', 'Pending Payment'),
        ('paid', 'Paid - In Escrow'),
        ('seller_completed', 'Seller Marked Complete'),
        ('completed', 'Buyer Confirmed - Released'),
        ('disputed', 'Disputed'),
        ('cancelled', 'Cancelled'),
    )

    reference = models.CharField(max_length=100, unique=True)
    buyer = models.ForeignKey(User, on_delete=models.CASCADE, related_name='orders')
    listing = models.ForeignKey(Listing, on_delete=models.CASCADE)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default='pending')
    created_at = models.DateTimeField(auto_now_add=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    seller_completed_at = models.DateTimeField(null=True, blank=True)
    buyer_confirmed_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"Order {self.reference} - {self.buyer.username}"

    class Meta:
        ordering = ['-created_at']
        verbose_name = "Order"
        verbose_name_plural = "Orders"