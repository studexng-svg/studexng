# payments/admin.py
from django.contrib import admin, messages
from django.utils.html import format_html
from django.utils import timezone
from django.http import HttpResponse
from django.db.models import Sum
import csv
from .models import (
    SellerBankAccount, PaymentTransaction, PricingSettings,
    EscrowReconciliationLog, VendorDebt, PayoutAuditRecord, CampusPricingSettings,
    BankTransferSettings, ManualRefund,
)
from .views import trigger_vendor_payout
from .reconciliation import run_reconciliation


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


@admin.register(BankTransferSettings)
class BankTransferSettingsAdmin(admin.ModelAdmin):
    """
    Singleton — temporary switch for menu-vendor checkout to bypass Paystack
    while Payout on Demand isn't yet approved. Flip is_enabled off to revert
    every menu vendor to normal Paystack checkout, no other change needed.
    """
    list_display = ['is_enabled', 'account_name', 'account_number', 'bank_name', 'updated_at']
    readonly_fields = ['updated_at']

    def has_add_permission(self, request):
        return not BankTransferSettings.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(CampusPricingSettings)
class CampusPricingSettingsAdmin(admin.ModelAdmin):
    """
    Editing here directly (rather than via AdminPricingSettingsView) does NOT
    retroactively recompute the affected listing prices — use the API for
    any change that should actually take effect on existing listings.
    """
    list_display = ['get_campus_display', 'scope_display', 'service_fee_percent_display', 'updated_at']
    list_filter = ['campus', 'vendor_type']
    readonly_fields = ['updated_at']

    def scope_display(self, obj):
        if obj.vendor_type_id:
            return obj.vendor_type.display_name
        return format_html('<em>campus default</em>')
    scope_display.short_description = 'Scope'

    def service_fee_percent_display(self, obj):
        if obj.service_fee_percent is None:
            return format_html('<span style="color:gray;">inherits next level</span>')
        return f'{obj.service_fee_percent}%'
    service_fee_percent_display.short_description = 'Fee'


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
        'order_type', 'colored_status', 'payout_status_display', 'transfer_reference', 'created_at'
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
        colors = {'success': 'green', 'pending': 'orange', 'failed': 'red', 'refunded': 'blue', 'refund_pending': 'darkorange'}
        color = colors.get(obj.status, 'black')
        return format_html(
            '<span style="color:{};font-weight:bold;">{}</span>',
            color,
            obj.status.upper()
        )
    colored_status.short_description = 'Status'

    def payout_status_display(self, obj):
        # Vendor payouts fail silently (trigger_vendor_payout never raises —
        # webhooks must always return 200), so this is the one place an admin
        # can see it without reading Render logs. Blank means no payout has
        # been attempted yet (payment not settled, or vendor has no bank
        # account on file) — not the same thing as a failed one.
        if obj.transfer_status == 'failed':
            return format_html('<span style="color:white;background:#DC2626;font-weight:bold;padding:2px 8px;border-radius:10px;">⚠ PAYOUT FAILED</span>')
        if obj.transfer_status == 'success':
            return format_html('<span style="color:green;font-weight:bold;">✓ Paid</span>')
        if obj.transfer_status == 'offset_by_debt':
            return format_html('<span style="color:#7C3AED;font-weight:bold;">Debt Offset</span>')
        if obj.transfer_status == 'reversed':
            return format_html('<span style="color:white;background:#EA580C;font-weight:bold;padding:2px 8px;border-radius:10px;">⚠ REVERSED</span>')
        if obj.transfer_status == 'pending':
            return format_html('<span style="color:orange;font-weight:bold;">Pending</span>')
        return format_html('<span style="color:gray;">—</span>')
    payout_status_display.short_description = 'Payout'

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
            trigger_vendor_payout(txn, listing_title)
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


@admin.register(EscrowReconciliationLog)
class EscrowReconciliationLogAdmin(admin.ModelAdmin):
    list_display = [
        'checked_at', 'paystack_balance_display', 'expected_balance_display',
        'discrepancy_display', 'flagged_badge',
    ]
    list_filter = ['is_flagged', 'resolved']
    readonly_fields = [
        'checked_at', 'paystack_balance', 'expected_held_for_vendors',
        'expected_platform_revenue', 'expected_balance', 'discrepancy', 'is_flagged',
    ]
    fields = [
        'checked_at', 'paystack_balance', 'expected_held_for_vendors',
        'expected_platform_revenue', 'expected_balance', 'discrepancy', 'is_flagged',
        'resolved', 'resolved_by', 'resolved_at', 'notes',
    ]
    ordering = ['-checked_at']
    actions = ['run_reconciliation_now', 'mark_resolved']

    def has_add_permission(self, request):
        # Only ever created by the reconciliation job/action, never by hand —
        # a manually-created row would misrepresent an actual balance check.
        return False

    def paystack_balance_display(self, obj):
        return format_html('₦{}', f'{obj.paystack_balance:,.2f}')
    paystack_balance_display.short_description = 'Actual Balance'

    def expected_balance_display(self, obj):
        return format_html('₦{}', f'{obj.expected_balance:,.2f}')
    expected_balance_display.short_description = 'Expected Balance'

    def discrepancy_display(self, obj):
        color = 'red' if (obj.is_flagged and not obj.resolved) else 'green'
        return format_html('<span style="color:{};font-weight:bold;">₦{}</span>', color, f'{obj.discrepancy:,.2f}')
    discrepancy_display.short_description = 'Discrepancy'

    def flagged_badge(self, obj):
        if obj.resolved:
            return format_html('<span style="color:gray;">Resolved</span>')
        if obj.is_flagged:
            return format_html('<span style="color:red;font-weight:bold;">⚠ FLAGGED</span>')
        return format_html('<span style="color:green;">OK</span>')
    flagged_badge.short_description = 'Status'

    def run_reconciliation_now(self, request, queryset):
        try:
            log = run_reconciliation()
            if log.is_flagged:
                self.message_user(
                    request,
                    f"Reconciliation run complete — DISCREPANCY of ₦{log.discrepancy:,.2f} flagged.",
                    level=messages.ERROR,
                )
            else:
                self.message_user(
                    request,
                    f"Reconciliation run complete — balanced (₦{log.discrepancy:,.2f}, within tolerance).",
                )
        except Exception as e:
            self.message_user(request, f"Reconciliation run failed: {e}", level=messages.ERROR)
    run_reconciliation_now.short_description = "Run a new reconciliation check now"

    def mark_resolved(self, request, queryset):
        updated = queryset.update(resolved=True, resolved_by=request.user, resolved_at=timezone.now())
        self.message_user(request, f"{updated} log(s) marked resolved.")
    mark_resolved.short_description = "Mark selected as resolved"


@admin.register(VendorDebt)
class VendorDebtAdmin(admin.ModelAdmin):
    list_display = [
        'vendor', 'original_amount_display', 'outstanding_amount_display',
        'status_badge', 'source_transaction', 'created_at', 'settled_at',
    ]
    list_filter = ['status', 'created_at']
    search_fields = ['vendor__username', 'source_transaction__reference', 'reason']
    readonly_fields = ['vendor', 'source_transaction', 'original_amount', 'created_at']
    ordering = ['-created_at']
    actions = ['write_off']

    def has_add_permission(self, request):
        # Only ever created automatically by refund_payment() when a refund
        # is issued after payout — a manually-added row wouldn't correspond
        # to a real refund that actually happened.
        return False

    def original_amount_display(self, obj):
        return format_html('₦{}', f'{obj.original_amount:,.2f}')
    original_amount_display.short_description = 'Original'

    def outstanding_amount_display(self, obj):
        color = 'red' if obj.status == 'outstanding' else 'gray'
        return format_html('<span style="color:{};font-weight:bold;">₦{}</span>', color, f'{obj.outstanding_amount:,.2f}')
    outstanding_amount_display.short_description = 'Outstanding'

    def status_badge(self, obj):
        colors = {'outstanding': 'red', 'settled': 'green', 'written_off': 'gray'}
        return format_html(
            '<span style="color:{};font-weight:bold;">{}</span>',
            colors.get(obj.status, 'black'), obj.get_status_display(),
        )
    status_badge.short_description = 'Status'

    def write_off(self, request, queryset):
        updated = queryset.filter(status='outstanding').update(
            status='written_off', outstanding_amount=0, settled_at=timezone.now(),
        )
        self.message_user(request, f"{updated} debt(s) written off.")
    write_off.short_description = "Write off selected debts (vendor will not be charged)"


@admin.register(ManualRefund)
class ManualRefundAdmin(admin.ModelAdmin):
    """
    Paper trail for refunds that can't go through Paystack — the temporary
    bank-transfer checkout path (payments.models.BankTransferSettings) has
    no real Paystack transaction to refund, so a buyer submits their own
    bank details here and an admin sends the money back manually, then
    marks it refunded with the action below.
    """
    list_display = [
        'id', 'buyer', 'amount_display', 'order_link', 'status_badge',
        'buyer_account_name', 'buyer_account_number', 'buyer_bank_name', 'created_at',
    ]
    list_filter = ['status', 'created_at']
    search_fields = ['buyer__username', 'buyer__email', 'order__reference', 'buyer_account_number']
    readonly_fields = [
        'order', 'order_item', 'buyer', 'amount', 'reason', 'created_at',
        'buyer_account_name', 'buyer_account_number', 'buyer_bank_name',
        'resolved_at', 'resolved_by',
    ]
    ordering = ['-created_at']
    actions = ['mark_refunded']

    def has_add_permission(self, request):
        # Only ever created automatically by payments.item_refund.
        # mark_order_item_unavailable — a manually-added row wouldn't
        # correspond to a real refund owed.
        return False

    def amount_display(self, obj):
        return format_html('<strong>₦{}</strong>', f'{obj.amount:,.2f}')
    amount_display.short_description = 'Amount'

    def order_link(self, obj):
        return obj.order.reference
    order_link.short_description = 'Order'

    def status_badge(self, obj):
        colors = {'awaiting_bank_details': 'orange', 'awaiting_admin_action': 'purple', 'completed': 'green'}
        return format_html(
            '<span style="color:{};font-weight:bold;">{}</span>',
            colors.get(obj.status, 'black'), obj.get_status_display(),
        )
    status_badge.short_description = 'Status'

    def mark_refunded(self, request, queryset):
        pending = queryset.filter(status='awaiting_admin_action')
        count = 0
        for refund in pending:
            refund.status = 'completed'
            refund.resolved_at = timezone.now()
            refund.resolved_by = request.user
            refund.save(update_fields=['status', 'resolved_at', 'resolved_by'])
            try:
                from accounts.utils import send_notification
                send_notification(
                    recipient=refund.buyer, notification_type='order_update',
                    title='Refund Sent',
                    message=(
                        f'₦{refund.amount:,.2f} has been sent to {refund.buyer_account_name} '
                        f'({refund.buyer_bank_name}).'
                    ),
                    action_url=f'/account/refunds/{refund.id}',
                )
            except Exception:
                pass
            count += 1
        skipped = queryset.count() - count
        msg = f"{count} refund(s) marked as sent."
        if skipped:
            msg += f" {skipped} skipped (not yet awaiting admin action)."
        self.message_user(request, msg)
    mark_refunded.short_description = "Mark selected as refunded (money already sent manually)"


@admin.register(PayoutAuditRecord)
class PayoutAuditRecordAdmin(admin.ModelAdmin):
    """
    Permanent payout audit trail — one row per transaction, written by
    record_payout_audit() from every place a payout resolves. Never
    hand-editable: the whole point is that this reflects what actually
    happened, not what an admin wishes had happened.
    """
    list_display = [
        'transaction', 'vendor', 'rider', 'amount_released_display',
        'transfer_status', 'pickup_verified_at', 'created_at',
    ]
    list_filter = ['transfer_status', 'created_at']
    search_fields = ['transaction__reference', 'vendor__username', 'rider__username', 'transfer_reference']
    readonly_fields = [
        'transaction', 'order_id', 'vendor', 'rider', 'delivery_assignment',
        'pickup_verified_at', 'pickup_evidence_image',
        'transfer_reference', 'transfer_status', 'amount_released',
        'created_at', 'updated_at',
    ]
    ordering = ['-created_at']

    def amount_released_display(self, obj):
        return format_html('₦{}', f'{obj.amount_released:,.2f}')
    amount_released_display.short_description = 'Amount Released'

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False