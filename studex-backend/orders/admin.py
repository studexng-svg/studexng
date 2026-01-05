from django.contrib import admin
from .models import Order, Dispute


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ['reference', 'buyer', 'listing', 'amount', 'status', 'created_at']
    list_filter = ['status', 'created_at']
    search_fields = ['reference', 'buyer__username', 'listing__title']
    readonly_fields = ['reference', 'created_at', 'paid_at', 'seller_completed_at', 'buyer_confirmed_at']
    ordering = ['-created_at']


@admin.register(Dispute)
class DisputeAdmin(admin.ModelAdmin):
    list_display = ['id', 'order', 'filed_by', 'filer', 'reason', 'status', 'resolution', 'created_at']
    list_filter = ['status', 'resolution', 'filed_by', 'reason', 'created_at']
    search_fields = ['order__reference', 'filer__username', 'complaint']
    readonly_fields = ['filer', 'created_at', 'updated_at', 'provider_responded_at', 'resolved_at', 'appealed_at']
    fieldsets = (
        ('Dispute Information', {
            'fields': ('order', 'filed_by', 'filer', 'reason', 'complaint', 'evidence')
        }),
        ('Provider Response', {
            'fields': ('provider_response', 'provider_responded_at')
        }),
        ('Admin Resolution', {
            'fields': ('status', 'resolution', 'assigned_to', 'admin_decision', 'resolved_at', 'resolved_by')
        }),
        ('Appeal', {
            'fields': ('appeal_text', 'appealed_at', 'appeal_decision')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at')
        }),
    )
    ordering = ['-created_at']
