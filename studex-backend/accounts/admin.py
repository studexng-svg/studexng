# accounts/admin.py
from django import forms
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.admin import helpers
from django.template.response import TemplateResponse
from django.utils import timezone
from django.utils.html import format_html
from django.http import HttpResponse
from django.db.models import Count, Avg, Sum, Q
import csv
from .models import User, Profile, SellerApplication, Vendor
from .utils import send_notification

SCHOOL_CHOICES = [
    ('', '— Not set —'),
    ('pau', 'Pan-Atlantic University (PAU)'),
    ('futo', 'Federal University of Technology Owerri (FUTO)'),
    ('imsu', 'Imo State University, Owerri (IMSU)'),
]

class UserChangeForm(forms.ModelForm):
    school = forms.ChoiceField(choices=SCHOOL_CHOICES, required=False,
        widget=forms.Select(attrs={'style': 'max-width:360px'}))

    class Meta:
        model = User
        fields = '__all__'


class ProfileInline(admin.StackedInline):
    model = Profile
    can_delete = False
    extra = 0
    verbose_name_plural = "Profile"
    fields = ('whatsapp', 'instagram', 'total_orders', 'total_sales', 'rating', 'total_reviews', 'notifications_enabled', 'email_notifications')
    readonly_fields = ('total_orders', 'total_sales', 'rating', 'total_reviews')


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    form = UserChangeForm
    inlines = [ProfileInline]

    def get_inlines(self, request, obj):
        if obj is None:
            return []
        return [ProfileInline]

    list_display = ['username', 'email', 'school', 'user_type', 'verification_type', 'matric_number', 'nin_display', 'business_name', 'hostel', 'wallet_balance', 'is_verified_vendor', 'is_staff', 'is_active', 'created_at']
    list_filter = ['school', 'user_type', 'is_verified_vendor', 'is_staff', 'is_active', 'hostel']
    search_fields = ['username', 'email', 'phone', 'business_name', 'matric_number', 'school']
    readonly_fields = ['wallet_balance', 'created_at', 'updated_at', 'nin_display']

    fieldsets = (
        (None, {'fields': ('username', 'password')}),
        ('Personal Info', {'fields': ('first_name', 'last_name', 'email', 'phone', 'bio', 'profile_image')}),
        ('StudEx Role', {'fields': ('user_type',)}),
        ('Student Info', {'fields': ('school', 'verification_type', 'matric_number', 'nin_display', 'hostel')}),
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

    def nin_display(self, obj):
        from accounts.fields import decrypt_field
        value = decrypt_field(obj.nin) if obj.nin else None
        if not value:
            return '—'
        return value
    nin_display.short_description = 'NIN'

    def changelist_view(self, request, extra_context=None):
        from datetime import timedelta
        thirty_days_ago = timezone.now() - timedelta(days=30)
        u = User.objects
        extra_context = extra_context or {}
        extra_context['summary_stats'] = [
            {'label': 'Total Users',      'value': u.count(),                                          'color': '#fff'},
            {'label': 'Active',           'value': u.filter(is_active=True).count(),                   'color': '#4ade80'},
            {'label': 'Inactive',         'value': u.filter(is_active=False).count(),                  'color': '#f87171'},
            {'label': 'Students',         'value': u.filter(user_type='student').count(),              'color': '#60a5fa'},
            {'label': 'Vendors',          'value': u.filter(user_type='vendor').count(),               'color': '#c084fc'},
            {'label': 'Verified Vendors', 'value': u.filter(is_verified_vendor=True).count(),          'color': '#34d399'},
            {'label': 'Pending Vendors',  'value': u.filter(user_type='vendor', is_verified_vendor=False).count(), 'color': '#fbbf24'},
            {'label': 'New (30d)',        'value': u.filter(date_joined__gte=thirty_days_ago).count(), 'color': '#a78bfa'},
        ]
        return super().changelist_view(request, extra_context=extra_context)

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
                Vendor.objects.update_or_create(
                    user=user,
                    defaults={
                        'is_verified': True,
                        'verified_at': timezone.now(),
                        'verified_by': request.user,
                        'unverified_at': None,
                        'unverified_by': None,
                        'unverification_reason': None,
                    },
                )
                send_notification(
                    recipient=user,
                    notification_type='seller_approved',
                    title='🎉 Application Accepted!',
                    message='Your seller application has been approved. You are now a verified vendor on StudEx. Go to Account Settings → Bank Account to add your bank details so you can receive payouts, then start listing your services!',
                    action_url='/vendor/dashboard',
                )
                approved_count += 1
        self.message_user(request, f"{approved_count} vendor(s) approved and notified.")
    approve_vendors.short_description = "Approve selected vendors (set verified = True)"

    def unverify_vendors(self, request, queryset):
        unverified_count = 0
        for user in queryset.filter(is_verified_vendor=True):
            vendor, _ = Vendor.objects.get_or_create(user=user)
            vendor.is_verified = False
            vendor.unverified_at = timezone.now()
            vendor.unverified_by = request.user
            vendor.save()  # triggers sync_user_from_vendor signal
            SellerApplication.objects.filter(user=user).delete()
            send_notification(
                recipient=user,
                notification_type='seller_revoked',
                title='⚠️ Vendor Status Removed',
                message='You have been unverified. Please re-apply if you would like to be a vendor again.',
                action_url='/vendor/apply',
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

    def changelist_view(self, request, extra_context=None):
        p = Profile.objects
        agg = p.aggregate(avg_rating=Avg('rating'), total_reviews=Sum('total_reviews'))
        extra_context = extra_context or {}
        extra_context['summary_stats'] = [
            {'label': 'Total Profiles',      'value': p.count(),                                        'color': '#fff'},
            {'label': 'Avg Rating',          'value': f"{float(agg['avg_rating'] or 0):.2f} ★",        'color': '#fbbf24'},
            {'label': 'Total Reviews',       'value': agg['total_reviews'] or 0,                        'color': '#60a5fa'},
            {'label': 'Bonus Eligible',      'value': p.filter(profile_bonus_eligible=True).count(),    'color': '#34d399'},
            {'label': 'Bonus Used',          'value': p.filter(profile_bonus_used=True).count(),        'color': '#a78bfa'},
            {'label': 'Has WhatsApp',        'value': p.filter(whatsapp__isnull=False).exclude(whatsapp='').count(), 'color': '#4ade80'},
            {'label': 'Has Instagram',       'value': p.filter(instagram__isnull=False).exclude(instagram='').count(), 'color': '#f472b6'},
        ]
        return super().changelist_view(request, extra_context=extra_context)


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

        from urllib.parse import quote
        from django.utils.html import mark_safe
        import html as _html

        name = str(file_field).lower()

        # Files with explicit PDF/doc extension go straight to the viewer.
        if any(name.endswith(ext) for ext in ('.pdf', '.doc', '.docx')):
            viewer_url = f'https://docs.google.com/viewer?url={quote(url, safe="")}'
            return format_html(
                '📄 <a href="{}" target="_blank" style="color:#0d9488;font-weight:600;">View {}</a>'
                '&nbsp;&nbsp;<a href="{}" target="_blank" style="color:#9ca3af;font-size:12px;">[Download]</a>',
                viewer_url, label, url,
            )

        # For Cloudinary URLs without extension (extension was stripped by MediaCloudinaryStorage):
        # try to render as an image. If the image fails to load (e.g. it's a PDF served as
        # octet-stream), the onerror handler hides it and shows the Google Docs viewer link.
        e_url = _html.escape(url)
        e_viewer = _html.escape(f'https://docs.google.com/viewer?url={quote(url, safe="")}')
        e_label = _html.escape(str(label))
        uid = abs(hash(url)) % 999999

        return mark_safe(
            f'<div>'
            f'<a href="{e_url}" target="_blank" id="doc-img-wrap-{uid}">'
            f'<img src="{e_url}" id="doc-img-{uid}"'
            f' style="max-height:240px;max-width:480px;object-fit:contain;border-radius:8px;border:1px solid #e5e7eb;"'
            f' onerror="'
            f'document.getElementById(\'doc-img-wrap-{uid}\').style.display=\'none\';'
            f'document.getElementById(\'doc-fb-{uid}\').style.display=\'block\';'
            f'" />'
            f'</a>'
            f'<div id="doc-fb-{uid}" style="display:none;">'
            f'📄 <a href="{e_viewer}" target="_blank" style="color:#0d9488;font-weight:600;">View {e_label}</a>'
            f'&nbsp;&nbsp;<a href="{e_url}" target="_blank" style="color:#9ca3af;font-size:12px;">[Download]</a>'
            f'</div>'
            f'<div style="margin-top:4px;">'
            f'<a href="{e_url}" target="_blank" style="color:#9ca3af;font-size:11px;">⬇ Open original</a>'
            f'</div>'
            f'</div>'
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
            Vendor.objects.update_or_create(
                user=app.user,
                defaults={
                    'is_verified': True,
                    'verified_at': timezone.now(),
                    'verified_by': request.user,
                    'unverified_at': None,
                    'unverified_by': None,
                    'unverification_reason': None,
                },
            )
            send_notification(
                recipient=app.user,
                notification_type='seller_approved',
                title='🎉 Application Accepted!',
                message='Your seller application has been approved. You are now a verified vendor on StudEx. Start listing your services!',
                action_url='/vendor/dashboard',
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
                action_url='/vendor/apply',
            )
            app.delete()
            rejected_count += 1
        self.message_user(request, f"{rejected_count} application(s) rejected and applicants notified.")
    reject_applications.short_description = "Reject selected applications"

    def changelist_view(self, request, extra_context=None):
        s = SellerApplication.objects
        extra_context = extra_context or {}
        extra_context['summary_stats'] = [
            {'label': 'Total',          'value': s.count(),                          'color': '#fff'},
            {'label': 'Pending',        'value': s.filter(status='pending').count(), 'color': '#fbbf24'},
            {'label': 'Approved',       'value': s.filter(status='approved').count(),'color': '#34d399'},
            {'label': 'Rejected',       'value': s.filter(status='rejected').count(),'color': '#f87171'},
            {'label': 'PAU Pending',    'value': s.filter(status='pending', user__school__iexact='pau').count(), 'color': '#60a5fa'},
            {'label': 'FUTO Pending',   'value': s.filter(status='pending', user__school__iexact='futo').count(),'color': '#c084fc'},
            {'label': 'IMSU Pending',   'value': s.filter(status='pending', user__school__iexact='imsu').count(),'color': '#fb923c'},
            {'label': 'Unassigned',     'value': s.filter(Q(user__school='') | Q(user__school__isnull=True)).count(), 'color': '#9ca3af',
             'sub': 'no campus set'},
        ]
        return super().changelist_view(request, extra_context=extra_context)

    def has_add_permission(self, request):
        return False


@admin.register(Vendor)
class VendorAdmin(admin.ModelAdmin):
    list_display = ['user', 'is_verified', 'verified_at', 'verified_by', 'unverified_at', 'unverified_by']
    list_filter = ['is_verified']
    search_fields = ['user__username', 'user__email', 'user__business_name']
    readonly_fields = ['created_at', 'verified_at', 'unverified_at']
    ordering = ['-created_at']

    fieldsets = (
        ('Vendor', {'fields': ('user', 'is_verified', 'created_at')}),
        ('Verification', {'fields': ('verified_at', 'verified_by')}),
        ('Unverification', {'fields': ('unverified_at', 'unverified_by', 'unverification_reason')}),
    )

    actions = ['verify_vendors', 'unverify_vendors', 'backfill_vendor_records']

    def verify_vendors(self, request, queryset):
        count = 0
        for vendor in queryset.filter(is_verified=False):
            vendor.is_verified = True
            vendor.verified_at = timezone.now()
            vendor.verified_by = request.user
            vendor.unverification_reason = None
            vendor.save()
            send_notification(
                recipient=vendor.user,
                notification_type='seller_approved',
                title='✅ Vendor Status Restored',
                message='Your vendor status has been reinstated. You can now list your services again.',
                action_url='/vendor',
            )
            count += 1
        self.message_user(request, f"{count} vendor(s) verified.")
    verify_vendors.short_description = "Verify selected vendors"

    def unverify_vendors(self, request, queryset):
        count = 0
        for vendor in queryset.filter(is_verified=True):
            vendor.is_verified = False
            vendor.unverified_at = timezone.now()
            vendor.unverified_by = request.user
            vendor.unverification_reason = "Unverified via admin action"
            vendor.save()  # triggers sync_user_from_vendor signal
            send_notification(
                recipient=vendor.user,
                notification_type='seller_revoked',
                title='⚠️ Vendor Status Removed',
                message='Your vendor status has been removed by admin. Please reapply if you wish to become a vendor again.',
                action_url='/vendor/apply',
            )
            count += 1
        self.message_user(request, f"{count} vendor(s) unverified.")
    unverify_vendors.short_description = "Unverify selected vendors"

    def backfill_vendor_records(self, request, queryset):
        created = 0
        skipped = 0
        for user in User.objects.filter(is_verified_vendor=True):
            _, was_created = Vendor.objects.get_or_create(
                user=user,
                defaults={'is_verified': True, 'verified_at': timezone.now()},
            )
            if was_created:
                created += 1
            else:
                skipped += 1
        self.message_user(request, f"Backfill done: {created} created, {skipped} already existed.")
    backfill_vendor_records.short_description = "Backfill Vendor records for all verified users"

    def changelist_view(self, request, extra_context=None):
        v = Vendor.objects
        extra_context = extra_context or {}
        extra_context['summary_stats'] = [
            {'label': 'Total Vendors',    'value': v.count(),                          'color': '#fff'},
            {'label': 'Verified',         'value': v.filter(is_verified=True).count(), 'color': '#34d399'},
            {'label': 'Unverified',       'value': v.filter(is_verified=False).count(),'color': '#f87171'},
        ]
        return super().changelist_view(request, extra_context=extra_context)