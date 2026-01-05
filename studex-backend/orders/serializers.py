# orders/serializers.py
from rest_framework import serializers
from .models import Order, Dispute
from services.serializers import ListingSerializer
from services.models import Listing
import uuid

class OrderSerializer(serializers.ModelSerializer):
    listing = ListingSerializer(read_only=True)
    listing_id = serializers.IntegerField(write_only=True)
    buyer = serializers.ReadOnlyField(source='buyer.username')

    class Meta:
        model = Order
        fields = ['id', 'reference', 'listing', 'listing_id', 'amount', 'status', 'created_at', 'paid_at']
        read_only_fields = ['reference', 'amount', 'status', 'created_at', 'paid_at']

    def create(self, validated_data):
        listing_id = validated_data.pop('listing_id')
        listing = Listing.objects.get(id=listing_id)

        # Basic validation
        if not listing.is_available:
            raise serializers.ValidationError("This listing is no longer available.")

        # Generate unique order reference
        reference = f"ORD-{uuid.uuid4().hex[:12].upper()}"

        # Create order
        order = Order.objects.create(
            reference=reference,
            buyer=self.context['request'].user,
            listing=listing,
            amount=listing.price,
            **validated_data
        )
        
        # Create transaction in escrow
        from services.models import Transaction
        Transaction.objects.create(
            vendor=listing.vendor,
            order=order,
            amount=listing.price,
            status='in_escrow'
        )

        return order


class DisputeSerializer(serializers.ModelSerializer):
    filer_username = serializers.ReadOnlyField(source='filer.username')
    order_reference = serializers.ReadOnlyField(source='order.reference')
    assigned_to_username = serializers.ReadOnlyField(source='assigned_to.username')
    resolved_by_username = serializers.ReadOnlyField(source='resolved_by.username')

    class Meta:
        model = Dispute
        fields = [
            'id', 'order', 'order_reference', 'filed_by', 'filer', 'filer_username',
            'reason', 'complaint', 'evidence', 'provider_response', 'provider_responded_at',
            'status', 'resolution', 'assigned_to', 'assigned_to_username',
            'admin_decision', 'resolved_at', 'resolved_by', 'resolved_by_username',
            'appeal_text', 'appealed_at', 'appeal_decision', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'filer', 'status', 'assigned_to', 'admin_decision', 'resolved_at',
            'resolved_by', 'provider_responded_at', 'appealed_at', 'created_at', 'updated_at'
        ]

    def create(self, validated_data):
        # Automatically set the filer to the current user
        validated_data['filer'] = self.context['request'].user

        # Determine filed_by based on user's relationship to the order
        order = validated_data['order']
        user = self.context['request'].user

        if user == order.buyer:
            validated_data['filed_by'] = 'customer'
        elif user == order.listing.vendor:
            validated_data['filed_by'] = 'provider'
        else:
            raise serializers.ValidationError("Only the buyer or provider can file a dispute for this order.")

        # Update order status to disputed
        order.status = 'disputed'
        order.save()

        return super().create(validated_data)


class DisputeResponseSerializer(serializers.Serializer):
    provider_response = serializers.CharField(required=True)

    def update(self, instance, validated_data):
        from django.utils import timezone
        instance.provider_response = validated_data['provider_response']
        instance.provider_responded_at = timezone.now()
        instance.status = 'under_review'
        instance.save()
        return instance


class DisputeResolutionSerializer(serializers.Serializer):
    resolution = serializers.ChoiceField(choices=Dispute.RESOLUTION_CHOICES)
    admin_decision = serializers.CharField(required=True)

    def update(self, instance, validated_data):
        from django.utils import timezone
        instance.resolution = validated_data['resolution']
        instance.admin_decision = validated_data['admin_decision']
        instance.status = 'resolved'
        instance.resolved_at = timezone.now()
        instance.resolved_by = self.context['request'].user
        instance.save()

        # Handle escrow based on resolution
        order = instance.order
        resolution = validated_data['resolution']

        if resolution == 'release_to_provider':
            # Release funds to provider (same as completing order)
            from wallet.models import EscrowTransaction
            escrow = EscrowTransaction.objects.filter(
                order=order,
                status='held'
            ).first()

            if escrow:
                escrow.status = 'released'
                escrow.save()

                # Update seller's wallet
                seller = order.listing.vendor
                seller.wallet_balance += escrow.seller_amount
                seller.save()

            order.status = 'completed'
            order.save()

        elif resolution == 'refund_customer':
            # Refund customer
            from wallet.models import EscrowTransaction
            escrow = EscrowTransaction.objects.filter(
                order=order,
                status='held'
            ).first()

            if escrow:
                escrow.status = 'refunded'
                escrow.save()

                # Update buyer's wallet
                buyer = order.buyer
                buyer.wallet_balance += escrow.total_amount
                buyer.save()

            order.status = 'cancelled'
            order.save()

        elif resolution == 'partial_split':
            # Hold for manual processing
            instance.status = 'under_review'
            instance.save()

        return instance


class DisputeAppealSerializer(serializers.Serializer):
    appeal_text = serializers.CharField(required=True)

    def update(self, instance, validated_data):
        from django.utils import timezone
        instance.appeal_text = validated_data['appeal_text']
        instance.appealed_at = timezone.now()
        instance.status = 'appealed'
        instance.save()
        return instance