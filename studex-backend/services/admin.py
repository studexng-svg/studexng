# services/admin.py
from django.contrib import admin
from django.utils import timezone
from django.utils.html import format_html
from django.http import HttpResponse
from django.db.models import Count
import csv
from .models import Category, Listing, Transaction


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ('title', 'slug', 'listing_count', 'active_listing_count')
    search_fields = ('title',)
    prepopulated_fields = {"slug": ("title",)}
    ordering = ('title',)
    actions = ['export_to_csv']

    def listing_count(self, obj):
        count = obj.listings.count()
        return format_html('<span style="font-weight: bold;">{}</span>', count)
    listing_count.short_description = 'Total Listings'

    def active_listing_count(self, obj):
        count = obj.listings.filter(is_available=True).count()
        return format_html('<span style="color: green; font-weight: bold;">{}</span>', count)
    active_listing_count.short_description = 'Active Listings'

    def export_to_csv(self, request, queryset):
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="categories.csv"'
        writer = csv.writer(response)
        writer.writerow(['ID', 'Title', 'Slug', 'Total Listings', 'Active Listings'])
        for category in queryset:
            writer.writerow([
                category.id, category.title, category.slug,
                category.listings.count(),
                category.listings.filter(is_available=True).count()
            ])
        return response
    export_to_csv.short_description = "Export selected to CSV"


@admin.register(Listing)
class ListingAdmin(admin.ModelAdmin):
    list_display = (
        'title', 'vendor', 'vendor_status', 'category',
        'price_display', 'availability_badge', 'order_count', 'created_at'
    )
    list_filter = ('category', 'is_available', 'vendor__is_verified_vendor', 'vendor__user_type', 'created_at')
    search_fields = ('title', 'description', 'vendor__username', 'vendor__business_name')
    readonly_fields = ('created_at', 'updated_at', 'get_total_orders', 'get_total_revenue')
    raw_id_fields = ('vendor',)
    date_hierarchy = 'created_at'
    list_per_page = 50

    fieldsets = (
        ('Product Info', {
            'fields': ('title', 'description', 'price', 'image', 'category')
        }),
        ('Vendor & Availability', {
            'fields': ('vendor', 'is_available')
        }),
        ('Statistics', {
            'fields': ('get_total_orders', 'get_total_revenue'),
            'classes': ('collapse',)
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',),
        }),
    )

    actions = ['mark_available', 'mark_unavailable', 'export_to_csv']

    def vendor_status(self, obj):
        if obj.vendor.is_verified_vendor:
            return format_html('<span style="color: green;">✓ Verified</span>')
        return format_html('<span style="color: red;">✗ Unverified</span>')
    vendor_status.short_description = 'Vendor Status'

    def price_display(self, obj):
        return format_html(
            '<span style="font-weight: bold;">₦{}</span>',
            '{:,.2f}'.format(float(obj.price))
        )
    price_display.short_description = 'Price'

    def availability_badge(self, obj):
        if obj.is_available:
            return format_html(
                '<span style="background-color: green; color: white; padding: 2px 8px; border-radius: 3px;">AVAILABLE</span>'
            )
        return format_html(
            '<span style="background-color: gray; color: white; padding: 2px 8px; border-radius: 3px;">UNAVAILABLE</span>'
        )
    availability_badge.short_description = 'Availability'

    def order_count(self, obj):
        from orders.models import Order
        return Order.objects.filter(listing=obj).count()
    order_count.short_description = 'Orders'

    def get_total_orders(self, obj):
        from orders.models import Order
        return Order.objects.filter(listing=obj).count()
    get_total_orders.short_description = 'Total Orders'

    def get_total_revenue(self, obj):
        from orders.models import Order
        from django.db.models import Sum
        revenue = Order.objects.filter(
            listing=obj, status='completed'
        ).aggregate(total=Sum('amount'))['total'] or 0
        return '₦{:,.2f}'.format(float(revenue))
    get_total_revenue.short_description = 'Total Revenue'

    def save_model(self, request, obj, form, change):
        """
        Override save_model so that when admin saves a listing,
        we detect is_available changes and notify the vendor.
        The pre_save signal handles this automatically, but this
        ensures it works even if signal registration has issues.
        """
        if change and 'is_available' in form.changed_data:
            try:
                old = Listing.objects.get(pk=obj.pk)
                if not old.is_available and obj.is_available:
                    super().save_model(request, obj, form, change)
                    from studex.notifications import notify_vendor_listing_approved
                    notify_vendor_listing_approved(obj)
                    return
                elif old.is_available and not obj.is_available:
                    super().save_model(request, obj, form, change)
                    from studex.notifications import notify_vendor_listing_deactivated
                    notify_vendor_listing_deactivated(obj)
                    return
            except Exception as e:
                import logging
                logging.getLogger(__name__).warning(f"Notification failed in save_model: {e}")
        super().save_model(request, obj, form, change)

    def mark_available(self, request, queryset):
        """Mark selected listings as available and notify each vendor."""
        count = 0
        for listing in queryset:
            if not listing.is_available:
                listing.is_available = True
                listing.save()  # triggers signal + save_model notifications
                try:
                    from studex.notifications import notify_vendor_listing_approved
                    notify_vendor_listing_approved(listing)
                except Exception:
                    pass
            count += 1
        self.message_user(request, f"{count} listing(s) marked as available.")
    mark_available.short_description = "Mark as available"

    def mark_unavailable(self, request, queryset):
        """Mark selected listings as unavailable and notify each vendor."""
        count = 0
        for listing in queryset:
            if listing.is_available:
                listing.is_available = False
                listing.save()
                try:
                    from studex.notifications import notify_vendor_listing_deactivated
                    notify_vendor_listing_deactivated(listing)
                except Exception:
                    pass
            count += 1
        self.message_user(request, f"{count} listing(s) marked as unavailable.")
    mark_unavailable.short_description = "Mark as unavailable"

    def export_to_csv(self, request, queryset):
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="listings.csv"'
        writer = csv.writer(response)
        writer.writerow([
            'ID', 'Title', 'Vendor', 'Business Name', 'Category',
            'Price', 'Is Available', 'Created At'
        ])
        for listing in queryset:
            writer.writerow([
                listing.id, listing.title, listing.vendor.username,
                listing.vendor.business_name or 'N/A',
                listing.category.title if listing.category else 'N/A',
                float(listing.price),
                'Yes' if listing.is_available else 'No',
                listing.created_at.strftime('%Y-%m-%d %H:%M:%S')
            ])
        return response
    export_to_csv.short_description = "Export selected to CSV"

    def delete_model(self, request, obj):
        """Notify vendor when admin deletes a single listing."""
        try:
            from studex.notifications import notify_vendor_listing_deleted
            notify_vendor_listing_deleted(obj.vendor, obj.title)
        except Exception:
            pass
        super().delete_model(request, obj)

    def delete_queryset(self, request, queryset):
        """Notify vendors when admin bulk-deletes listings."""
        for listing in queryset:
            try:
                from studex.notifications import notify_vendor_listing_deleted
                notify_vendor_listing_deleted(listing.vendor, listing.title)
            except Exception:
                pass
        super().delete_queryset(request, queryset)

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if not request.user.is_superuser:
            qs = qs.filter(vendor__is_verified_vendor=True)
        return qs


@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    list_display = (
        'id', 'vendor', 'amount_display', 'colored_status',
        'created_at', 'released_at', 'withdrawn_at'
    )
    list_filter = ('status', 'created_at', 'released_at')
    search_fields = ('vendor__username', 'vendor__business_name')
    readonly_fields = ('created_at', 'released_at', 'withdrawn_at')
    raw_id_fields = ('vendor',)
    date_hierarchy = 'created_at'
    list_per_page = 50

    fieldsets = (
        ('Transaction Info', {
            'fields': ('vendor', 'amount', 'status')
        }),
        ('Escrow & Payout Dates', {
            'fields': ('created_at', 'released_at', 'withdrawn_at'),
            'classes': ('collapse',),
        }),
    )

    actions = ['release_to_wallet', 'mark_as_withdrawn', 'export_to_csv']

    def amount_display(self, obj):
        return format_html(
            '<span style="font-weight: bold;">₦{}</span>',
            '{:,.2f}'.format(float(obj.amount))
        )
    amount_display.short_description = 'Amount'

    def colored_status(self, obj):
        colors = {'in_escrow': 'orange', 'released': 'green', 'withdrawn': 'blue'}
        color = colors.get(obj.status, 'black')
        return format_html(
            '<span style="color: {}; font-weight: bold;">{}</span>',
            color, obj.status.upper().replace('_', ' ')
        )
    colored_status.short_description = 'Status'

    def release_to_wallet(self, request, queryset):
        updated = 0
        for txn in queryset.filter(status='in_escrow'):
            txn.status = 'released'
            txn.released_at = timezone.now()
            txn.save()
            txn.vendor.wallet_balance += txn.amount
            txn.vendor.save()
            updated += 1
        self.message_user(request, f"{updated} transaction(s) released to vendor wallet.")
    release_to_wallet.short_description = "Release selected escrow to vendor wallet"

    def mark_as_withdrawn(self, request, queryset):
        updated = queryset.filter(status='released').update(
            status='withdrawn', withdrawn_at=timezone.now()
        )
        self.message_user(request, f"{updated} transaction(s) marked as withdrawn.")
    mark_as_withdrawn.short_description = "Mark selected as withdrawn to bank"

    def export_to_csv(self, request, queryset):
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="transactions.csv"'
        writer = csv.writer(response)
        writer.writerow([
            'ID', 'Vendor', 'Business Name', 'Amount', 'Status',
            'Created At', 'Released At', 'Withdrawn At'
        ])
        for txn in queryset:
            writer.writerow([
                txn.id, txn.vendor.username,
                txn.vendor.business_name or 'N/A',
                float(txn.amount), txn.status,
                txn.created_at.strftime('%Y-%m-%d %H:%M:%S'),
                txn.released_at.strftime('%Y-%m-%d %H:%M:%S') if txn.released_at else 'N/A',
                txn.withdrawn_at.strftime('%Y-%m-%d %H:%M:%S') if txn.withdrawn_at else 'N/A'
            ])
        return response
    export_to_csv.short_description = "Export selected to CSV"

    def has_add_permission(self, request):
        return False