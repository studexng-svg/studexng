# payments/admin.py
from django.contrib import admin
from django.utils.html import format_html
from django.http import HttpResponse
from django.db.models import Sum
import csv
from .models import SellerBankAccount, PaymentTransaction, PricingSettings
from .views import _transfer_to_vendor


@admin.register(PricingSettings)
class PricingSettingsAdmin(admin.ModelAdmin):
    """
    Singleton — use the AdminPricingSettingsView API (/api/admin/pricing-settings/)
    for the retroactive-recompute behavior; editing here directly does NOT recompute
    existing listings' prices.
    """
    list_display = ['service_fee_percent', 'updated_at']
    readonly_fields = ['updated_at']

    def has_add_permission(self, request):
        return not PricingSettings.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(SellerBankAccount)
class SellerBankAccountAdmin(admin.ModelAdmin):
    list_display = ['user', 'bank_name', 'account_number', 'account_name', 'paystack_subaccount_display', 'is_active', 'created_at']
    search_fields = ['user__username', 'bank_name', 'account_number', 'account_name']
    list_filter = ['is_active', 'bank_name']
    readonly_fields = ['created_at', 'updated_at']
 
    def paystack_subaccount_display(self, obj):
        return obj.paystack_subaccount_code or '—'
    paystack_subaccount_display.short_description = 'Paystack Subaccount Code'
 
 


@admin.register(PaymentTransaction)
class PaymentTransactionAdmin(admin.ModelAdmin):
    list_display = [
        'reference', 'buyer', 'seller', 'amount_display',
        'seller_amount_display', 'platform_amount_display', 'net_platform_display',
        'order_type', 'colored_status', 'transfer_status', 'transfer_reference', 'created_at'
    ]
    list_filter = ['status', 'transfer_status', 'order_type', 'created_at']
    search_fields = ['reference', 'buyer__username', 'seller__username', 'buyer_email', 'transfer_reference']
    readonly_fields = ['created_at', 'updated_at', 'paystack_response', 'transfer_reference', 'transfer_status']
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
    platform_amount_display.short_description = 'Gross Fee'

    def net_platform_display(self, obj):
        net = float(obj.platform_amount) - float(obj.paystack_charge_fee) - float(obj.transfer_fee)
        color = "green" if net >= 0 else "red"
        return format_html('<span style="color:{};font-weight:bold;">₦{}</span>', color, f'{net:,.2f}')
    net_platform_display.short_description = 'Net Profit'

    def colored_status(self, obj):
        colors = {'success': 'green', 'pending': 'orange', 'failed': 'red', 'refunded': 'blue'}
        color = colors.get(obj.status, 'black')
        return format_html(
            '<span style="color:{};font-weight:bold;">{}</span>',
            color,
            obj.status.upper()
        )
    colored_status.short_description = 'Status'

    def changelist_view(self, request, extra_context=None):
        successful = PaymentTransaction.objects.filter(status='success')
        totals = successful.aggregate(
            volume=Sum('amount'),
            vendor=Sum('seller_amount'),
            platform=Sum('platform_amount'),
            paystack_fees=Sum('paystack_charge_fee'),
            transfer_fees=Sum('transfer_fee'),
        )
        gross = float(totals['platform'] or 0)
        paystack_fees = float(totals['paystack_fees'] or 0)
        transfer_fees = float(totals['transfer_fees'] or 0)
        net = gross - paystack_fees - transfer_fees
        extra_context = extra_context or {}
        extra_context['payment_totals'] = {
            'volume': f"₦{float(totals['volume'] or 0):,.2f}",
            'vendor': f"₦{float(totals['vendor'] or 0):,.2f}",
            'platform_gross': f"₦{gross:,.2f}",
            'paystack_fees': f"₦{paystack_fees:,.2f}",
            'transfer_fees': f"₦{transfer_fees:,.2f}",
            'platform_net': f"₦{net:,.2f}",
        }
        return super().changelist_view(request, extra_context=extra_context)

    actions = ['retry_transfer', 'export_to_csv']

    def retry_transfer(self, request, queryset):
        sent = 0
        skipped = 0
        for txn in queryset.filter(status='success'):
            if txn.transfer_reference:
                skipped += 1
                continue
            if not txn.seller:
                skipped += 1
                continue
            listing_title = ''
            try:
                from orders.models import Order
                order = Order.objects.select_related('listing').get(id=txn.order_id)
                listing_title = order.listing.title
            except Exception:
                pass
            _transfer_to_vendor(txn, listing_title)
            txn.refresh_from_db(fields=['transfer_reference'])
            if txn.transfer_reference:
                sent += 1
            else:
                skipped += 1
        self.message_user(
            request,
            f"Transfer initiated for {sent} transaction(s). {skipped} skipped (already paid or no bank account)."
        )
    retry_transfer.short_description = "Retry vendor payout transfer"

    def export_to_csv(self, request, queryset):
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="transactions.csv"'
        writer = csv.writer(response)
        writer.writerow([
            'Reference', 'Buyer', 'Seller', 'Amount Paid', 'Vendor Amount',
            'Gross Platform Fee', 'Paystack Charge Fee', 'Transfer Fee', 'Net Platform Profit',
            'Type', 'Status', 'Date',
        ])
        for t in queryset:
            net = float(t.platform_amount) - float(t.paystack_charge_fee) - float(t.transfer_fee)
            writer.writerow([
                t.reference,
                t.buyer.username if t.buyer else 'N/A',
                t.seller.username if t.seller else 'N/A',
                float(t.amount), float(t.seller_amount), float(t.platform_amount),
                float(t.paystack_charge_fee), float(t.transfer_fee), net,
                t.order_type, t.status,
                t.created_at.strftime('%Y-%m-%d %H:%M:%S'),
            ])
        return response
    export_to_csv.short_description = "Export to CSV"