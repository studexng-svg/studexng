from django.contrib import admin
from django.utils import timezone
from django.utils.html import format_html
from django.http import HttpResponse
import csv
from .models import Order, Dispute


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = [
        'reference', 'buyer', 'get_seller', 'listing',
        'amount', 'colored_status', 'created_at'
    ]
    list_filter = ['status', 'created_at', 'paid_at']
    search_fields = ['reference', 'buyer__username', 'listing__title', 'listing__vendor__username']
    readonly_fields = ['reference', 'created_at', 'paid_at', 'seller_completed_at', 'buyer_confirmed_at']
    ordering = ['-created_at']
    date_hierarchy = 'created_at'
    list_per_page = 50

    fieldsets = (
        ('Order Details', {
            'fields': ('reference', 'buyer', 'listing', 'amount', 'status')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'paid_at', 'seller_completed_at', 'buyer_confirmed_at'),
            'classes': ('collapse',)
        }),
    )

    actions = ['mark_as_completed', 'mark_as_cancelled', 'trigger_auto_complete', 'export_to_csv']

    def get_seller(self, obj):
        """Get seller from listing"""
        return obj.listing.vendor if obj.listing else "N/A"
    get_seller.short_description = 'Seller'

    def colored_status(self, obj):
        """Display status with color coding"""
        colors = {
            'pending': 'gray',
            'paid': 'blue',
            'in_progress': 'orange',
            'completed': 'green',
            'cancelled': 'red',
            'disputed': 'purple'
        }
        color = colors.get(obj.status, 'black')
        return format_html(
            '<span style="color: {}; font-weight: bold;">{}</span>',
            color,
            obj.status.upper()
        )
    colored_status.short_description = 'Status'

    def mark_as_completed(self, request, queryset):
        """Manually complete orders (releases escrow)"""
        from wallet.models import EscrowTransaction
        updated = 0
        for order in queryset.filter(status='in_progress'):
            order.status = 'completed'
            order.buyer_confirmed_at = timezone.now()
            order.save()

            # Release escrow
            try:
                escrow = EscrowTransaction.objects.get(order=order, status='held')
                escrow.release()
            except EscrowTransaction.DoesNotExist:
                pass

            updated += 1

        self.message_user(request, f"{updated} order(s) marked as completed and escrow released.")
    mark_as_completed.short_description = "Complete selected orders (release escrow)"

    def mark_as_cancelled(self, request, queryset):
        """Cancel orders and refund escrow"""
        from wallet.models import EscrowTransaction
        updated = 0
        for order in queryset.filter(status__in=['pending', 'paid', 'in_progress']):
            order.status = 'cancelled'
            order.save()

            # Refund escrow if exists
            try:
                escrow = EscrowTransaction.objects.get(order=order, status='held')
                escrow.refund()
            except EscrowTransaction.DoesNotExist:
                pass

            updated += 1

        self.message_user(request, f"{updated} order(s) cancelled and refunded.")
    mark_as_cancelled.short_description = "Cancel selected orders (refund buyer)"

    def trigger_auto_complete(self, request, queryset):
        """Force auto-completion for orders older than 7 days"""
        from datetime import timedelta
        from wallet.models import EscrowTransaction

        cutoff_date = timezone.now() - timedelta(days=7)
        updated = 0

        for order in queryset.filter(status='in_progress', paid_at__lte=cutoff_date):
            order.status = 'completed'
            order.buyer_confirmed_at = timezone.now()
            order.save()

            try:
                escrow = EscrowTransaction.objects.get(order=order, status='held')
                escrow.release()
            except EscrowTransaction.DoesNotExist:
                pass

            updated += 1

        self.message_user(request, f"{updated} order(s) auto-completed (older than 7 days).")
    trigger_auto_complete.short_description = "Auto-complete orders older than 7 days"

    def export_to_csv(self, request, queryset):
        """Export selected orders to CSV"""
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="orders.csv"'

        writer = csv.writer(response)
        writer.writerow([
            'Reference', 'Buyer', 'Seller', 'Listing', 'Amount',
            'Status', 'Created At', 'Paid At', 'Seller Completed At', 'Buyer Confirmed At'
        ])

        for order in queryset:
            writer.writerow([
                order.reference,
                order.buyer.username,
                order.listing.vendor.username if order.listing else 'N/A',
                order.listing.title if order.listing else 'N/A',
                float(order.amount),
                order.status,
                order.created_at.strftime('%Y-%m-%d %H:%M:%S'),
                order.paid_at.strftime('%Y-%m-%d %H:%M:%S') if order.paid_at else 'N/A',
                order.seller_completed_at.strftime('%Y-%m-%d %H:%M:%S') if order.seller_completed_at else 'N/A',
                order.buyer_confirmed_at.strftime('%Y-%m-%d %H:%M:%S') if order.buyer_confirmed_at else 'N/A'
            ])

        return response
    export_to_csv.short_description = "Export selected to CSV"


@admin.register(Dispute)
class DisputeAdmin(admin.ModelAdmin):
    list_display = [
        'id', 'order_reference', 'filed_by', 'filer',
        'reason', 'colored_status', 'resolution', 'created_at'
    ]
    list_filter = ['status', 'resolution', 'filed_by', 'reason', 'created_at']
    search_fields = ['order__reference', 'filer__username', 'complaint']
    readonly_fields = ['filer', 'created_at', 'updated_at', 'provider_responded_at', 'resolved_at', 'appealed_at']
    date_hierarchy = 'created_at'
    list_per_page = 30

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
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    ordering = ['-created_at']

    actions = ['resolve_in_buyer_favor', 'resolve_in_seller_favor', 'mark_under_review', 'export_to_csv']

    def order_reference(self, obj):
        """Display order reference"""
        return obj.order.reference if obj.order else "N/A"
    order_reference.short_description = 'Order Reference'

    def colored_status(self, obj):
        """Display status with color coding"""
        colors = {
            'open': 'orange',
            'under_review': 'blue',
            'resolved': 'green',
            'closed': 'gray'
        }
        color = colors.get(obj.status, 'black')
        return format_html(
            '<span style="color: {}; font-weight: bold;">{}</span>',
            color,
            obj.status.upper()
        )
    colored_status.short_description = 'Status'

    def resolve_in_buyer_favor(self, request, queryset):
        """Resolve disputes in buyer's favor (refund)"""
        from wallet.models import EscrowTransaction
        updated = 0

        for dispute in queryset.filter(status__in=['open', 'under_review']):
            dispute.status = 'resolved'
            dispute.resolution = 'buyer_favor'
            dispute.admin_decision = 'Refund issued to buyer by admin action'
            dispute.resolved_at = timezone.now()
            dispute.resolved_by = request.user
            dispute.save()

            # Refund escrow
            try:
                escrow = EscrowTransaction.objects.get(order=dispute.order, status='held')
                escrow.refund()

                # Cancel the order
                dispute.order.status = 'cancelled'
                dispute.order.save()
            except EscrowTransaction.DoesNotExist:
                pass

            updated += 1

        self.message_user(request, f"{updated} dispute(s) resolved in buyer's favor. Funds refunded.")
    resolve_in_buyer_favor.short_description = "Resolve in buyer's favor (refund)"

    def resolve_in_seller_favor(self, request, queryset):
        """Resolve disputes in seller's favor (release escrow)"""
        from wallet.models import EscrowTransaction
        updated = 0

        for dispute in queryset.filter(status__in=['open', 'under_review']):
            dispute.status = 'resolved'
            dispute.resolution = 'seller_favor'
            dispute.admin_decision = 'Seller was right, escrow released by admin'
            dispute.resolved_at = timezone.now()
            dispute.resolved_by = request.user
            dispute.save()

            # Release escrow to seller
            try:
                escrow = EscrowTransaction.objects.get(order=dispute.order, status='held')
                escrow.release()

                # Complete the order
                dispute.order.status = 'completed'
                dispute.order.buyer_confirmed_at = timezone.now()
                dispute.order.save()
            except EscrowTransaction.DoesNotExist:
                pass

            updated += 1

        self.message_user(request, f"{updated} dispute(s) resolved in seller's favor. Escrow released.")
    resolve_in_seller_favor.short_description = "Resolve in seller's favor (release)"

    def mark_under_review(self, request, queryset):
        """Mark disputes as under review"""
        updated = queryset.filter(status='open').update(
            status='under_review',
            assigned_to=request.user
        )
        self.message_user(request, f"{updated} dispute(s) marked as under review.")
    mark_under_review.short_description = "Mark as under review"

    def export_to_csv(self, request, queryset):
        """Export selected disputes to CSV"""
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="disputes.csv"'

        writer = csv.writer(response)
        writer.writerow([
            'ID', 'Order Reference', 'Filed By', 'Filer Username', 'Reason',
            'Status', 'Resolution', 'Created At', 'Resolved At'
        ])

        for dispute in queryset:
            writer.writerow([
                dispute.id,
                dispute.order.reference if dispute.order else 'N/A',
                dispute.filed_by,
                dispute.filer.username if dispute.filer else 'N/A',
                dispute.reason,
                dispute.status,
                dispute.resolution or 'N/A',
                dispute.created_at.strftime('%Y-%m-%d %H:%M:%S'),
                dispute.resolved_at.strftime('%Y-%m-%d %H:%M:%S') if dispute.resolved_at else 'N/A'
            ])

        return response
    export_to_csv.short_description = "Export selected to CSV"
