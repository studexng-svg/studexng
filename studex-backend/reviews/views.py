# reviews/views.py
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Avg, Count
from .models import Review
from .serializers import ReviewSerializer


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
        serializer.save()

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