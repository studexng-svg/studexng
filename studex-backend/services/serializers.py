# services/serializers.py
import json
from rest_framework import serializers
from .models import Category, Listing, ListingVariant, Transaction, Deal
from django.contrib.auth import get_user_model

User = get_user_model()


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ['id', 'title', 'slug', 'image']
        read_only_fields = ['id']


class ListingVariantSerializer(serializers.ModelSerializer):
    class Meta:
        model = ListingVariant
        fields = ['id', 'title', 'payout_amount', 'price']
        read_only_fields = ['id', 'price']


class VendorSerializer(serializers.Serializer):
    """Minimal vendor info needed by frontend - includes id for chat"""
    id = serializers.IntegerField(source='pk')
    username = serializers.CharField()
    business_name = serializers.SerializerMethodField()

    def get_business_name(self, obj):
        profile = getattr(obj, 'profile', None)
        return profile.business_name if profile and hasattr(profile, 'business_name') else None


class ListingVendorSerializer(serializers.ModelSerializer):
    """Vendor serializer for listing detail — includes profile stats."""
    vendor_badge = serializers.CharField(source='profile.vendor_badge', default=None)
    completion_rate = serializers.DecimalField(source='profile.completion_rate', max_digits=5, decimal_places=2, default=0)
    rating = serializers.DecimalField(source='profile.rating', max_digits=3, decimal_places=2, default=0)
    total_reviews = serializers.IntegerField(source='profile.total_reviews', default=0)
    profile = serializers.SerializerMethodField()
    profile_picture = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'business_name', 'hostel', 'vendor_badge', 'completion_rate', 'rating', 'total_reviews', 'profile', 'profile_picture']

    def get_profile_picture(self, obj):
        try:
            img = getattr(obj, 'profile_image', None)
            if not img:
                return None
            name = getattr(img, 'name', None)
            if not name or name == 'profiles/default.jpg':
                return None
            # Cloudinary stores the full URL as the name field
            if name.startswith('http'):
                return name
            url = img.url
            return url if url.startswith('http') else None
        except Exception:
            return None

    def get_profile(self, obj):
        try:
            p = obj.profile
            profile_data = {
                'available_days': p.available_days or [],
                'opening_time': p.opening_time.strftime('%H:%M') if p.opening_time else None,
                'closing_time': p.closing_time.strftime('%H:%M') if p.closing_time else None,
                'avg_response_minutes': None,
            }
        except Exception:
            profile_data = {
                'available_days': [], 'opening_time': None, 'closing_time': None,
                'avg_response_minutes': None,
            }

        try:
            from orders.models import Booking
            from django.db.models import Avg, ExpressionWrapper, F, DurationField
            result = Booking.objects.filter(
                listing__vendor=obj,
                confirmed_at__isnull=False,
            ).aggregate(
                avg_time=Avg(ExpressionWrapper(
                    F('confirmed_at') - F('created_at'),
                    output_field=DurationField(),
                ))
            )
            if result['avg_time']:
                profile_data['avg_response_minutes'] = round(result['avg_time'].total_seconds() / 60)
        except Exception:
            pass

        return profile_data


class ListingSerializer(serializers.ModelSerializer):
    vendor = ListingVendorSerializer(read_only=True)
    vendor_is_verified = serializers.ReadOnlyField(source='vendor.is_verified_vendor')
    category = serializers.SlugRelatedField(
        slug_field='slug',
        queryset=Category.objects.all(),
        help_text="Category slug (e.g., 'food', 'nails')"
    )
    image = serializers.SerializerMethodField()
    image2 = serializers.SerializerMethodField()
    image3 = serializers.SerializerMethodField()
    image4 = serializers.SerializerMethodField()
    image5 = serializers.SerializerMethodField()
    image_upload = serializers.CharField(required=False, allow_null=True, allow_blank=True, write_only=True, source='image')
    # Required on create; PATCH (partial=True) updates may omit it to leave price
    # unchanged. Nullable at the model level only for pre-migration legacy rows.
    payout_amount = serializers.DecimalField(max_digits=10, decimal_places=2, required=True)
    is_reserved = serializers.SerializerMethodField()
    campus = serializers.CharField(source='vendor.school', read_only=True, default='')
    sale_price = serializers.SerializerMethodField(read_only=True)
    weekly_order_count = serializers.SerializerMethodField(read_only=True)
    last_ordered_at = serializers.SerializerMethodField(read_only=True)
    platform_fee = serializers.SerializerMethodField(read_only=True)
    # Named variants (e.g. "Washing Only" vs "Washing & Ironing") under this
    # listing. Read-only here — writes come in as a raw JSON string under the
    # same `variants` key (see create()/update()/_sync_variants below), not a
    # nested DRF field, so the vendor form can submit it in the same
    # multipart request as everything else without nested-serializer plumbing.
    variants = ListingVariantSerializer(many=True, read_only=True)

    class Meta:
        model = Listing
        fields = [
            'id', 'title', 'description', 'payout_amount', 'price', 'platform_fee',
            'is_per_unit', 'unit_label', 'variants',
            'discount_percent', 'sale_price',
            'image', 'image2', 'image3', 'image4', 'image5', 'image_upload',
            'is_available', 'listing_type', 'track_inventory', 'stock_quantity',
            'is_reserved',
            'category', 'vendor', 'vendor_is_verified',
            'campus',
            'brand', 'condition', 'delivery_time', 'tags',
            'weekly_order_count', 'last_ordered_at',
            'created_at', 'updated_at'
        ]
        # `price` is computed from `payout_amount` (see payments/pricing.py) — vendors
        # no longer set it directly. Enforced here, not just by convention.
        read_only_fields = ['vendor', 'vendor_is_verified', 'price', 'created_at', 'updated_at']

    def validate_payout_amount(self, value):
        if value is not None and value <= 0:
            raise serializers.ValidationError("Amount you want to receive must be greater than zero.")
        return value

    def get_platform_fee(self, obj):
        if obj.payout_amount is None:
            return None
        return float(obj.price - obj.payout_amount)

    def create(self, validated_data):
        from payments.pricing import calculate_final_price
        validated_data['price'] = calculate_final_price(validated_data['payout_amount'])
        instance = super().create(validated_data)
        self._variant_warnings = self._sync_variants(instance, self.initial_data.get('variants'))
        return instance

    def update(self, instance, validated_data):
        if 'payout_amount' in validated_data and validated_data['payout_amount'] is not None:
            from payments.pricing import calculate_final_price
            validated_data['price'] = calculate_final_price(validated_data['payout_amount'])
        instance = super().update(instance, validated_data)
        self._variant_warnings = self._sync_variants(instance, self.initial_data.get('variants'))
        return instance

    def _sync_variants(self, listing, raw_variants):
        """
        Syncs ListingVariant rows from a raw JSON string like:
        '[{"id": 3, "title": "Washing Only", "payout_amount": "300"}, {"title": "New Variant", "payout_amount": "500"}]'
        Rows with an `id` are updated in place; rows without one are created;
        any existing variant not present in the submitted list is deleted —
        unless it has real bookings (PROTECT), in which case it's left alone
        and a warning is collected instead of raising a 500.
        """
        if raw_variants is None:
            return []
        try:
            rows = json.loads(raw_variants)
        except (TypeError, ValueError):
            return []
        if not isinstance(rows, list):
            return []

        from decimal import Decimal, InvalidOperation
        from django.db.models import ProtectedError
        from payments.pricing import calculate_final_price

        submitted_ids = set()
        warnings = []
        for row in rows:
            if not isinstance(row, dict):
                continue
            title = (row.get('title') or '').strip()
            raw_amount = row.get('payout_amount')
            if not title or raw_amount in (None, ''):
                continue
            try:
                payout_amount = Decimal(str(raw_amount))
            except InvalidOperation:
                continue
            if payout_amount <= 0:
                continue
            price = calculate_final_price(payout_amount)

            variant_id = row.get('id')
            if variant_id:
                updated = ListingVariant.objects.filter(id=variant_id, listing=listing).update(
                    title=title, payout_amount=payout_amount, price=price,
                )
                if updated:
                    submitted_ids.add(int(variant_id))
            else:
                variant = ListingVariant.objects.create(
                    listing=listing, title=title, payout_amount=payout_amount, price=price,
                )
                submitted_ids.add(variant.id)

        for existing in listing.variants.exclude(id__in=submitted_ids):
            try:
                existing.delete()
            except ProtectedError:
                warnings.append(f'Cannot remove "{existing.title}" — it has existing bookings.')
        return warnings

    def get_sale_price(self, obj):
        if obj.discount_percent and obj.discount_percent > 0:
            from decimal import Decimal
            return float(obj.price - obj.price * Decimal(obj.discount_percent) / 100)
        return None

    def get_weekly_order_count(self, obj):
        from django.utils import timezone
        from datetime import timedelta
        try:
            from orders.models import Order
            cutoff = timezone.now() - timedelta(days=7)
            return Order.objects.filter(
                listing=obj,
                created_at__gte=cutoff,
                status__in=['paid', 'preparing', 'ready', 'completed'],
            ).count()
        except Exception:
            return 0

    def get_last_ordered_at(self, obj):
        try:
            from orders.models import Order
            last = Order.objects.filter(
                listing=obj,
                status__in=['paid', 'preparing', 'ready', 'completed'],
            ).order_by('-created_at').values_list('created_at', flat=True).first()
            return last.isoformat() if last else None
        except Exception:
            return None

    def validate_discount_percent(self, value):
        if not (0 <= value <= 100):
            raise serializers.ValidationError("Discount must be between 0 and 100.")
        return value

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Expand category slug into a full object for frontend consumption.
        # Writes still use SlugRelatedField (slug string) as before.
        cat = instance.category
        if cat:
            data['category'] = {'id': cat.id, 'title': cat.title, 'slug': cat.slug}
        # Include active admin deal so the frontend can show slashed prices.
        try:
            deal = instance.deal
            if deal.is_active:
                data['deal'] = {
                    'discount_percent': deal.discount_percent,
                    'discounted_price': float(deal.discounted_price),
                }
            else:
                data['deal'] = None
        except Exception:
            data['deal'] = None
        if getattr(self, '_variant_warnings', None):
            data['variant_warnings'] = self._variant_warnings
        return data

    def get_is_reserved(self, obj):
        if not (obj.track_inventory and obj.stock_quantity == 1):
            return False
        from django.core.cache import cache
        return cache.get(f'reserved:{obj.pk}') is not None

    def _resolve_image(self, url):
        if not url:
            return None
        img = str(url)
        if img.startswith('http'):
            return img
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(f'/media/{img}')
        return f'/media/{img}'

    def get_image(self, obj):
        return self._resolve_image(obj.image)

    def get_image2(self, obj):
        return self._resolve_image(obj.image2)

    def get_image3(self, obj):
        return self._resolve_image(obj.image3)

    def get_image4(self, obj):
        return self._resolve_image(obj.image4)

    def get_image5(self, obj):
        return self._resolve_image(obj.image5)

    def validate_image(self, value):
        # If it's already a URL string, just return it
        if isinstance(value, str):
            return value
        return value

    def validate(self, data):
        request = self.context.get('request')
        if not request:
            return data  # nested/read-only usage — skip write validation
        user = request.user
        if not user.is_verified_vendor:
            raise serializers.ValidationError("You must be a verified vendor to post listings.")

        is_per_unit = data.get('is_per_unit', getattr(self.instance, 'is_per_unit', False))
        unit_label = data.get('unit_label', getattr(self.instance, 'unit_label', ''))
        if is_per_unit and not (unit_label or '').strip():
            raise serializers.ValidationError(
                {'unit_label': "A unit label (e.g. 'cloth') is required for per-unit pricing."}
            )
        return data


class TransactionSerializer(serializers.ModelSerializer):
    buyer_name = serializers.CharField(source='order.buyer.username', read_only=True)
    service_name = serializers.CharField(source='order.listing.title', read_only=True)
    order_reference = serializers.CharField(source='order.reference', read_only=True)

    class Meta:
        model = Transaction
        fields = [
            'id', 'order_reference', 'amount', 'status',
            'created_at', 'released_at', 'withdrawn_at',
            'buyer_name', 'service_name'
        ]
        read_only_fields = ['id', 'created_at', 'released_at', 'withdrawn_at']


class DealSerializer(serializers.ModelSerializer):
    listing_id = serializers.IntegerField()
    discounted_price = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Deal
        fields = ['id', 'listing_id', 'discount_percent', 'discounted_price', 'is_active', 'created_at']
        read_only_fields = ['id', 'created_at']

    def get_discounted_price(self, obj):
        return float(obj.discounted_price)


class DealDetailSerializer(serializers.ModelSerializer):
    listing = ListingSerializer(read_only=True)
    discounted_price = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Deal
        fields = ['id', 'listing', 'discount_percent', 'discounted_price', 'is_active', 'created_at']
        read_only_fields = ['id', 'created_at']

    def get_discounted_price(self, obj):
        return float(obj.discounted_price)


