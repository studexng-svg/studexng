# payments/contracts.py
"""
The public interface other apps use to reach into `payments` (Blocker 8 —
Internal Service Contracts). If another app needs something from payments,
it should be importable from here — not from payments.views/payments.models
directly, and never anything with a leading underscore (that's this app's
private implementation detail, not a stable contract another app should
depend on).

This module does not implement anything itself — it only re-exports the
functions that were already the intended integration points, several of
which used to have a leading underscore purely by historical accident
(they were written as same-file helpers before any other app needed to call
them, and the underscore was never revisited once one did). Renaming them
here is a pure naming fix — no behavior changed. See the Blocker 8
implementation report for the full before/after list.

Adoption note: existing cross-app call sites (orders, delivery, scheduler,
the admin dashboard) still import these directly from `payments.views` /
`payments.pricing` / `payments.settlement` rather than through this module —
left that way deliberately so every existing test's `patch("payments.views.
<name>", ...)` target keeps working unchanged (patching a name here would
not affect the separately-bound name in its home module, and vice versa;
picking one canonical import path per caller avoids that split). New
cross-app call sites should import from here going forward; migrating the
existing ones is a safe follow-up, not a correctness requirement.
"""
from payments.views import (
    trigger_vendor_payout,
    settle_vendor_debt,
    record_payout_audit,
    refund_paystack_transaction,
)
from payments.pricing import (
    calculate_final_price,
    calculate_platform_fee,
    get_service_fee_percent,
    split_settlement,
    recompute_all_listing_prices,
)
from payments.settlement import (
    get_vendor_type,
    get_settlement_trigger,
    should_settle_on_pickup,
)

__all__ = [
    "trigger_vendor_payout",
    "settle_vendor_debt",
    "record_payout_audit",
    "refund_paystack_transaction",
    "calculate_final_price",
    "calculate_platform_fee",
    "get_service_fee_percent",
    "split_settlement",
    "recompute_all_listing_prices",
    "get_vendor_type",
    "get_settlement_trigger",
    "should_settle_on_pickup",
]
