# payments/admin.py
from django.contrib import admin
from django.utils.html import format_html
from django.http import HttpResponse
import csv
from .models import SellerBankAccount, PaymentTransaction


@admin.register(SellerBankAccount)
class SellerBankAccountAdmin(admin.ModelAdmin):
    list_display = ['user', 'bank_name', 'account_number', 'account_name', 'flw_subaccount_display', 'is_active', 'created_at']
    search_fields = ['user__username', 'bank_name', 'account_number', 'account_name']
    list_filter = ['is_active', 'bank_name']
    readonly_fields = ['created_at', 'updated_at']
 
    def flw_subaccount_display(self, obj):
        return obj.flw_subaccount_id or '—'
    flw_subaccount_display.short_description = 'FLW Subaccount ID'
 
 


@admin.register(PaymentTransaction)
class PaymentTransactionAdmin(admin.ModelAdmin):
    list_display = [
        'reference', 'buyer', 'seller', 'amount_display',
        'seller_amount_display', 'platform_amount_display',
        'order_type', 'colored_status', 'created_at'
    ]
    list_filter = ['status', 'order_type', 'created_at']
    search_fields = ['reference', 'buyer__username', 'seller__username', 'buyer_email']
    readonly_fields = ['created_at', 'updated_at', 'flw_response']
    ordering = ['-created_at']
    date_hierarchy = 'created_at'
    list_per_page = 50

    def amount_display(self, obj):
        # ✅ Format the number to a string FIRST, then pass to format_html
        # Passing float directly with {:,.2f} breaks in Python 3.14 because
        # format_html wraps args in SafeString which only supports string format specs
        amount = f"₦{float(obj.amount):,.2f}"
        return format_html('<strong>{}</strong>', amount)
    amount_display.short_description = 'Total'

    def seller_amount_display(self, obj):
        amount = f"₦{float(obj.seller_amount):,.2f}"
        return format_html('<span style="color:green;">{}</span>', amount)
    seller_amount_display.short_description = 'Vendor Share'

    def platform_amount_display(self, obj):
        amount = f"₦{float(obj.platform_amount):,.2f}"
        return format_html('<span style="color:purple;">{}</span>', amount)
    platform_amount_display.short_description = 'Platform Fee'

    def colored_status(self, obj):
        colors = {'success': 'green', 'pending': 'orange', 'failed': 'red', 'refunded': 'blue'}
        color = colors.get(obj.status, 'black')
        return format_html(
            '<span style="color:{};font-weight:bold;">{}</span>',
            color,
            obj.status.upper()
        )
    colored_status.short_description = 'Status'

    actions = ['export_to_csv']

    def export_to_csv(self, request, queryset):
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="transactions.csv"'
        writer = csv.writer(response)
        writer.writerow(['Reference', 'Buyer', 'Seller', 'Amount', 'Vendor Amount', 'Platform Fee', 'Type', 'Status', 'Date'])
        for t in queryset:
            writer.writerow([
                t.reference,
                t.buyer.username if t.buyer else 'N/A',
                t.seller.username if t.seller else 'N/A',
                float(t.amount), float(t.seller_amount), float(t.platform_amount),
                t.order_type, t.status,
                t.created_at.strftime('%Y-%m-%d %H:%M:%S'),
            ])
        return response
    export_to_csv.short_description = "Export to CSV"