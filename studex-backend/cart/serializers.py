from rest_framework import serializers
from .models import CartItem


class CartItemAddonSerializer(serializers.Serializer):
    """Read-only nested view of a cart line's selected add-ons (Phase 1 — Food Commerce Engine, Step 3)."""
    id = serializers.IntegerField(source='addon.id')
    name = serializers.CharField(source='addon.name')
    price_delta = serializers.DecimalField(source='price_delta_at_add_time', max_digits=10, decimal_places=2)
    quantity = serializers.IntegerField()


class CartItemSerializer(serializers.ModelSerializer):
    listing_id = serializers.IntegerField(source='listing.id', read_only=True)
    title = serializers.CharField(source='listing.title', read_only=True)
    price = serializers.DecimalField(
        source='listing.price', max_digits=10, decimal_places=2, read_only=True
    )
    img = serializers.SerializerMethodField()
    stock_quantity = serializers.IntegerField(source='listing.stock_quantity', read_only=True, allow_null=True)
    is_single_stock = serializers.SerializerMethodField()
    deal_discount_percent = serializers.SerializerMethodField()
    effective_price = serializers.SerializerMethodField()
    # Phase 1 — Food Commerce Engine, Step 3: a cart can hold lines from
    # several vendors at once (checkout itself is what's vendor-scoped — see
    # payments/cart_checkout.py) — these let the frontend group cart display
    # by vendor and identify which vendor_id to pass to checkout.
    vendor_id = serializers.IntegerField(source='listing.vendor_id', read_only=True)
    vendor_username = serializers.CharField(source='listing.vendor.username', read_only=True)
    selected_addons = CartItemAddonSerializer(many=True, read_only=True)
    # Phase 2 — Frontend Integration: tells the frontend which checkout
    # endpoint this vendor's cart lines must go through — the vendor-scoped
    # /api/payments/initialize-cart/ + verify-cart/ (Step 3/4, supports
    # add-ons and batch reservation) vs the pre-existing single-listing
    # /api/payments/initialize/ + verify/ (deals/profile-bonus/loyalty
    # credits, no add-on or batch support). Reuses the same capability
    # flags checkout itself already gates on — no new backend concept.
    uses_menu_checkout = serializers.SerializerMethodField()

    class Meta:
        model = CartItem
        fields = [
            'id', 'listing_id', 'title',
            'price', 'effective_price', 'deal_discount_percent',
            'img', 'quantity', 'reserved_at', 'stock_quantity', 'is_single_stock',
            'vendor_id', 'vendor_username', 'addon_signature', 'selected_addons',
            'uses_menu_checkout',
        ]

    def get_uses_menu_checkout(self, obj):
        from payments.settlement import get_vendor_type
        vendor_type = get_vendor_type(obj.listing.vendor)
        return bool(vendor_type and (vendor_type.supports_menu_ordering or vendor_type.supports_batched_delivery))

    def get_img(self, obj):
        return obj.listing.image or ''

    def get_is_single_stock(self, obj):
        return bool(obj.listing.track_inventory and (obj.listing.stock_quantity or 0) == 1)

    def get_deal_discount_percent(self, obj):
        try:
            deal = obj.listing.deal
            if deal.is_active:
                return deal.discount_percent
        except Exception:
            pass
        # No admin Deal row — fall back to the vendor's own self-service
        # discount (services.models.Listing.discount_percent, exposed
        # elsewhere as ListingSerializer.sale_price). These are two
        # independent discount mechanisms; the cart previously only ever
        # checked Deal, so a vendor's own discounted listing silently
        # showed full price in the cart even though the listing/home page
        # displayed the sale price correctly via sale_price.
        if obj.listing.discount_percent and obj.listing.discount_percent > 0:
            return obj.listing.discount_percent
        return 0

    def get_effective_price(self, obj):
        # A menu item's real per-unit checkout price includes its selected
        # add-ons, combined with the base payout before the platform fee is
        # applied once (see payments.cart_checkout.price_cart_item) — never
        # the bare listing.price plus each add-on's raw delta added after
        # the fact. Deals aren't part of the vendor-scoped menu checkout
        # (Step 3's scope decision), so add-ons take priority here.
        selected = list(obj.selected_addons.all())
        if selected:
            from decimal import Decimal
            from payments.pricing import calculate_final_price
            from payments.settlement import get_vendor_type
            listing = obj.listing
            base = Decimal(str(listing.payout_amount if listing.payout_amount is not None else listing.price))
            addon_total = sum(
                (Decimal(str(a.price_delta_at_add_time)) * a.quantity for a in selected), Decimal('0')
            )
            combined = max(base + addon_total, Decimal('0'))
            vendor_type = get_vendor_type(listing.vendor)
            return float(calculate_final_price(combined, campus=listing.campus, vendor_type=vendor_type))
        try:
            deal = obj.listing.deal
            if deal.is_active:
                return float(deal.discounted_price)
        except Exception:
            pass
        # No admin Deal — same fallback as get_deal_discount_percent above.
        # Matches ListingSerializer.get_sale_price's exact formula so the
        # cart's price always agrees with what the listing/home page shows.
        if obj.listing.discount_percent and obj.listing.discount_percent > 0:
            from decimal import Decimal
            price = obj.listing.price
            return float(price - price * Decimal(obj.listing.discount_percent) / 100)
        return float(obj.listing.price)
