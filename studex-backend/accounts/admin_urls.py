# accounts/admin_urls.py
from django.urls import path
from accounts.admin_views import (
    AdminDashboardView,
    AdminUserListView,
    AdminUserDetailView,
    AdminNotifyUserView,
    AdminListingListView,
    AdminListingDetailView,
    AdminOrderListView,
    AdminOrderDetailView,
    AdminDisputeListView,
    AdminDisputeDetailView,
    AdminPaymentListView,
    AdminPaymentDetailView,
    AdminBankAccountListView,
    AdminBankAccountDetailView,
    AdminServiceTransactionListView,
    AdminServiceTransactionDetailView,
    AdminReviewListView,
    AdminReviewDetailView,
    AdminFeedbackListView,
    AdminCategoryListView,
    AdminCategoryDetailView,
)

app_name = 'admin_api'

urlpatterns = [
    # Dashboard
    path('dashboard/', AdminDashboardView.as_view(), name='dashboard'),

    # Users
    path('users/', AdminUserListView.as_view(), name='user-list'),
    path('users/<int:user_id>/', AdminUserDetailView.as_view(), name='user-detail'),
    path('users/<int:user_id>/notify/', AdminNotifyUserView.as_view(), name='notify-user'),
]

if AdminListingListView is not None:
    urlpatterns += [
        path('listings/', AdminListingListView.as_view(), name='listing-list'),
        path('listings/<int:listing_id>/', AdminListingDetailView.as_view(), name='listing-detail'),
    ]

if AdminOrderListView is not None:
    urlpatterns += [
        path('orders/', AdminOrderListView.as_view(), name='order-list'),
        path('orders/<int:order_id>/', AdminOrderDetailView.as_view(), name='order-detail'),
    ]

if AdminDisputeListView is not None:
    urlpatterns += [
        path('disputes/', AdminDisputeListView.as_view(), name='dispute-list'),
        path('disputes/<int:dispute_id>/', AdminDisputeDetailView.as_view(), name='dispute-detail'),
    ]

if AdminPaymentListView is not None:
    urlpatterns += [
        path('payments/', AdminPaymentListView.as_view(), name='payment-list'),
        path('payments/<int:payment_id>/', AdminPaymentDetailView.as_view(), name='payment-detail'),
        path('bank-accounts/', AdminBankAccountListView.as_view(), name='bank-account-list'),
        path('bank-accounts/<int:account_id>/', AdminBankAccountDetailView.as_view(), name='bank-account-detail'),
    ]

if AdminServiceTransactionListView is not None:
    urlpatterns += [
        path('service-transactions/', AdminServiceTransactionListView.as_view(), name='service-tx-list'),
        path('service-transactions/<int:tx_id>/', AdminServiceTransactionDetailView.as_view(), name='service-tx-detail'),
    ]

if AdminReviewListView is not None:
    urlpatterns += [
        path('reviews/', AdminReviewListView.as_view(), name='review-list'),
        path('reviews/<int:review_id>/', AdminReviewDetailView.as_view(), name='review-detail'),
        path('feedback/', AdminFeedbackListView.as_view(), name='feedback-list'),
    ]

if AdminCategoryListView is not None:
    urlpatterns += [
        path('categories/', AdminCategoryListView.as_view(), name='category-list'),
        path('categories/<int:category_id>/', AdminCategoryDetailView.as_view(), name='category-detail'),
    ]
