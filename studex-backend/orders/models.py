# orders/models.py
from django.db import models
from django.conf import settings
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

    auto_released = models.BooleanField(default=False)

    def __str__(self):
        return f"Order {self.reference} - {self.buyer.username}"

    class Meta:
        ordering = ['-created_at']
        verbose_name = "Order"
        verbose_name_plural = "Orders"


class Dispute(models.Model):
    STATUS_CHOICES = (
        ('open', 'Open'),
        ('under_review', 'Under Review'),
        ('resolved', 'Resolved'),
        ('appealed', 'Appealed'),
        ('closed', 'Closed'),
    )

    RESOLUTION_CHOICES = (
        ('pending', 'Pending Decision'),
        ('release_to_provider', 'Release Funds to Provider'),
        ('refund_customer', 'Refund Customer'),
        ('partial_split', 'Partial Split'),
        ('hold_pending', 'Hold Pending Investigation'),
    )

    FILED_BY_CHOICES = (
        ('customer', 'Customer'),
        ('provider', 'Provider'),
    )

    REASON_CHOICES = (
        ('service_not_completed', 'Service Not Completed'),
        ('quality_issue', 'Quality Issue'),
        ('provider_no_show', 'Provider No-Show'),
        ('late_delivery', 'Late Delivery'),
        ('wrong_service', 'Wrong Service Delivered'),
        ('payment_issue', 'Payment Issue'),
        ('other', 'Other'),
    )

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='disputes')
    filed_by = models.CharField(max_length=20, choices=FILED_BY_CHOICES)
    filer = models.ForeignKey(User, on_delete=models.CASCADE, related_name='disputes_filed')
    reason = models.CharField(max_length=50, choices=REASON_CHOICES)
    complaint = models.TextField(help_text="Detailed description of the issue")
    evidence = models.TextField(blank=True, help_text="Evidence or screenshots description")

    # Provider response
    provider_response = models.TextField(blank=True, null=True)
    provider_responded_at = models.DateTimeField(null=True, blank=True)

    # Admin resolution
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='open')
    resolution = models.CharField(max_length=30, choices=RESOLUTION_CHOICES, default='pending')
    assigned_to = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True,
                                     related_name='assigned_disputes',
                                     help_text="Support staff assigned to this dispute")
    admin_decision = models.TextField(blank=True, help_text="Admin's reasoning for resolution")
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolved_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True,
                                     related_name='disputes_resolved')

    # Appeal system
    appeal_text = models.TextField(blank=True, null=True)
    appealed_at = models.DateTimeField(null=True, blank=True)
    appeal_decision = models.TextField(blank=True, null=True)

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Dispute #{self.id} - Order {self.order.reference}"

    class Meta:
        ordering = ['-created_at']
        verbose_name = "Dispute"
        verbose_name_plural = "Disputes"
        indexes = [
            models.Index(fields=['-created_at']),
            models.Index(fields=['status']),
            models.Index(fields=['order']),
        ]

class Booking(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),       # buyer sent request
        ('confirmed', 'Confirmed'),   # vendor confirmed
        ('paid', 'Paid'),               # buyer paid
        ('cancelled', 'Cancelled'),   # either party cancelled
        ('completed', 'Completed'),   # service done
    ]

    buyer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='bookings_made'
    )
    listing = models.ForeignKey(
        'services.Listing',
        on_delete=models.CASCADE,
        related_name='bookings'
    )
    scheduled_date = models.DateField()
    scheduled_time = models.CharField(max_length=20)  # e.g. "2:00 PM"
    note = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Booking by {self.buyer.username} for {self.listing.title} on {self.scheduled_date}"
    
