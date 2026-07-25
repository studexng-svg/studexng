from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.core.cache import cache
from django.utils import timezone
from .models import CartItem, CartItemAddon, compute_addon_signature
from .serializers import CartItemSerializer
from services.models import Listing
from services.menu_selection import validate_addon_selection, AddonSelectionError

RESERVATION_TTL = 600  # 10 minutes in seconds


def _reservation_key(listing_id):
    return f'reserved:{listing_id}'


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_cart(request):
    items = CartItem.objects.filter(user=request.user).select_related(
        'listing__deal', 'listing__vendor',
    ).prefetch_related('selected_addons__addon')
    return Response(CartItemSerializer(items, many=True).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def add_to_cart(request):
    listing_id = request.data.get('listing_id')
    quantity = max(1, int(request.data.get('quantity', 1)))
    addon_ids = request.data.get('addon_ids', [])
    # Optional per-addon quantity (e.g. 2x Chicken) — either a {id: qty}
    # object or a [{id, quantity}] list, both accepted so the frontend can
    # send whichever shape is more convenient to build. Absent/empty means
    # every addon in addon_ids defaults to quantity 1, exactly the
    # pre-existing behavior.
    raw_addon_quantities = request.data.get('addon_quantities')
    if isinstance(raw_addon_quantities, dict):
        addon_quantities = raw_addon_quantities
    elif isinstance(raw_addon_quantities, list):
        addon_quantities = {
            entry.get('id'): entry.get('quantity', 1)
            for entry in raw_addon_quantities if isinstance(entry, dict) and entry.get('id') is not None
        }
    else:
        addon_quantities = {}

    if not listing_id:
        return Response({'error': 'listing_id is required.'}, status=400)

    try:
        listing = Listing.objects.get(id=listing_id)
    except Listing.DoesNotExist:
        return Response({'error': 'Listing not found.'}, status=404)

    # Phase 1 — Food Commerce Engine, Step 3: a menu item can be added with a
    # chosen set of add-ons — validated against the item's AddonGroup rules
    # (required/min/max) here, at cart-construction time. A plain listing
    # (no addon_ids, no MenuItem) behaves exactly as before: addon_signature
    # stays '', matching the original (user, listing) uniqueness exactly.
    try:
        selected_addons = validate_addon_selection(listing, addon_ids, addon_quantities)
    except AddonSelectionError as e:
        return Response({'error': e.detail}, status=400)

    addon_signature = compute_addon_signature({addon.id: qty for addon, qty in selected_addons})

    # Single-stock reservation gate
    is_single_stock = listing.track_inventory and listing.stock_quantity == 1
    rkey = _reservation_key(listing_id)

    if is_single_stock:
        reserved_by = cache.get(rkey)
        if reserved_by is not None and reserved_by != request.user.id:
            return Response({'error': 'Item is currently reserved by another user'}, status=400)
        cache.set(rkey, request.user.id, RESERVATION_TTL)

    now = timezone.now() if is_single_stock else None

    item, created = CartItem.objects.get_or_create(
        user=request.user,
        listing=listing,
        addon_signature=addon_signature,
        defaults={'quantity': quantity, 'reserved_at': now},
    )
    if created:
        for addon, addon_qty in selected_addons:
            CartItemAddon.objects.create(
                cart_item=item, addon=addon, price_delta_at_add_time=addon.price_delta, quantity=addon_qty,
            )
    else:
        update_fields = ['quantity', 'updated_at']
        item.quantity += quantity
        if is_single_stock and item.reserved_at is None:
            item.reserved_at = now
            update_fields.append('reserved_at')
        item.save(update_fields=update_fields)

    return Response(CartItemSerializer(item).data, status=201 if created else 200)


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def update_cart_item(request, listing_id):
    quantity = request.data.get('quantity')
    if quantity is None:
        return Response({'error': 'quantity is required.'}, status=400)

    # Only safe for a listing with a single (addon_signature='') cart line.
    # A menu item added with several different add-on selections now has
    # more than one CartItem per (user, listing) — use update_cart_item_by_id
    # below to target a specific line unambiguously in that case.
    item = get_object_or_404(CartItem, user=request.user, listing_id=listing_id, addon_signature='')
    item.quantity = max(1, int(quantity))
    item.save(update_fields=['quantity', 'updated_at'])
    return Response(CartItemSerializer(item).data)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def remove_from_cart(request, listing_id):
    # Same addon_signature='' scoping caveat as update_cart_item above.
    item = get_object_or_404(CartItem, user=request.user, listing_id=listing_id, addon_signature='')

    # Release reservation if this user owns it
    rkey = _reservation_key(listing_id)
    if cache.get(rkey) == request.user.id:
        cache.delete(rkey)

    item.delete()
    return Response(status=204)


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def update_cart_item_by_id(request, pk):
    """
    Phase 1 — Food Commerce Engine, Step 3: identifies a cart line by its own
    id rather than by listing_id, so a listing with several add-on-distinct
    lines (see CartItem.addon_signature) can have exactly one of them
    updated. Additive — update_cart_item above is untouched for callers that
    only ever have one line per listing.
    """
    quantity = request.data.get('quantity')
    if quantity is None:
        return Response({'error': 'quantity is required.'}, status=400)
    item = get_object_or_404(CartItem, id=pk, user=request.user)
    item.quantity = max(1, int(quantity))
    item.save(update_fields=['quantity', 'updated_at'])
    return Response(CartItemSerializer(item).data)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def remove_cart_item_by_id(request, pk):
    """Additive id-scoped counterpart to remove_from_cart — see update_cart_item_by_id."""
    item = get_object_or_404(CartItem, id=pk, user=request.user)

    rkey = _reservation_key(item.listing_id)
    if cache.get(rkey) == request.user.id:
        cache.delete(rkey)

    item.delete()
    return Response(status=204)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def clear_cart(request):
    items = CartItem.objects.filter(user=request.user).select_related('listing__deal')
    for item in items:
        if item.reserved_at:
            rkey = _reservation_key(item.listing_id)
            if cache.get(rkey) == request.user.id:
                cache.delete(rkey)
    CartItem.objects.filter(user=request.user).delete()
    return Response({'message': 'Cart cleared.'})


@api_view(['GET'])
@permission_classes([AllowAny])
def check_availability(request):
    listing_id = request.query_params.get('listing_id')
    if not listing_id:
        return Response({'error': 'listing_id is required.'}, status=400)

    rkey = _reservation_key(listing_id)
    reserved_by = cache.get(rkey)

    if reserved_by is None:
        return Response({'reserved': False, 'is_mine': False})

    requesting_user_id = request.user.id if request.user.is_authenticated else None
    return Response({'reserved': True, 'is_mine': reserved_by == requesting_user_id})
