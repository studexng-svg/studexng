# accounts/admin_urls.py
from django.urls import path
from accounts.admin_views import (
    AdminRewardsOverviewView,
    AdminDashboardView,
    AdminAnalyticsTimeSeriesView,
    AdminVendorOfMonthView,
    AdminActivityView,
    AdminUserListView,
    AdminUserDetailView,
    AdminNotifyUserView,
    AdminListingListView,
    AdminListingDetailView,
    AdminListingBulkUpdateCategoryView,
    AdminOrderListView,
    AdminOrderDetailView,
    AdminDisputeListView,
    AdminDisputeDetailView,
    AdminPaymentListView,
    AdminPaymentDetailView,
    AdminBankAccountListView,
    AdminBankAccountDetailView,
    AdminVendorPayoutsView,
    AdminPlatformEarningsView,
    AdminServiceTransactionListView,
    AdminServiceTransactionDetailView,
    AdminReviewListView,
    AdminReviewDetailView,
    AdminFeedbackListView,
    AdminCategoryListView,
    AdminCategoryDetailView,
    AdminCartListView,
    AdminConversationListView,
    AdminConversationDetailView,
    AdminBroadcastMessageView,
    AdminBroadcastPreviewView,
    AdminBroadcastCountsView,
    AdminGroqNotifyView,
    AdminPlatformSettingsView,
    AdminAIChatView,
    AdminAIActionView,
    AdminAIChatHistoryView,
    AdminTestEmailView,
)

app_name = 'admin_api'

urlpatterns = [
    # Dashboard
    path('dashboard/', AdminDashboardView.as_view(), name='dashboard'),
    path('rewards-overview/', AdminRewardsOverviewView.as_view(), name='rewards-overview'),
    path('analytics/timeseries/', AdminAnalyticsTimeSeriesView.as_view(), name='analytics-timeseries'),
    path('vendor-of-month/', AdminVendorOfMonthView.as_view(), name='vendor-of-month'),
    path('activity/', AdminActivityView.as_view(), name='activity'),

    # Users
    path('users/', AdminUserListView.as_view(), name='user-list'),
    path('users/<int:user_id>/', AdminUserDetailView.as_view(), name='user-detail'),
    path('users/<int:user_id>/notify/', AdminNotifyUserView.as_view(), name='notify-user'),
]

if AdminListingListView is not None:
    urlpatterns += [
        path('listings/', AdminListingListView.as_view(), name='listing-list'),
        path('listings/bulk-update-category/', AdminListingBulkUpdateCategoryView.as_view(), name='listing-bulk-category'),
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

urlpatterns += [
    path('vendor-payouts/', AdminVendorPayoutsView.as_view(), name='vendor-payouts'),
    path('platform-earnings/', AdminPlatformEarningsView.as_view(), name='platform-earnings'),
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

# Broadcast messaging
urlpatterns += [
    path('notify-all/', AdminBroadcastMessageView.as_view(), name='notify-all'),
    path('broadcast-preview/', AdminBroadcastPreviewView.as_view(), name='broadcast-preview'),
    path('broadcast-counts/', AdminBroadcastCountsView.as_view(), name='broadcast-counts'),
    path('groq-notify/', AdminGroqNotifyView.as_view(), name='groq-notify'),
    path('platform-settings/', AdminPlatformSettingsView.as_view(), name='platform-settings'),
    path('ai-chat/', AdminAIChatView.as_view(), name='ai-chat'),
    path('ai-action/', AdminAIActionView.as_view(), name='ai-action'),
    path('ai-history/', AdminAIChatHistoryView.as_view(), name='ai-history-list'),
    path('ai-history/<int:session_id>/', AdminAIChatHistoryView.as_view(), name='ai-history-detail'),
    path('test-email/', AdminTestEmailView.as_view(), name='test-email'),
]

if AdminCartListView is not None:
    urlpatterns += [
        path('cart/', AdminCartListView.as_view(), name='cart-list'),
    ]

if AdminConversationListView is not None:
    urlpatterns += [
        path('conversations/', AdminConversationListView.as_view(), name='conversation-list'),
        path('conversations/<int:conversation_id>/', AdminConversationDetailView.as_view(), name='conversation-detail'),
    ]
