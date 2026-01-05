# accounts/admin_urls.py
"""
Admin API URL routing.

All routes are prefixed with /api/admin/
All views require is_staff=True permission.
"""

from django.urls import path
from accounts.admin_views import (
    AdminDashboardView,
    AdminUserListView,
    AdminUserDetailView,
    AdminListingListView,
    AdminListingDetailView,
    AdminOrderListView,
    AdminOrderDetailView,
)

app_name = 'admin_api'

urlpatterns = [
    # Dashboard Analytics
    path('dashboard/', AdminDashboardView.as_view(), name='dashboard'),

    # User Management
    path('users/', AdminUserListView.as_view(), name='user-list'),
    path('users/<int:user_id>/', AdminUserDetailView.as_view(), name='user-detail'),
]

# Add listing routes if services app available
if AdminListingListView is not None:
    urlpatterns += [
        path('listings/', AdminListingListView.as_view(), name='listing-list'),
        path('listings/<int:listing_id>/', AdminListingDetailView.as_view(), name='listing-detail'),
    ]

# Add order routes if services app available
if AdminOrderListView is not None:
    urlpatterns += [
        path('orders/', AdminOrderListView.as_view(), name='order-list'),
        path('orders/<int:order_id>/', AdminOrderDetailView.as_view(), name='order-detail'),
    ]
