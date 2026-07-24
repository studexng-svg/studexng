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
    AdminPromoteToRiderView,
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
    AdminAbandonedCartsView,
    AdminAbandonedCartReminderView,
    AdminConversationListView,
    AdminConversationDetailView,
    AdminBlockedMessagesView,
    AdminBroadcastMessageView,
    AdminBroadcastPreviewView,
    AdminBroadcastCountsView,
    AdminGroqNotifyView,
    AdminPlatformSettingsView,
    AdminPricingSettingsView,
    AdminAIChatView,
    AdminAIActionView,
    AdminAIChatHistoryView,
    AdminTestEmailView,
    AdminDealsListView,
    AdminDealDetailView,
)

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
    path('users/<int:user_id>/make-rider/', AdminPromoteToRiderView.as_view(), name='make-rider'),
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
    path('pricing-settings/', AdminPricingSettingsView.as_view(), name='pricing-settings'),
    path('ai-chat/', AdminAIChatView.as_view(), name='ai-chat'),
    path('ai-action/', AdminAIActionView.as_view(), name='ai-action'),
    path('ai-history/', AdminAIChatHistoryView.as_view(), name='ai-history-list'),
    path('ai-history/<int:session_id>/', AdminAIChatHistoryView.as_view(), name='ai-history-detail'),
    path('test-email/', AdminTestEmailView.as_view(), name='test-email'),
]

# Deals management
urlpatterns += [
    path('deals/', AdminDealsListView.as_view(), name='deals-list'),
    path('deals/<int:deal_id>/', AdminDealDetailView.as_view(), name='deal-detail'),
]

# Delivery management
from delivery.views import (
    AdminPickupPointListView,
    AdminPickupPointDetailView,
    AdminAssignRiderView,
    AdminDeliveryListView,
    AdminRiderListView,
    AdminBatchTemplateListView,
    AdminBatchTemplateDetailView,
    AdminDeliveryBatchListView,
    AdminDeliveryBatchDetailView,
)
urlpatterns += [
    path('pickup-points/', AdminPickupPointListView.as_view(), name='pickup-point-list'),
    path('pickup-points/<int:pk>/', AdminPickupPointDetailView.as_view(), name='pickup-point-detail'),
    path('orders/<int:order_id>/assign-rider/', AdminAssignRiderView.as_view(), name='assign-rider'),
    path('deliveries/', AdminDeliveryListView.as_view(), name='delivery-list'),
    path('riders/', AdminRiderListView.as_view(), name='rider-list'),
    # Phase 1 — Food Commerce Engine, Step 7: admin batch controls (FR-12, FR-13).
    path('batch-templates/', AdminBatchTemplateListView.as_view(), name='batch-template-list'),
    path('batch-templates/<int:pk>/', AdminBatchTemplateDetailView.as_view(), name='batch-template-detail'),
    path('delivery-batches/', AdminDeliveryBatchListView.as_view(), name='delivery-batch-list'),
    path('delivery-batches/<int:pk>/', AdminDeliveryBatchDetailView.as_view(), name='delivery-batch-detail'),
]

if AdminCartListView is not None:
    urlpatterns += [
        path('cart/', AdminCartListView.as_view(), name='cart-list'),
        path('abandoned-carts/', AdminAbandonedCartsView.as_view(), name='abandoned-carts'),
        path('abandoned-carts/remind/', AdminAbandonedCartReminderView.as_view(), name='abandoned-carts-remind'),
    ]

if AdminConversationListView is not None:
    urlpatterns += [
        path('conversations/', AdminConversationListView.as_view(), name='conversation-list'),
        path('conversations/<int:conversation_id>/', AdminConversationDetailView.as_view(), name='conversation-detail'),
    ]

if AdminBlockedMessagesView is not None:
    urlpatterns += [
        path('blocked-messages/', AdminBlockedMessagesView.as_view(), name='blocked-messages'),
    ]
