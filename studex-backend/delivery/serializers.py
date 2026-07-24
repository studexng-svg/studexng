from rest_framework import serializers
from .models import CampusPickupPoint, DeliveryAssignment, BatchTemplate, DeliveryBatch


class CampusPickupPointSerializer(serializers.ModelSerializer):
    class Meta:
        model = CampusPickupPoint
        fields = ['id', 'name', 'campus', 'description', 'is_active']


class DeliveryAssignmentSerializer(serializers.ModelSerializer):
    rider_username = serializers.CharField(source='rider.username', read_only=True)
    pickup_point_name = serializers.CharField(source='pickup_point.name', read_only=True)
    pickup_point_campus = serializers.CharField(source='pickup_point.campus', read_only=True)
    order_reference = serializers.CharField(source='order.reference', read_only=True)
    order_id = serializers.IntegerField(source='order.id', read_only=True)
    buyer_username = serializers.CharField(source='order.buyer.username', read_only=True)
    listing_title = serializers.CharField(source='order.listing.title', read_only=True)
    vendor_username = serializers.CharField(source='order.listing.vendor.username', read_only=True)
    order_status = serializers.CharField(source='order.status', read_only=True)
    # Phase 1 — Food Commerce Engine, Step 5 (Rider Batch Workflow). Both
    # null for every order from a non-batching vendor, and for every order
    # that predates this phase — identical to today's shape in that case.
    batch_id = serializers.SerializerMethodField()
    batch_display_name = serializers.SerializerMethodField()
    # Itemized contents — from OrderItem when this order has them (a menu
    # checkout), else a single synthetic line for the anchor listing (every
    # order that predates OrderItem, and every non-menu order after it).
    items = serializers.SerializerMethodField()

    class Meta:
        model = DeliveryAssignment
        fields = [
            'id', 'order_id', 'order_reference', 'order_status',
            'rider_username', 'pickup_point_name', 'pickup_point_campus',
            'buyer_username', 'listing_title', 'vendor_username',
            'status', 'assigned_at', 'picked_up_at', 'at_pickup_point_at', 'completed_at',
            'pickup_proof_image', 'completion_proof_image',
            'responsibility', 'responsibility_transferred_at', 'code_locked',
            'batch_id', 'batch_display_name', 'items',
        ]
        # delivery_code is intentionally excluded here — this serializer backs
        # rider-facing and general admin views. It must never reach a rider,
        # since the whole point is proof the rider got it from the buyer, not
        # from the API. See BuyerDeliveryStatusSerializer below.

    def get_batch_id(self, obj):
        return obj.batch_id

    def get_batch_display_name(self, obj):
        return obj.batch.display_name if obj.batch_id else None

    def get_items(self, obj):
        order_items = list(obj.order.items.all())
        if order_items:
            return [
                {
                    'listing_title': item.listing.title,
                    'quantity': item.quantity,
                    'unit_price': str(item.unit_price_at_order_time),
                    'line_total': str(item.line_total),
                    'status': item.status,
                    'addons': [
                        {'name': a.name_snapshot, 'price_delta': str(a.price_delta_snapshot)}
                        for a in item.selected_addons.all()
                    ],
                }
                for item in order_items
            ]
        return [{
            'listing_title': obj.order.listing.title, 'quantity': obj.order.quantity,
            'unit_price': str(obj.order.amount), 'line_total': str(obj.order.amount),
            'status': 'fulfilled', 'addons': [],
        }]


class BuyerDeliveryStatusSerializer(DeliveryAssignmentSerializer):
    """Only the buyer's own OrderDeliveryStatusView uses this — adds delivery_code."""
    delivery_code = serializers.SerializerMethodField()

    class Meta(DeliveryAssignmentSerializer.Meta):
        fields = DeliveryAssignmentSerializer.Meta.fields + ['delivery_code']

    def get_delivery_code(self, obj):
        # Reveal only once there's actually something to hand off — showing it
        # while the rider is still en route to the vendor serves no purpose
        # and just widens the window for it to leak before it matters.
        if obj.status in ('at_pickup_point', 'completed'):
            return obj.delivery_code
        return None


# ─────────────────────────────────────────────────────────────────────────────
# Phase 1 — Food Commerce Engine, Step 7: admin batch controls (FR-12, FR-13).
# ─────────────────────────────────────────────────────────────────────────────

class BatchTemplateSerializer(serializers.ModelSerializer):
    vendor_username = serializers.CharField(source='vendor.username', read_only=True)

    class Meta:
        model = BatchTemplate
        fields = [
            'id', 'vendor', 'vendor_username', 'campus', 'display_name', 'delivery_time',
            'cutoff_offset_minutes', 'max_orders', 'days_of_week', 'is_active',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class DeliveryBatchSerializer(serializers.ModelSerializer):
    """
    Admin-facing read/override serializer (FR-12/FR-13). vendor/campus/
    batch_date/template/current_orders are read-only here — an admin
    override changes this one day's delivery_time/cutoff_time/max_orders/
    display_name/status, never the batch's identity or its live counter
    (which only delivery.capacity.reserve_capacity/release_capacity touch).
    """
    vendor_username = serializers.CharField(source='vendor.username', read_only=True)
    template_id = serializers.SerializerMethodField()

    class Meta:
        model = DeliveryBatch
        fields = [
            'id', 'vendor', 'vendor_username', 'template_id', 'campus', 'batch_date',
            'display_name', 'delivery_time', 'cutoff_time', 'max_orders', 'current_orders',
            'status', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'vendor', 'template_id', 'campus', 'batch_date', 'current_orders',
            'created_at', 'updated_at',
        ]

    def get_template_id(self, obj):
        return obj.template_id
