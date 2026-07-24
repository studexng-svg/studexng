# services/permissions.py
"""
Permissions for Phase 1 (Food Commerce Engine) menu management. Menu
ordering is a VendorType capability, not a hardcoded vendor-type check —
gated by accounts.VendorType.supports_menu_ordering exactly as the Step 1
schema and the revised TDS specify. Nothing here checks
`vendor_type.name == 'food'` anywhere.
"""
from rest_framework import permissions

from payments.settlement import get_vendor_type


def vendor_supports_menu_ordering(user):
    """
    True only if `user` is a vendor whose VendorType has
    supports_menu_ordering=True. Reuses payments.settlement.get_vendor_type
    — the same lookup Settlement Policy already uses — rather than
    duplicating the seller.vendor.vendor_type traversal a second time.
    """
    if user is None or not getattr(user, 'is_authenticated', False):
        return False
    vendor_type = get_vendor_type(user)
    return bool(vendor_type and vendor_type.supports_menu_ordering)


class CanManageMenu(permissions.BasePermission):
    """
    Grants access only to an authenticated vendor whose VendorType supports
    menu ordering. Object-level ownership (a vendor may only touch their
    own MenuCategory/MenuItem/AddonGroup/Addon rows) is enforced by each
    ViewSet's get_queryset — an unauthorized row is a 404, not a 403, the
    same pattern already used by ListingViewSet.
    """
    message = "Your vendor account is not enabled for menu-based ordering."

    def has_permission(self, request, view):
        return vendor_supports_menu_ordering(request.user)
