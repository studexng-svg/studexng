# wallet/admin.py
from django.contrib import admin
from .models import Wallet, WalletTransaction, EscrowTransaction, BankAccount


@admin.register(Wallet)
class WalletAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'balance', 'account_number', 'created_at')
    list_filter = ('created_at',)
    search_fields = ('user__username', 'account_number')
    readonly_fields = ('created_at', 'updated_at')


@admin.register(WalletTransaction)
class WalletTransactionAdmin(admin.ModelAdmin):
    list_display = ('id', 'wallet', 'type', 'amount', 'status', 'created_at')
    list_filter = ('type', 'status', 'created_at')
    search_fields = ('wallet__user__username', 'reference')
    readonly_fields = ('created_at', 'updated_at')
    list_per_page = 25


@admin.register(EscrowTransaction)
class EscrowTransactionAdmin(admin.ModelAdmin):
    list_display = ('id', 'order', 'total_amount', 'status', 'created_at')
    list_filter = ('status', 'created_at')
    search_fields = ('buyer__username', 'seller__username')
    readonly_fields = ('created_at', 'released_at', 'refunded_at')


@admin.register(BankAccount)
class BankAccountAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'account_number', 'bank_name', 'is_verified', 'created_at')
    list_filter = ('is_verified', 'created_at')
    search_fields = ('user__username', 'account_holder_name')