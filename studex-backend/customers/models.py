# customers/models.py
from django.db import models
from django.conf import settings


class VendorCustomer(models.Model):
    """
    Denormalized per-(vendor, customer) summary built from completed Orders and paid
    Bookings — never a copy of order line items. Kept in sync by
    customers.services.recompute_vendor_customer, called from a signal on every
    Order transition to 'completed' and by the one-time historical backfill command.
    """
    vendor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='customers')
    customer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='vendor_relationships')

    first_purchase_at = models.DateTimeField()
    last_purchase_at = models.DateTimeField()
    total_completed_orders = models.PositiveIntegerField(default=0)
    total_amount_spent = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    average_order_value = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    # Bookings that reached a paid engagement (status paid/completed), regardless of
    # what happened to the resulting order afterward — see recompute_vendor_customer.
    total_successful_bookings = models.PositiveIntegerField(default=0)

    favorite_listing = models.ForeignKey(
        'services.Listing', null=True, blank=True, on_delete=models.SET_NULL, related_name='+'
    )
    favorite_category = models.ForeignKey(
        'services.Category', null=True, blank=True, on_delete=models.SET_NULL, related_name='+'
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('vendor', 'customer')
        indexes = [
            models.Index(fields=['vendor', '-last_purchase_at']),
            models.Index(fields=['vendor', '-total_amount_spent']),
        ]

    def __str__(self):
        return f"{self.customer.username} @ {self.vendor.username}"
