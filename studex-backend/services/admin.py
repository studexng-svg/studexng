# services/admin.py
from django.contrib import admin
from django.utils import timezone
from django.utils.html import format_html
from django.http import HttpResponse
from django.db.models import Count, Sum
from django import forms
import csv
from .models import Category, Listing, Transaction


class CategoryImageForm(forms.ModelForm):
    image_file = forms.ImageField(required=False, label='Upload Image')

    class Meta:
        model = Category
        fields = ['title', 'slug', 'image_file', 'campus']

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance and self.instance.image:
            self.fields['image_file'].help_text = f'Current: <a href="{self.instance.image}" target="_blank">View image</a>'


_ORDER_TYPE_CHOICES = [
    ('service', 'Service (Booking)'),
    ('product', 'Product (Order)'),
    ('food',    'Food (Order)'),
]


class ListingAdminForm(forms.ModelForm):
    """Detail-view form: custom order-type labels + image upload field."""
    image_file = forms.ImageField(required=False, label='Upload Image')
    listing_type = forms.ChoiceField(
        choices=_ORDER_TYPE_CHOICES,
        label='Order Type',
        help_text='Controls whether a purchase creates a Booking (Service) or a direct Order (Product / Food).',
    )

    class Meta:
        model = Listing
        exclude = []

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance and self.instance.image:
            self.fields['image_file'].help_text = (
                f'Current: <a href="{self.instance.image}" target="_blank">View image</a>'
            )


class ListingChangelistForm(forms.ModelForm):
    """Minimal form used by list_editable — just overrides the dropdown labels."""
    listing_type = forms.ChoiceField(choices=_ORDER_TYPE_CHOICES)

    class Meta:
        model = Listing
        fields = ['listing_type']


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    form = CategoryImageForm
    list_display = ('title', 'slug', 'campus', 'image_preview', 'listing_count', 'active_listing_count')
    list_filter = ('campus',)
    search_fields = ('title',)
    prepopulated_fields = {"slug": ("title",)}
    ordering = ('title',)
    actions = ['export_to_csv']

    def image_preview(self, obj):
        if obj.image:
            return format_html('<img src="{}" style="height:40px;border-radius:4px;"/>', obj.image)
        return 'No image'
    image_preview.short_description = 'Image'

    def listing_count(self, obj):
        count = obj.listings.count()
        return format_html('<span style="font-weight: bold;">{}</span>', count)
    listing_count.short_description = 'Total Listings'

    def active_listing_count(self, obj):
        count = obj.listings.filter(is_available=True).count()
        return format_html('<span style="color: green; font-weight: bold;">{}</span>', count)
    active_listing_count.short_description = 'Active Listings'

    def save_model(self, request, obj, form, change):
        """Upload category image directly to Cloudinary."""
        image_file = form.cleaned_data.get('image_file')
        if image_file:
            try:
                import cloudinary.uploader
                result = cloudinary.uploader.upload(
                    image_file,
                    folder='studex/categories',
                    transformation=[{'quality': 'auto', 'fetch_format': 'auto'}]
                )
                obj.image = result.get('secure_url', '')
            except Exception as e:
                import logging
                logging.getLogger(__name__).warning(f"Cloudinary category upload failed: {e}")
        super().save_model(request, obj, form, change)

    def changelist_view(self, request, extra_context=None):
        c = Category.objects
        l = Listing.objects
        extra_context = extra_context or {}
        extra_context['summary_stats'] = [
            {'label': 'Total Categories', 'value': c.count(),                              'color': '#fff'},
            {'label': 'PAU',              'value': c.filter(campus='pau').count(),         'color': '#60a5fa'},
            {'label': 'FUTO',             'value': c.filter(campus='futo').count(),        'color': '#c084fc'},
            {'label': 'Total Listings',   'value': l.count(),                              'color': '#fbbf24'},
            {'label': 'Active Listings',  'value': l.filter(is_available=True).count(),    'color': '#34d399'},
            {'label': 'Inactive Listings','value': l.filter(is_available=False).count(),   'color': '#f87171'},
        ]
        return super().changelist_view(request, extra_context=extra_context)

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
    form = ListingAdminForm

    list_display = (
        'title', 'vendor', 'campus', 'vendor_status', 'category',
        'price_display', 'listing_type', 'availability_badge', 'order_count', 'created_at'
    )
    list_editable = ('listing_type',)
    list_filter = ('listing_type', 'campus', 'is_available', 'category', 'vendor__is_verified_vendor', 'vendor__user_type', 'created_at')
    search_fields = ('title', 'description', 'vendor__username', 'vendor__business_name', 'listing_type')
    readonly_fields = ('campus', 'created_at', 'updated_at', 'get_total_orders', 'get_total_revenue')
    raw_id_fields = ('vendor',)
    date_hierarchy = 'created_at'
    list_per_page = 50

    fieldsets = (
        ('Listing Info', {
            'fields': ('title', 'description', 'price', 'image', 'category', 'listing_type')
        }),
        ('Vendor & Availability', {
            'fields': ('vendor', 'campus', 'is_available')
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

    actions = ['mark_available', 'mark_unavailable', 'export_to_csv', 'change_category']

    def changelist_view(self, request, extra_context=None):
        from orders.models import Order
        l = Listing.objects
        rev = Order.objects.filter(status__in=['paid', 'seller_completed', 'completed']).aggregate(
            total=Sum('amount')
        )['total'] or 0
        extra_context = extra_context or {}
        extra_context['summary_stats'] = [
            {'label': 'Total',      'value': l.count(),                                      'color': '#fff'},
            {'label': 'Available',  'value': l.filter(is_available=True).count(),            'color': '#34d399'},
            {'label': 'Unavailable','value': l.filter(is_available=False).count(),           'color': '#f87171'},
            {'label': 'Services',   'value': l.filter(listing_type='service').count(),       'color': '#60a5fa'},
            {'label': 'Products',   'value': l.filter(listing_type='product').count(),       'color': '#c084fc'},
            {'label': 'Food',       'value': l.filter(listing_type='food').count(),          'color': '#fb923c'},
            {'label': 'Revenue',    'value': f'₦{float(rev):,.0f}',                          'color': '#fbbf24',
             'sub': 'paid orders'},
        ]
        return super().changelist_view(request, extra_context=extra_context)

    def get_changelist_form(self, request, **kwargs):
        kwargs.setdefault('form', ListingChangelistForm)
        return super().get_changelist_form(request, **kwargs)

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
        # Upload listing image directly to Cloudinary if a new file was uploaded
        image_file = request.FILES.get('image_file') or request.FILES.get('image')
        if image_file:
            try:
                import cloudinary.uploader
                result = cloudinary.uploader.upload(
                    image_file,
                    folder='studex/listings',
                    transformation=[{'quality': 'auto', 'fetch_format': 'auto'}]
                )
                obj.image = result.get('secure_url', '')
            except Exception as e:
                import logging
                logging.getLogger(__name__).warning(f"Cloudinary listing upload failed: {e}")
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

    def change_category(self, request, queryset):
        from django.contrib.admin import helpers
        from django.template.response import TemplateResponse

        if 'apply' in request.POST:
            category_id = request.POST.get('category_id')
            try:
                category = Category.objects.get(id=category_id)
            except Category.DoesNotExist:
                self.message_user(request, "Invalid category selected.", level='error')
                return
            updated = queryset.update(category=category)
            self.message_user(request, f"{updated} listing(s) changed to '{category.title}'.")
            return

        return TemplateResponse(request, 'admin/services/listing/change_category.html', {
            'title': 'Change category',
            'queryset': queryset,
            'categories': Category.objects.order_by('title'),
            'action_checkbox_name': helpers.ACTION_CHECKBOX_NAME,
            'opts': self.model._meta,
        })
    change_category.short_description = "Change category"

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

    def changelist_view(self, request, extra_context=None):
        t = Transaction.objects
        in_escrow_amt = float(t.filter(status='in_escrow').aggregate(s=Sum('amount'))['s'] or 0)
        released_amt  = float(t.filter(status='released').aggregate(s=Sum('amount'))['s'] or 0)
        withdrawn_amt = float(t.filter(status='withdrawn').aggregate(s=Sum('amount'))['s'] or 0)
        total_amt     = float(t.aggregate(s=Sum('amount'))['s'] or 0)
        extra_context = extra_context or {}
        extra_context['summary_stats'] = [
            {'label': 'Total',        'value': t.count(),                           'color': '#fff'},
            {'label': 'In Escrow',    'value': t.filter(status='in_escrow').count(),'color': '#fbbf24', 'sub': f'₦{in_escrow_amt:,.0f}'},
            {'label': 'Released',     'value': t.filter(status='released').count(), 'color': '#34d399', 'sub': f'₦{released_amt:,.0f}'},
            {'label': 'Withdrawn',    'value': t.filter(status='withdrawn').count(),'color': '#60a5fa', 'sub': f'₦{withdrawn_amt:,.0f}'},
            {'label': 'Total Volume', 'value': f'₦{total_amt:,.0f}',               'color': '#a78bfa'},
        ]
        return super().changelist_view(request, extra_context=extra_context)

    def has_add_permission(self, request):
        return False