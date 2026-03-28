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


def get_commission_split(amount: Decimal):
    if amount < Decimal("5000"):
        platform_rate = Decimal("0.30")
    elif amount <= Decimal("20000"):
        platform_rate = Decimal("0.20")
    else:
        platform_rate = Decimal("0.15")
    seller_rate = Decimal("1") - platform_rate
    return seller_rate, platform_rate


def _create_order_from_flw_data(flw_data, buyer, listing_id, order_type, use_credits=False):
    """
    Core order creation logic. Called from both verify_payment and the webhook.
    Returns (order_id, error_message).
    """
    from services.models import Listing

    amount_paid = Decimal(str(flw_data["amount"]))
    ref_key = flw_data.get("tx_ref", "")
    flw_transaction_id = flw_data.get("id")
    buyer_email = flw_data.get("customer", {}).get("email", buyer.email if buyer else "")

    seller_rate, platform_rate = get_commission_split(amount_paid)
    seller_amount = (amount_paid * seller_rate).quantize(Decimal("0.01"))
    platform_amount = (amount_paid * platform_rate).quantize(Decimal("0.01"))

    seller = _get_seller_from_listing(listing_id)

    # Create or get transaction record
    txn, created = PaymentTransaction.objects.get_or_create(
        reference=ref_key,
        defaults={
            "buyer": buyer,
            "seller": seller,
            "flw_transaction_id": flw_transaction_id,
            "amount": amount_paid,
            "seller_amount": seller_amount,
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
        if order_type == "service" and listing_id:
            listing = Listing.objects.get(id=listing_id)

            order = Order.objects.create(
                buyer=buyer,
                listing=listing,
                amount=amount_paid,
                reference=ref_key,
                status="paid",
            )
            order_id = order.id

            # Update booking status to paid
            try:
                from orders.models import Booking
                Booking.objects.filter(
                    buyer=buyer, listing=listing, status="confirmed"
                ).update(status="paid")
            except Exception as e:
                logger.warning(f"Booking status update failed: {e}")

            # Reduce stock
            try:
                listing.reduce_stock(1)
            except Exception as e:
                logger.warning(f"reduce_stock failed: {e}")

            # Notify vendor
            try:
                from notifications.models import Notification
                Notification.objects.create(
                    recipient=listing.vendor,
                    notification_type='vendor_approved',
                    title=f'💰 Payment Received — {listing.title}',
                    message=(
                        f'{buyer.username} has paid ₦{amount_paid:,.0f} for '
                        f'"{listing.title}". Flutterwave will transfer your share within 1-2 business days.'
                    ),
                    action_url='/vendor/dashboard',
                )
            except Exception as ne:
                logger.warning(f"Vendor notification failed: {ne}")

    except Exception as e:
        logger.error(f"Order creation failed: {e}", exc_info=True)
        return None, str(e)

    # Save order_id to transaction
    txn.order_id = order_id
    txn.status = "success"
    txn.save()

    # Handle loyalty credits
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
                    amount=credits_used, description=f"Credits used on order #{order_id}",
                )
        except Exception as e:
            logger.warning(f"Loyalty deduction failed: {e}")

    return order_id, None


# ─────────────────────────────────────────
# GET BANKS — backend proxy (avoids CORS)
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
    except Exception as e:
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

    subaccount_id = _create_or_update_flw_subaccount(request.user, bank_code, account_number, account_name)
    if not subaccount_id:
        return Response({"error": "Failed to register with Flutterwave. Check your bank details."}, status=400)

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
    return Response({
        "message": "Bank account saved successfully.",
        "account_name": account.account_name,
        "bank_name": account.bank_name,
        "flw_subaccount_id": subaccount_id,
    }, status=201)


# ─────────────────────────────────────────
# VERIFY PAYMENT — called from frontend callback
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

    # Already processed — return existing order_id
    existing = PaymentTransaction.objects.filter(reference=ref_key, status="success").first()
    if existing and existing.order_id:
        return Response({"order_id": existing.order_id, "message": "Already processed."})

    # Verify with Flutterwave
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
        order_type=order_type,
        use_credits=use_credits,
    )

    if error:
        return Response({"error": f"Payment received but order failed: {error}", "reference": ref_key}, status=500)

    return Response({"order_id": order_id, "message": "Payment verified. Order created."})


# ─────────────────────────────────────────
# CHECK PAYMENT STATUS — frontend polls this
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
    commission_rate = 30 if total_orders < 10 else (20 if total_orders < 50 else 15)
    return Response({
        "total_earned": float(total_earned),
        "pending": 0,
        "available": float(total_earned),
        "total_orders": total_orders,
        "commission_rate": commission_rate,
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
            return Response({"message": "Refund initiated. Returns within 3-5 business days.", "amount": float(txn.amount)})
        return Response({"error": refund_res.json().get("message", "Refund failed.")}, status=400)
    except Exception as e:
        return Response({"error": "Refund request failed. Contact support."}, status=400)


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
        "discount_message": f"🎉 5% discount applied — you save ₦{discount_amount:,.2f}!" if has_discount else None,
    })


# ─────────────────────────────────────────
# FLUTTERWAVE WEBHOOK
# The webhook fires server-side when payment completes.
# This is the RELIABLE path — always creates order even if frontend callback fails.
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

        # Already processed
        if PaymentTransaction.objects.filter(reference=tx_ref, status="success").exists():
            existing = PaymentTransaction.objects.get(reference=tx_ref, status="success")
            if existing.order_id:
                logger.info(f"Webhook: {tx_ref} already has order {existing.order_id}")
                return HttpResponse(status=200)

        customer_email = data.get("customer", {}).get("email", "")
        meta = data.get("meta", {}) or {}
        listing_id = meta.get("listing_id")
        order_type = meta.get("type", "service")
        if "booking" in str(order_type):
            order_type = "service"

        # Find buyer
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
                logger.info(f"Webhook created order {order_id} for tx_ref {tx_ref}")
        else:
            # Store transaction even without buyer/listing for audit
            seller = _get_seller_from_listing(listing_id)
            amount = Decimal(str(data.get("amount", 0)))
            seller_rate, platform_rate = get_commission_split(amount)
            PaymentTransaction.objects.get_or_create(
                reference=tx_ref,
                defaults={
                    "buyer": buyer,
                    "seller": seller,
                    "amount": amount,
                    "seller_amount": (amount * seller_rate).quantize(Decimal("0.01")),
                    "platform_amount": (amount * platform_rate).quantize(Decimal("0.01")),
                    "status": "success",
                    "order_type": order_type,
                    "buyer_email": customer_email,
                    "flw_response": data,
                }
            )

    return HttpResponse(status=200)


# ─────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────

def _create_or_update_flw_subaccount(user, bank_code, account_number, account_name):
    try:
        existing = SellerBankAccount.objects.filter(user=user).first()
        payload = {
            "account_bank": bank_code,
            "account_number": account_number,
            "business_name": getattr(user, "business_name", None) or user.username,
            "business_email": user.email,
            "country": "NG",
            "split_type": "percentage",
            "split_value": 0.7,
        }
        if existing and existing.flw_subaccount_id:
            res = requests.put(f"{FLW_BASE}/subaccounts/{existing.flw_subaccount_id}", headers=FLW_HEADERS, json=payload, timeout=15)
        else:
            res = requests.post(f"{FLW_BASE}/subaccounts", headers=FLW_HEADERS, json=payload, timeout=15)

        if res.status_code in [200, 201]:
            data = res.json().get("data", {})
            return data.get("subaccount_id") or str(data.get("id", ""))
        logger.error(f"FLW subaccount error: {res.text[:300]}")
        return None
    except Exception as e:
        logger.error(f"Subaccount creation failed: {e}")
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
        "044": "Access Bank", "050": "Ecobank Nigeria", "070": "Fidelity Bank",
        "011": "First Bank of Nigeria", "214": "FCMB", "058": "Guaranty Trust Bank",
        "030": "Heritage Bank", "082": "Keystone Bank", "526": "OPay",
        "999991": "PalmPay", "076": "Polaris Bank", "101": "Providus Bank",
        "221": "Stanbic IBTC", "232": "Sterling Bank", "032": "Union Bank",
        "033": "UBA", "215": "Unity Bank", "035": "Wema Bank", "057": "Zenith Bank",
        "090405": "Moniepoint MFB", "999992": "Kuda Bank",
    }
    return BANKS.get(str(bank_code), "Unknown Bank")