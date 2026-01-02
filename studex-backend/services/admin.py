# services/admin.py
from django.contrib import admin
from django.utils import timezone
from .models import Category, Listing, Transaction


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ('title', 'slug')
    search_fields = ('title',)
    prepopulated_fields = {"slug": ("title",)}
    ordering = ('title',)


@admin.register(Listing)
class ListingAdmin(admin.ModelAdmin):
    list_display = ('title', 'vendor', 'category', 'price', 'is_available', 'created_at')
    list_filter = ('category', 'is_available', 'vendor__is_verified_vendor', 'vendor__user_type')
    search_fields = ('title', 'description', 'vendor__username', 'vendor__business_name')
    readonly_fields = ('created_at', 'updated_at')
    raw_id_fields = ('vendor',)

    fieldsets = (
        ('Product Info', {
            'fields': ('title', 'description', 'price', 'image', 'category')
        }),
        ('Vendor & Availability', {
            'fields': ('vendor', 'is_available')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',),
        }),
    )

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if not request.user.is_superuser:
            qs = qs.filter(vendor__is_verified_vendor=True)
        return qs


@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    list_display = ('vendor', 'amount', 'status', 'created_at', 'released_at', 'withdrawn_at')  # ← Removed 'order'
    list_filter = ('status', 'created_at', 'released_at')
    search_fields = ('vendor__username', 'vendor__business_name')
    readonly_fields = ('created_at', 'released_at', 'withdrawn_at')  # ← Removed 'order'
    raw_id_fields = ('vendor',)

    fieldsets = (
        ('Transaction Info', {
            'fields': ('vendor', 'amount', 'status')
        }),
        ('Escrow & Payout Dates', {
            'fields': ('created_at', 'released_at', 'withdrawn_at'),
            'classes': ('collapse',),
        }),
    )

    actions = ['release_to_wallet', 'mark_as_withdrawn']

    def release_to_wallet(self, request, queryset):
        updated = 0
        for txn in queryset.filter(status='in_escrow'):
            txn.status = 'released'
            txn.released_at = timezone.now()
            txn.save()
            
            # Add money to vendor wallet
            txn.vendor.wallet_balance += txn.amount
            txn.vendor.save()
            
            updated += 1
        
        self.message_user(request, f"{updated} transaction(s) released to vendor wallet.")
    release_to_wallet.short_description = "Release selected escrow to vendor wallet"

    def mark_as_withdrawn(self, request, queryset):
        updated = queryset.filter(status='released').update(
            status='withdrawn',
            withdrawn_at=timezone.now()
        )
        self.message_user(request, f"{updated} transaction(s) marked as withdrawn.")
    mark_as_withdrawn.short_description = "Mark selected as withdrawn to bank"

    def has_add_permission(self, request):
        return False