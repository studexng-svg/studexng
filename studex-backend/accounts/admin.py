# accounts/admin.py
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.utils import timezone
from django.http import HttpResponse
import csv
from .models import User, Profile, SellerApplication


# Inline for Profile — shows Profile fields inside the User edit page
class ProfileInline(admin.StackedInline):
    model = Profile
    can_delete = False
    extra = 0
    verbose_name_plural = "Profile"
    fields = (
        'whatsapp', 'instagram',
        'total_orders', 'total_sales', 'rating', 'total_reviews',
        'notifications_enabled', 'email_notifications',
    )
    readonly_fields = ('total_orders', 'total_sales', 'rating', 'total_reviews')


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    inlines = [ProfileInline]

    def get_inlines(self, request, obj):
        if obj is None:
            return []
        return [ProfileInline]

    list_display = [
        'username', 'email', 'user_type', 'business_name', 'hostel',
        'wallet_balance', 'is_verified_vendor', 'is_staff', 'is_active', 'created_at'
    ]
    list_filter = [
        'user_type', 'is_verified_vendor', 'is_staff', 'is_active', 'hostel'
    ]
    search_fields = ['username', 'email', 'phone', 'business_name', 'matric_number']
    readonly_fields = ['wallet_balance', 'created_at', 'updated_at']

    fieldsets = (
        (None, {
            'fields': ('username', 'password')
        }),
        ('Personal Info', {
            'fields': ('first_name', 'last_name', 'email', 'phone', 'bio', 'profile_image')
        }),
        ('StudEx Role', {
            'fields': ('user_type',)
        }),
        ('Student Info', {
            'fields': ('matric_number', 'hostel')
        }),
        ('Vendor Info', {
            'fields': ('business_name', 'is_verified_vendor')
        }),
        ('Wallet', {
            'fields': ('wallet_balance',)
        }),
        ('Permissions', {
            'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')
        }),
        ('Important Dates', {
            'fields': ('last_login', 'date_joined', 'created_at', 'updated_at')
        }),
    )

    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('username', 'email', 'password1', 'password2', 'user_type'),
        }),
    )

    ordering = ['-created_at']

    # Custom actions for easy vendor management
    actions = ['approve_vendors', 'unverify_vendors', 'export_to_csv']

    def approve_vendors(self, request, queryset):
        # Only approve actual vendors
        updated = queryset.filter(user_type='vendor').update(is_verified_vendor=True)
        self.message_user(request, f"{updated} vendor(s) have been approved and can now sell on StudEx.")
    approve_vendors.short_description = "Approve selected vendors (set verified = True)"

    def unverify_vendors(self, request, queryset):
        updated = queryset.filter(user_type='vendor').update(is_verified_vendor=False)
        self.message_user(request, f"{updated} vendor(s) have been unverified.")
    unverify_vendors.short_description = "Unverify selected vendors"

    def export_to_csv(self, request, queryset):
        """Export selected users to CSV"""
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="users.csv"'

        writer = csv.writer(response)
        writer.writerow([
            'ID', 'Username', 'Email', 'User Type', 'Business Name',
            'Phone', 'Matric Number', 'Hostel', 'Wallet Balance',
            'Is Verified Vendor', 'Is Active', 'Is Staff', 'Created At'
        ])

        for user in queryset:
            writer.writerow([
                user.id,
                user.username,
                user.email,
                user.user_type,
                user.business_name or 'N/A',
                user.phone or 'N/A',
                user.matric_number or 'N/A',
                user.hostel or 'N/A',
                float(user.wallet_balance),
                'Yes' if user.is_verified_vendor else 'No',
                'Yes' if user.is_active else 'No',
                'Yes' if user.is_staff else 'No',
                user.created_at.strftime('%Y-%m-%d %H:%M:%S')
            ])

        return response
    export_to_csv.short_description = "Export selected to CSV"


# Optional: Separate Profile list view
@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    list_display = ['user', 'total_orders', 'total_sales', 'rating', 'total_reviews', 'notifications_enabled']
    search_fields = ['user__username', 'user__email', 'user__business_name']
    list_filter = ['notifications_enabled', 'email_notifications']
    readonly_fields = ['total_orders', 'total_sales', 'rating', 'total_reviews']
    ordering = ['-total_orders']


# NEW: Seller Application Admin
@admin.register(SellerApplication)
class SellerApplicationAdmin(admin.ModelAdmin):
    list_display = ['user', 'status', 'submitted_at', 'business_age_confirmed']
    list_filter = ['status', 'submitted_at', 'business_age_confirmed']
    search_fields = ['user__username', 'user__email', 'user__business_name']
    readonly_fields = ['user', 'id_document', 'admission_letter', 'submitted_at', 'id']
    
    fieldsets = (
        ('Application Info', {
            'fields': ('id', 'user', 'status', 'submitted_at')
        }),
        ('Documents', {
            'fields': ('id_document', 'admission_letter')
        }),
        ('Verification', {
            'fields': ('business_age_confirmed',)
        }),
        ('Notes', {
            'fields': ('notes',)
        }),
    )

    # Custom actions to approve/reject applications
    actions = ['approve_applications', 'reject_applications']

    def approve_applications(self, request, queryset):
        """Approve selected applications and mark user as verified vendor"""
        for app in queryset.filter(status='pending'):
            app.status = 'approved'
            app.save()
            # Also set the user as a verified vendor
            app.user.is_verified_vendor = True
            app.user.save()
        
        count = queryset.filter(status='pending').count()
        self.message_user(request, f"{count} application(s) approved! Users are now verified vendors.")
    approve_applications.short_description = "Approve selected applications"

    def reject_applications(self, request, queryset):
        """Reject selected applications"""
        updated = queryset.filter(status='pending').update(status='rejected')
        self.message_user(request, f"{updated} application(s) rejected.")
    reject_applications.short_description = "Reject selected applications"

    def has_add_permission(self, request):
        """Don't allow adding applications from admin"""
        return False