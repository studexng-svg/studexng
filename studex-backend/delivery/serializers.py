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
        ]
