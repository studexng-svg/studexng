# services/menu_selection.py
"""
Validates a buyer's add-on selection against a menu item's AddonGroup rules
(Phase 1 — Food Commerce Engine, Step 3). Used by cart/views.py.add_to_cart
when a buyer adds a menu item to their cart with chosen add-ons.

This is a cart-construction-time concern (does this selection satisfy
required/min/max group rules), distinct from checkout-time availability
(services/availability.py) — an addon that was validly selected here can
still become unavailable later, which checkout re-checks independently.
"""
from .models import Addon


class AddonSelectionError(Exception):
    """`.detail` is a buyer-facing message, safe to return directly in a 400."""
    def __init__(self, detail):
        self.detail = detail
        super().__init__(detail)


def validate_addon_selection(listing, addon_ids):
    """
    Validates that `addon_ids` is a legal selection for `listing`'s menu item:
    every id must name an Addon belonging to one of this exact menu item's
    add-on groups (never another listing's), every selected addon must be
    available, and every group's required/min/max rule must be satisfied.

    Returns the list of validated Addon instances (order not guaranteed to
    match input). Raises AddonSelectionError with a buyer-facing message on
    any violation.
    """
    from .availability import check_addon_availability

    addon_ids = [int(a) for a in (addon_ids or [])]
    menu_item = getattr(listing, 'menu_item', None)

    if not addon_ids:
        selected = []
    else:
        if menu_item is None:
            raise AddonSelectionError(f'"{listing.title}" does not support add-ons.')

        selected = list(
            Addon.objects.filter(id__in=addon_ids, group__menu_item=menu_item).select_related('group')
        )
        found_ids = {a.id for a in selected}
        missing = set(addon_ids) - found_ids
        if missing:
            raise AddonSelectionError(f'One or more selected add-ons do not belong to "{listing.title}".')

        for addon in selected:
            result = check_addon_availability(addon)
            if not result.available:
                raise AddonSelectionError(result.message)

    if menu_item is not None:
        selected_by_group = {}
        for addon in selected:
            selected_by_group.setdefault(addon.group_id, []).append(addon)

        for group in menu_item.addon_groups.all():
            count = len(selected_by_group.get(group.id, []))
            if group.is_required and count == 0:
                raise AddonSelectionError(f'"{group.name}" requires a selection.')
            if count < group.min_selections:
                raise AddonSelectionError(
                    f'"{group.name}" requires at least {group.min_selections} selection(s).'
                )
            if count > group.max_selections:
                raise AddonSelectionError(
                    f'"{group.name}" allows at most {group.max_selections} selection(s).'
                )

    return selected
