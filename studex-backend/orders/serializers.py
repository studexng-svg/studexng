# orders/serializers.py
from rest_framework import serializers
from .models import Order, Dispute, Booking
from services.serializers import ListingSerializer
from services.models import Listing
import uuid

class OrderSerializer(serializers.ModelSerializer):
    listing = ListingSerializer(read_only=True)
    listing_id = serializers.IntegerField(write_only=True)
    buyer = serializers.ReadOnlyField(source='buyer.username')

    class Meta:
        model = Order
        fields = ['id', 'reference', 'listing', 'listing_id', 'buyer', 'amount', 'status', 'created_at', 'paid_at']
        read_only_fields = ['reference', 'amount', 'status', 'created_at', 'paid_at']

    def create(self, validated_data):
        from wallet.models import EscrowTransaction
        from decimal import Decimal

        listing_id = validated_data.pop('listing_id')
        listing = Listing.objects.get(id=listing_id)

        if not listing.is_available:
            raise serializers.ValidationError("This listing is no longer available.")

        reference = f"ORD-{uuid.uuid4().hex[:12].upper()}"

        total_amount = Decimal(str(listing.price))
        platform_fee_percentage = Decimal('0.05')
        platform_fee = total_amount * platform_fee_percentage
        seller_amount = total_amount - platform_fee

        order = Order.objects.create(
            reference=reference,
            listing=listing,
            amount=total_amount,
            status='pending',
            **validated_data
        )

        EscrowTransaction.objects.create(
            order=order,
            buyer=self.context['request'].user,
            seller=listing.vendor,
            total_amount=total_amount,
            seller_amount=seller_amount,
            platform_fee=platform_fee,
            status='held'
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
        validated_data['filer'] = self.context['request'].user

        order = validated_data['order']
        user = self.context['request'].user

        if user == order.buyer:
            validated_data['filed_by'] = 'customer'
        elif user == order.listing.vendor:
            validated_data['filed_by'] = 'provider'
        else:
            raise serializers.ValidationError("Only the buyer or provider can file a dispute for this order.")

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

        order = instance.order
        resolution = validated_data['resolution']

        if resolution == 'release_to_provider':
            from wallet.models import EscrowTransaction
            escrow = EscrowTransaction.objects.filter(order=order, status='held').first()
            if escrow:
                escrow.status = 'released'
                escrow.save()
                seller = order.listing.vendor
                seller.wallet_balance += escrow.seller_amount
                seller.save()
            order.status = 'completed'
            order.save()

        elif resolution == 'refund_customer':
            from wallet.models import EscrowTransaction
            escrow = EscrowTransaction.objects.filter(order=order, status='held').first()
            if escrow:
                escrow.status = 'refunded'
                escrow.save()
                buyer = order.buyer
                buyer.wallet_balance += escrow.total_amount
                buyer.save()
            order.status = 'cancelled'
            order.save()

        elif resolution == 'partial_split':
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


class BookingSerializer(serializers.ModelSerializer):
    buyer_username = serializers.CharField(source='buyer.username', read_only=True)
    vendor_username = serializers.CharField(source='listing.vendor.username', read_only=True)
    listing_title = serializers.CharField(source='listing.title', read_only=True)
    listing_price = serializers.DecimalField(source='listing.price', max_digits=10, decimal_places=2, read_only=True)
    vendor_name = serializers.SerializerMethodField()
    vendor_subaccount_code = serializers.SerializerMethodField()

    class Meta:
        model = Booking
        fields = [
            'id', 'buyer_username', 'vendor_username', 'listing', 'listing_title',
            'listing_price', 'vendor_name', 'vendor_subaccount_code',
            'scheduled_date', 'scheduled_time', 'note', 'status', 'created_at',
        ]
        read_only_fields = ['id', 'buyer_username', 'vendor_username', 'listing_title', 'listing_price', 'vendor_name', 'vendor_subaccount_code', 'status', 'created_at']

    def get_vendor_name(self, obj):
        vendor = obj.listing.vendor
        return getattr(vendor, 'business_name', None) or vendor.username

    def get_vendor_subaccount_code(self, obj):
        """Return vendor's Flutterwave subaccount ID so frontend can pass it at payment init."""
        try:
            from payments.models import SellerBankAccount
            bank = SellerBankAccount.objects.filter(user=obj.listing.vendor).first()
            return bank.flw_subaccount_id if bank else None
        except Exception:
            return None

    def validate_scheduled_date(self, value):
        from datetime import date
        if value < date.today():
            raise serializers.ValidationError("Booking date cannot be in the past.")
        return value