from rest_framework import serializers
from .models import CampusPickupPoint, DeliveryAssignment


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

    class Meta:
        model = DeliveryAssignment
        fields = [
            'id', 'order_id', 'order_reference', 'order_status',
            'rider_username', 'pickup_point_name', 'pickup_point_campus',
            'buyer_username', 'listing_title', 'vendor_username',
            'status', 'assigned_at', 'picked_up_at', 'at_pickup_point_at', 'completed_at',
            'pickup_proof_image', 'completion_proof_image',
            'responsibility', 'responsibility_transferred_at', 'code_locked',
        ]
        # delivery_code is intentionally excluded here — this serializer backs
        # rider-facing and general admin views. It must never reach a rider,
        # since the whole point is proof the rider got it from the buyer, not
        # from the API. See BuyerDeliveryStatusSerializer below.


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
