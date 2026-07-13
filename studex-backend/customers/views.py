# customers/views.py
from rest_framework import viewsets, permissions
from rest_framework.response import Response

from .models import VendorCustomer
from .serializers import VendorCustomerSerializer, VendorCustomerOrderHistorySerializer

SORT_FIELDS = {
    'total_spent': '-total_amount_spent',
    'last_purchase': '-last_purchase_at',
}


class VendorCustomerViewSet(viewsets.ReadOnlyModelViewSet):
    """
    GET /api/vendor/customers/           — this vendor's customer list
    GET /api/vendor/customers/{customer_id}/ — one customer's stats + order history
    with this vendor. Scoped to request.user as vendor throughout — a vendor can
    never see another vendor's relationship with the same buyer.
    """
    serializer_class = VendorCustomerSerializer
    permission_classes = [permissions.IsAuthenticated]
    lookup_field = 'customer_id'
    lookup_url_kwarg = 'customer_id'

    def get_queryset(self):
        qs = VendorCustomer.objects.filter(vendor=self.request.user).select_related(
            'customer', 'favorite_listing', 'favorite_category'
        )
        sort = self.request.query_params.get('sort')
        qs = qs.order_by(SORT_FIELDS.get(sort, '-last_purchase_at'))
        return qs

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        data = self.get_serializer(instance).data

        from orders.models import Order
        history = (
            Order.objects.filter(buyer_id=instance.customer_id, listing__vendor=request.user)
            .select_related('listing')
            .order_by('-created_at')
        )
        data['order_history'] = VendorCustomerOrderHistorySerializer(history, many=True).data
        return Response(data)
