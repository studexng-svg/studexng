from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from .models import CartItem
from .serializers import CartItemSerializer
from services.models import Listing


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_cart(request):
    items = CartItem.objects.filter(user=request.user).select_related('listing')
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

    item, created = CartItem.objects.get_or_create(
        user=request.user,
        listing=listing,
        defaults={'quantity': quantity},
    )
    if not created:
        item.quantity += quantity
        item.save(update_fields=['quantity', 'updated_at'])

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
    item.delete()
    return Response(status=204)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def clear_cart(request):
    CartItem.objects.filter(user=request.user).delete()
    return Response({'message': 'Cart cleared.'})
