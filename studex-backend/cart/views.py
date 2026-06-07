from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.core.cache import cache
from django.utils import timezone
from .models import CartItem
from .serializers import CartItemSerializer
from services.models import Listing

RESERVATION_TTL = 600  # 10 minutes in seconds


def _reservation_key(listing_id):
    return f'reserved:{listing_id}'


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_cart(request):
    items = CartItem.objects.filter(user=request.user).select_related('listing__deal')
    return Response(CartItemSerializer(items, many=True).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def add_to_cart(request):
    listing_id = request.data.get('listing_id')
    quantity = max(1, int(request.data.get('quantity', 1)))

    if not listing_id:
        return Response({'error': 'listing_id is required.'}, status=400)

    try:
        listing = Listing.objects.get(id=listing_id)
    except Listing.DoesNotExist:
        return Response({'error': 'Listing not found.'}, status=404)

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
        defaults={'quantity': quantity, 'reserved_at': now},
    )
    if not created:
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

    item = get_object_or_404(CartItem, user=request.user, listing_id=listing_id)
    item.quantity = max(1, int(quantity))
    item.save(update_fields=['quantity', 'updated_at'])
    return Response(CartItemSerializer(item).data)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def remove_from_cart(request, listing_id):
    item = get_object_or_404(CartItem, user=request.user, listing_id=listing_id)

    # Release reservation if this user owns it
    rkey = _reservation_key(listing_id)
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
