from rest_framework import serializers
from .models import CampusPickupPoint, DeliveryAssignment, DeliverySlot


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
    # The buyer's own typed drop-off location (Order.delivery_location) —
    # what an auto-assigned rider actually sees, since auto-assignment
    # (delivery.assignment.auto_assign_rider) never sets a pickup_point.
    delivery_location = serializers.CharField(source='order.delivery_location', read_only=True)
    buyer_username = serializers.CharField(source='order.buyer.username', read_only=True)
    # So the rider can actually reach the buyer to locate them at drop-off —
    # blank/None for any buyer who never set a phone number (User.phone is
    # optional), the frontend handles that case rather than hiding the field.
    buyer_phone = serializers.CharField(source='order.buyer.phone', read_only=True)
    listing_title = serializers.CharField(source='order.listing.title', read_only=True)
    vendor_username = serializers.CharField(source='order.listing.vendor.username', read_only=True)
    order_status = serializers.CharField(source='order.status', read_only=True)
    # Both null for every order from a non-slotted vendor. Field names kept
    # as batch_id/batch_display_name on the wire (backed by delivery_slot
    # internally) — purely a naming choice, no frontend change needed.
    batch_id = serializers.SerializerMethodField()
    batch_display_name = serializers.SerializerMethodField()
    # Itemized contents — from OrderItem when this order has them (a menu
    # checkout), else a single synthetic line for the anchor listing (every
    # order that predates OrderItem, and every non-menu order after it).
    items = serializers.SerializerMethodField()
    # Full receipt total the buyer actually paid at checkout (delivery_fee
    # already folded in — see Order.delivery_fee's docstring) — so the rider
    # can see it without going into Django admin. order_delivery_fee is kept
    # alongside it purely so the UI can show "₦X items + ₦Y delivery" instead
    # of one opaque total.
    order_amount = serializers.DecimalField(source='order.amount', max_digits=10, decimal_places=2, read_only=True)
    order_delivery_fee = serializers.DecimalField(source='order.delivery_fee', max_digits=10, decimal_places=2, read_only=True)

    class Meta:
        model = DeliveryAssignment
        fields = [
            'id', 'order_id', 'order_reference', 'order_status',
            'rider_username', 'pickup_point_name', 'pickup_point_campus', 'delivery_location',
            'buyer_username', 'buyer_phone', 'listing_title', 'vendor_username',
            'status', 'assigned_at', 'picked_up_at', 'at_pickup_point_at', 'completed_at',
            'pickup_proof_image', 'completion_proof_image',
            'responsibility', 'responsibility_transferred_at', 'code_locked',
            'batch_id', 'batch_display_name', 'items', 'order_amount', 'order_delivery_fee',
        ]
        # delivery_code is intentionally excluded here — this serializer backs
        # rider-facing and general admin views. It must never reach a rider,
        # since the whole point is proof the rider got it from the buyer, not
        # from the API. See BuyerDeliveryStatusSerializer below.

    def get_batch_id(self, obj):
        return obj.delivery_slot_id

    def get_batch_display_name(self, obj):
        return obj.delivery_slot.display_name if obj.delivery_slot_id else None

    def get_items(self, obj):
        order_items = list(obj.order.items.all())
        if order_items:
            return [
                {
                    'id': item.id,
                    'listing_title': item.listing.title,
                    'image': item.listing.image,
                    'quantity': item.quantity,
                    'unit_price': str(item.unit_price_at_order_time),
                    'line_total': str(item.line_total),
                    'status': item.status,
                    'addons': [
                        {'name': a.name_snapshot, 'price_delta': str(a.price_delta_snapshot), 'quantity': a.quantity}
                        for a in item.selected_addons.all()
                    ],
                }
                for item in order_items
            ]
        return [{
            'listing_title': obj.order.listing.title, 'image': obj.order.listing.image, 'quantity': obj.order.quantity,
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
# Admin: Delivery Slots (Phase 2 simplification — one row per recurring
# window, replacing the earlier BatchTemplate + DeliveryBatch pair).
# ─────────────────────────────────────────────────────────────────────────────

class DeliverySlotSerializer(serializers.ModelSerializer):
    vendor_username = serializers.CharField(source='vendor.username', read_only=True)
    used_today = serializers.SerializerMethodField()

    class Meta:
        model = DeliverySlot
        fields = [
            'id', 'vendor', 'vendor_username', 'campus', 'display_name', 'delivery_time',
            'cutoff_offset_minutes', 'max_orders', 'is_active', 'used_today',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_used_today(self, obj):
        from django.utils import timezone
        from delivery.capacity import LAGOS, _orders_today_count
        today = timezone.now().astimezone(LAGOS).date()
        return _orders_today_count(obj, today)
