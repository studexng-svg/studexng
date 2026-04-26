# reviews/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ReviewViewSet, submit_app_feedback, submit_listing_review

router = DefaultRouter()
router.register(r'reviews', ReviewViewSet, basename='review')

urlpatterns = [
    path('', include(router.urls)),
    path('submit-app-feedback/', submit_app_feedback, name='submit-app-feedback'),
    path('submit-listing-review/', submit_listing_review, name='submit-listing-review'),
]