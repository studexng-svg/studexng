from django.contrib import admin
from .models import CampusPickupPoint, DeliveryAssignment


@admin.register(CampusPickupPoint)
class CampusPickupPointAdmin(admin.ModelAdmin):
    list_display = ['name', 'campus', 'is_active']
    list_filter = ['campus', 'is_active']
    search_fields = ['name']


@admin.register(DeliveryAssignment)
class DeliveryAssignmentAdmin(admin.ModelAdmin):
    list_display = ['order', 'rider', 'pickup_point', 'status', 'assigned_at']
    list_filter = ['status']
    raw_id_fields = ['order', 'rider', 'pickup_point']
