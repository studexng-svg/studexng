# studex/permissions.py
"""
Custom permissions for StudEx platform.

This module provides granular permission classes for different user types
and actions throughout the application.
"""

from rest_framework import permissions


class IsAdminUser(permissions.BasePermission):
    """
    Permission class that only allows staff users (admins) to access.

    Usage:
        class MyAdminView(APIView):
            permission_classes = [IsAdminUser]
    """

    def has_permission(self, request, view):
        """
        Check if user is authenticated and is staff.

        Returns:
            bool: True if user is admin, False otherwise
        """
        return bool(
            request.user and
            request.user.is_authenticated and
            request.user.is_staff
        )

    message = "You must be an admin to access this resource."


class IsSuperAdminUser(permissions.BasePermission):
    """
    Permission for superuser-only actions (like deleting users).

    Usage:
        class DangerousAdminView(APIView):
            permission_classes = [IsSuperAdminUser]
    """

    def has_permission(self, request, view):
        """
        Check if user is superuser.

        Returns:
            bool: True if user is superuser, False otherwise
        """
        return bool(
            request.user and
            request.user.is_authenticated and
            request.user.is_superuser
        )

    message = "You must be a superuser to perform this action."


class IsOwnerOrReadOnly(permissions.BasePermission):
    """
    Permission that allows owners of an object to edit it.
    Read-only for other authenticated users.

    Usage:
        class MyViewSet(viewsets.ModelViewSet):
            permission_classes = [IsAuthenticated, IsOwnerOrReadOnly]
    """

    def has_object_permission(self, request, view, obj):
        """
        Check if user owns the object or is reading only.

        Args:
            request: The HTTP request
            view: The view being accessed
            obj: The object being accessed

        Returns:
            bool: True if read-only or user is owner
        """
        # Read permissions are allowed for any request
        if request.method in permissions.SAFE_METHODS:
            return True

        # Write permissions only for owner
        # Handle different object types
        if hasattr(obj, 'user'):
            return obj.user == request.user
        elif hasattr(obj, 'owner'):
            return obj.owner == request.user
        elif hasattr(obj, 'buyer'):
            return obj.buyer == request.user
        elif hasattr(obj, 'vendor'):
            return obj.vendor == request.user

        # Default: not the owner
        return False

    message = "You must be the owner of this resource to modify it."


class IsVendorUser(permissions.BasePermission):
    """
    Permission that only allows verified vendor users.

    Usage:
        class VendorOnlyView(APIView):
            permission_classes = [IsAuthenticated, IsVendorUser]
    """

    def has_permission(self, request, view):
        """
        Check if user is authenticated and is a verified vendor.

        Returns:
            bool: True if user is verified vendor, False otherwise
        """
        return bool(
            request.user and
            request.user.is_authenticated and
            request.user.user_type == 'vendor' and
            request.user.is_verified_vendor
        )

    message = "You must be a verified vendor to perform this action."


class IsStudentUser(permissions.BasePermission):
    """
    Permission that only allows student users.

    Usage:
        class StudentOnlyView(APIView):
            permission_classes = [IsAuthenticated, IsStudentUser]
    """

    def has_permission(self, request, view):
        """
        Check if user is authenticated and is a student.

        Returns:
            bool: True if user is student, False otherwise
        """
        return bool(
            request.user and
            request.user.is_authenticated and
            request.user.user_type == 'student'
        )

    message = "You must be a student to perform this action."


class IsOwner(permissions.BasePermission):
    """
    Permission that only allows owners of an object to access it.

    Usage:
        class MyViewSet(viewsets.ModelViewSet):
            permission_classes = [IsAuthenticated, IsOwner]
    """

    def has_object_permission(self, request, view, obj):
        """
        Check if user owns the object.

        Args:
            request: The HTTP request
            view: The view being accessed
            obj: The object being accessed

        Returns:
            bool: True if user is owner
        """
        # Handle different object types
        if hasattr(obj, 'user'):
            return obj.user == request.user
        elif hasattr(obj, 'owner'):
            return obj.owner == request.user
        elif hasattr(obj, 'buyer'):
            return obj.buyer == request.user
        elif hasattr(obj, 'vendor'):
            return obj.vendor == request.user

        # Default: not the owner
        return False

    message = "You must be the owner of this resource to access it."


class IsOrderParticipant(permissions.BasePermission):
    """
    Permission that allows only the buyer or seller of an order to access it.

    Usage:
        class OrderViewSet(viewsets.ModelViewSet):
            permission_classes = [IsAuthenticated, IsOrderParticipant]
    """

    def has_object_permission(self, request, view, obj):
        """
        Check if user is buyer or seller in the order.

        Args:
            request: The HTTP request
            view: The view being accessed
            obj: The order object

        Returns:
            bool: True if user is buyer or seller
        """
        # Admin can access all orders
        if request.user.is_staff:
            return True

        # Check if buyer
        if hasattr(obj, 'buyer') and obj.buyer == request.user:
            return True

        # Check if seller (via listing)
        if hasattr(obj, 'listing') and obj.listing and hasattr(obj.listing, 'vendor'):
            if obj.listing.vendor == request.user:
                return True

        return False

    message = "You must be the buyer or seller to access this order."


class IsConversationParticipant(permissions.BasePermission):
    """
    Permission that allows only participants of a conversation to access it.

    Usage:
        class ConversationViewSet(viewsets.ModelViewSet):
            permission_classes = [IsAuthenticated, IsConversationParticipant]
    """

    def has_object_permission(self, request, view, obj):
        """
        Check if user is a participant in the conversation.

        Args:
            request: The HTTP request
            view: The view being accessed
            obj: The conversation object

        Returns:
            bool: True if user is buyer or seller in conversation
        """
        # Admin can access all conversations
        if request.user.is_staff:
            return True

        # Check if buyer or seller in conversation
        if hasattr(obj, 'buyer') and obj.buyer == request.user:
            return True
        if hasattr(obj, 'seller') and obj.seller == request.user:
            return True

        return False

    message = "You must be a participant in this conversation to access it."


class ReadOnlyOrIsAuthenticated(permissions.BasePermission):
    """
    Permission that allows read-only access to anyone,
    but requires authentication for write operations.

    Usage:
        class MyViewSet(viewsets.ModelViewSet):
            permission_classes = [ReadOnlyOrIsAuthenticated]
    """

    def has_permission(self, request, view):
        """
        Check if request is read-only or user is authenticated.

        Returns:
            bool: True if read-only or authenticated
        """
        # Read permissions are allowed for any request
        if request.method in permissions.SAFE_METHODS:
            return True

        # Write permissions require authentication
        return bool(request.user and request.user.is_authenticated)

    message = "You must be authenticated to perform this action."
