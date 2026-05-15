from django.contrib import admin
from django.db.models import Avg, Count
from .models import Review, AppFeedback


@admin.register(Review)
class ReviewAdmin(admin.ModelAdmin):
    list_display = ['reviewer', 'listing', 'rating', 'comment', 'created_at']
    list_filter = ['rating', 'created_at']
    search_fields = ['reviewer__username', 'comment', 'listing__title']
    readonly_fields = ['reviewer', 'listing', 'vendor', 'order', 'rating', 'comment', 'created_at']

    def changelist_view(self, request, extra_context=None):
        r = Review.objects
        avg = float(r.aggregate(avg=Avg('rating'))['avg'] or 0)
        extra_context = extra_context or {}
        extra_context['summary_stats'] = [
            {'label': 'Total Reviews', 'value': r.count(),                          'color': '#fff'},
            {'label': 'Avg Rating',    'value': '{:.2f} ★'.format(avg),             'color': '#fbbf24'},
            {'label': '5 Stars',       'value': r.filter(rating=5).count(),         'color': '#34d399'},
            {'label': '4 Stars',       'value': r.filter(rating=4).count(),         'color': '#60a5fa'},
            {'label': '3 Stars',       'value': r.filter(rating=3).count(),         'color': '#fbbf24'},
            {'label': '2 Stars',       'value': r.filter(rating=2).count(),         'color': '#fb923c'},
            {'label': '1 Star',        'value': r.filter(rating=1).count(),         'color': '#f87171'},
        ]
        return super().changelist_view(request, extra_context=extra_context)


@admin.register(AppFeedback)
class AppFeedbackAdmin(admin.ModelAdmin):
    list_display = ['user', 'feedback_type', 'rating', 'comment', 'created_at']
    list_filter = ['feedback_type', 'rating', 'created_at']
    search_fields = ['user__username', 'comment']
    readonly_fields = ['user', 'feedback_type', 'rating', 'comment', 'created_at']

    def changelist_view(self, request, extra_context=None):
        fb = AppFeedback.objects
        avg = float(fb.aggregate(avg=Avg('rating'))['avg'] or 0)
        extra_context = extra_context or {}
        extra_context['summary_stats'] = [
            {'label': 'Total',     'value': fb.count(),                                 'color': '#fff'},
            {'label': 'Avg Rating','value': '{:.2f} ★'.format(avg),               'color': '#fbbf24'},
            {'label': 'Buyer',     'value': fb.filter(feedback_type='buyer').count(),  'color': '#60a5fa'},
            {'label': 'Seller',    'value': fb.filter(feedback_type='seller').count(), 'color': '#c084fc'},
            {'label': '5 Stars',   'value': fb.filter(rating=5).count(),               'color': '#34d399'},
            {'label': '4 Stars',   'value': fb.filter(rating=4).count(),               'color': '#4ade80'},
            {'label': '3 Stars',   'value': fb.filter(rating=3).count(),               'color': '#fbbf24'},
            {'label': '1-2 Stars', 'value': fb.filter(rating__lte=2).count(),          'color': '#f87171'},
        ]
        return super().changelist_view(request, extra_context=extra_context)
