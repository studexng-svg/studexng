# payments/views.py
import hmac
import hashlib
import uuid
import requests
import logging
import json
from decimal import Decimal
from django.conf import settings
from django.core.cache import cache
from django.views.decorators.csrf import csrf_exempt
from django.http import HttpResponse
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from orders.models import Order
from .models import SellerBankAccount, PaymentTransaction

logger = logging.getLogger(__name__)

PAYSTACK_BASE = "https://api.paystack.co"

# ─────────────────────────────────────────
# Dynamic service fee: 5% of the base amount, min ₦50, capped at ₦1,500.
# Full payment goes to StudEx balance (no subaccount split at charge time).
# After charge.success webhook, StudEx immediately transfers vendor_amount
# to the vendor's bank via the Paystack Transfer API using their RCP_xxx code.
# ─────────────────────────────────────────

def calc_service_fee(base: Decimal) -> Decimal:
    """StudEx fee: 5% of base amount, minimum ₦50, maximum ₦1,500."""
    fee = (base * Decimal("0.05")).quantize(Decimal("0.01"))
    return max(Decimal("50"), min(fee, Decimal("1500")))


def _split_amounts(total_amount: Decimal):
    """
    Returns (vendor_amount, platform_amount) from the total checkout amount
    (base + fee). Inverts the fee formula to recover the original base.
    """
    # Region 1: base < ₦1,000 → fee was ₦50 (the minimum)
    base1 = total_amount - Decimal("50")
    if Decimal("0") < base1 < Decimal("1000"):
        return base1, Decimal("50")
    # Region 2: ₦1,000 ≤ base ≤ ₦30,000 → fee was 5%
    base2 = (total_amount / Decimal("1.05")).quantize(Decimal("0.01"))
    if Decimal("1000") <= base2 <= Decimal("30000"):
        return base2, calc_service_fee(base2)
    # Region 3: base > ₦30,000 → fee was ₦1,500 (the cap)
    base3 = total_amount - Decimal("1500")
    if base3 > Decimal("0"):
        return base3, Decimal("1500")
    return Decimal("0"), total_amount


def _normalize_order_type(raw_type: str) -> str:
    t = (raw_type or "service").lower()
    if "booking" in t or "service" in t:
        return "service"
    if "food" in t or "product" in t:
        return t
    return "service"


# ─────────────────────────────────────────
# GET BANKS
# ─────────────────────────────────────────

_BANK_LIST_CACHE_KEY = "paystack_bank_list"
_BANK_LIST_CACHE_TTL = 86400  # 24 hours — bank list changes rarely


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_banks(request):
    cached = cache.get(_BANK_LIST_CACHE_KEY)
    if cached is not None:
        return Response({"data": cached}, status=200)

    try:
        secret_key = (getattr(settings, "PAYSTACK_SECRET_KEY", "") or "").strip()
        headers = {"Authorization": f"Bearer {secret_key}", "Content-Type": "application/json"}
        res = requests.get(f"{PAYSTACK_BASE}/bank?country=NG&perPage=100", headers=headers, timeout=10)
        if res.status_code == 200:
            data = res.json().get("data", [])
            cache.set(_BANK_LIST_CACHE_KEY, data, _BANK_LIST_CACHE_TTL)
            return Response({"data": data}, status=200)
        return Response({"data": []}, status=200)
    except Exception as e:
        logger.error(f"get_banks error: {e}")
        return Response({"data": []}, status=200)


# ─────────────────────────────────────────
# VERIFY BANK ACCOUNT
# ─────────────────────────────────────────

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def verify_bank_account(request):
    # 10 lookups per user per minute — prevents automated account enumeration
    _rate_key = f"bank_verify_rate:{request.user.id}"
    _count = cache.get(_rate_key, 0)
    if _count >= 10:
        return Response(
            {"error": "Too many verification attempts. Please wait a minute and try again."},
            status=429,
        )
    cache.set(_rate_key, _count + 1, 60)

    account_number = request.data.get("account_number")
    bank_code = request.data.get("bank_code")
    if not account_number or not bank_code:
        return Response({"error": "account_number and bank_code required."}, status=400)
    # Read the key fresh every request — avoids the module-level constant being stale
    # if the server was started before .env was populated with a real key.
    secret_key = (getattr(settings, "PAYSTACK_SECRET_KEY", "") or "").strip()
    if not secret_key:
        logger.error("verify_bank_account: PAYSTACK_SECRET_KEY is not set")
        return Response({"error": "Payment gateway not configured."}, status=503)
    headers = {"Authorization": f"Bearer {secret_key}", "Content-Type": "application/json"}
    try:
        res = requests.get(
            f"{PAYSTACK_BASE}/bank/resolve",
            headers=headers,
            params={"account_number": str(account_number), "bank_code": str(bank_code)},
            timeout=15,
        )
        data = res.json()
        if res.status_code == 200 and data.get("status"):
            return Response({"account_name": data.get("data", {}).get("account_name", "")})
        paystack_msg = (data.get("message") or "").lower()
        if "invalid account" in paystack_msg or "could not resolve" in paystack_msg:
            return Response({"error": "Invalid account number — please check and try again"}, status=400)
        return Response({"error": data.get("message") or "Could not verify account"}, status=400)
    except Exception:
        return Response({"error": "Verification unavailable. Enter account name manually."}, status=400)


# ─────────────────────────────────────────
# SELLER BANK ACCOUNT
# ─────────────────────────────────────────

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def seller_bank_account(request):
    if request.method == "GET":
        try:
            account = SellerBankAccount.objects.get(user=request.user)
            return Response({
                "bank_code": account.bank_code,
                "bank_name": account.bank_name,
                "account_number": "••••••" + account.account_number[-4:],
                "account_name": account.account_name,
                "paystack_subaccount_code": account.paystack_subaccount_code,
                "paystack_recipient_code": account.paystack_recipient_code,
                "subaccount_ready": bool(account.paystack_subaccount_code),
                "recipient_ready": bool(account.paystack_recipient_code),
            })
        except SellerBankAccount.DoesNotExist:
            return Response({"subaccount_ready": False}, status=200)

    bank_code = request.data.get("bank_code")
    account_number = str(request.data.get("account_number", ""))
    account_name = request.data.get("account_name")
    bank_name = request.data.get("bank_name", "") or _get_bank_name(bank_code)

    if not account_number or len(account_number) != 10:
        return Response({"error": "Account number must be 10 digits."}, status=400)
    if not all([bank_code, account_number, account_name]):
        return Response({"error": "bank_code, account_number, and account_name are required."}, status=400)

    recipient_code, error_detail = _create_or_update_transfer_recipient(
        request.user, bank_code, account_number, account_name
    )

    if not recipient_code:
        SellerBankAccount.objects.update_or_create(
            user=request.user,
            defaults={
                "bank_code": bank_code,
                "bank_name": bank_name,
                "account_number": account_number,
                "account_name": account_name,
                "paystack_recipient_code": "",
            }
        )
        return Response({
            "error": f"Bank details saved but transfer recipient setup failed: {error_detail}",
            "recipient_ready": False,
        }, status=400)

    account, _ = SellerBankAccount.objects.update_or_create(
        user=request.user,
        defaults={
            "bank_code": bank_code,
            "bank_name": bank_name,
            "account_number": account_number,
            "account_name": account_name,
            "paystack_recipient_code": recipient_code,
        }
    )
    logger.info(f"Paystack transfer recipient saved for {request.user.username}: {recipient_code}")
    return Response({
        "message": "Bank account saved and transfer recipient created successfully.",
        "account_name": account.account_name,
        "bank_name": account.bank_name,
        "paystack_recipient_code": recipient_code,
        "recipient_ready": True,
    }, status=201)


# ─────────────────────────────────────────
# GET CHECKOUT CONFIG
# Frontend can call this before opening Paystack modal.
# Returns subaccount split config.
# ─────────────────────────────────────────

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_checkout_config(request):
    """GET /api/payments/checkout-config/?listing_id=<id>"""
    listing_id = request.query_params.get("listing_id")
    if not listing_id:
        return Response({"error": "listing_id is required."}, status=400)

    try:
        from services.models import Listing
        listing = Listing.objects.select_related("vendor").get(id=listing_id)
    except Exception:
        return Response({"error": "Listing not found."}, status=404)

    vendor = listing.vendor
    amount = Decimal(str(listing.price))

    discount_amount = Decimal("0")
    try:
        profile = request.user.profile
        if profile.profile_bonus_eligible and not profile.profile_bonus_used:
            discount_amount = (amount * Decimal("0.05")).quantize(Decimal("0.01"))
    except Exception:
        pass

    final_amount = amount - discount_amount
    service_fee = calc_service_fee(final_amount)
    checkout_amount = final_amount + service_fee

    return Response({
        "listing_id": listing.id,
        "listing_title": listing.title,
        "listing_price": float(amount),
        "discount_amount": float(discount_amount),
        "vendor_receives": float(final_amount),
        "service_fee": float(service_fee),
        "checkout_amount": float(checkout_amount),
        "checkout_amount_kobo": int(checkout_amount * 100),
        "currency": "NGN",
        "vendor_username": vendor.username,
        # No subaccount split — full amount goes to StudEx balance;
        # vendor payout is handled via Transfer API after charge.success webhook.
        "paystack_split": None,
    })


# ─────────────────────────────────────────
# INITIALIZE PAYMENT
# Server-side Paystack transaction init with subaccount split.
# ─────────────────────────────────────────

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def initialize_payment(request):
    """
    POST /api/payments/initialize/
    Calls Paystack /transaction/initialize. Full amount goes to StudEx balance;
    vendor payout is handled via Transfer API after charge.success webhook.
    Returns { authorization_url, access_code, reference }.
    """
    listing_id = request.data.get("listing_id")
    if not listing_id:
        return Response({"error": "listing_id is required."}, status=400)

    try:
        from services.models import Listing
        listing = Listing.objects.select_related("vendor").get(id=listing_id)
    except Exception:
        return Response({"error": "Listing not found."}, status=404)

    buyer = request.user
    # cart_amount lets the frontend pass the true multi-item cart total so the
    # discount base is correct; fall back to the single listing price otherwise.
    cart_amount = request.data.get("cart_amount")
    try:
        amount = Decimal(str(cart_amount)) if cart_amount else Decimal(str(listing.price))
    except Exception:
        amount = Decimal(str(listing.price))

    discount_amount = Decimal("0")
    try:
        profile = buyer.profile
        if profile.profile_bonus_eligible and not profile.profile_bonus_used:
            discount_amount = (amount * Decimal("0.05")).quantize(Decimal("0.01"))
    except Exception:
        pass

    final_amount = amount - discount_amount
    checkout_amount = final_amount + calc_service_fee(final_amount)
    total_amount_kobo = int(checkout_amount * 100)

    if total_amount_kobo < 10000:  # Paystack minimum is ₦100 (10000 kobo)
        logger.error(f"Amount too low: {total_amount_kobo} kobo for listing {listing_id}")
        return Response({"error": "Amount is below the minimum transaction value."}, status=400)

    reference = f"STX-{uuid.uuid4().hex[:16].upper()}"

    # Calculate the gross amount Paystack will charge the customer when
    # "pass fees to customer" is enabled (1.5%, +₦100 flat above ₦2,500).
    # This is the EXACT amount that will appear in Paystack's checkout modal.
    _rate = Decimal("0.015")
    _flat = Decimal("100") if checkout_amount >= Decimal("2500") else Decimal("0")
    _gross = ((checkout_amount + _flat) / (1 - _rate)).quantize(Decimal("0.01"))
    _gross_kobo = int(_gross * 100)

    # Store both bounds so verify_payment can enforce the exact checkout amount.
    # 50 kobo tolerance covers Paystack's internal rounding.
    cache.set(f'pay_init:{reference}', {
        'min_kobo': total_amount_kobo,
        'max_kobo': _gross_kobo + 50,
    }, 3600)

    callback_url = (
        request.data.get("callback_url")
        or getattr(settings, "PAYSTACK_CALLBACK_URL", "")
        or None
    )

    payload = {
        "email": buyer.email,
        "amount": total_amount_kobo,
        "reference": reference,
        "metadata": {
            "listing_id": listing_id,
            "buyer_id": buyer.id,
            "type": "service",
            "discount_amount": str(discount_amount),
        },
    }
    if callback_url:
        payload["callback_url"] = callback_url

    secret_key = (getattr(settings, "PAYSTACK_SECRET_KEY", "") or "").strip()
    if not secret_key:
        return Response({"error": "Payment gateway not configured."}, status=503)

    headers = {"Authorization": f"Bearer {secret_key}", "Content-Type": "application/json"}
    try:
        res = requests.post(
            f"{PAYSTACK_BASE}/transaction/initialize",
            headers=headers,
            json=payload,
            timeout=15,
        )
    except Exception as e:
        logger.error(f"Paystack initialize request failed: {e}")
        return Response({"error": "Payment initialization failed."}, status=500)

    if res.status_code not in [200, 201]:
        logger.error(f"Paystack init error {res.status_code}: {res.text[:300]}")
        return Response({"error": "Payment initialization failed."}, status=500)

    res_json = res.json()
    # Paystack returns HTTP 200 even for failures — check the body status field
    if not res_json.get("status"):
        paystack_msg = res_json.get("message", "Unknown Paystack error")
        logger.error(f"Paystack init rejected: {paystack_msg}")
        return Response({"error": f"Payment initialization failed: {paystack_msg}"}, status=500)

    data = res_json.get("data", {})
    if not data.get("access_code"):
        logger.error(f"Paystack init: no access_code in response data: {data}")
        return Response({"error": "Payment initialization failed: no access code returned."}, status=500)

    return Response({
        "authorization_url": data.get("authorization_url"),
        "access_code": data.get("access_code"),
        "reference": data.get("reference", reference),
        "amount_kobo": total_amount_kobo,
    })


# ─────────────────────────────────────────
# RETRY SUBACCOUNT
# ─────────────────────────────────────────

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def retry_subaccount(request):
    """
    POST /api/payments/retry-subaccount/
    Re-creates or force-updates the vendor's Paystack subaccount.
    """
    try:
        account = SellerBankAccount.objects.get(user=request.user)
    except SellerBankAccount.DoesNotExist:
        return Response({"error": "No bank account saved yet."}, status=404)

    subaccount_code, error_detail = _create_or_update_paystack_subaccount(
        request.user,
        account.bank_code,
        account.account_number,
        account.account_name,
        force_update=True,
    )

    if not subaccount_code:
        return Response({
            "error": f"Subaccount update failed: {error_detail}",
            "subaccount_ready": False,
        }, status=400)

    account.paystack_subaccount_code = subaccount_code
    account.save(update_fields=["paystack_subaccount_code"])

    return Response({
        "message": "Paystack subaccount updated. Vendor now receives full listing price.",
        "paystack_subaccount_code": subaccount_code,
        "subaccount_ready": True,
    })


# ─────────────────────────────────────────
# VERIFY PAYMENT
# ─────────────────────────────────────────

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def verify_payment(request):
    reference = request.data.get("reference")
    transaction_id = request.data.get("transaction_id")
    order_type = request.data.get("order_type", "service")
    listing_id = request.data.get("listing_id")
    items = request.data.get("items", [])
    use_credits = request.data.get("use_credits", False)

    if not reference and not transaction_id:
        return Response({"error": "Payment reference is required."}, status=400)

    ref_key = reference or str(transaction_id)

    existing = PaymentTransaction.objects.filter(reference=ref_key, status="success").first()
    if existing and existing.order_id:
        return Response({"order_id": existing.order_id, "message": "Already processed."})

    try:
        secret_key = (getattr(settings, "PAYSTACK_SECRET_KEY", "") or "").strip()
        headers = {"Authorization": f"Bearer {secret_key}", "Content-Type": "application/json"}
        verify_res = requests.get(
            f"{PAYSTACK_BASE}/transaction/verify/{ref_key}",
            headers=headers,
            timeout=15,
        )
    except Exception as e:
        logger.error(f"Paystack verify request failed: {e}")
        return Response({"error": "Payment verification failed. Contact support."}, status=400)

    if verify_res.status_code != 200:
        return Response({"error": "Payment verification failed."}, status=400)

    verify_data = verify_res.json()
    if not verify_data.get("status") or verify_data.get("data", {}).get("status") != "success":
        return Response({"error": "Payment was not completed successfully."}, status=400)

    paystack_data = verify_data["data"]
    actual_listing_id = listing_id or (items[0]["listing_id"] if items else None)

    # ── Ownership check ───────────────────────────────────────────────────────
    # The email Paystack recorded for this transaction must match the caller.
    # Prevents a scammer from submitting another user's reference or a sequential
    # Paystack transaction_id to claim someone else's payment as their own order.
    paystack_email = paystack_data.get("customer", {}).get("email", "")
    if paystack_email.lower() != request.user.email.lower():
        logger.warning(
            f"verify_payment: email mismatch on {ref_key} — "
            f"Paystack customer={paystack_email}, requester={request.user.email}"
        )
        return Response({"error": "Payment was not made by this account."}, status=403)

    # ── Listing integrity check ───────────────────────────────────────────────
    # Confirm the listing_id in Paystack's metadata matches what the client sent.
    # Prevents redirecting a payment to a different listing/vendor after the fact.
    meta_listing_id = str((paystack_data.get("metadata") or {}).get("listing_id", "") or "")
    if meta_listing_id and actual_listing_id and meta_listing_id != str(actual_listing_id):
        logger.warning(
            f"verify_payment: listing_id mismatch on {ref_key} — "
            f"Paystack metadata={meta_listing_id}, request={actual_listing_id}"
        )
        return Response({"error": "Payment reference does not match this listing."}, status=400)
    # ─────────────────────────────────────────────────────────────────────────

    # ── Amount integrity check ────────────────────────────────────────────────
    # Enforce that Paystack charged exactly what our checkout showed.
    # min_kobo = net checkout amount we initialised (before Paystack grosses up).
    # max_kobo = gross amount Paystack charged the customer + 50 kobo rounding buffer.
    # Rejects both underpayment and any amount above what checkout displayed.
    actual_kobo = int(paystack_data.get("amount", 0))
    pay_init = cache.get(f'pay_init:{ref_key}')

    if isinstance(pay_init, dict):
        min_kobo = pay_init.get('min_kobo')
        max_kobo = pay_init.get('max_kobo')
    elif isinstance(pay_init, int):
        # Backward compat: old cache format stored only the net amount
        min_kobo = pay_init
        max_kobo = None
    else:
        min_kobo = None
        max_kobo = None

    if min_kobo is None and actual_listing_id:
        # Cache miss (server restart / TTL expired) — recalculate from listing price.
        # Assume max discount applied so a legitimately discounted payment isn't rejected.
        try:
            from services.models import Listing
            _listing = Listing.objects.get(id=actual_listing_id)
            _base = Decimal(str(_listing.price))
            _max_discount = (_base * Decimal("0.05")).quantize(Decimal("0.01"))
            _discounted = _base - _max_discount
            _net = _discounted + calc_service_fee(_discounted)
            _rate = Decimal("0.015")
            _flat = Decimal("100") if _net >= Decimal("2500") else Decimal("0")
            _gross = ((_net + _flat) / (1 - _rate)).quantize(Decimal("0.01"))
            min_kobo = int(_net * 100)
            max_kobo = int(_gross * 100) + 50
        except Exception:
            min_kobo = None
            max_kobo = None

    if min_kobo is not None and actual_kobo < min_kobo - 1:
        logger.warning(
            f"verify_payment: underpayment on {ref_key} — "
            f"paid {actual_kobo} kobo, min expected {min_kobo} kobo"
        )
        return Response({"error": "Payment amount is less than the order amount."}, status=400)

    if max_kobo is not None and actual_kobo > max_kobo:
        logger.warning(
            f"verify_payment: overpayment on {ref_key} — "
            f"paid {actual_kobo} kobo, max expected {max_kobo} kobo"
        )
        return Response({"error": "Payment amount does not match the checkout amount."}, status=400)
    # ─────────────────────────────────────────────────────────────────────────

    order_id, error = _create_order_from_paystack_data(
        paystack_data=paystack_data,
        buyer=request.user,
        listing_id=actual_listing_id,
        order_type=_normalize_order_type(order_type),
        use_credits=use_credits,
    )

    if error:
        return Response(
            {"error": f"Payment received but order failed: {error}", "reference": ref_key},
            status=500,
        )

    # Mark profile bonus as used if a discount was applied on this payment
    try:
        meta = paystack_data.get("metadata") or {}
        discount_in_meta = Decimal(str(meta.get("discount_amount", "0") or "0"))
        if discount_in_meta > 0:
            buyer_profile = request.user.profile
            if buyer_profile.profile_bonus_eligible and not buyer_profile.profile_bonus_used:
                buyer_profile.profile_bonus_used = True
                buyer_profile.save(update_fields=["profile_bonus_used"])
    except Exception:
        pass

    # Trigger vendor payout immediately from here — don't rely solely on the webhook.
    # The transfer is idempotent (PAYOUT-{reference} key), so if the webhook also fires
    # later, Paystack deduplicates and no double-payment occurs.
    try:
        txn = PaymentTransaction.objects.get(reference=ref_key, status="success")
        if not txn.transfer_reference:
            listing_title = ""
            try:
                from services.models import Listing
                listing_title = Listing.objects.get(id=actual_listing_id).title
            except Exception:
                pass
            _transfer_to_vendor(txn, listing_title)
    except Exception as te:
        logger.error(f"verify_payment: post-order transfer failed for {ref_key}: {te}", exc_info=True)

    return Response({"order_id": order_id, "message": "Payment verified. Order created."})


# ─────────────────────────────────────────
# CHECK PAYMENT STATUS
# ─────────────────────────────────────────

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def check_payment_status(request):
    tx_ref = request.query_params.get("tx_ref")
    if not tx_ref:
        return Response({"status": "not_found"}, status=400)
    txn = PaymentTransaction.objects.filter(reference=tx_ref, status="success").first()
    if txn and txn.order_id:
        return Response({"status": "paid", "order_id": txn.order_id})
    return Response({"status": "pending"})


# ─────────────────────────────────────────
# SELLER TRANSACTIONS
# ─────────────────────────────────────────

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def seller_transactions(request):
    txns = PaymentTransaction.objects.filter(
        seller=request.user, status="success"
    ).order_by("-created_at")[:50]
    return Response([{
        "id": t.id,
        "reference": t.reference,
        "amount": float(t.amount),
        "seller_amount": float(t.seller_amount),
        "platform_amount": float(t.platform_amount),
        "order_type": t.order_type,
        "buyer_name": t.buyer_name,
        "buyer_email": t.buyer_email,
        "order_id": t.order_id,
        "created_at": t.created_at.isoformat(),
    } for t in txns])


# ─────────────────────────────────────────
# SELLER EARNINGS
# ─────────────────────────────────────────

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def seller_earnings(request):
    from django.db.models import Sum
    user = request.user
    total_orders = Order.objects.filter(listing__vendor=user).count()
    txns = PaymentTransaction.objects.filter(seller=user, status="success")
    total_earned = txns.aggregate(Sum("seller_amount"))["seller_amount__sum"] or 0
    return Response({
        "total_earned": float(total_earned),
        "total_orders": total_orders,
        "service_fee_description": "5% (min ₦50, max ₦1,500)",
    })


# ─────────────────────────────────────────
# PRICE PREVIEW
# ─────────────────────────────────────────

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def preview_price(request):
    amount = request.data.get("amount")
    if not amount:
        return Response({"error": "amount is required."}, status=400)
    original = Decimal(str(amount))
    discount_amount = Decimal("0")
    has_discount = False
    try:
        profile = request.user.profile
        if profile.profile_bonus_eligible and not profile.profile_bonus_used:
            has_discount = True
            discount_amount = (original * Decimal("0.05")).quantize(Decimal("0.01"))
    except Exception:
        pass
    final_amount = original - discount_amount
    return Response({
        "original_amount": str(original),
        "discount_eligible": has_discount,
        "discount_percent": 5 if has_discount else 0,
        "discount_amount": str(discount_amount),
        "final_amount": str(final_amount),
        "discount_message": (
            f"🎉 5% discount applied — you save ₦{discount_amount:,.2f}!"
            if has_discount else None
        ),
    })


# ─────────────────────────────────────────
# REFUND
# ─────────────────────────────────────────

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def refund_payment(request):
    reference = request.data.get("reference")
    reason = request.data.get("reason", "Customer requested refund")
    if not reference:
        return Response({"error": "reference is required."}, status=400)
    try:
        txn = PaymentTransaction.objects.get(reference=reference)
    except PaymentTransaction.DoesNotExist:
        return Response({"error": "Transaction not found."}, status=404)
    if txn.buyer != request.user and not request.user.is_staff:
        return Response({"error": "Not authorized."}, status=403)
    if txn.status == "refunded":
        return Response({"error": "Already refunded."}, status=400)
    # Vendor has already been paid via Transfer API — reversing without clawing
    # back the transfer would leave StudEx covering both sides of the payment.
    # Require admin intervention in this case.
    if txn.transfer_reference:
        logger.warning(
            f"refund_payment: blocked self-service refund on {reference} — "
            f"vendor transfer {txn.transfer_reference} already sent"
        )
        return Response({
            "error": "The vendor has already been paid for this order. "
                     "Please contact support to arrange a refund."
        }, status=400)
    try:
        # Paystack refund: POST /refund with transaction reference
        # Amount in kobo (naira × 100)
        secret_key = (getattr(settings, "PAYSTACK_SECRET_KEY", "") or "").strip()
        headers = {"Authorization": f"Bearer {secret_key}", "Content-Type": "application/json"}
        refund_res = requests.post(
            f"{PAYSTACK_BASE}/refund",
            headers=headers,
            json={
                "transaction": reference,
                "amount": int(txn.amount * 100),
                "merchant_note": reason,
            },
            timeout=15,
        )
        if refund_res.status_code in [200, 201] and refund_res.json().get("status"):
            txn.status = "refunded"
            txn.save()
            return Response({
                "message": "Refund initiated. Returns within 3-5 business days.",
                "amount": float(txn.amount),
            })
        return Response({"error": refund_res.json().get("message", "Refund failed.")}, status=400)
    except Exception:
        return Response({"error": "Refund request failed. Contact support."}, status=400)


# ─────────────────────────────────────────
# PAYSTACK WEBHOOK
# ─────────────────────────────────────────

PAYSTACK_WEBHOOK_IPS = {"52.31.139.75", "52.49.173.169", "52.214.14.220"}


@csrf_exempt
def paystack_webhook(request):
    if request.method != "POST":
        return HttpResponse(status=405)

    # IP allowlist — enabled unless PAYSTACK_SKIP_IP_CHECK=true in env (useful when the
    # hosting layer doesn't forward the real client IP into X-Forwarded-For).
    skip_ip = (getattr(settings, 'PAYSTACK_SKIP_IP_CHECK', '') or '').lower() == 'true'
    if not skip_ip:
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR', '')
        client_ip = (x_forwarded_for.split(',')[0].strip() if x_forwarded_for
                     else request.META.get('REMOTE_ADDR', ''))
        if client_ip not in PAYSTACK_WEBHOOK_IPS:
            logger.warning(f"Paystack webhook: rejected request from unknown IP {client_ip}")
            return HttpResponse(status=403)

    # Verify HMAC-SHA512 signature — always required, never skipped
    webhook_secret = (getattr(settings, "PAYSTACK_WEBHOOK_SECRET", "") or "").strip()
    if not webhook_secret:
        logger.error("Paystack webhook: PAYSTACK_WEBHOOK_SECRET is not configured — rejecting request")
        return HttpResponse(status=401)

    signature = request.headers.get("x-paystack-signature", "")
    computed = hmac.new(
        webhook_secret.encode("utf-8"),
        request.body,
        hashlib.sha512,
    ).hexdigest()
    if not hmac.compare_digest(signature, computed):
        logger.warning("Paystack webhook: invalid signature")
        return HttpResponse(status=400)

    try:
        payload = json.loads(request.body)
    except Exception:
        return HttpResponse(status=400)

    event = payload.get("event")
    data = payload.get("data", {})
    logger.info(f"Paystack webhook: {event}")

    if event == "charge.success" and data.get("status") == "success":
        reference = data.get("reference", "")

        if PaymentTransaction.objects.filter(reference=reference, status="success").exists():
            existing = PaymentTransaction.objects.get(reference=reference, status="success")
            if existing.order_id:
                if not existing.transfer_reference:
                    # Order was created by verify_payment before this webhook arrived.
                    # Transfer hasn't been sent yet — do it now.
                    try:
                        listing_title = ""
                        try:
                            order = Order.objects.select_related("listing").get(id=existing.order_id)
                            listing_title = order.listing.title
                        except Exception:
                            pass
                        _transfer_to_vendor(existing, listing_title)
                    except Exception as te:
                        logger.error(f"Transfer to vendor failed for {reference}: {te}", exc_info=True)
                return HttpResponse(status=200)

        customer_email = data.get("customer", {}).get("email", "")
        meta = data.get("metadata", {}) or {}
        listing_id = meta.get("listing_id")
        raw_type = meta.get("type", "service")
        order_type = _normalize_order_type(raw_type)

        try:
            from django.contrib.auth import get_user_model
            User = get_user_model()
            buyer = User.objects.filter(email=customer_email).first()
        except Exception:
            buyer = None

        if buyer and listing_id:
            order_id, error = _create_order_from_paystack_data(
                paystack_data=data,
                buyer=buyer,
                listing_id=listing_id,
                order_type=order_type,
            )
            if error:
                logger.error(f"Webhook order creation failed: {error}")
            else:
                logger.info(f"Webhook created order {order_id} for {reference}")
                # Mark profile bonus as used if a discount was applied
                try:
                    discount_in_meta = Decimal(str((meta or {}).get("discount_amount", "0") or "0"))
                    if discount_in_meta > 0:
                        buyer_profile = buyer.profile
                        if buyer_profile.profile_bonus_eligible and not buyer_profile.profile_bonus_used:
                            buyer_profile.profile_bonus_used = True
                            buyer_profile.save(update_fields=["profile_bonus_used"])
                except Exception:
                    pass
                try:
                    txn = PaymentTransaction.objects.get(reference=reference)
                    listing_title = ""
                    try:
                        from services.models import Listing
                        listing_title = Listing.objects.get(id=listing_id).title
                    except Exception:
                        pass
                    _transfer_to_vendor(txn, listing_title)
                except Exception as te:
                    logger.error(f"Transfer to vendor failed for {reference}: {te}", exc_info=True)
        else:
            # Paystack amount is in kobo — convert to naira
            amount = Decimal(str(data.get("amount", 0))) / 100
            vendor_amount, platform_amount = _split_amounts(amount)
            seller = _get_seller_from_listing(listing_id)
            PaymentTransaction.objects.get_or_create(
                reference=reference,
                defaults={
                    "buyer": buyer,
                    "seller": seller,
                    "amount": amount,
                    "seller_amount": vendor_amount,
                    "platform_amount": platform_amount,
                    "service_charge": platform_amount,
                    "status": "success",
                    "order_type": order_type,
                    "buyer_email": customer_email,
                    "paystack_response": data,
                }
            )

    elif event == "transfer.success":
        transfer_ref = data.get("reference", "")
        try:
            txn = PaymentTransaction.objects.filter(transfer_reference=transfer_ref).first()
            if txn:
                txn.transfer_status = "success"
                txn.save(update_fields=["transfer_status"])
                logger.info(f"Paystack webhook: transfer confirmed {transfer_ref} — order {txn.order_id}")
        except Exception as e:
            logger.error(f"transfer.success handler error: {e}")

    elif event == "transfer.failed":
        transfer_ref = data.get("reference", "")
        try:
            txn = PaymentTransaction.objects.filter(transfer_reference=transfer_ref).first()
            if txn:
                txn.transfer_status = "failed"
                txn.save(update_fields=["transfer_status"])
                logger.error(
                    f"Paystack webhook: transfer FAILED {transfer_ref} — "
                    f"order {txn.order_id}, seller {txn.seller.username if txn.seller else 'unknown'}, "
                    f"amount ₦{txn.seller_amount}"
                )
                if txn.seller:
                    try:
                        from accounts.utils import send_notification
                        send_notification(
                            recipient=txn.seller,
                            notification_type='payout_failed',
                            title='⚠️ Payout Failed',
                            message=(
                                f'Your payout of ₦{txn.seller_amount:,.0f} for order #{txn.order_id} '
                                f'could not be processed. Please contact StudEx support.'
                            ),
                            action_url='/vendor/dashboard',
                        )
                    except Exception as ne:
                        logger.warning(f"Payout-failed notification error: {ne}")
        except Exception as e:
            logger.error(f"transfer.failed handler error: {e}")

    elif event == "transfer.reversed":
        transfer_ref = data.get("reference", "")
        try:
            txn = PaymentTransaction.objects.filter(transfer_reference=transfer_ref).first()
            if txn:
                txn.transfer_status = "reversed"
                txn.save(update_fields=["transfer_status"])
                logger.warning(
                    f"Paystack webhook: transfer REVERSED {transfer_ref} — order {txn.order_id}"
                )
        except Exception as e:
            logger.error(f"transfer.reversed handler error: {e}")

    elif event == "refund.processed":
        ref = ((data.get("transaction") or {}).get("reference") or data.get("reference") or "")
        try:
            txn = PaymentTransaction.objects.filter(reference=ref).first()
            if txn and txn.status != "refunded":
                txn.status = "refunded"
                txn.save(update_fields=["status"])
                logger.info(f"Paystack webhook: refund confirmed for {ref}")
        except Exception as e:
            logger.error(f"refund.processed handler error: {e}")

    elif event == "refund.failed":
        ref = ((data.get("transaction") or {}).get("reference") or data.get("reference") or "")
        logger.error(f"Paystack webhook: refund FAILED for {ref} — manual action required")

    return HttpResponse(status=200)


# ─────────────────────────────────────────
# INTERNAL: create order from Paystack data
# ─────────────────────────────────────────

def _create_order_from_paystack_data(paystack_data, buyer, listing_id, order_type, use_credits=False):
    from services.models import Listing

    # Paystack amounts are in kobo — divide by 100 to get naira
    amount_paid = Decimal(str(paystack_data["amount"])) / 100
    ref_key = paystack_data.get("reference", "")
    paystack_transaction_id = paystack_data.get("id")
    buyer_email = paystack_data.get("customer", {}).get("email", buyer.email if buyer else "")

    # Resolve listing early so vendor_amount = listing.price exactly.
    # amount_paid may be grossed up by Paystack's "pass fees to customer" setting,
    # or reduced by a StudEx profile-bonus discount. In both cases the vendor
    # must receive their listed price — StudEx absorbs any difference.
    listing = None
    if listing_id:
        try:
            listing = Listing.objects.get(id=listing_id)
        except Exception:
            pass

    if listing is not None:
        vendor_amount = Decimal(str(listing.price))
        platform_amount = max(amount_paid - vendor_amount, Decimal("0"))
    else:
        vendor_amount, platform_amount = _split_amounts(amount_paid)

    seller = _get_seller_from_listing(listing_id)

    txn, created = PaymentTransaction.objects.get_or_create(
        reference=ref_key,
        defaults={
            "buyer": buyer,
            "seller": seller,
            "paystack_transaction_id": paystack_transaction_id,
            "amount": amount_paid,
            "seller_amount": vendor_amount,
            "platform_amount": platform_amount,
            "service_charge": platform_amount,
            "status": "success",
            "order_type": order_type,
            "buyer_email": buyer_email,
            "buyer_name": buyer.get_full_name() or buyer.username if buyer else "",
            "paystack_response": paystack_data,
        }
    )

    if not created and txn.order_id:
        return txn.order_id, None

    order_id = None

    try:
        if listing is not None:
            order = Order.objects.create(
                buyer=buyer,
                listing=listing,
                amount=amount_paid,
                reference=ref_key,
                status="paid",
            )
            order_id = order.id

            try:
                from orders.models import Booking
                Booking.objects.filter(
                    buyer=buyer, listing=listing, status="confirmed"
                ).update(status="paid")
            except Exception as e:
                logger.warning(f"Booking status update failed: {e}")

            try:
                listing.reduce_stock(1)
            except Exception as e:
                logger.warning(f"reduce_stock failed: {e}")

            try:
                from accounts.utils import send_notification
                # Notify vendor
                send_notification(
                    recipient=listing.vendor,
                    notification_type='new_order',
                    title=f'New Order — {listing.title}',
                    message=(
                        f'{buyer.username} just paid for "{listing.title}". '
                        f'Your payout of ₦{vendor_amount:,.0f} will be transferred to your bank shortly.'
                    ),
                    action_url='/vendor/dashboard',
                )
                # Notify buyer
                send_notification(
                    recipient=buyer,
                    notification_type='order_placed',
                    title=f'Order Confirmed — {listing.title}',
                    message=(
                        f'Your payment of ₦{amount_paid:,.0f} for "{listing.title}" was successful. '
                        f'The vendor has been notified and will begin your order shortly.'
                    ),
                    action_url='/account/orders',
                )
            except Exception as ne:
                logger.warning(f"Order notification failed: {ne}")

    except Exception as e:
        logger.error(f"Order creation failed: {e}", exc_info=True)
        return None, str(e)

    txn.order_id = order_id
    txn.status = "success"
    txn.save()

    if use_credits and buyer:
        try:
            from loyalty.models import LoyaltyAccount, LoyaltyTransaction
            loyalty_account = LoyaltyAccount.objects.filter(user=buyer).first()
            if loyalty_account and loyalty_account.credit_balance > 0:
                credits_used = min(loyalty_account.credit_balance, amount_paid)
                loyalty_account.credit_balance -= credits_used
                loyalty_account.save()
                LoyaltyTransaction.objects.create(
                    account=loyalty_account, type="redeemed",
                    amount=credits_used,
                    description=f"Credits used on order #{order_id}",
                )
        except Exception as e:
            logger.warning(f"Loyalty deduction failed: {e}")

    return order_id, None


# ─────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────

def _create_or_update_transfer_recipient(user, bank_code, account_number, account_name):
    """
    Creates a Paystack transfer recipient (RCP_xxx) for instant vendor payouts.
    Returns (recipient_code, error_message).
    """
    try:
        secret_key = (getattr(settings, "PAYSTACK_SECRET_KEY", "") or "").strip()
        if not secret_key:
            msg = "PAYSTACK_SECRET_KEY is not configured."
            logger.error(msg)
            return None, msg

        headers = {"Authorization": f"Bearer {secret_key}", "Content-Type": "application/json"}
        payload = {
            "type": "nuban",
            "name": account_name,
            "account_number": str(account_number),
            "bank_code": str(bank_code),
            "currency": "NGN",
        }

        logger.info(f"Paystack transfer recipient for {user.username}: bank={bank_code}, acct=****{account_number[-4:]}")
        res = requests.post(
            f"{PAYSTACK_BASE}/transferrecipient",
            headers=headers,
            json=payload,
            timeout=15,
        )
        logger.info(f"Paystack transferrecipient → {res.status_code}: {res.text[:300]}")

        if res.status_code in [200, 201]:
            data = res.json().get("data", {})
            recipient_code = data.get("recipient_code")
            if recipient_code:
                logger.info(f"Paystack transfer recipient created: {recipient_code}")
                return str(recipient_code), None
            msg = f"Paystack returned success but no recipient_code: {data}"
            logger.error(msg)
            return None, msg
        else:
            try:
                error_body = res.json()
            except Exception:
                error_body = res.text
            msg = f"Paystack transferrecipient failed ({res.status_code}): {error_body}"
            logger.error(msg)
            return None, str(msg)[:300]

    except requests.exceptions.Timeout:
        return None, "Paystack API timed out."
    except Exception as e:
        logger.error(f"Transfer recipient exception: {e}", exc_info=True)
        return None, str(e)


def _transfer_to_vendor(txn, listing_title):
    """
    Initiates a Paystack transfer to the vendor's bank account.
    Updates txn.transfer_reference / txn.transfer_status on success.
    Never raises — webhook must always return 200.
    """
    seller = txn.seller
    if not seller:
        logger.error(f"_transfer_to_vendor: no seller on txn {txn.reference}")
        return

    try:
        bank_account = SellerBankAccount.objects.get(user=seller)
    except SellerBankAccount.DoesNotExist:
        logger.error(
            f"_transfer_to_vendor: no bank account for {seller.username} "
            f"(order {txn.order_id}) — manual payout required"
        )
        return

    recipient_code = bank_account.paystack_recipient_code
    if not recipient_code:
        logger.error(
            f"_transfer_to_vendor: no recipient_code for {seller.username} "
            f"(order {txn.order_id}) — manual payout required"
        )
        return

    vendor_amount_kobo = int(txn.seller_amount * 100)
    secret_key = (getattr(settings, "PAYSTACK_SECRET_KEY", "") or "").strip()
    if not secret_key:
        logger.error("_transfer_to_vendor: PAYSTACK_SECRET_KEY not configured")
        return

    headers = {"Authorization": f"Bearer {secret_key}", "Content-Type": "application/json"}
    payload = {
        "source": "balance",
        "amount": vendor_amount_kobo,
        "recipient": recipient_code,
        "reason": f"StudEx payout for order #{txn.order_id} - {listing_title}",
        # Stable reference tied to the charge reference — Paystack deduplicates
        # on this field, so a webhook retry cannot create a second transfer.
        "reference": f"PAYOUT-{txn.reference}",
    }

    try:
        res = requests.post(f"{PAYSTACK_BASE}/transfer", headers=headers, json=payload, timeout=15)
        res_json = res.json()
        if res.status_code in [200, 201] and res_json.get("status"):
            transfer_data = res_json.get("data", {})
            txn.transfer_reference = transfer_data.get("reference", "")
            txn.transfer_status = transfer_data.get("status", "pending")
            txn.save(update_fields=["transfer_reference", "transfer_status"])
            logger.info(
                f"Transfer initiated for order {txn.order_id}: "
                f"ref={txn.transfer_reference}, status={txn.transfer_status}"
            )
        else:
            logger.error(
                f"Transfer failed for order {txn.order_id} (seller: {seller.username}): "
                f"{res.status_code} — {res_json}"
            )
    except Exception as e:
        logger.error(f"Transfer exception for order {txn.order_id}: {e}", exc_info=True)


def _create_or_update_paystack_subaccount(user, bank_code, account_number, account_name, force_update=False):
    """
    Creates or updates a Paystack subaccount for the vendor.

    Paystack subaccount split config (set at payment time via PaystackPop.setup):
      subaccount = ACCT_xxx  (the subaccount code returned here)
      transaction_charge = dynamic (5% of base, min ₦50, max ₦1,500) → goes to StudEx
      bearer = "account"    → StudEx bears Paystack's processing fee

    Returns (subaccount_code, error_message).
    """
    try:
        secret_key = (getattr(settings, "PAYSTACK_SECRET_KEY", "") or "").strip()
        if not secret_key:
            msg = "PAYSTACK_SECRET_KEY is not configured."
            logger.error(msg)
            return None, msg

        headers = {"Authorization": f"Bearer {secret_key}", "Content-Type": "application/json"}

        existing = SellerBankAccount.objects.filter(user=user).first()

        payload = {
            "business_name": getattr(user, "business_name", None) or user.username,
            "settlement_bank": str(bank_code),
            "account_number": str(account_number),
            "percentage_charge": 0,  # Split is handled at transaction time, not subaccount level
        }

        logger.info(f"Paystack subaccount for {user.username}: bank={bank_code}, acct={account_number[-4:]}****")

        if existing and existing.paystack_subaccount_code and not force_update:
            # Update the existing subaccount
            res = requests.put(
                f"{PAYSTACK_BASE}/subaccount/{existing.paystack_subaccount_code}",
                headers=headers,
                json=payload,
                timeout=15,
            )
            action = "update"
        else:
            # Create new subaccount
            res = requests.post(
                f"{PAYSTACK_BASE}/subaccount",
                headers=headers,
                json=payload,
                timeout=15,
            )
            action = "create"

        logger.info(f"Paystack subaccount {action} → {res.status_code}: {res.text[:300]}")

        if res.status_code in [200, 201]:
            data = res.json().get("data", {})
            sub_code = data.get("subaccount_code") or data.get("id")
            if sub_code:
                logger.info(f"Paystack subaccount {action}d: {sub_code}")
                return str(sub_code), None
            else:
                msg = f"Paystack returned success but no subaccount_code: {data}"
                logger.error(msg)
                return None, msg
        else:
            try:
                error_body = res.json()
            except Exception:
                error_body = res.text
            msg = f"Paystack {action} failed ({res.status_code}): {error_body}"
            logger.error(msg)
            return None, str(msg)[:300]

    except requests.exceptions.Timeout:
        return None, "Paystack API timed out."
    except Exception as e:
        logger.error(f"Subaccount exception: {e}", exc_info=True)
        return None, str(e)


def _get_seller_from_listing(listing_id):
    if not listing_id:
        return None
    try:
        from services.models import Listing
        return Listing.objects.get(id=listing_id).vendor
    except Exception:
        return None


def _get_bank_name(bank_code):
    BANKS = {
        "044": "Access Bank", "050": "Ecobank Nigeria", "070": "Fidelity Bank",
        "011": "First Bank of Nigeria", "214": "FCMB", "058": "Guaranty Trust Bank",
        "030": "Heritage Bank", "082": "Keystone Bank", "526": "OPay",
        "999991": "PalmPay", "076": "Polaris Bank", "101": "Providus Bank",
        "221": "Stanbic IBTC", "232": "Sterling Bank", "032": "Union Bank",
        "033": "UBA", "215": "Unity Bank", "035": "Wema Bank", "057": "Zenith Bank",
        "090405": "Moniepoint MFB", "999992": "Kuda Bank",
    }
    return BANKS.get(str(bank_code), "Unknown Bank")
