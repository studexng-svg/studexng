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


MAX_ADDON_QUANTITY = 20


def validate_addon_selection(listing, addon_ids, addon_quantities=None):
    """
    Validates that `addon_ids` is a legal selection for `listing`'s menu item:
    every id must name an Addon belonging to one of this exact menu item's
    add-on groups (never another listing's), every selected addon must be
    available, and every group's required/min/max rule must be satisfied.
    Group min/max always counts *distinct* add-ons picked, never the sum of
    their quantities — "Extras: up to 3" means up to 3 different extras,
    each of which may independently be bumped to 2x, 3x, etc.

    `addon_quantities` is an optional {addon_id: quantity} mapping — e.g.
    2x Chicken. Any id in `addon_ids` missing from it defaults to quantity 1
    (the pre-existing behavior, unaffected by this parameter's addition).
    Quantity must be a positive integer no greater than MAX_ADDON_QUANTITY.

    Returns a list of (Addon, quantity) tuples (order not guaranteed to
    match input). Raises AddonSelectionError with a buyer-facing message on
    any violation.
    """
    from .availability import check_addon_availability

    addon_ids = [int(a) for a in (addon_ids or [])]
    addon_quantities = {int(k): v for k, v in (addon_quantities or {}).items()}
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
            qty = addon_quantities.get(addon.id, 1)
            if not isinstance(qty, int) or qty < 1 or qty > MAX_ADDON_QUANTITY:
                raise AddonSelectionError(
                    f'Quantity for "{addon.name}" must be between 1 and {MAX_ADDON_QUANTITY}.'
                )

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

    return [(addon, addon_quantities.get(addon.id, 1)) for addon in selected]
