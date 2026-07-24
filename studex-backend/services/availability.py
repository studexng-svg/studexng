# services/availability.py
"""
Centralized menu-item / add-on availability contract (Phase 1 — Food Commerce
Engine, Step 3). Every checkout-time (and cart-time) availability check goes
through the two functions here — nothing else in the codebase re-implements
this logic, per the Step 3 kickoff instruction: "centralize menu-item
availability checks through a single reusable contract/helper... rather than
scattering conditional logic throughout the codebase."

A Listing can be unavailable for four independent reasons:
  - moderation:  Listing.is_available is False (admin-only gate — see
                 services/views.py ListingViewSet.update, which already
                 strips vendor-submitted changes to this field)
  - hidden:      MenuItem.is_hidden is True (vendor-controlled — the Step 2
                 replacement for FR-15's "vendor marks item unavailable",
                 since Listing.is_available is admin-only)
  - archived:    MenuItem.is_archived is True (retired from the active menu,
                 kept only for historical OrderItem references)
  - scheduling:  outside MenuItem.availability_window_start/_end, when both
                 are set (handles an overnight window, e.g. 22:00-02:00)
  - inventory:   Listing.track_inventory is True and stock_quantity is below
                 the quantity requested (existing generic inventory, reused
                 unchanged — no Food-specific stock model)

A Listing with no MenuItem row (every non-food listing, and any food listing
that hasn't been set up as a menu item yet) only ever hits the moderation and
inventory checks — the exact behavior every other vendor type already has
today. Nothing here changes what happens for those listings.
"""
from dataclasses import dataclass
from django.utils import timezone


@dataclass
class AvailabilityResult:
    available: bool
    reason: str = ""  # '' | 'moderation' | 'hidden' | 'archived' | 'scheduling' | 'inventory' | 'unavailable'
    message: str = ""  # human-readable, safe to show the buyer directly


def _in_time_window(now, start, end):
    if start <= end:
        return start <= now <= end
    # Overnight window (e.g. 22:00-02:00) wraps past midnight.
    return now >= start or now <= end


def check_menu_item_availability(listing, quantity=1) -> AvailabilityResult:
    """
    The single entry point for "can this listing be ordered right now, in
    this quantity." Order of checks is deliberate: moderation is the
    strictest gate (an admin has flagged it for removal), followed by the
    vendor-controlled signals, followed by inventory — the buyer sees the
    most authoritative reason first.
    """
    if not listing.is_available:
        return AvailabilityResult(False, 'moderation', f'"{listing.title}" is not currently available.')

    menu_item = getattr(listing, 'menu_item', None)
    if menu_item is not None:
        if menu_item.is_archived:
            return AvailabilityResult(False, 'archived', f'"{listing.title}" is no longer on the menu.')
        if menu_item.is_hidden:
            return AvailabilityResult(False, 'hidden', f'"{listing.title}" is not currently available.')
        start = menu_item.availability_window_start
        end = menu_item.availability_window_end
        if start and end:
            now = timezone.localtime().time()
            if not _in_time_window(now, start, end):
                return AvailabilityResult(
                    False, 'scheduling',
                    f'"{listing.title}" is only available between '
                    f'{start.strftime("%I:%M %p").lstrip("0")} and {end.strftime("%I:%M %p").lstrip("0")}.',
                )

    if listing.track_inventory and listing.stock_quantity < quantity:
        left = listing.stock_quantity
        if left <= 0:
            return AvailabilityResult(False, 'inventory', f'"{listing.title}" is out of stock.')
        return AvailabilityResult(
            False, 'inventory', f'Only {left} left of "{listing.title}" — reduce the quantity and try again.',
        )

    return AvailabilityResult(True)


def check_addon_availability(addon) -> AvailabilityResult:
    """The parallel check for a single selected Addon."""
    if not addon.is_available:
        return AvailabilityResult(False, 'unavailable', f'"{addon.name}" is no longer available.')
    return AvailabilityResult(True)
