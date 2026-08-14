# services/availability.py
"""
Centralized menu-item / add-on availability contract (Phase 1 — Food Commerce
Engine, Step 3). Every checkout-time (and cart-time) availability check goes
through the two functions here — nothing else in the codebase re-implements
this logic, per the Step 3 kickoff instruction: "centralize menu-item
availability checks through a single reusable contract/helper... rather than
scattering conditional logic throughout the codebase."

A Listing can be unavailable for six independent reasons:
  - moderation:  Listing.is_available is False (admin-only gate — see
                 services/views.py ListingViewSet.update, which already
                 strips vendor-submitted changes to this field)
  - vendor_hours: outside the vendor's own opening_time/closing_time (and,
                 if set, available_days) — accounts.models.Profile. Coarser
                 than everything below: it gates the whole storefront, not
                 one item. Strictly opt-in — see check_vendor_open.
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
that hasn't been set up as a menu item yet) only ever hits the moderation,
vendor_hours, and inventory checks — the exact behavior every other vendor
type already has today. Nothing here changes what happens for those listings.
"""
from dataclasses import dataclass
from django.utils import timezone


def _vendor_label(vendor) -> str:
    return getattr(vendor, 'business_name', '') or getattr(vendor, 'username', '') or 'This vendor'


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


def check_vendor_open(vendor, now=None) -> AvailabilityResult:
    """
    Vendor-level opening/closing hours (accounts.models.Profile.opening_time/
    closing_time/available_days) — coarser than and independent of the
    per-item MenuItem scheduling below; gates the whole storefront (e.g.
    "Buka 9" outside their working hours), not one dish.

    Strictly opt-in: opening_time/closing_time are optional profile fields
    that default to null for every vendor, and the overwhelming majority
    have never touched them. A vendor who hasn't configured BOTH is always
    open — identical to today's behavior. Only once a vendor explicitly sets
    both does this gate engage at all; available_days is a further, also-
    optional narrowing on top (empty/unset = every day).
    """
    profile = getattr(vendor, 'profile', None)
    if profile is None or not profile.opening_time or not profile.closing_time:
        return AvailabilityResult(True)

    now = now or timezone.localtime()
    available_days = profile.available_days or []
    if available_days:
        # Same loose matching the vendor profile page's isDayOpen() already
        # accepts client-side (3-letter or full day name, case-insensitive)
        # — this field predates any format validation, so vendors have typed
        # it freely either way.
        today = {now.strftime('%a').lower(), now.strftime('%A').lower()}
        if not any(str(d).strip().lower() in today for d in available_days):
            return AvailabilityResult(
                False, 'vendor_hours', f'{_vendor_label(vendor)} is closed today.',
            )

    if not _in_time_window(now.time(), profile.opening_time, profile.closing_time):
        return AvailabilityResult(
            False, 'vendor_hours',
            f'{_vendor_label(vendor)} is closed right now — open '
            f'{profile.opening_time.strftime("%I:%M %p").lstrip("0")}–'
            f'{profile.closing_time.strftime("%I:%M %p").lstrip("0")}.',
        )
    return AvailabilityResult(True)


def check_menu_item_availability(listing, quantity=1) -> AvailabilityResult:
    """
    The single entry point for "can this listing be ordered right now, in
    this quantity." Order of checks is deliberate: moderation is the
    strictest gate (an admin has flagged it for removal), followed by
    whether the vendor's own storefront is open at all, followed by the
    remaining vendor-controlled signals, followed by inventory — the buyer
    sees the most authoritative reason first.
    """
    if not listing.is_available:
        return AvailabilityResult(False, 'moderation', f'"{listing.title}" is not currently available.')

    vendor_open = check_vendor_open(listing.vendor)
    if not vendor_open.available:
        return vendor_open

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
