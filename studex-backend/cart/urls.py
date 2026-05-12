from django.urls import path
from . import views

urlpatterns = [
    path('', views.get_cart, name='cart-list'),
    path('add/', views.add_to_cart, name='cart-add'),
    path('update/<int:listing_id>/', views.update_cart_item, name='cart-update'),
    path('remove/<int:listing_id>/', views.remove_from_cart, name='cart-remove'),
    path('clear/', views.clear_cart, name='cart-clear'),
    path('check-availability/', views.check_availability, name='cart-check-availability'),
]
