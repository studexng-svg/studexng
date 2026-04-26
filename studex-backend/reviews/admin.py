from django.contrib import admin
from .models import Review, AppFeedback


@admin.register(Review)
class ReviewAdmin(admin.ModelAdmin):
    list_display = ['reviewer', 'listing', 'rating', 'comment', 'created_at']
    list_filter = ['rating', 'created_at']
    search_fields = ['reviewer__username', 'comment', 'listing__title']
    readonly_fields = ['reviewer', 'listing', 'vendor', 'order', 'rating', 'comment', 'created_at']


@admin.register(AppFeedback)
class AppFeedbackAdmin(admin.ModelAdmin):
    list_display = ['user', 'feedback_type', 'rating', 'comment', 'created_at']
    list_filter = ['feedback_type', 'rating', 'created_at']
    search_fields = ['user__username', 'comment']
    readonly_fields = ['user', 'feedback_type', 'rating', 'comment', 'created_at']
