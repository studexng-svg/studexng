# reviews/views.py
from django.conf import settings
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db.models import Avg, Count
from .models import Review, AppFeedback
from .serializers import ReviewSerializer


def _recalc_vendor_profile(vendor):
    """Recalculate rating and total_reviews from live Review table and persist."""
    try:
        stats = Review.objects.filter(vendor=vendor).aggregate(
            avg_rating=Avg('rating'),
            total_reviews=Count('id'),
        )
        profile = vendor.profile
        profile.rating = round(stats['avg_rating'] or 0, 2)
        profile.total_reviews = stats['total_reviews']
        profile.save(update_fields=['rating', 'total_reviews'])
    except Exception:
        pass


class ReviewViewSet(viewsets.ModelViewSet):
    queryset = Review.objects.all()
    serializer_class = ReviewSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    http_method_names = ['get', 'post', 'head', 'options']  # no edit/delete

    def get_queryset(self):
        qs = Review.objects.select_related('reviewer', 'vendor', 'listing')
        vendor_id = self.request.query_params.get('vendor')
        listing_id = self.request.query_params.get('listing')
        if vendor_id:
            qs = qs.filter(vendor_id=vendor_id)
        if listing_id:
            qs = qs.filter(listing_id=listing_id)
        return qs

    def perform_create(self, serializer):
        review = serializer.save()
        _recalc_vendor_profile(review.vendor)

    @action(detail=False, methods=['get'], url_path='can-review/(?P<order_id>[^/.]+)')
    def can_review(self, request, order_id=None):
        """GET /api/reviews/reviews/can-review/<order_id>/
        Returns whether the current user can leave a review for this order.
        """
        try:
            from orders.models import Order
            order = Order.objects.get(id=order_id, buyer=request.user)
        except Order.DoesNotExist:
            return Response({'can_review': False})

        if order.status != 'completed':
            return Response({'can_review': False})

        already_reviewed = Review.objects.filter(order=order).exists()
        return Response({'can_review': not already_reviewed})

    @action(detail=False, methods=['get'], url_path='vendor-stats')
    def vendor_stats(self, request):
        """GET /api/reviews/reviews/vendor-stats/?vendor=<id>"""
        vendor_id = request.query_params.get('vendor')
        if not vendor_id:
            return Response({'error': 'vendor param required'}, status=400)

        stats = Review.objects.filter(vendor_id=vendor_id).aggregate(
            avg_rating=Avg('rating'),
            total_reviews=Count('id'),
        )
        breakdown = {
            f'{i}_star': Review.objects.filter(vendor_id=vendor_id, rating=i).count()
            for i in range(1, 6)
        }
        return Response({
            'vendor_id': vendor_id,
            'avg_rating': round(stats['avg_rating'] or 0, 2),
            'total_reviews': stats['total_reviews'],
            'breakdown': breakdown,
        })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def submit_app_feedback(request):
    comment = request.data.get('comment', '').strip()
    rating = request.data.get('rating')
    feedback_type = request.data.get('feedback_type', 'buyer')

    if not comment:
        return Response({'error': 'Comment is required'}, status=400)

    feedback = AppFeedback.objects.create(
        user=request.user,
        feedback_type=feedback_type,
        rating=rating,
        comment=comment,
    )

    return Response({'message': 'Feedback submitted successfully'})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def submit_listing_review(request):
    listing_id = request.data.get('listing_id')
    rating = request.data.get('rating')
    comment = request.data.get('comment', '').strip()

    if not listing_id or not rating:
        return Response({'error': 'listing_id and rating are required'}, status=400)

    # Check if already reviewed this listing
    if Review.objects.filter(reviewer=request.user, listing_id=listing_id).exists():
        return Response({'error': 'You have already reviewed this listing'}, status=400)

    from orders.models import Order
    # Find a completed order for this listing that has no review yet
    order = Order.objects.filter(
        buyer=request.user,
        listing_id=listing_id,
        status='completed',
    ).exclude(review__isnull=False).first()

    if not order:
        return Response({'error': 'You can only review listings you have completed orders for'}, status=403)

    review = Review.objects.create(
        order=order,
        reviewer=request.user,
        vendor=order.listing.vendor,
        listing=order.listing,
        rating=int(rating),
        comment=comment,
    )
    _recalc_vendor_profile(review.vendor)
    return Response({'message': 'Review submitted successfully', 'id': review.id})