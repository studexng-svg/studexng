# wallet/admin.py
from django.contrib import admin
from django.utils import timezone
from django.utils.html import format_html
from django.http import HttpResponse
from django.db.models import Sum
import csv
from .models import Wallet, WalletTransaction, EscrowTransaction, BankAccount


@admin.register(Wallet)
class WalletAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'balance_display', 'account_number', 'created_at')
    list_filter = ('created_at',)
    search_fields = ('user__username', 'user__email', 'account_number')
    readonly_fields = ('created_at', 'updated_at', 'get_total_credit', 'get_total_debit', 'get_escrow_balance')
    date_hierarchy = 'created_at'

    fieldsets = (
        ('Wallet Info', {
            'fields': ('user', 'balance', 'account_number')
        }),
        ('Statistics', {
            'fields': ('get_total_credit', 'get_total_debit', 'get_escrow_balance'),
            'classes': ('collapse',)
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )

    actions = ['export_to_csv']

    def balance_display(self, obj):
        """Display balance with currency formatting"""
        return format_html(
            '<span style="color: green; font-weight: bold;">₦{:,.2f}</span>',
            float(obj.balance)
        )
    balance_display.short_description = 'Balance'

    def get_total_credit(self, obj):
        """Calculate total credits (money in)"""
        total = WalletTransaction.objects.filter(
            wallet=obj,
            type='credit',
            status='success'
        ).aggregate(total=Sum('amount'))['total'] or 0
        return f"₦{total:,.2f}"
    get_total_credit.short_description = 'Total Money In'

    def get_total_debit(self, obj):
        """Calculate total debits (money out)"""
        total = WalletTransaction.objects.filter(
            wallet=obj,
            type='debit',
            status='success'
        ).aggregate(total=Sum('amount'))['total'] or 0
        return f"₦{total:,.2f}"
    get_total_debit.short_description = 'Total Money Out'

    def get_escrow_balance(self, obj):
        """Calculate money held in escrow"""
        total = EscrowTransaction.objects.filter(
            seller=obj.user,
            status='held'
        ).aggregate(total=Sum('seller_amount'))['total'] or 0
        return f"₦{total:,.2f}"
    get_escrow_balance.short_description = 'Funds in Escrow'

    def export_to_csv(self, request, queryset):
        """Export selected wallets to CSV"""
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="wallets.csv"'

        writer = csv.writer(response)
        writer.writerow([
            'ID', 'User', 'Email', 'Account Number', 'Balance',
            'Total Credit', 'Total Debit', 'Escrow Balance', 'Created At'
        ])

        for wallet in queryset:
            total_credit = WalletTransaction.objects.filter(
                wallet=wallet,
                type='credit',
                status='success'
            ).aggregate(total=Sum('amount'))['total'] or 0

            total_debit = WalletTransaction.objects.filter(
                wallet=wallet,
                type='debit',
                status='success'
            ).aggregate(total=Sum('amount'))['total'] or 0

            escrow_balance = EscrowTransaction.objects.filter(
                seller=wallet.user,
                status='held'
            ).aggregate(total=Sum('seller_amount'))['total'] or 0

            writer.writerow([
                wallet.id,
                wallet.user.username,
                wallet.user.email,
                wallet.account_number,
                float(wallet.balance),
                float(total_credit),
                float(total_debit),
                float(escrow_balance),
                wallet.created_at.strftime('%Y-%m-%d %H:%M:%S')
            ])

        return response
    export_to_csv.short_description = "Export selected to CSV"


@admin.register(WalletTransaction)
class WalletTransactionAdmin(admin.ModelAdmin):
    list_display = ('id', 'get_user', 'type', 'amount_display', 'colored_status', 'description', 'created_at')
    list_filter = ('type', 'status', 'created_at')
    search_fields = ('wallet__user__username', 'wallet__user__email', 'reference', 'description')
    readonly_fields = ('created_at', 'updated_at')
    list_per_page = 50
    date_hierarchy = 'created_at'

    fieldsets = (
        ('Transaction Details', {
            'fields': ('wallet', 'type', 'amount', 'status', 'description', 'reference')
        }),
        ('Related Records', {
            'fields': ('order',),
            'classes': ('collapse',)
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )

    actions = ['export_to_csv']

    def get_user(self, obj):
        """Get username from wallet"""
        return obj.wallet.user.username
    get_user.short_description = 'User'

    def amount_display(self, obj):
        """Display amount with color coding"""
        color = 'green' if obj.type == 'credit' else 'red'
        prefix = '+' if obj.type == 'credit' else '-'
        return format_html(
            '<span style="color: {}; font-weight: bold;">{} ₦{:,.2f}</span>',
            color,
            prefix,
            float(obj.amount)
        )
    amount_display.short_description = 'Amount'

    def colored_status(self, obj):
        """Display status with color coding"""
        colors = {
            'success': 'green',
            'pending': 'orange',
            'failed': 'red'
        }
        color = colors.get(obj.status, 'black')
        return format_html(
            '<span style="color: {}; font-weight: bold;">{}</span>',
            color,
            obj.status.upper()
        )
    colored_status.short_description = 'Status'

    def export_to_csv(self, request, queryset):
        """Export selected wallet transactions to CSV"""
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="wallet_transactions.csv"'

        writer = csv.writer(response)
        writer.writerow([
            'ID', 'User', 'Type', 'Amount', 'Status', 'Description',
            'Reference', 'Order Reference', 'Created At'
        ])

        for txn in queryset:
            writer.writerow([
                txn.id,
                txn.wallet.user.username,
                txn.type,
                float(txn.amount),
                txn.status,
                txn.description or 'N/A',
                txn.reference or 'N/A',
                txn.order.reference if txn.order else 'N/A',
                txn.created_at.strftime('%Y-%m-%d %H:%M:%S')
            ])

        return response
    export_to_csv.short_description = "Export selected to CSV"


@admin.register(EscrowTransaction)
class EscrowTransactionAdmin(admin.ModelAdmin):
    list_display = (
        'id', 'order_reference', 'buyer', 'seller',
        'total_amount_display', 'seller_amount_display',
        'platform_fee_display', 'colored_status', 'created_at'
    )
    list_filter = ('status', 'created_at', 'released_at')
    search_fields = ('buyer__username', 'seller__username', 'order__reference')
    readonly_fields = ('created_at', 'released_at', 'refunded_at')
    date_hierarchy = 'created_at'
    list_per_page = 50

    fieldsets = (
        ('Escrow Details', {
            'fields': ('order', 'buyer', 'seller', 'status')
        }),
        ('Amounts', {
            'fields': ('total_amount', 'seller_amount', 'platform_fee')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'released_at', 'refunded_at'),
            'classes': ('collapse',)
        }),
    )

    actions = ['release_to_seller', 'refund_to_buyer', 'export_to_csv']

    def order_reference(self, obj):
        """Get order reference"""
        return obj.order.reference if obj.order else "N/A"
    order_reference.short_description = 'Order Ref'

    def total_amount_display(self, obj):
        """Display total amount"""
        return format_html(
            '<span style="font-weight: bold;">₦{:,.2f}</span>',
            float(obj.total_amount)
        )
    total_amount_display.short_description = 'Total Amount'

    def seller_amount_display(self, obj):
        """Display seller amount (95%)"""
        return format_html(
            '<span style="color: green;">₦{:,.2f}</span>',
            float(obj.seller_amount)
        )
    seller_amount_display.short_description = 'Seller Gets'

    def platform_fee_display(self, obj):
        """Display platform fee (5%)"""
        return format_html(
            '<span style="color: blue;">₦{:,.2f}</span>',
            float(obj.platform_fee)
        )
    platform_fee_display.short_description = 'Platform Fee'

    def colored_status(self, obj):
        """Display status with color coding"""
        colors = {
            'held': 'orange',
            'released': 'green',
            'refunded': 'red'
        }
        color = colors.get(obj.status, 'black')
        return format_html(
            '<span style="color: {}; font-weight: bold;">{}</span>',
            color,
            obj.status.upper()
        )
    colored_status.short_description = 'Status'

    def release_to_seller(self, request, queryset):
        """Release escrow to seller wallet"""
        updated = 0
        for escrow in queryset.filter(status='held'):
            escrow.release()
            updated += 1

        self.message_user(request, f"{updated} escrow transaction(s) released to seller wallets.")
    release_to_seller.short_description = "Release to seller (95% to wallet)"

    def refund_to_buyer(self, request, queryset):
        """Refund escrow to buyer wallet"""
        updated = 0
        for escrow in queryset.filter(status='held'):
            escrow.refund()
            updated += 1

        self.message_user(request, f"{updated} escrow transaction(s) refunded to buyers.")
    refund_to_buyer.short_description = "Refund to buyer (full amount)"

    def export_to_csv(self, request, queryset):
        """Export selected escrow transactions to CSV"""
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="escrow_transactions.csv"'

        writer = csv.writer(response)
        writer.writerow([
            'ID', 'Order Reference', 'Buyer', 'Seller', 'Total Amount',
            'Seller Amount', 'Platform Fee', 'Status', 'Created At', 'Released At', 'Refunded At'
        ])

        for escrow in queryset:
            writer.writerow([
                escrow.id,
                escrow.order.reference if escrow.order else 'N/A',
                escrow.buyer.username,
                escrow.seller.username,
                float(escrow.total_amount),
                float(escrow.seller_amount),
                float(escrow.platform_fee),
                escrow.status,
                escrow.created_at.strftime('%Y-%m-%d %H:%M:%S'),
                escrow.released_at.strftime('%Y-%m-%d %H:%M:%S') if escrow.released_at else 'N/A',
                escrow.refunded_at.strftime('%Y-%m-%d %H:%M:%S') if escrow.refunded_at else 'N/A'
            ])

        return response
    export_to_csv.short_description = "Export selected to CSV"


@admin.register(BankAccount)
class BankAccountAdmin(admin.ModelAdmin):
    list_display = (
        'id', 'user', 'account_holder_name', 'bank_name',
        'masked_account_number', 'verified_badge', 'created_at'
    )
    list_filter = ('is_verified', 'created_at', 'bank_name')
    search_fields = ('user__username', 'user__email', 'account_holder_name', 'account_number')
    readonly_fields = ('created_at', 'updated_at')
    date_hierarchy = 'created_at'

    fieldsets = (
        ('Account Details', {
            'fields': ('user', 'account_holder_name', 'account_number', 'bank_name', 'bank_code')
        }),
        ('Verification', {
            'fields': ('is_verified',)
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )

    actions = ['verify_accounts', 'unverify_accounts', 'export_to_csv']

    def masked_account_number(self, obj):
        """Display masked account number for security"""
        return f"****{obj.account_number[-4:]}"
    masked_account_number.short_description = 'Account Number'

    def verified_badge(self, obj):
        """Display verification badge"""
        if obj.is_verified:
            return format_html(
                '<span style="color: green; font-weight: bold;">✓ VERIFIED</span>'
            )
        else:
            return format_html(
                '<span style="color: red; font-weight: bold;">✗ UNVERIFIED</span>'
            )
    verified_badge.short_description = 'Verification Status'

    def verify_accounts(self, request, queryset):
        """Verify selected bank accounts"""
        updated = queryset.update(is_verified=True)
        self.message_user(request, f"{updated} bank account(s) verified. Users can now withdraw.")
    verify_accounts.short_description = "Verify selected bank accounts"

    def unverify_accounts(self, request, queryset):
        """Unverify selected bank accounts"""
        updated = queryset.update(is_verified=False)
        self.message_user(request, f"{updated} bank account(s) unverified.")
    unverify_accounts.short_description = "Unverify selected bank accounts"

    def export_to_csv(self, request, queryset):
        """Export selected bank accounts to CSV"""
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="bank_accounts.csv"'

        writer = csv.writer(response)
        writer.writerow([
            'ID', 'User', 'Account Holder Name', 'Bank Name',
            'Bank Code', 'Account Number', 'Is Verified', 'Created At'
        ])

        for account in queryset:
            writer.writerow([
                account.id,
                account.user.username,
                account.account_holder_name,
                account.bank_name,
                account.bank_code or 'N/A',
                account.account_number,
                'Yes' if account.is_verified else 'No',
                account.created_at.strftime('%Y-%m-%d %H:%M:%S')
            ])

        return response
    export_to_csv.short_description = "Export selected to CSV"