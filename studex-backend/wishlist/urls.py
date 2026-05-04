from django.urls import path
from . import views

urlpatterns = [
    path('', views.get_wishlist, name='wishlist-list'),
    path('add/', views.add_to_wishlist, name='wishlist-add'),
    path('remove/<int:listing_id>/', views.remove_from_wishlist, name='wishlist-remove'),
    path('clear/', views.clear_wishlist, name='wishlist-clear'),
]
