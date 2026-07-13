from django.contrib import admin
from .models import VendorCustomer


@admin.register(VendorCustomer)
class VendorCustomerAdmin(admin.ModelAdmin):
    list_display = [
        'id', 'vendor', 'customer', 'total_completed_orders', 'total_amount_spent',
        'average_order_value', 'total_successful_bookings', 'last_purchase_at',
    ]
    list_filter = ['last_purchase_at']
    search_fields = ['vendor__username', 'customer__username']
    readonly_fields = [f.name for f in VendorCustomer._meta.fields]
    ordering = ['-last_purchase_at']

    def has_add_permission(self, request):
        return False
