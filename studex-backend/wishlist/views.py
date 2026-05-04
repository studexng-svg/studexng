from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from .models import WishlistItem
from .serializers import WishlistItemSerializer
from services.models import Listing


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_wishlist(request):
    items = WishlistItem.objects.filter(user=request.user).select_related('listing')
    return Response(WishlistItemSerializer(items, many=True).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def add_to_wishlist(request):
    listing_id = request.data.get('listing_id')
    if not listing_id:
        return Response({'error': 'listing_id is required.'}, status=400)

    try:
        listing = Listing.objects.get(id=listing_id)
    except Listing.DoesNotExist:
        return Response({'error': 'Listing not found.'}, status=404)

    item, created = WishlistItem.objects.get_or_create(user=request.user, listing=listing)
    return Response(WishlistItemSerializer(item).data, status=201 if created else 200)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def remove_from_wishlist(request, listing_id):
    item = get_object_or_404(WishlistItem, user=request.user, listing_id=listing_id)
    item.delete()
    return Response(status=204)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def clear_wishlist(request):
    WishlistItem.objects.filter(user=request.user).delete()
    return Response({'message': 'Wishlist cleared.'})
