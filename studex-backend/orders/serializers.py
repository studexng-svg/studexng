# orders/serializers.py
from rest_framework import serializers
from .models import Order, OrderStatus, Dispute, Booking
from services.serializers import ListingSerializer
from services.models import Listing
import uuid


class OrderStatusSerializer(serializers.ModelSerializer):
    updated_by = serializers.ReadOnlyField(source='updated_by.username')

    class Meta:
        model = OrderStatus
        fields = ['id', 'status', 'note', 'updated_by', 'created_at']
        read_only_fields = ['id', 'updated_by', 'created_at']


class OrderSerializer(serializers.ModelSerializer):
    listing = ListingSerializer(read_only=True)
    listing_id = serializers.IntegerField(write_only=True)
    buyer = serializers.ReadOnlyField(source='buyer.username')
    buyer_id = serializers.ReadOnlyField(source='buyer.id')
    buyer_username = serializers.ReadOnlyField(source='buyer.username')
    buyer_profile_picture = serializers.SerializerMethodField()
    dispute = serializers.SerializerMethodField()

    def get_buyer_profile_picture(self, obj):
        try:
            img = obj.buyer.profile_image
            if not img:
                return None
            name = getattr(img, 'name', None)
            if not name or name == 'profiles/default.jpg':
                return None
            if name.startswith('http'):
                return name
            url = img.url
            if url and url.startswith('http'):
                return url
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(url)
        except Exception:
            pass
        return None

    def get_dispute(self, obj):
        d = obj.disputes.first()
        if not d:
            return None
        return {
            'id': d.id,
            'reason': d.reason,
            'complaint': d.complaint,
            'evidence': d.evidence,
            'evidence_image_1': d.evidence_image_1,
            'evidence_image_2': d.evidence_image_2,
            'filer_username': d.filer.username,
            'provider_response': d.provider_response,
            'provider_responded_at': d.provider_responded_at.isoformat() if d.provider_responded_at else None,
            'status': d.status,
            'created_at': d.created_at.isoformat(),
        }

    class Meta:
        model = Order
        fields = [
            'id', 'reference', 'listing', 'listing_id', 'buyer', 'buyer_id',
            'buyer_username', 'buyer_profile_picture',
            'amount', 'status', 'current_status', 'estimated_time',
            'delivery_location', 'created_at', 'paid_at', 'seller_completed_at',
            'delivery_proof_1', 'delivery_proof_2', 'dispute',
        ]
        read_only_fields = [
            'reference', 'amount', 'status', 'current_status', 'estimated_time',
            'created_at', 'paid_at', 'seller_completed_at',
            'delivery_proof_1', 'delivery_proof_2',
        ]

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
    order_listing_title = serializers.ReadOnlyField(source='order.listing.title')
    assigned_to_username = serializers.ReadOnlyField(source='assigned_to.username')
    resolved_by_username = serializers.ReadOnlyField(source='resolved_by.username')

    class Meta:
        model = Dispute
        fields = [
            'id', 'order', 'order_reference', 'order_listing_title', 'filed_by', 'filer', 'filer_username',
            'reason', 'complaint', 'evidence', 'evidence_image_1', 'evidence_image_2',
            'provider_response', 'provider_responded_at',
            'status', 'resolution', 'assigned_to', 'assigned_to_username',
            'admin_decision', 'resolved_at', 'resolved_by', 'resolved_by_username',
            'appeal_text', 'appealed_at', 'appeal_decision', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'filer', 'status', 'assigned_to', 'admin_decision', 'resolved_at',
            'resolved_by', 'provider_responded_at', 'appealed_at', 'created_at', 'updated_at'
        ]
        extra_kwargs = {
            'filed_by': {'required': False},
        }

    def create(self, validated_data):
        validated_data['filer'] = self.context['request'].user

        order = validated_data['order']
        user = self.context['request'].user

        # Validate order is in a disputable state
        if order.status == 'pending':
            raise serializers.ValidationError("Cannot dispute an order that has not been paid yet.")
        if order.status == 'cancelled':
            raise serializers.ValidationError("Cannot dispute a cancelled order.")
        if order.status == 'disputed':
            raise serializers.ValidationError("A dispute has already been filed for this order.")

        # Buyers have 7 days after confirming receipt to raise a post-completion dispute.
        # Prevents abuse months after a transaction closed.
        if order.status == 'completed' and order.buyer_confirmed_at:
            from django.utils import timezone as _tz
            from datetime import timedelta
            if _tz.now() - order.buyer_confirmed_at > timedelta(days=7):
                raise serializers.ValidationError(
                    "Disputes must be filed within 7 days of order completion."
                )

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
    buyer_id = serializers.IntegerField(source='buyer.id', read_only=True)
    vendor_username = serializers.CharField(source='listing.vendor.username', read_only=True)
    listing_title = serializers.CharField(source='listing.title', read_only=True)
    listing_price = serializers.SerializerMethodField()
    listing_id = serializers.IntegerField(source='listing.id', read_only=True)
    vendor_name = serializers.SerializerMethodField()

    class Meta:
        model = Booking
        fields = [
            'id', 'buyer_username', 'buyer_id', 'vendor_username', 'listing', 'listing_id',
            'listing_title', 'listing_price', 'vendor_name',
            'scheduled_date', 'scheduled_time', 'note', 'status', 'created_at',
        ]
        read_only_fields = ['id', 'buyer_username', 'buyer_id', 'vendor_username', 'listing_title', 'listing_id', 'listing_price', 'vendor_name', 'status', 'created_at']

    def get_listing_price(self, obj):
        from decimal import Decimal
        price = Decimal(str(obj.listing.price))
        try:
            deal = obj.listing.deal
            if deal.is_active:
                return str(deal.discounted_price)
        except Exception:
            vd = getattr(obj.listing, 'discount_percent', 0) or 0
            if vd > 0:
                effective = price - price * Decimal(vd) / 100
                return str(effective.quantize(Decimal('0.01')))
        return str(price)

    def get_vendor_name(self, obj):
        vendor = obj.listing.vendor
        return getattr(vendor, 'business_name', None) or vendor.username

    def validate_scheduled_date(self, value):
        from datetime import date
        if value < date.today():
            raise serializers.ValidationError("Booking date cannot be in the past.")
        return value