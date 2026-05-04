from django.contrib import admin
from .models import CartItem


@admin.register(CartItem)
class CartItemAdmin(admin.ModelAdmin):
    list_display = ['user', 'listing', 'quantity', 'created_at']
    list_filter = ['created_at']
    search_fields = ['user__username', 'listing__title']
