# orders/serializers.py
from rest_framework import serializers
from .models import Order, OrderStatus, Dispute, Booking, BookingReferenceImage
from services.serializers import ListingSerializer
from services.models import Listing, ListingVariant
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
    items = serializers.SerializerMethodField()
    has_rider_delivery = serializers.SerializerMethodField()

    def get_has_rider_delivery(self, obj):
        # Lets the frontend show a rider-delivery-appropriate status message
        # instead of the vendor-fulfilled-order default ("waiting for vendor
        # to confirm delivery" never applied once a rider was involved).
        from delivery.models import DeliveryAssignment
        return DeliveryAssignment.objects.filter(order=obj).exists()

    def get_items(self, obj):
        # Phase 2 — Frontend Integration: itemized breakdown for a multi-item
        # (menu/food) order — the id here is what
        # orders/{id}/items/{item_id}/mark-unavailable/ (Step 6) expects.
        # Empty list for every single-item order (nothing to break down).
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
                    {
                        'name': a.name_snapshot,
                        'price_delta': str(a.price_delta_snapshot),
                        'quantity': a.quantity,
                    }
                    for a in item.selected_addons.all()
                ],
            }
            for item in obj.items.select_related('listing').prefetch_related('selected_addons').all()
        ]

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
            'amount', 'quantity', 'status', 'current_status', 'estimated_time',
            'delivery_location', 'created_at', 'paid_at',
            'vendor_accepted_at', 'service_started_at', 'seller_completed_at', 'buyer_confirmed_at',
            'delivery_proof_1', 'delivery_proof_2', 'bank_transfer_proof', 'dispute', 'items', 'has_rider_delivery',
        ]
        read_only_fields = [
            'reference', 'amount', 'quantity', 'status', 'current_status', 'estimated_time',
            'created_at', 'paid_at',
            'vendor_accepted_at', 'service_started_at', 'seller_completed_at', 'buyer_confirmed_at',
            'delivery_proof_1', 'delivery_proof_2', 'bank_transfer_proof',
        ]

    def create(self, validated_data):
        # NOTE: this path is not used by the live payment flow — real orders are
        # created by payments._create_order_from_paystack_data after a Paystack
        # charge succeeds, using payments.pricing for the vendor/platform split.
        # This serializer's create() only exists so OrderViewSet's default POST
        # doesn't crash outright; it used to call a dead `wallet.EscrowTransaction`
        # with its own hardcoded (and wrong) 5% fee — removed as part of centralizing
        # all fee/split logic into payments.pricing.
        from decimal import Decimal

        listing_id = validated_data.pop('listing_id')
        listing = Listing.objects.get(id=listing_id)

        if not listing.is_available:
            raise serializers.ValidationError("This listing is no longer available.")

        reference = f"ORD-{uuid.uuid4().hex[:12].upper()}"

        order = Order.objects.create(
            reference=reference,
            listing=listing,
            amount=Decimal(str(listing.price)),
            status='pending',
            **validated_data
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
    note = serializers.CharField(max_length=250, allow_blank=True, required=False)
    reference_images = serializers.SerializerMethodField()
    quantity = serializers.IntegerField(required=False, default=1, min_value=1)
    variant = serializers.PrimaryKeyRelatedField(queryset=ListingVariant.objects.all(), required=False, allow_null=True)
    variant_title = serializers.CharField(source='variant.title', read_only=True, default=None)

    class Meta:
        model = Booking
        fields = [
            'id', 'buyer_username', 'buyer_id', 'vendor_username', 'listing', 'listing_id',
            'listing_title', 'listing_price', 'vendor_name', 'variant', 'variant_title',
            'scheduled_date', 'scheduled_time', 'quantity', 'note', 'reference_images', 'status', 'created_at',
        ]
        read_only_fields = ['id', 'buyer_username', 'buyer_id', 'vendor_username', 'listing_title', 'listing_id', 'listing_price', 'vendor_name', 'variant_title', 'reference_images', 'status', 'created_at']

    def validate(self, data):
        listing = data.get('listing', getattr(self.instance, 'listing', None))
        quantity = data.get('quantity', getattr(self.instance, 'quantity', 1))
        variant = data.get('variant', getattr(self.instance, 'variant', None))

        if listing is not None and quantity > 1 and not listing.is_per_unit:
            raise serializers.ValidationError(
                {'quantity': "This listing is not priced per unit — quantity must be 1."}
            )
        if listing is not None:
            if listing.variants.exists() and variant is None:
                raise serializers.ValidationError(
                    {'variant': "This listing offers multiple options — please choose one."}
                )
            if variant is not None and variant.listing_id != listing.id:
                raise serializers.ValidationError(
                    {'variant': "This option does not belong to the selected listing."}
                )
        return data

    def get_reference_images(self, obj):
        return [img.image_url for img in obj.reference_images.all()]

    def get_listing_price(self, obj):
        from decimal import Decimal
        from payments.settlement import get_vendor_type
        vendor_type = get_vendor_type(obj.listing.vendor)
        if obj.variant_id:
            payout_amount = obj.variant.payout_amount
            if obj.listing.is_per_unit and obj.quantity > 1:
                from payments.pricing import calculate_final_price
                return str(calculate_final_price(
                    Decimal(str(payout_amount)) * obj.quantity, campus=obj.listing.campus,
                    vendor_type=vendor_type,
                ))
            return str(obj.variant.price)
        if obj.listing.is_per_unit and obj.quantity > 1:
            from payments.pricing import calculate_final_price
            return str(calculate_final_price(
                Decimal(str(obj.listing.payout_amount)) * obj.quantity, campus=obj.listing.campus,
                vendor_type=vendor_type,
            ))
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