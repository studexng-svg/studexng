# payments/views.py
import requests
import logging
from decimal import Decimal
from django.conf import settings
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from orders.models import Order
from .models import SellerBankAccount, PaymentTransaction

logger = logging.getLogger(__name__)

FLW_SECRET = (getattr(settings, "FLW_SECRET_KEY", "") or "").strip()
if not FLW_SECRET:
    logger.error("FLW_SECRET_KEY is not set!")

FLW_BASE = "https://api.flutterwave.com/v3"
FLW_HEADERS = {
    "Authorization": f"Bearer {FLW_SECRET}",
    "Content-Type": "application/json",
}

# ── Pricing constants ──────────────────────────────────────────────────────────
SERVICE_CHARGE = Decimal("200")   # flat fee added to every booking, kept by platform
MAX_DISCOUNT   = SERVICE_CHARGE   # 5% profile discount is capped at the service charge


def calculate_pricing(listing_price: Decimal, apply_discount: bool = False):
    """
    New pricing model — NO split payments.

    Vendor always receives their full listing_price.
    Platform revenue comes entirely from the SERVICE_CHARGE.

    buyer pays:     listing_price + SERVICE_CHARGE - discount
    vendor gets:    listing_price (paid manually by StudEx)
    platform keeps: SERVICE_CHARGE - discount  (minimum ₦0)

    The 5% profile-completion discount is capped at ₦200 (the service charge).
    This means the discount NEVER touches vendor revenue.

    Examples:
        ₦2,000 listing, no discount → buyer pays ₦2,200, vendor gets ₦2,000, platform ₦200
        ₦2,000 listing, 5% discount → buyer pays ₦2,100, vendor gets ₦2,000, platform ₦100
        ₦5,000 listing, 5% discount → 5% = ₦250, capped at ₦200
                                    → buyer pays ₦5,000, vendor gets ₦5,000, platform ₦0
    """
    discount = Decimal("0")
    if apply_discount:
        raw_discount = (listing_price * Decimal("0.05")).quantize(Decimal("0.01"))
        discount = min(raw_discount, MAX_DISCOUNT)

    buyer_pays     = listing_price + SERVICE_CHARGE - discount
    seller_amount  = listing_price          # vendor always gets full price
    platform_net   = SERVICE_CHARGE - discount

    return {
        "listing_price":   listing_price,
        "service_charge":  SERVICE_CHARGE,
        "discount_amount": discount,
        "buyer_pays":      buyer_pays,
        "seller_amount":   seller_amount,
        "platform_amount": platform_net,
    }


# ─────────────────────────────────────────
# GET BANKS — backend proxy to avoid CORS
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
        logger.error(f"get_banks error: {e}", exc_info=True)
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

    if not FLW_SECRET:
        return Response(
            {"error": "Verification unavailable. Please enter your account name manually."},
            status=400
        )

    try:
        payload = {"account_number": str(account_number), "account_bank": str(bank_code)}
        res = requests.post(
            f"{FLW_BASE}/accounts/resolve",
            headers=FLW_HEADERS, json=payload, timeout=15,
        )
        try:
            resp_json = res.json()
        except Exception:
            resp_json = {}

        if res.status_code == 200 and resp_json.get("status") == "success":
            return Response({"account_name": resp_json.get("data", {}).get("account_name", "")})

        flw_message = resp_json.get("message", "Could not verify account.")
        return Response({"error": flw_message}, status=400)

    except requests.exceptions.Timeout:
        return Response({"error": "Verification timed out. Enter account name manually."}, status=400)
    except Exception as e:
        logger.error(f"verify_bank_account error: {e}", exc_info=True)
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
            })
        except SellerBankAccount.DoesNotExist:
            return Response({}, status=200)

    bank_code = request.data.get("bank_code")
    account_number = str(request.data.get("account_number", ""))
    account_name = request.data.get("account_name")
    bank_name = request.data.get("bank_name", "") or _get_bank_name(bank_code)

    if not account_number or len(account_number) != 10:
        return Response({"error": "Account number must be 10 digits."}, status=400)
    if not all([bank_code, account_number, account_name]):
        return Response({"error": "bank_code, account_number, and account_name are required."}, status=400)

    # Still register subaccount with Flutterwave for identity/payout purposes,
    # but we no longer use it for split payments at checkout.
    subaccount_id = _create_or_update_flw_subaccount(request.user, bank_code, account_number, account_name)

    account, _ = SellerBankAccount.objects.update_or_create(
        user=request.user,
        defaults={
            "bank_code": bank_code,
            "bank_name": bank_name,
            "account_number": account_number,
            "account_name": account_name,
            "flw_subaccount_id": subaccount_id or "",
        }
    )

    return Response({
        "message": "Bank account saved successfully.",
        "account_name": account.account_name,
        "bank_name": account.bank_name,
    }, status=201)


# ─────────────────────────────────────────
# PRICE PREVIEW
# Returns the full breakdown the frontend shows before payment.
# ─────────────────────────────────────────

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def preview_price(request):
    """
    POST { "amount": 2000, "listing_id": 5 }
    Returns full price breakdown including service charge and any applicable discount.
    Frontend uses this to show the buyer exactly what they'll pay before hitting Flutterwave.
    """
    amount = request.data.get("amount")
    if not amount:
        return Response({"error": "amount is required."}, status=400)

    listing_price = Decimal(str(amount))
    apply_discount = False

    try:
        profile = request.user.profile
        if profile.profile_bonus_eligible and not profile.profile_bonus_used:
            apply_discount = True
    except Exception:
        pass

    pricing = calculate_pricing(listing_price, apply_discount)

    return Response({
        "listing_price":    str(pricing["listing_price"]),
        "service_charge":   str(pricing["service_charge"]),
        "discount_eligible": apply_discount,
        "discount_percent":  5 if apply_discount else 0,
        "discount_amount":   str(pricing["discount_amount"]),
        "discount_note": (
            f"5% profile discount applied (₦{pricing['discount_amount']:,.0f} off service charge)"
            if apply_discount and pricing["discount_amount"] > 0 else None
        ),
        "buyer_pays":       str(pricing["buyer_pays"]),
        "vendor_receives":  str(pricing["seller_amount"]),
        "platform_revenue": str(pricing["platform_amount"]),
    })


# ─────────────────────────────────────────
# VERIFY PAYMENT + CREATE ORDER
# ─────────────────────────────────────────

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def verify_payment(request):
    reference = request.data.get("reference")
    transaction_id = request.data.get("transaction_id")
    order_type = request.data.get("order_type", "product")
    listing_id = request.data.get("listing_id")
    items = request.data.get("items", [])
    use_discount = request.data.get("use_discount", False)

    if not reference and not transaction_id:
        return Response({"error": "Payment reference is required."}, status=400)

    ref_key = reference or str(transaction_id)
    if PaymentTransaction.objects.filter(reference=ref_key, status="success").exists():
        existing = PaymentTransaction.objects.get(reference=ref_key, status="success")
        return Response({"order_id": existing.order_id, "message": "Already processed."})

    # ── Verify with Flutterwave ────────────────────────────────────────────
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
    except requests.exceptions.Timeout:
        return Response({"error": "Payment verification timed out. Please contact support."}, status=400)
    except Exception as e:
        logger.error(f"FLW verification failed: {e}", exc_info=True)
        return Response({"error": "Payment verification failed. Please contact support."}, status=400)

    if verify_res.status_code != 200:
        return Response({"error": "Payment verification failed."}, status=400)

    verify_data = verify_res.json()
    if verify_data.get("status") != "success" or verify_data.get("data", {}).get("status") != "successful":
        return Response({"error": "Payment was not completed successfully."}, status=400)

    flw_data = verify_data["data"]
    amount_paid = Decimal(str(flw_data["amount"]))   # what Flutterwave confirmed was paid
    buyer_email = flw_data.get("customer", {}).get("email", request.user.email)
    ref_key = flw_data.get("tx_ref", ref_key)
    flw_transaction_id = flw_data.get("id")

    # ── Recalculate pricing from listing so we have clean figures ──────────
    seller = _get_seller_from_listing(listing_id or (items[0]["listing_id"] if items else None))

    try:
        from services.models import Listing as ListingModel
        listing_obj = ListingModel.objects.get(id=listing_id) if listing_id else None
        listing_price = Decimal(str(listing_obj.price)) if listing_obj else amount_paid
    except Exception:
        listing_price = amount_paid

    # Check if this user is eligible for the profile discount
    apply_discount = False
    if use_discount:
        try:
            profile = request.user.profile
            if profile.profile_bonus_eligible and not profile.profile_bonus_used:
                apply_discount = True
        except Exception:
            pass

    pricing = calculate_pricing(listing_price, apply_discount)

    # ── Record transaction ─────────────────────────────────────────────────
    txn = PaymentTransaction.objects.create(
        buyer=request.user,
        seller=seller,
        reference=ref_key,
        flw_transaction_id=flw_transaction_id,
        amount=pricing["buyer_pays"],
        seller_amount=pricing["seller_amount"],
        service_charge=pricing["service_charge"],
        discount_amount=pricing["discount_amount"],
        platform_amount=pricing["platform_amount"],
        status="success",
        order_type=order_type,
        buyer_email=buyer_email,
        buyer_name=request.user.get_full_name() or request.user.username,
        flw_response=flw_data,
    )

    try:
        from services.models import Listing
        order_id = None

        if order_type == "service" and listing_id:
            listing = Listing.objects.get(id=listing_id)
            qty = int(request.data.get("quantity", 1))
            if listing.track_inventory:
                if listing.stock_quantity <= 0:
                    return Response({"error": f'"{listing.title}" is out of stock.'}, status=400)
                if listing.stock_quantity < qty:
                    return Response({"error": f'Only {listing.stock_quantity} of "{listing.title}" available.'}, status=400)

            order = Order.objects.create(
                buyer=request.user, listing=listing,
                amount=pricing["buyer_pays"],
                reference=ref_key, status="paid",
            )
            order_id = order.id

            try:
                listing.reduce_stock(1)
            except Exception as e:
                logger.warning(f"reduce_stock failed: {e}")

            try:
                from orders.models import Booking
                Booking.objects.filter(
                    buyer=request.user, listing=listing, status="confirmed"
                ).update(status="paid")
            except Exception as e:
                logger.warning(f"Could not update booking to paid: {e}")

            # Mark profile discount as used
            if apply_discount:
                try:
                    profile = request.user.profile
                    profile.profile_bonus_used = True
                    profile.save(update_fields=["profile_bonus_used"])
                except Exception as e:
                    logger.warning(f"Could not mark discount as used: {e}")

            try:
                from notifications.models import Notification
                discount_note = (
                    f" (₦{pricing['discount_amount']:,.0f} profile discount applied)"
                    if pricing["discount_amount"] > 0 else ""
                )
                Notification.objects.create(
                    recipient=listing.vendor,
                    notification_type='vendor_approved',
                    title=f'💰 Payment Received — {listing.title}',
                    message=(
                        f'{request.user.username} has paid for "{listing.title}". '
                        f'StudEx will transfer ₦{pricing["seller_amount"]:,.0f} to your account.'
                        f'{discount_note}'
                    ),
                    action_url='/vendor/dashboard',
                )
            except Exception as ne:
                logger.warning(f"Notification failed: {ne}")

        elif order_type == "product" and items:
            for i, item_data in enumerate(items):
                listing = Listing.objects.get(id=item_data["listing_id"])
                qty = item_data.get("quantity", 1)
                item_price = Decimal(str(listing.price))
                item_pricing = calculate_pricing(item_price * qty, False)  # no discount on products

                if listing.track_inventory:
                    if listing.stock_quantity <= 0:
                        return Response({"error": f'"{listing.title}" is out of stock.'}, status=400)
                    if listing.stock_quantity < qty:
                        return Response({"error": f'Only {listing.stock_quantity} available.'}, status=400)

                order = Order.objects.create(
                    buyer=request.user, listing=listing,
                    amount=item_pricing["buyer_pays"],
                    reference=f"{ref_key}-{item_data['listing_id']}-{i}",
                    status="paid",
                )

                try:
                    listing.reduce_stock(qty)
                except Exception as e:
                    logger.warning(f"reduce_stock failed: {e}")

                try:
                    from notifications.models import Notification
                    Notification.objects.create(
                        recipient=listing.vendor,
                        notification_type='vendor_approved',
                        title=f'💰 Payment Received — {listing.title}',
                        message=(
                            f'{request.user.username} paid for "{listing.title}" (qty: {qty}). '
                            f'StudEx will transfer ₦{item_pricing["seller_amount"]:,.0f} to your account.'
                        ),
                        action_url='/vendor/dashboard',
                    )
                except Exception as ne:
                    logger.warning(f"Notification failed: {ne}")

                if order_id is None:
                    order_id = order.id

        txn.order_id = order_id
        txn.save()

        # ── Loyalty credits (₦200 per 10 orders, from platform revenue) ──
        credits_awarded = False
        credits_amount = 0
        try:
            import importlib.util
            if importlib.util.find_spec("loyalty"):
                from loyalty.models import LoyaltyAccount, LoyaltyTransaction
                loyalty_account, _ = LoyaltyAccount.objects.get_or_create(user=request.user)
                loyalty_account.total_completed_orders = (loyalty_account.total_completed_orders or 0) + 1
                loyalty_account.save(update_fields=["total_completed_orders"])

                MILESTONE = 10
                REWARD = Decimal("200")
                if loyalty_account.total_completed_orders % MILESTONE == 0:
                    loyalty_account.credit_balance = (loyalty_account.credit_balance or Decimal("0")) + REWARD
                    loyalty_account.save(update_fields=["credit_balance"])
                    LoyaltyTransaction.objects.create(
                        account=loyalty_account, transaction_type="earned",
                        amount=REWARD,
                        description=f"Loyalty reward: {loyalty_account.total_completed_orders} orders completed!",
                    )
                    credits_awarded = True
                    credits_amount = int(REWARD)
        except Exception as e:
            logger.warning(f"Loyalty credit failed: {e}")

        response_data = {
            "order_id": order_id,
            "message": "Payment verified. Order created.",
            "pricing": {
                "listing_price":   str(pricing["listing_price"]),
                "service_charge":  str(pricing["service_charge"]),
                "discount_applied": str(pricing["discount_amount"]),
                "total_paid":      str(pricing["buyer_pays"]),
            },
        }
        if credits_awarded:
            response_data["loyalty_reward"] = {
                "awarded": True,
                "amount": credits_amount,
                "message": f"🎉 You earned ₦{credits_amount} loyalty credits!",
            }
        return Response(response_data)

    except Exception as e:
        logger.error(f"Order creation failed after payment: {e}", exc_info=True)
        return Response({
            "error": f"Payment received but order creation failed: {str(e)}",
            "reference": ref_key,
        }, status=500)


# ─────────────────────────────────────────
# CHECK PAYMENT STATUS
# ─────────────────────────────────────────

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def check_payment_status(request):
    """
    Frontend polls this after Flutterwave checkout closes.
    Returns order_id if payment was processed (either by callback or webhook).
    GET /api/payments/check-status/?tx_ref=STUDEX-BKG-xxx
    """
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
        "flw_transaction_id": t.flw_transaction_id,
        "amount": float(t.amount),
        "seller_amount": float(t.seller_amount),
        "service_charge": float(t.service_charge),
        "discount_amount": float(t.discount_amount),
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
        "pending": 0,
        "available": float(total_earned),
        "total_orders": total_orders,
        "service_charge": float(SERVICE_CHARGE),
        "commission_rate": 0,  # vendors keep 100% of their listed price
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
        return Response({"error": "Not authorized to refund this transaction."}, status=403)

    if txn.status == "refunded":
        return Response({"error": "This transaction has already been refunded."}, status=400)

    if not txn.flw_transaction_id:
        return Response({"error": "Cannot process refund automatically. Please contact support."}, status=400)

    try:
        refund_res = requests.post(
            f"{FLW_BASE}/transactions/{txn.flw_transaction_id}/refund",
            headers=FLW_HEADERS,
            json={"amount": float(txn.amount), "comments": reason},
            timeout=15,
        )

        if refund_res.status_code in [200, 201]:
            txn.status = "refunded"
            txn.save()

            try:
                from notifications.models import Notification
                Notification.objects.create(
                    recipient=txn.buyer,
                    notification_type='refund_processed',
                    title='💸 Refund Initiated',
                    message=(
                        f'Your refund of ₦{txn.amount:,.0f} has been initiated. '
                        f'It will return to your original payment method within 3-5 business days.'
                    ),
                    action_url='/account/orders',
                )
            except Exception as ne:
                logger.warning(f"Refund notification failed: {ne}")

            return Response({
                "message": "Refund initiated. Amount returns within 3-5 business days.",
                "reference": reference,
                "amount": float(txn.amount),
            })

        error_data = refund_res.json()
        return Response({"error": error_data.get("message", "Refund failed. Please contact support.")}, status=400)

    except Exception as e:
        logger.error(f"Refund failed: {e}", exc_info=True)
        return Response({"error": "Refund request failed. Please contact support."}, status=400)


# ─────────────────────────────────────────
# FLUTTERWAVE WEBHOOK
# ─────────────────────────────────────────

import json
from django.views.decorators.csrf import csrf_exempt
from django.http import HttpResponse


@csrf_exempt
def flutterwave_webhook(request):
    if request.method != "POST":
        return HttpResponse(status=405)

    flw_signature = request.headers.get("verif-hash", "")
    if flw_signature != settings.FLW_WEBHOOK_HASH:
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
        tx_ref = data.get("tx_ref")
        flw_transaction_id = data.get("id")
        amount_paid = Decimal(str(data.get("amount", 0)))

        if PaymentTransaction.objects.filter(reference=tx_ref, status="success").exists():
            return HttpResponse(status=200)

        customer_email = data.get("customer", {}).get("email")
        try:
            from django.contrib.auth import get_user_model
            User = get_user_model()
            buyer = User.objects.filter(email=customer_email).first()
        except Exception:
            buyer = None

        if buyer:
            meta = data.get("meta", {})
            listing_id = meta.get("listing_id")
            seller = _get_seller_from_listing(listing_id)

            # Reconstruct pricing from listing if possible
            try:
                from services.models import Listing
                listing_obj = Listing.objects.get(id=listing_id) if listing_id else None
                listing_price = Decimal(str(listing_obj.price)) if listing_obj else amount_paid
            except Exception:
                listing_price = amount_paid - SERVICE_CHARGE  # best estimate

            pricing = calculate_pricing(listing_price, False)

            PaymentTransaction.objects.get_or_create(
                reference=tx_ref,
                defaults={
                    "buyer": buyer,
                    "seller": seller,
                    "amount": amount_paid,
                    "flw_transaction_id": flw_transaction_id,
                    "seller_amount": pricing["seller_amount"],
                    "service_charge": pricing["service_charge"],
                    "discount_amount": pricing["discount_amount"],
                    "platform_amount": pricing["platform_amount"],
                    "status": "success",
                    "order_type": meta.get("type", "product"),
                    "buyer_email": customer_email,
                    "buyer_name": buyer.get_full_name() or buyer.username,
                    "flw_response": data,
                }
            )

    return HttpResponse(status=200)


# ─────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────

def _create_or_update_flw_subaccount(user, bank_code, account_number, account_name):
    """
    Registers vendor with Flutterwave for identity and manual payout use.
    No longer used for split payments at checkout.
    Stores subaccount_id (RS_xxx string) not data.id (integer).
    """
    try:
        existing = SellerBankAccount.objects.filter(user=user).first()
        payload = {
            "account_bank": bank_code,
            "account_number": account_number,
            "business_name": getattr(user, "business_name", None) or user.username,
            "business_email": user.email,
            "country": "NG",
            "split_type": "percentage",
            "split_value": 0,  # 0% split — full amount goes to StudEx
        }

        if existing and existing.flw_subaccount_id:
            res = requests.put(
                f"{FLW_BASE}/subaccounts/{existing.flw_subaccount_id}",
                headers=FLW_HEADERS, json=payload, timeout=15,
            )
        else:
            res = requests.post(
                f"{FLW_BASE}/subaccounts",
                headers=FLW_HEADERS, json=payload, timeout=15,
            )

        if res.status_code in [200, 201]:
            data = res.json().get("data", {})
            subaccount_id = data.get("subaccount_id") or str(data.get("id", ""))
            logger.info(f"FLW subaccount registered: {subaccount_id} for {user.username}")
            return subaccount_id

        logger.error(f"FLW subaccount error: {res.status_code} {res.text[:200]}")
        return None

    except Exception as e:
        logger.error(f"Subaccount creation failed: {e}", exc_info=True)
        return None


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
        "044": "Access Bank", "023": "Citibank", "050": "Ecobank Nigeria",
        "070": "Fidelity Bank", "011": "First Bank of Nigeria", "214": "FCMB",
        "058": "Guaranty Trust Bank", "030": "Heritage Bank", "082": "Keystone Bank",
        "526": "OPay", "999991": "PalmPay", "076": "Polaris Bank",
        "101": "Providus Bank", "221": "Stanbic IBTC", "068": "Standard Chartered",
        "232": "Sterling Bank", "032": "Union Bank", "033": "UBA",
        "215": "Unity Bank", "035": "Wema Bank", "057": "Zenith Bank",
        "090405": "Moniepoint MFB", "999992": "Kuda Bank",
    }
    return BANKS.get(str(bank_code), "Unknown Bank")