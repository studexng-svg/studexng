# chat/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ConversationViewSet, MessageViewSet

router = DefaultRouter()
router.register(r'conversations', ConversationViewSet, basename='conversation')
router.register(r'messages', MessageViewSet, basename='message')

urlpatterns = [
    path('', include(router.urls)),
]
# This auto-generates:
# GET/POST   /api/chat/conversations/
# GET        /api/chat/conversations/{id}/
# GET        /api/chat/conversations/{id}/messages/
# GET        /api/chat/conversations/{id}/pinned/
# POST       /api/chat/conversations/{id}/send/
# DELETE     /api/chat/messages/{id}/delete_message/
# PATCH      /api/chat/messages/{id}/edit_message/
# POST       /api/chat/messages/{id}/pin_message/