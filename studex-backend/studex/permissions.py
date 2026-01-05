# studex/permissions.py
"""
Custom permissions for admin-only endpoints.

This ensures that only users with is_staff=True can access admin APIs.
Regular users will receive 403 Forbidden responses.
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
