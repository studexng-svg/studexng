from django.contrib import admin
from django.utils.html import format_html
from django.contrib.auth import get_user_model
from django import forms
from .models import CampusPickupPoint, DeliveryAssignment, DeliveryVerificationEvent, generate_delivery_code

User = get_user_model()


def notify_rider_assignment(order, rider, point):
    """
    Public contract (Blocker 8 — Internal Service Contracts): orders/admin.py
    calls this to notify rider/vendor/buyer whenever it reassigns a rider
    from the Order admin's inline formset. See delivery/contracts.py.
    """
    try:
        from accounts.utils import send_notification
        send_notification(
            recipient=rider,
            notification_type='order',
            title='New Delivery Assignment',
            message=(
                f'You have been assigned to deliver order #{order.reference}. '
                f'Collect from "@{order.listing.vendor.username}" and drop at "{point.name}".'
            ),
            action_url='/rider',
            send_email=False,
        )
        send_notification(
            recipient=order.listing.vendor,
            notification_type='order',
            title='Rider Assigned — Package Your Order',
            message=(
                f'A rider has been assigned to order #{order.reference}. '
                f'Hand it to "@{rider.username}" when they arrive.'
            ),
            action_url='/vendor/dashboard/orders',
            send_email=False,
        )
        send_notification(
            recipient=order.buyer,
            notification_type='order',
            title='Your delivery is on the way!',
            message=(
                f'Your order #{order.reference} will be delivered to "{point.name}". '
                f"We'll notify you when it arrives."
            ),
            action_url=f'/account/orders/{order.id}',
            send_email=False,
        )
    except Exception:
        pass


# ── Shared form: filters rider & pickup_point dropdowns ──────────────────────

class DeliveryAssignmentForm(forms.ModelForm):
    class Meta:
        model = DeliveryAssignment
        fields = '__all__'

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['rider'].queryset = (
            User.objects.filter(user_type='rider').order_by('username')
        )
        self.fields['rider'].empty_label = '— Select Rider —'
        self.fields['pickup_point'].queryset = (
            CampusPickupPoint.objects.filter(is_active=True).order_by('campus', 'name')
        )
        self.fields['pickup_point'].empty_label = '— Select Pickup Point —'


# ── Inline used inside OrderAdmin ────────────────────────────────────────────

class DeliveryAssignmentInline(admin.StackedInline):
    model = DeliveryAssignment
    form = DeliveryAssignmentForm
    extra = 0
    max_num = 1
    can_delete = True
    verbose_name = 'Delivery'
    verbose_name_plural = 'Delivery Assignment'
    readonly_fields = [
        'assigned_at', 'picked_up_at', 'at_pickup_point_at',
        'completed_at', 'assigned_by', 'delivery_code',
        'pickup_proof_image', 'completion_proof_image',
        'responsibility', 'responsibility_transferred_at',
    ]
    fields = [
        'rider', 'pickup_point', 'status', 'delivery_code',
        'responsibility', 'responsibility_transferred_at',
        'pickup_proof_image', 'completion_proof_image',
        'assigned_at', 'picked_up_at', 'at_pickup_point_at',
        'completed_at', 'assigned_by',
    ]


# ── Pickup Points ─────────────────────────────────────────────────────────────

@admin.register(CampusPickupPoint)
class CampusPickupPointAdmin(admin.ModelAdmin):
    list_display = ['name', 'campus', 'is_active', 'created_at']
    list_filter = ['campus', 'is_active']
    search_fields = ['name', 'description']
    list_editable = ['is_active']
    ordering = ['campus', 'name']


# ── Delivery Assignments ──────────────────────────────────────────────────────

@admin.register(DeliveryAssignment)
class DeliveryAssignmentAdmin(admin.ModelAdmin):
    form = DeliveryAssignmentForm
    list_display = ['order_ref', 'rider', 'pickup_point', 'colored_status', 'assigned_at']
    list_filter = ['status', 'pickup_point__campus']
    search_fields = ['order__reference', 'rider__username', 'pickup_point__name']
    readonly_fields = [
        'assigned_at', 'picked_up_at', 'at_pickup_point_at',
        'completed_at', 'assigned_by', 'delivery_code', 'code_attempts', 'code_locked',
        'pickup_proof_image', 'completion_proof_image',
        'responsibility', 'responsibility_transferred_at',
    ]
    fieldsets = (
        ('Assignment', {
            'fields': ('order', 'rider', 'pickup_point', 'status'),
        }),
        ('Responsibility Transfer', {
            'fields': ('responsibility', 'responsibility_transferred_at'),
            'description': 'Vendor is responsible until pickup is verified by the rider; StudEx Delivery from that point on.',
        }),
        ('Verification Evidence', {
            'fields': (
                'delivery_code', 'code_attempts', 'code_locked',
                'pickup_proof_image', 'completion_proof_image',
            ),
            'description': 'Support staff only — the delivery_code is never exposed to riders via the API.',
        }),
        ('Timestamps', {
            'fields': (
                'assigned_at', 'picked_up_at', 'at_pickup_point_at',
                'completed_at', 'assigned_by',
            ),
            'classes': ('collapse',),
        }),
    )
    actions = ['regenerate_delivery_code']

    def order_ref(self, obj):
        return obj.order.reference
    order_ref.short_description = 'Order'

    def regenerate_delivery_code(self, request, queryset):
        updated = 0
        for assignment in queryset:
            assignment.delivery_code = generate_delivery_code()
            assignment.code_attempts = 0
            assignment.code_locked = False
            assignment.save(update_fields=['delivery_code', 'code_attempts', 'code_locked'])
            updated += 1
        self.message_user(request, f"Regenerated delivery code and cleared lockout for {updated} assignment(s).")
    regenerate_delivery_code.short_description = "Regenerate delivery code (clears lockout)"

    def colored_status(self, obj):
        colors = {
            'assigned': '#f59e0b',
            'picked_up': '#3b82f6',
            'at_pickup_point': '#14b8a6',
            'completed': '#10b981',
        }
        return format_html(
            '<span style="color:{}; font-weight:bold;">{}</span>',
            colors.get(obj.status, '#6b7280'),
            obj.get_status_display(),
        )
    colored_status.short_description = 'Status'

    def save_model(self, request, obj, form, change):
        # Capture the old rider before saving so we know if it changed
        old_rider_id = (
            DeliveryAssignment.objects
            .values_list('rider_id', flat=True)
            .filter(pk=obj.pk)
            .first()
        ) if change else None

        obj.assigned_by = request.user
        super().save_model(request, obj, form, change)

        if obj.rider and obj.pickup_point and obj.rider_id != old_rider_id:
            notify_rider_assignment(obj.order, obj.rider, obj.pickup_point)


@admin.register(DeliveryVerificationEvent)
class DeliveryVerificationEventAdmin(admin.ModelAdmin):
    """Permanent audit trail — never editable or deletable, even by staff."""
    list_display = ['assignment_order_ref', 'event_type', 'rider', 'occurred_at', 'ip_address']
    list_filter = ['event_type', 'occurred_at']
    search_fields = ['assignment__order__reference', 'rider__username']
    readonly_fields = ['assignment', 'event_type', 'rider', 'evidence_image', 'ip_address', 'occurred_at']

    def assignment_order_ref(self, obj):
        return obj.assignment.order.reference
    assignment_order_ref.short_description = 'Order'

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
