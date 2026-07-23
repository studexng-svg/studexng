# payments/settlement.py
"""
Settlement Policy resolution — decides which event triggers a vendor's
payout. This is the one seam Blocker 5 introduces into the payout flow;
everything downstream of it (Paystack transfer, debt settlement, audit
recording) is the same, already-idempotent machinery built in Blockers 2-4.

Today there are two triggers:
  - buyer_confirmation  (global default, unchanged from every blocker before
    this one — the buyer confirms receipt, or the 24h auto-release fires)
  - pickup_verification (opt-in per VendorType — a rider verifying pickup
    fires the payout immediately; see delivery/views.py RiderUpdateStatusView)

A vendor with no VendorType assigned, or a VendorType with no explicit
override, always resolves to buyer_confirmation — assigning a settlement
trigger is a strict per-vendor-type opt-in, never a retroactive change to
existing payout behavior. Adding a third trigger later (e.g. one driven by
a future Delivery Batch closing) means adding one more constant here and one
more `should_settle_on_*` predicate — no changes to any existing caller.
"""

SETTLEMENT_TRIGGER_BUYER_CONFIRMATION = "buyer_confirmation"
SETTLEMENT_TRIGGER_PICKUP_VERIFICATION = "pickup_verification"


def get_vendor_type(seller):
    """
    Returns the VendorType instance for a seller (a User), or None if they
    have no Vendor row or no vendor_type assigned. Shared by both Settlement
    Policy (below) and Campus+VendorType Pricing (payments/pricing.py) — one
    lookup, reused, never a string-name comparison at either call site.
    """
    if seller is None:
        return None
    try:
        return seller.vendor.vendor_type
    except Exception:
        return None


def get_settlement_trigger(seller):
    """Resolves the settlement trigger for a seller (a User with user_type='vendor')."""
    vendor_type = get_vendor_type(seller)
    if not vendor_type:
        return SETTLEMENT_TRIGGER_BUYER_CONFIRMATION
    return vendor_type.settlement_trigger or SETTLEMENT_TRIGGER_BUYER_CONFIRMATION


def should_settle_on_pickup(seller):
    return get_settlement_trigger(seller) == SETTLEMENT_TRIGGER_PICKUP_VERIFICATION
