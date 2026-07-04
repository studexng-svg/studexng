from django.contrib import admin
from django.utils.html import format_html
from django.contrib.auth import get_user_model
from django import forms
from .models import CampusPickupPoint, DeliveryAssignment

User = get_user_model()


def _notify_assignment(order, rider, point):
    """Send rider / vendor / buyer notifications when a rider is (re)assigned."""
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
        'completed_at', 'assigned_by',
    ]
    fields = [
        'rider', 'pickup_point', 'status',
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
        'completed_at', 'assigned_by',
    ]
    fieldsets = (
        ('Assignment', {
            'fields': ('order', 'rider', 'pickup_point', 'status'),
        }),
        ('Timestamps', {
            'fields': (
                'assigned_at', 'picked_up_at', 'at_pickup_point_at',
                'completed_at', 'assigned_by',
            ),
            'classes': ('collapse',),
        }),
    )

    def order_ref(self, obj):
        return obj.order.reference
    order_ref.short_description = 'Order'

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
            _notify_assignment(obj.order, obj.rider, obj.pickup_point)
