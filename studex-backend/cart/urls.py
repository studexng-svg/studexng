from django.urls import path
from . import views

urlpatterns = [
    path('', views.get_cart, name='cart-list'),
    path('add/', views.add_to_cart, name='cart-add'),
    path('update/<int:listing_id>/', views.update_cart_item, name='cart-update'),
    path('remove/<int:listing_id>/', views.remove_from_cart, name='cart-remove'),
    # Phase 1 — Food Commerce Engine, Step 3: id-scoped counterparts for a
    # listing with several add-on-distinct cart lines (see CartItem.addon_signature).
    path('items/<int:pk>/update/', views.update_cart_item_by_id, name='cart-item-update'),
    path('items/<int:pk>/remove/', views.remove_cart_item_by_id, name='cart-item-remove'),
    path('clear/', views.clear_cart, name='cart-clear'),
    path('check-availability/', views.check_availability, name='cart-check-availability'),
]
