# payments/views.py
import requests
import logging
import json
from decimal import Decimal
from django.conf import settings
from django.views.decorators.csrf import csrf_exempt
from django.http import HttpResponse
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from orders.models import Order
from .models import SellerBankAccount, PaymentTransaction

logger = logging.getLogger(__name__)

FLW_SECRET = (getattr(settings, "FLW_SECRET_KEY", "") or "").strip()
FLW_BASE = "https://api.flutterwave.com/v3"
FLW_HEADERS = {"Authorization": f"Bearer {FLW_SECRET}", "Content-Type": "application/json"}

# ─────────────────────────────────────────
# ₦200 flat service fee per transaction.
# Vendor receives listing price minus ₦200.
# Flutterwave splits at payment time via subaccount (split_type=flat, split_value=200).
#
# HOW THE SPLIT WORKS ON FLUTTERWAVE:
#   split_type = "flat"
#   split_value = 200
#   → Flutterwave sends ₦200 to StudEx (the main account)
#   → Everything else goes to the vendor's subaccount immediately
#
# IMPORTANT: The subaccount's split_value=200 means StudEx gets ₦200 FLAT.
# The vendor gets (amount - 200 - FLW_fees). NOT a percentage split.
# ─────────────────────────────────────────
SERVICE_FEE = Decimal("200")


def _split_amounts(amount: Decimal):
    """Returns (vendor_amount, platform_amount)."""
    vendor_amount = amount - SERVICE_FEE
    if vendor_amount < Decimal("0"):
        return Decimal("0"), amount
    return vendor_amount, SERVICE_FEE


def _normalize_order_type(raw_type: str) -> str:
    """
    Normalises the order type from metadata.
    booking_payment, booking, service_booking all map to 'service'.
    """
    t = (raw_type or "service").lower()
    if "booking" in t or "service" in t:
        return "service"
    if "food" in t or "product" in t:
        return t
    return "service"


# ─────────────────────────────────────────
# GET BANKS
# ─────────────────────────────────────────

@api_view(["GET"])
@permission_classes([AllowAny])
def get_banks(request):
    try:
        res = requests.get(f"{FLW_BASE}/banks/NG", headers=FLW_HEADERS, timeout=10)
        if res.status_code == 200:
            return Response(res.json(), status=200)
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
    account_number = request.data.get("account_number")
    bank_code = request.data.get("bank_code")
    if not account_number or not bank_code:
        return Response({"error": "account_number and bank_code required."}, status=400)
    try:
        res = requests.post(
            f"{FLW_BASE}/accounts/resolve",
            headers=FLW_HEADERS,
            json={"account_number": str(account_number), "account_bank": str(bank_code)},
            timeout=15,
        )
        if res.status_code == 200 and res.json().get("status") == "success":
            return Response({"account_name": res.json().get("data", {}).get("account_name", "")})
        return Response({"error": res.json().get("message", "Could not verify account.")}, status=400)
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
                "account_number": account.account_number,
                "account_name": account.account_name,
                "flw_subaccount_id": account.flw_subaccount_id,
                "subaccount_ready": bool(account.flw_subaccount_id),
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

    subaccount_id, error_detail = _create_or_update_flw_subaccount(
        request.user, bank_code, account_number, account_name
    )

    if not subaccount_id:
        SellerBankAccount.objects.update_or_create(
            user=request.user,
            defaults={
                "bank_code": bank_code,
                "bank_name": bank_name,
                "account_number": account_number,
                "account_name": account_name,
                "flw_subaccount_id": "",
            }
        )
        return Response({
            "error": f"Bank details saved but Flutterwave subaccount setup failed: {error_detail}",
            "subaccount_ready": False,
        }, status=400)

    account, _ = SellerBankAccount.objects.update_or_create(
        user=request.user,
        defaults={
            "bank_code": bank_code,
            "bank_name": bank_name,
            "account_number": account_number,
            "account_name": account_name,
            "flw_subaccount_id": subaccount_id,
        }
    )
    logger.info(f"Subaccount saved for {request.user.username}: {subaccount_id}")
    return Response({
        "message": "Bank account saved and payout subaccount created successfully.",
        "account_name": account.account_name,
        "bank_name": account.bank_name,
        "flw_subaccount_id": subaccount_id,
        "subaccount_ready": True,
    }, status=201)


# ─────────────────────────────────────────
# GET CHECKOUT CONFIG
# Frontend calls this before opening Flutterwave modal.
# Returns the subaccount split config — MUST be passed to FlutterwaveCheckout().
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

    # Apply profile completion discount if eligible
    discount_amount = Decimal("0")
    try:
        profile = request.user.profile
        if profile.profile_bonus_eligible and not profile.profile_bonus_used:
            discount_amount = (amount * Decimal("0.05")).quantize(Decimal("0.01"))
    except Exception:
        pass

    final_amount = amount - discount_amount

    # Total charged to customer = listing price + ₦200 service fee
    # The service fee is baked into the checkout amount.
    # Flutterwave then splits: ₦200 → StudEx, rest → vendor.
    checkout_amount = final_amount + SERVICE_FEE

    subaccount_id = None
    try:
        bank = SellerBankAccount.objects.get(user=vendor)
        subaccount_id = bank.flw_subaccount_id or None
    except SellerBankAccount.DoesNotExist:
        pass

    if not subaccount_id:
        logger.warning(
            f"No subaccount for vendor {vendor.username} on listing {listing_id}. "
            f"Full payment will go to StudEx settlement account."
        )

    return Response({
        "listing_id": listing.id,
        "listing_title": listing.title,
        "listing_price": float(amount),
        "discount_amount": float(discount_amount),
        "vendor_receives": float(final_amount),   # what vendor gets after ₦200 fee
        "service_fee": float(SERVICE_FEE),
        "checkout_amount": float(checkout_amount), # total customer pays
        "currency": "NGN",
        "vendor_username": vendor.username,
        "subaccount_id": subaccount_id,
        "subaccount_ready": bool(subaccount_id),
        # Pass this directly into FlutterwaveCheckout({ subaccounts: [...] })
        # split_type=flat means StudEx keeps ₦200 flat, vendor gets the rest.
        "flw_subaccounts": [
            {
                "id": subaccount_id,
                "transaction_split_ratio": 1,
                "transaction_charge_type": "flat",
                "transaction_charge": float(SERVICE_FEE),
            }
        ] if subaccount_id else [],
    })


# ─────────────────────────────────────────
# RETRY SUBACCOUNT — for vendors with missing/wrong subaccount
# Also force-updates existing subaccounts to the correct flat split
# ─────────────────────────────────────────

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def retry_subaccount(request):
    """
    POST /api/payments/retry-subaccount/
    Re-creates or force-updates the vendor's Flutterwave subaccount
    to use split_type=flat, split_value=200.
    Call this for any vendor whose split was wrong (percentage instead of flat).
    """
    try:
        account = SellerBankAccount.objects.get(user=request.user)
    except SellerBankAccount.DoesNotExist:
        return Response({"error": "No bank account saved yet."}, status=404)

    subaccount_id, error_detail = _create_or_update_flw_subaccount(
        request.user,
        account.bank_code,
        account.account_number,
        account.account_name,
        force_update=True,  # always update even if subaccount_id already exists
    )

    if not subaccount_id:
        return Response({
            "error": f"Subaccount update failed: {error_detail}",
            "subaccount_ready": False,
        }, status=400)

    account.flw_subaccount_id = subaccount_id
    account.save(update_fields=["flw_subaccount_id"])

    return Response({
        "message": "Subaccount updated to flat ₦200 split. Vendor now receives full listing price.",
        "flw_subaccount_id": subaccount_id,
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
        if transaction_id:
            verify_res = requests.get(
                f"{FLW_BASE}/transactions/{transaction_id}/verify",
                headers=FLW_HEADERS, timeout=15,
            )
        else:
            verify_res = requests.get(
                f"{FLW_BASE}/transactions/verify_by_reference?tx_ref={reference}",
                headers=FLW_HEADERS, timeout=15,
            )
    except Exception as e:
        logger.error(f"FLW verify request failed: {e}")
        return Response({"error": "Payment verification failed. Contact support."}, status=400)

    if verify_res.status_code != 200:
        return Response({"error": "Payment verification failed."}, status=400)

    verify_data = verify_res.json()
    if verify_data.get("status") != "success" or verify_data.get("data", {}).get("status") != "successful":
        return Response({"error": "Payment was not completed successfully."}, status=400)

    flw_data = verify_data["data"]
    actual_listing_id = listing_id or (items[0]["listing_id"] if items else None)

    order_id, error = _create_order_from_flw_data(
        flw_data=flw_data,
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
        "service_fee": float(SERVICE_FEE),
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
    try:
        refund_id = getattr(txn, 'flw_transaction_id', None) or reference
        refund_res = requests.post(
            f"{FLW_BASE}/transactions/{refund_id}/refund",
            headers=FLW_HEADERS,
            json={"amount": float(txn.amount), "comments": reason},
            timeout=15,
        )
        if refund_res.status_code in [200, 201]:
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
# FLUTTERWAVE WEBHOOK
# ─────────────────────────────────────────

@csrf_exempt
def flutterwave_webhook(request):
    if request.method != "POST":
        return HttpResponse(status=405)

    flw_signature = request.headers.get("verif-hash", "")
    if flw_signature != getattr(settings, "FLW_WEBHOOK_HASH", ""):
        logger.warning("Flutterwave webhook: invalid signature")
        return HttpResponse(status=401)

    try:
        payload = json.loads(request.body)
    except Exception:
        return HttpResponse(status=400)

    event = payload.get("event")
    data = payload.get("data", {})
    logger.info(f"FLW webhook: {event}")

    if event == "charge.completed" and data.get("status") == "successful":
        tx_ref = data.get("tx_ref", "")

        if PaymentTransaction.objects.filter(reference=tx_ref, status="success").exists():
            existing = PaymentTransaction.objects.get(reference=tx_ref, status="success")
            if existing.order_id:
                return HttpResponse(status=200)

        customer_email = data.get("customer", {}).get("email", "")
        meta = data.get("meta", {}) or {}
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
            order_id, error = _create_order_from_flw_data(
                flw_data=data,
                buyer=buyer,
                listing_id=listing_id,
                order_type=order_type,
            )
            if error:
                logger.error(f"Webhook order creation failed: {error}")
            else:
                logger.info(f"Webhook created order {order_id} for {tx_ref}")
        else:
            amount = Decimal(str(data.get("amount", 0)))
            vendor_amount, platform_amount = _split_amounts(amount)
            seller = _get_seller_from_listing(listing_id)
            PaymentTransaction.objects.get_or_create(
                reference=tx_ref,
                defaults={
                    "buyer": buyer,
                    "seller": seller,
                    "amount": amount,
                    "seller_amount": vendor_amount,
                    "platform_amount": platform_amount,
                    "status": "success",
                    "order_type": order_type,
                    "buyer_email": customer_email,
                    "flw_response": data,
                }
            )

    return HttpResponse(status=200)


# ─────────────────────────────────────────
# INTERNAL: create order
# ─────────────────────────────────────────

def _create_order_from_flw_data(flw_data, buyer, listing_id, order_type, use_credits=False):
    from services.models import Listing

    amount_paid = Decimal(str(flw_data["amount"]))
    ref_key = flw_data.get("tx_ref", "")
    flw_transaction_id = flw_data.get("id")
    buyer_email = flw_data.get("customer", {}).get("email", buyer.email if buyer else "")

    vendor_amount, platform_amount = _split_amounts(amount_paid)
    seller = _get_seller_from_listing(listing_id)

    txn, created = PaymentTransaction.objects.get_or_create(
        reference=ref_key,
        defaults={
            "buyer": buyer,
            "seller": seller,
            "flw_transaction_id": flw_transaction_id,
            "amount": amount_paid,
            "seller_amount": vendor_amount,
            "platform_amount": platform_amount,
            "status": "success",
            "order_type": order_type,
            "buyer_email": buyer_email,
            "buyer_name": buyer.get_full_name() or buyer.username if buyer else "",
            "flw_response": flw_data,
        }
    )

    if not created and txn.order_id:
        return txn.order_id, None

    order_id = None

    try:
        if listing_id:
            listing = Listing.objects.get(id=listing_id)
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
                send_notification(
                    recipient=listing.vendor,
                    notification_type='new_order',
                    title=f'💰 Payment Received — {listing.title}',
                    message=(
                        f'{buyer.username} just paid ₦{amount_paid:,.0f} for "{listing.title}". '
                        f'Your payout of ₦{vendor_amount:,.0f} will be transferred to your bank by Flutterwave.'
                    ),
                    action_url='/vendor/dashboard',
                )
            except Exception as ne:
                logger.warning(f"Vendor notification failed: {ne}")

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
                    account=loyalty_account, transaction_type="redeemed",
                    amount=credits_used,
                    description=f"Credits used on order #{order_id}",
                )
        except Exception as e:
            logger.warning(f"Loyalty deduction failed: {e}")

    return order_id, None


# ─────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────

def _create_or_update_flw_subaccount(user, bank_code, account_number, account_name, force_update=False):
    """
    Creates or updates a Flutterwave subaccount for the vendor.

    CORRECT SPLIT CONFIG:
      split_type  = "flat"
      split_value = 200

    This means:
      - StudEx (main account) receives ₦200 flat per transaction
      - The vendor's subaccount receives everything else immediately
      - This is NOT a percentage split

    If force_update=True, always calls the update endpoint even if subaccount_id exists.
    Use this to fix existing vendors who were set up with the old percentage split.

    Returns (subaccount_id, error_message).
    """
    try:
        if not FLW_SECRET:
            msg = "FLW_SECRET_KEY is not configured."
            logger.error(msg)
            return None, msg

        existing = SellerBankAccount.objects.filter(user=user).first()

        payload = {
            "account_bank": str(bank_code),
            "account_number": str(account_number),
            "business_name": getattr(user, "business_name", None) or user.username,
            "business_email": user.email or f"{user.username}@studex.ng",
            "country": "NG",
            "split_type": "flat",    # ← FLAT, not percentage
            "split_value": 200,      # ← ₦200 to StudEx; rest to vendor
        }

        logger.info(f"FLW subaccount for {user.username}: bank={bank_code}, acct={account_number[-4:]}****")

        if existing and existing.flw_subaccount_id:
            # Update the existing subaccount — this fixes any wrong split config
            res = requests.put(
                f"{FLW_BASE}/subaccounts/{existing.flw_subaccount_id}",
                headers=FLW_HEADERS,
                json=payload,
                timeout=15,
            )
            action = "update"
        else:
            # Create new subaccount
            res = requests.post(
                f"{FLW_BASE}/subaccounts",
                headers=FLW_HEADERS,
                json=payload,
                timeout=15,
            )
            action = "create"

        logger.info(f"FLW subaccount {action} → {res.status_code}: {res.text[:300]}")

        if res.status_code in [200, 201]:
            data = res.json().get("data", {})
            sub_id = (
                data.get("subaccount_id")
                or data.get("id")
                or str(data.get("subaccount_id", ""))
            )
            if sub_id:
                logger.info(f"Subaccount {action}d: {sub_id} (flat ₦200 split)")
                return str(sub_id), None
            else:
                msg = f"FLW returned success but no subaccount_id: {data}"
                logger.error(msg)
                return None, msg
        else:
            try:
                error_body = res.json()
            except Exception:
                error_body = res.text
            msg = f"FLW {action} failed ({res.status_code}): {error_body}"
            logger.error(msg)
            return None, str(msg)[:300]

    except requests.exceptions.Timeout:
        return None, "Flutterwave API timed out."
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