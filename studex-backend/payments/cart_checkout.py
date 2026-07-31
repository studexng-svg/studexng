# payments/cart_checkout.py
"""
Vendor-scoped cart checkout (Phase 1 — Food Commerce Engine, Step 3).

Architecture decision (see the Step 3 kickoff report): a buyer's cart can
hold lines from several vendors at once — nothing restricts CartItem to one
vendor. Checkout itself is scoped to exactly one vendor at a time: the buyer
picks a vendor_id, and only that vendor's CartItem rows are validated,
priced, and charged. Every other vendor's items are left completely
untouched in the cart — nothing here ever reads or deletes another vendor's
rows.

Pricing decision (explicit product call): the platform fee applies to the
*combined* per-unit amount — the base item's payout_amount plus every
selected add-on's price_delta — not to the item and each add-on separately.
"A ₦3,000 item costs 3,000 + 8% fee. A ₦4,000 item with add-ons costs 4,000
+ 8% fee." Concretely: combined_payout = listing.payout_amount +
sum(addon.price_delta * addon_quantity for selected addons); unit_price =
calculate_final_price(combined_payout, ...). This reuses
payments.pricing.calculate_final_price/get_service_fee_percent (the
Campus+VendorType hierarchy, Blocker 6) completely unchanged — no new fee
math, no schema change to Addon.

Availability (hidden/moderation/archived/scheduling/inventory) and pricing
are both re-derived entirely server-side here — never trusted from the
client or from stale CartItemAddon.price_delta_at_add_time snapshots (FR-5).

Deliberately out of scope for this step (see the Step 3 kickoff decision):
Deal discounts, the profile-completion bonus, and loyalty credits are all
single-listing marketplace features with no defined multi-vendor-cart
behavior yet — this checkout path does not apply them. It also does not
touch initialize_payment / verify_payment / pay_with_credits, which remain
the existing single-listing checkout path, unchanged.
"""
from decimal import Decimal
from django.db import transaction as db_transaction
from django.utils import timezone

from cart.models import CartItem
from services.availability import check_menu_item_availability, check_addon_availability
from payments.pricing import calculate_final_price
from payments.settlement import get_vendor_type


class CartCheckoutError(Exception):
    """Raised when a cart line (or the whole vendor cart) fails validation. `.detail` is buyer-facing."""
    def __init__(self, detail):
        self.detail = detail
        super().__init__(detail)


def get_vendor_cart_items(buyer, vendor_id):
    """The buyer's cart lines for exactly one vendor — every other vendor's lines are untouched."""
    return list(
        CartItem.objects.filter(user=buyer, listing__vendor_id=vendor_id)
        .select_related('listing', 'listing__vendor')
        .prefetch_related('selected_addons__addon')
        .order_by('created_at')
    )


def _combined_payout_per_unit(listing, addon_deltas):
    base = Decimal(str(listing.payout_amount if listing.payout_amount is not None else listing.price))
    total = base + sum(addon_deltas, Decimal("0"))
    return max(total, Decimal("0"))


def price_cart_item(cart_item, vendor_type):
    """
    Re-derives one cart line's per-unit price entirely server-side. Raises
    CartCheckoutError (buyer-facing message) if the item or any selected
    add-on fails availability. Returns a dict describing the priced line.
    """
    listing = cart_item.listing
    quantity = cart_item.quantity

    item_result = check_menu_item_availability(listing, quantity)
    if not item_result.available:
        raise CartCheckoutError(item_result.message)

    addons = []
    deltas = []
    for selection in cart_item.selected_addons.all():
        addon = selection.addon
        addon_result = check_addon_availability(addon)
        if not addon_result.available:
            raise CartCheckoutError(addon_result.message)
        delta = Decimal(str(addon.price_delta))
        addon_qty = selection.quantity
        addons.append((addon, delta, addon_qty))
        # Folded into the per-unit combined payout below — e.g. 2 dishes
        # each with 2x Chicken charges the chicken delta four times total,
        # via (base + 2*chicken_delta) * dish_quantity.
        deltas.append(delta * addon_qty)

    combined_payout = _combined_payout_per_unit(listing, deltas)
    unit_price = calculate_final_price(combined_payout, campus=listing.campus, vendor_type=vendor_type)
    line_total = (unit_price * quantity).quantize(Decimal("0.01"))

    return {
        'cart_item': cart_item,
        'listing': listing,
        'quantity': quantity,
        'unit_price': unit_price,
        'line_total': line_total,
        'combined_payout_per_unit': combined_payout,
        'addons': addons,
    }


def price_vendor_cart(buyer, vendor_id):
    """
    Validates and prices every cart line for one vendor. Raises
    CartCheckoutError if the vendor has no cart items, or if any line fails
    availability. Returns (priced_lines, total_amount, vendor_type).
    """
    cart_items = get_vendor_cart_items(buyer, vendor_id)
    if not cart_items:
        raise CartCheckoutError("Your cart has no items from this vendor.")

    vendor = cart_items[0].listing.vendor
    vendor_type = get_vendor_type(vendor)

    priced_lines = [price_cart_item(item, vendor_type) for item in cart_items]
    total_amount = sum((line['line_total'] for line in priced_lines), Decimal("0"))
    return priced_lines, total_amount, vendor_type


def create_order_from_priced_lines(
    buyer, priced_lines, reference, amount_paid, delivery_location="", batch_id=None,
    delivery_fee=None, delivery_fee_waived=False, status="paid",
):
    """
    Creates one Order (anchor = the first priced line's listing — every
    line in `priced_lines` is already guaranteed to share one vendor by
    price_vendor_cart's construction) + one OrderItem per line + one
    OrderItemAddon per selected add-on, reduces stock per line, then deletes
    exactly those CartItem rows (CartItemAddon rows cascade). Returns
    (order, total_payout_amount) — the latter is what payments.pricing.
    split_settlement needs as its payout_amount argument.

    If this vendor has an active DeliverySlot (VendorType.supports_batched_
    delivery AND an admin has set one up — see delivery.capacity.
    vendor_uses_batched_delivery), reserves one inside this same atomic
    block and stamps it onto order.delivery_slot — a
    NoDeliverySlotCapacityError propagates out and rolls back the whole
    order (no Order/OrderItem/stock-reduction/cart-deletion persists),
    leaving the caller (payments.views.verify_cart_payment) to refund the
    buyer. Every non-slotted vendor's order is completely unaffected:
    delivery_slot stays None.

    delivery_fee/delivery_fee_waived are the frozen decision from
    payments.views (see delivery.fees.get_delivery_fee_quote) — already
    baked into amount_paid, stored on the order separately only for
    itemization/receipt display and for future get_delivery_fee_quote calls
    to count live. Deliberately excluded from total_payout_amount (the
    vendor's payout basis) below — the fee, when charged, lands entirely in
    platform_amount via payments.pricing.split_settlement, never the vendor.

    status defaults to "paid" (the Paystack path — payment is already
    verified by the time this is called). The manual bank-transfer path
    (payments.views.initiate_bank_transfer_cart) passes
    "pending_bank_transfer" instead, since nothing has actually been
    confirmed received yet — paid_at is only stamped for an immediately-paid
    order; the bank-transfer path sets it later, at admin confirmation.
    """
    from orders.models import Order, OrderItem, OrderItemAddon
    from delivery.capacity import vendor_uses_batched_delivery, reserve_delivery_slot

    anchor_listing = priced_lines[0]['listing']
    vendor = anchor_listing.vendor

    with db_transaction.atomic():
        order = Order.objects.create(
            buyer=buyer,
            listing=anchor_listing,
            amount=amount_paid,
            quantity=sum(line['quantity'] for line in priced_lines),
            reference=reference,
            status=status,
            paid_at=timezone.now() if status == "paid" else None,
            delivery_location=delivery_location or "",
            delivery_fee=delivery_fee or Decimal("0"),
            delivery_fee_waived=delivery_fee_waived,
        )

        if vendor_uses_batched_delivery(vendor):
            slot = reserve_delivery_slot(vendor, anchor_listing.campus, preferred_slot_id=batch_id)
            order.delivery_slot = slot
            order.save(update_fields=['delivery_slot'])

        total_payout_amount = Decimal("0")
        for line in priced_lines:
            total_payout_amount += line['combined_payout_per_unit'] * line['quantity']

            order_item = OrderItem.objects.create(
                order=order,
                listing=line['listing'],
                quantity=line['quantity'],
                unit_price_at_order_time=line['unit_price'],
                line_total=line['line_total'],
            )
            for addon, delta, addon_qty in line['addons']:
                OrderItemAddon.objects.create(
                    order_item=order_item, addon=addon, name_snapshot=addon.name,
                    price_delta_snapshot=delta, quantity=addon_qty,
                )

            try:
                line['listing'].reduce_stock(line['quantity'])
            except Exception:
                pass

            line['cart_item'].delete()

    return order, total_payout_amount
