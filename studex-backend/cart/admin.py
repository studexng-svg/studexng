from django.contrib import admin
from .models import CartItem, CartItemAddon


class CartItemAddonInline(admin.TabularInline):
    model = CartItemAddon
    extra = 0
    fields = ('addon', 'price_delta_at_add_time')


@admin.register(CartItem)
class CartItemAdmin(admin.ModelAdmin):
    list_display = ['user', 'listing', 'quantity', 'created_at']
    list_filter = ['created_at']
    search_fields = ['user__username', 'listing__title']
    inlines = [CartItemAddonInline]
