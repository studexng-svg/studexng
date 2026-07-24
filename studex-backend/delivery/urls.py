from django.urls import path
from .views import (
    PickupPointListView,
    RiderAssignmentListView,
    RiderBatchListView,
    RiderUpdateStatusView,
    OrderDeliveryStatusView,
)

urlpatterns = [
    path('pickup-points/', PickupPointListView.as_view(), name='pickup-points'),
    path('my-assignments/', RiderAssignmentListView.as_view(), name='rider-assignments'),
    # Phase 1 — Food Commerce Engine, Step 5: rider assignments grouped by batch.
    path('my-batches/', RiderBatchListView.as_view(), name='rider-batches'),
    path('assignments/<int:pk>/update-status/', RiderUpdateStatusView.as_view(), name='update-status'),
    path('order/<int:order_id>/', OrderDeliveryStatusView.as_view(), name='order-delivery-status'),
]
