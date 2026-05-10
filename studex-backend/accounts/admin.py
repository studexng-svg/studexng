# accounts/admin.py
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.admin import helpers
from django.template.response import TemplateResponse
from django.utils import timezone
from django.utils.html import format_html
from django.http import HttpResponse
import csv
from .models import User, Profile, SellerApplication
from .utils import send_notification


class ProfileInline(admin.StackedInline):
    model = Profile
    can_delete = False
    extra = 0
    verbose_name_plural = "Profile"
    fields = ('whatsapp', 'instagram', 'total_orders', 'total_sales', 'rating', 'total_reviews', 'notifications_enabled', 'email_notifications')
    readonly_fields = ('total_orders', 'total_sales', 'rating', 'total_reviews')


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    inlines = [ProfileInline]

    def get_inlines(self, request, obj):
        if obj is None:
            return []
        return [ProfileInline]

    list_display = ['username', 'email', 'school', 'user_type', 'business_name', 'hostel', 'wallet_balance', 'is_verified_vendor', 'is_staff', 'is_active', 'created_at']
    list_filter = ['school', 'user_type', 'is_verified_vendor', 'is_staff', 'is_active', 'hostel']
    search_fields = ['username', 'email', 'phone', 'business_name', 'matric_number', 'school']
    readonly_fields = ['wallet_balance', 'created_at', 'updated_at']

    fieldsets = (
        (None, {'fields': ('username', 'password')}),
        ('Personal Info', {'fields': ('first_name', 'last_name', 'email', 'phone', 'bio', 'profile_image')}),
        ('StudEx Role', {'fields': ('user_type',)}),
        ('Student Info', {'fields': ('school', 'matric_number', 'hostel')}),
        ('Vendor Info', {'fields': ('business_name', 'is_verified_vendor')}),
        ('Wallet', {'fields': ('wallet_balance',)}),
        ('Permissions', {'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')}),
        ('Important Dates', {'fields': ('last_login', 'date_joined', 'created_at', 'updated_at')}),
    )

    add_fieldsets = (
        (None, {'classes': ('wide',), 'fields': ('username', 'email', 'password1', 'password2', 'user_type')}),
    )

    ordering = ['-created_at']
    actions = ['approve_vendors', 'unverify_vendors', 'export_to_csv', 'send_custom_notification']

    def send_custom_notification(self, request, queryset):
        if 'apply' in request.POST:
            title = request.POST.get('notification_title', '').strip()
            message = request.POST.get('notification_message', '').strip()
            if not title or not message:
                self.message_user(request, "Title and message are required.", level='error')
                return None
            count = 0
            for user in queryset:
                send_notification(
                    recipient=user,
                    notification_type='admin_message',
                    title=title,
                    message=message,
                )
                count += 1
            self.message_user(request, f"Notification sent to {count} user(s).")
            return None

        return TemplateResponse(request, 'admin/send_notification.html', {
            'users': queryset,
            'action_checkbox_name': helpers.ACTION_CHECKBOX_NAME,
            'title': 'Send Custom Notification',
            'opts': self.model._meta,
            'media': self.media,
        })
    send_custom_notification.short_description = "Send custom notification to selected users"

    def approve_vendors(self, request, queryset):
        approved_count = 0
        for user in queryset:
            if not user.is_verified_vendor:
                user.is_verified_vendor = True
                user.user_type = 'vendor'
                user.save()
                send_notification(
                    recipient=user,
                    notification_type='seller_approved',
                    title='🎉 Application Accepted!',
                    message='Your seller application has been approved. You are now a verified vendor on StudEx. Start listing your services!',
                    action_url='/seller',
                )
                approved_count += 1
        self.message_user(request, f"{approved_count} vendor(s) approved and notified.")
    approve_vendors.short_description = "Approve selected vendors (set verified = True)"

    def unverify_vendors(self, request, queryset):
        unverified_count = 0
        for user in queryset.filter(is_verified_vendor=True):
            user.is_verified_vendor = False
            user.user_type = 'student'
            user.save()
            SellerApplication.objects.filter(user=user).delete()
            send_notification(
                recipient=user,
                notification_type='seller_revoked',
                title='⚠️ Vendor Status Removed',
                message='You have been unverified. Please re-apply if you would like to be a vendor again.',
                action_url='/seller/onboarding',
            )
            unverified_count += 1
        self.message_user(request, f"{unverified_count} vendor(s) unverified and notified.")
    unverify_vendors.short_description = "Unverify selected vendors"

    def export_to_csv(self, request, queryset):
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="users.csv"'
        writer = csv.writer(response)
        writer.writerow(['ID', 'Username', 'Email', 'User Type', 'Business Name', 'Phone', 'Matric Number', 'Hostel', 'Wallet Balance', 'Is Verified Vendor', 'Is Active', 'Is Staff', 'Created At'])
        for user in queryset:
            writer.writerow([user.id, user.username, user.email, user.user_type, user.business_name or 'N/A', user.phone or 'N/A', user.matric_number or 'N/A', user.hostel or 'N/A', float(user.wallet_balance), 'Yes' if user.is_verified_vendor else 'No', 'Yes' if user.is_active else 'No', 'Yes' if user.is_staff else 'No', user.created_at.strftime('%Y-%m-%d %H:%M:%S')])
        return response
    export_to_csv.short_description = "Export selected to CSV"


@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    list_display = ['user', 'total_orders', 'total_sales', 'rating', 'total_reviews', 'notifications_enabled']
    search_fields = ['user__username', 'user__email', 'user__business_name']
    list_filter = ['notifications_enabled', 'email_notifications']
    readonly_fields = ['total_orders', 'total_sales', 'rating', 'total_reviews']
    ordering = ['-total_orders']


@admin.register(SellerApplication)
class SellerApplicationAdmin(admin.ModelAdmin):
    list_display = ['user', 'status', 'submitted_at', 'business_age_confirmed']
    list_filter = ['status', 'submitted_at', 'business_age_confirmed']
    search_fields = ['user__username', 'user__email']
    readonly_fields = [
        'id', 'user', 'submitted_at',
        'preview_id_front', 'preview_id_back', 'preview_admission_letter', 'preview_nin_document',
    ]

    fieldsets = (
        ('Application Info', {'fields': ('id', 'user', 'status', 'submitted_at')}),
        ('Documents', {'fields': ('preview_id_front', 'preview_id_back', 'preview_admission_letter', 'preview_nin_document')}),
        ('Verification', {'fields': ('business_age_confirmed',)}),
        ('Admin Notes', {'fields': ('notes',)}),
    )

    def _file_preview(self, file_field, label):
        if not file_field:
            return format_html('<span style="color:#9ca3af;">Not uploaded</span>')
        try:
            url = file_field.url
        except Exception:
            return format_html('<span style="color:#ef4444;">File not accessible</span>')
        name = str(file_field).lower()
        if name.endswith('.pdf') or name.endswith('.doc') or name.endswith('.docx'):
            return format_html(
                '<a href="{}" target="_blank" style="color:#0d9488;font-weight:600;">📄 View {}</a>',
                url, label,
            )
        return format_html(
            '<a href="{url}" target="_blank">'
            '<img src="{url}" style="max-height:240px;max-width:480px;'
            'object-fit:contain;border-radius:8px;border:1px solid #e5e7eb;" />'
            '</a>',
            url=url,
        )

    def preview_id_front(self, obj):
        return self._file_preview(obj.id_front, 'ID Front')
    preview_id_front.short_description = 'ID Card — Front'

    def preview_id_back(self, obj):
        return self._file_preview(obj.id_back, 'ID Back')
    preview_id_back.short_description = 'ID Card — Back'

    def preview_admission_letter(self, obj):
        return self._file_preview(obj.admission_letter, 'Admission Letter')
    preview_admission_letter.short_description = 'Admission Letter'

    def preview_nin_document(self, obj):
        return self._file_preview(obj.nin_document, 'NIN Document')
    preview_nin_document.short_description = 'NIN Document'

    actions = ['approve_applications', 'reject_applications']

    def approve_applications(self, request, queryset):
        approved_count = 0
        for app in queryset.filter(status='pending'):
            app.status = 'approved'
            app.reviewed_at = timezone.now()
            app.reviewed_by = request.user
            app.save()
            app.user.is_verified_vendor = True
            app.user.user_type = 'vendor'
            app.user.save()
            send_notification(
                recipient=app.user,
                notification_type='seller_approved',
                title='🎉 Application Accepted!',
                message='Your seller application has been approved. You are now a verified vendor on StudEx. Start listing your services!',
                action_url='/seller',
            )
            approved_count += 1
        self.message_user(request, f"{approved_count} application(s) approved and vendors notified.")
    approve_applications.short_description = "Approve selected applications"

    def reject_applications(self, request, queryset):
        rejected_count = 0
        for app in queryset.filter(status='pending'):
            user = app.user
            user.is_verified_vendor = False
            user.user_type = 'student'
            user.save()
            send_notification(
                recipient=user,
                notification_type='seller_rejected',
                title='❌ Application Rejected',
                message='Your seller application was rejected. Please upload your ID card details correctly and try again.',
                action_url='/seller/onboarding',
            )
            app.delete()
            rejected_count += 1
        self.message_user(request, f"{rejected_count} application(s) rejected and applicants notified.")
    reject_applications.short_description = "Reject selected applications"

    def has_add_permission(self, request):
        return False