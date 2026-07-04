from django.db import models
from django.conf import settings

User = settings.AUTH_USER_MODEL


class CampusPickupPoint(models.Model):
    CAMPUS_CHOICES = (
        ('pau', 'PAU'),
        ('futo', 'FUTO'),
        ('imsu', 'IMSU'),
    )

    name = models.CharField(max_length=150)
    campus = models.CharField(max_length=20, choices=CAMPUS_CHOICES)
    description = models.CharField(max_length=300, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['campus', 'name']

    def __str__(self):
        return f"{self.name} ({self.campus})"


class DeliveryAssignment(models.Model):
    STATUS_CHOICES = (
        ('assigned', 'Assigned to Rider'),
        ('picked_up', 'Picked Up from Vendor'),
        ('at_pickup_point', 'At Pickup Point'),
        ('completed', 'Collected by Buyer'),
    )

    order = models.OneToOneField(
        'orders.Order',
        on_delete=models.CASCADE,
        related_name='delivery',
    )
    rider = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='deliveries',
    )
    pickup_point = models.ForeignKey(
        CampusPickupPoint,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='deliveries',
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='assigned')

    assigned_at = models.DateTimeField(auto_now_add=True)
    picked_up_at = models.DateTimeField(null=True, blank=True)
    at_pickup_point_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    assigned_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='delivery_assignments_made',
    )

    class Meta:
        ordering = ['-assigned_at']

    def __str__(self):
        return f"Delivery for Order {self.order.reference} — {self.get_status_display()}"
