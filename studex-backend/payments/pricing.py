# payments/pricing.py
"""
The single pricing service. Vendors enter `Listing.payout_amount` (the amount they
want to receive); everything else — the buyer-facing `Listing.price`, the settlement
split at order-completion, and the admin-triggered platform-wide recompute — flows
through the functions here. No other module should hardcode the service fee rate or
re-derive vendor/platform split math.

Every function accepts optional `campus` and `vendor_type` arguments (Blocker 6 —
Campus Pricing, extended for Campus+VendorType). Omitting both (every call site that
existed before Blocker 6) behaves exactly as it always has — this is a strict opt-in,
never a change to a call site that doesn't ask for it. The resolution hierarchy:

  Level 1: campus + vendor_type (most specific)
  Level 2: campus only           (Blocker 6's original shape)
  Level 3: global PricingSettings

`vendor_type` is always a VendorType instance (or None), never a name string — an id
is immutable and a join is unambiguous where a name could be renamed or collide.
Resolve a seller's VendorType via payments.settlement.get_vendor_type(seller) — the
one shared lookup both Settlement Policy and this module use.
"""
from decimal import Decimal

MIN_FEE = Decimal("100")
MAX_FEE = Decimal("3500")


def get_service_fee_percent(campus: str = None, vendor_type=None) -> Decimal:
    from payments.models import PricingSettings, CampusPricingSettings

    if campus and vendor_type is not None:
        row = CampusPricingSettings.objects.filter(
            campus=campus, vendor_type=vendor_type, service_fee_percent__isnull=False,
        ).first()
        if row is not None:
            return row.service_fee_percent

    if campus:
        row = CampusPricingSettings.objects.filter(
            campus=campus, vendor_type__isnull=True, service_fee_percent__isnull=False,
        ).first()
        if row is not None:
            return row.service_fee_percent

    return PricingSettings.get().service_fee_percent


def calculate_platform_fee(
    payout_amount: Decimal, fee_percent: Decimal = None, campus: str = None, vendor_type=None,
) -> Decimal:
    """Platform fee on top of a vendor's requested payout: rate% of payout, floored at
    MIN_FEE and capped at MAX_FEE."""
    rate = (fee_percent if fee_percent is not None else get_service_fee_percent(campus, vendor_type)) / Decimal("100")
    fee = (Decimal(str(payout_amount)) * rate).quantize(Decimal("0.01"))
    return max(MIN_FEE, min(fee, MAX_FEE))


def calculate_final_price(
    payout_amount: Decimal, fee_percent: Decimal = None, campus: str = None, vendor_type=None,
) -> Decimal:
    """The buyer-facing all-inclusive price for a given vendor payout."""
    payout_amount = Decimal(str(payout_amount))
    return payout_amount + calculate_platform_fee(payout_amount, fee_percent, campus, vendor_type)


def split_settlement(
    amount_paid: Decimal,
    payout_amount: Decimal,
    vendor_discount_currency: Decimal = Decimal("0"),
    deal_absorbed_by_platform: bool = False,
) -> tuple[Decimal, Decimal]:
    """
    Splits what the buyer actually paid into (vendor_amount, platform_amount).

    - Admin Deal discounts are platform-absorbed: the vendor still gets their full
      payout_amount regardless of how much amount_paid was discounted.
    - A vendor's own discount_percent is vendor-absorbed: it reduces vendor_amount by
      the currency value of that discount (computed against the listing price by the
      caller), while the platform's cut stays whatever's left of amount_paid.
    - Anything else that further reduces amount_paid below payout_amount + fee
      (profile-completion bonus, loyalty credits) is absorbed by the platform, floored
      at ₦0 — it never reduces the vendor's payout.
    """
    amount_paid = Decimal(str(amount_paid))
    payout_amount = Decimal(str(payout_amount))
    vendor_discount_currency = Decimal(str(vendor_discount_currency))

    if deal_absorbed_by_platform:
        vendor_amount = payout_amount
    else:
        vendor_amount = max(payout_amount - vendor_discount_currency, Decimal("0"))

    platform_amount = max(amount_paid - vendor_amount, Decimal("0"))
    return vendor_amount, platform_amount


def recompute_all_listing_prices(fee_percent: Decimal, campus: str = None, vendor_type=None) -> int:
    """
    Bulk-recomputes `price` for every listing with a payout_amount set, using the given
    fee percentage. Called whenever the admin changes the platform-wide fee — by
    confirmed product decision this is retroactive across the whole catalog, not just
    new/edited listings. Pass `campus` and/or `vendor_type` to scope the recompute to
    exactly the listings a given override affects — every listing outside that scope
    is left untouched. `vendor_type` filters via the listing's vendor's VendorType
    (Listing -> vendor (User) -> vendor (Vendor) -> vendor_type).
    """
    from services.models import Listing

    qs = Listing.objects.filter(payout_amount__isnull=False)
    if campus:
        qs = qs.filter(campus=campus)
    if vendor_type is not None:
        qs = qs.filter(vendor__vendor__vendor_type=vendor_type)
    listings = list(qs.only('id', 'payout_amount', 'price'))
    for listing in listings:
        listing.price = calculate_final_price(listing.payout_amount, fee_percent)
    Listing.objects.bulk_update(listings, ['price'], batch_size=500)
    return len(listings)
