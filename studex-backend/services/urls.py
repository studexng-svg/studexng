# services/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CategoryViewSet, ListingViewSet, TransactionViewSet
from .views import ChangePasswordView, VendorOfMonthView, VendorOfMonthHistoryView, DealsListView, HeroSlideListView
from .views import PreviewPriceView
from .views import MenuCategoryViewSet, MenuItemViewSet, AddonGroupViewSet, AddonViewSet, MenuItemAddonGroupViewSet

router = DefaultRouter()
router.register(r'categories', CategoryViewSet, basename='category')
router.register(r'listings', ListingViewSet, basename='listing')
router.register(r'transactions', TransactionViewSet, basename='transaction')
# Phase 1 — Food Commerce Engine: menu management (Step 2)
router.register(r'menu-categories', MenuCategoryViewSet, basename='menu-category')
router.register(r'menu-items', MenuItemViewSet, basename='menu-item')
# Phase 2 — vendor-level add-on library: groups/options are vendor-owned
# templates; addon-group-links is where a dish links to one.
router.register(r'addon-groups', AddonGroupViewSet, basename='addon-group')
router.register(r'addons', AddonViewSet, basename='addon')
router.register(r'addon-group-links', MenuItemAddonGroupViewSet, basename='addon-group-link')


urlpatterns = [
    path('', include(router.urls)),
    path('auth/change-password/', ChangePasswordView.as_view(), name='change-password'),
    path('vendor-of-month/', VendorOfMonthView.as_view(), name='vendor-of-month'),
    path('vendor-of-month/history/', VendorOfMonthHistoryView.as_view(), name='vendor-of-month-history'),
    path('deals/', DealsListView.as_view(), name='deals'),
    path('hero-slides/', HeroSlideListView.as_view(), name='hero-slides'),
    path('preview-price/', PreviewPriceView.as_view(), name='preview-price'),
]