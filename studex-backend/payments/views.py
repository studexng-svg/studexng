# payments/views.py
import requests
import logging
from decimal import Decimal
from django.conf import settings
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from orders.models import Order
from .models import SellerBankAccount, PaymentTransaction

logger = logging.getLogger(__name__)

FLW_SECRET = settings.FLW_SECRET_KEY
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
                "flw_subaccount_id": account.paystack_subaccount_code,
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
            "paystack_subaccount_code": subaccount_id,
        }
    )

    return Response({
        "message": "Bank account saved successfully.",
        "account_name": account.account_name,
        "bank_name": account.bank_name,
        "flw_subaccount_id": subaccount_id,
    }, status=201)


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

    res = requests.post(
        f"{FLW_BASE}/accounts/resolve",
        headers=FLW_HEADERS,
        json={"account_number": account_number, "account_bank": bank_code},
    )

    if res.status_code == 200 and res.json().get("status") == "success":
        data = res.json().get("data", {})
        return Response({"account_name": data.get("account_name", "")})

    return Response({"error": "Could not verify account. Please check the details."}, status=400)


# ─────────────────────────────────────────
# VERIFY PAYMENT + CREATE ORDER
# ─────────────────────────────────────────

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def verify_payment(request):
    reference = request.data.get("reference")  # Flutterwave tx_ref
    transaction_id = request.data.get("transaction_id")  # Flutterwave transaction_id
    order_type = request.data.get("order_type", "product")
    listing_id = request.data.get("listing_id")
    items = request.data.get("items", [])
    use_credits = request.data.get("use_credits", False)

    if not reference and not transaction_id:
        return Response({"error": "Payment reference is required."}, status=400)

    # Prevent duplicate processing
    ref_key = reference or str(transaction_id)
    if PaymentTransaction.objects.filter(reference=ref_key, status="success").exists():
        existing = PaymentTransaction.objects.get(reference=ref_key, status="success")
        return Response({"order_id": existing.order_id, "message": "Already processed."})

    # Verify with Flutterwave
    if transaction_id:
        verify_res = requests.get(
            f"{FLW_BASE}/transactions/{transaction_id}/verify",
            headers=FLW_HEADERS,
        )
    else:
        verify_res = requests.get(
            f"{FLW_BASE}/transactions/verify_by_reference?tx_ref={reference}",
            headers=FLW_HEADERS,
        )

    if verify_res.status_code != 200:
        logger.error(f"Flutterwave verification HTTP error: {verify_res.status_code}")
        return Response({"error": "Payment verification failed."}, status=400)

    verify_data = verify_res.json()

    if verify_data.get("status") != "success" or verify_data.get("data", {}).get("status") != "successful":
        logger.error(f"Payment not successful: {verify_data}")
        return Response({"error": "Payment was not completed successfully."}, status=400)

    flw_data = verify_data["data"]
    amount_paid = Decimal(str(flw_data["amount"]))
    buyer_email = flw_data.get("customer", {}).get("email", request.user.email)
    ref_key = flw_data.get("tx_ref", ref_key)

    seller_rate, platform_rate = get_commission_split(amount_paid)
    seller_amount = (amount_paid * seller_rate).quantize(Decimal("0.01"))
    platform_amount = (amount_paid * platform_rate).quantize(Decimal("0.01"))

    seller = _get_seller_from_listing(listing_id or (items[0]["listing_id"] if items else None))

    txn = PaymentTransaction.objects.create(
        buyer=request.user,
        seller=seller,
        reference=ref_key,
        amount=amount_paid,
        seller_amount=seller_amount,
        platform_amount=platform_amount,
        status="success",
        order_type=order_type,
        buyer_email=buyer_email,
        buyer_name=request.user.get_full_name() or request.user.username,
        paystack_response=flw_data,
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
                    return Response({"error": f'Only {listing.stock_quantity} of "{listing.title}" available. Stock limit exceeded.'}, status=400)

            order = Order.objects.create(
                buyer=request.user, listing=listing,
                amount=amount_paid, reference=ref_key, status="paid",
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
                logger.warning(f"Could not update booking status to paid: {e}")

            # Notify vendor
            try:
                from notifications.models import Notification
                Notification.objects.create(
                    recipient=listing.vendor,
                    notification_type='vendor_approved',
                    title=f'💰 Payment Received — {listing.title}',
                    message=(
                        f'{request.user.username} has paid ₦{amount_paid:,.0f} for '
                        f'"{listing.title}". Funds are held in escrow.'
                    ),
                    action_url='/vendor/dashboard',
                )
                logger.info(f"[StudEx] Payment notification sent to {listing.vendor.username}")
            except Exception as ne:
                logger.warning(f"Payment notification failed: {ne}")

        elif order_type == "product" and items:
            for i, item_data in enumerate(items):
                listing = Listing.objects.get(id=item_data["listing_id"])
                qty = item_data.get("quantity", 1)

                if listing.track_inventory:
                    if listing.stock_quantity <= 0:
                        return Response({"error": f'"{listing.title}" is out of stock.'}, status=400)
                    if listing.stock_quantity < qty:
                        return Response({"error": f'Only {listing.stock_quantity} of "{listing.title}" available. You requested {qty}. Stock limit exceeded.'}, status=400)

                order = Order.objects.create(
                    buyer=request.user, listing=listing,
                    amount=listing.price * qty,
                    reference=f"{ref_key}-{item_data['listing_id']}-{i}",
                    status="paid",
                )

                try:
                    listing.reduce_stock(qty)
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
                            f'{request.user.username} has paid ₦{listing.price * qty:,.0f} for '
                            f'"{listing.title}" (qty: {qty}). Funds are held in escrow.'
                        ),
                        action_url='/vendor/dashboard',
                    )
                except Exception as ne:
                    logger.warning(f"Product payment notification failed: {ne}")

                if order_id is None:
                    order_id = order.id

        txn.order_id = order_id
        txn.save()

        # Deduct loyalty credits
        credits_used = Decimal("0")
        if use_credits:
            try:
                import importlib.util
                if importlib.util.find_spec("loyalty"):
                    from loyalty.models import LoyaltyAccount, LoyaltyTransaction
                    loyalty_account = LoyaltyAccount.objects.filter(user=request.user).first()
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

        return Response({
            "order_id": order_id,
            "message": "Payment verified. Order created.",
            "credits_used": float(credits_used),
        })

    except Exception as e:
        logger.error(f"Order creation failed after payment: {e}", exc_info=True)
        return Response({
            "error": f"Payment received but order creation failed: {str(e)}",
            "reference": ref_key,
        }, status=500)


# ─────────────────────────────────────────
# SELLER TRANSACTIONS
# ─────────────────────────────────────────

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def seller_transactions(request):
    txns = PaymentTransaction.objects.filter(
        seller=request.user, status="success"
    ).order_by("-created_at")[:50]

    data = []
    for t in txns:
        data.append({
            "id": t.id, "reference": t.reference,
            "amount": float(t.amount), "seller_amount": float(t.seller_amount),
            "platform_amount": float(t.platform_amount), "order_type": t.order_type,
            "buyer_name": t.buyer_name, "buyer_email": t.buyer_email,
            "order_id": t.order_id, "created_at": t.created_at.isoformat(),
        })
    return Response(data)


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

    # Flutterwave refund
    refund_res = requests.post(
        f"{FLW_BASE}/transactions/{reference}/refund",
        headers=FLW_HEADERS,
        json={"amount": float(txn.amount), "comments": reason},
    )

    if refund_res.status_code in [200, 201]:
        txn.status = "refunded"
        txn.save()
        return Response({
            "message": "Refund initiated. Amount returns to original payment method within 3-5 business days.",
            "reference": reference, "amount": float(txn.amount),
        })

    error_data = refund_res.json()
    logger.error(f"Flutterwave refund failed: {error_data}")
    return Response({"error": error_data.get("message", "Refund failed. Please contact support.")}, status=400)


# ─────────────────────────────────────────
# SELLER EARNINGS
# ─────────────────────────────────────────

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def seller_earnings(request):
    user = request.user
    from django.db.models import Sum

    total_orders = Order.objects.filter(listing__vendor=user).count()

    try:
        from wallet.models import EscrowTransaction
        escrows = EscrowTransaction.objects.filter(seller=user)
        total_earned = escrows.filter(status="released").aggregate(Sum("seller_amount"))["seller_amount__sum"] or 0
        pending = escrows.filter(status="held").aggregate(Sum("seller_amount"))["seller_amount__sum"] or 0
    except Exception:
        txns = PaymentTransaction.objects.filter(seller=user, status="success")
        total_earned = txns.aggregate(Sum("seller_amount"))["seller_amount__sum"] or 0
        pending = 0

    commission_rate = 30 if total_orders < 10 else (20 if total_orders < 50 else 15)

    return Response({
        "total_earned": float(total_earned), "pending": float(pending),
        "available": float(total_earned), "total_orders": total_orders,
        "commission_rate": commission_rate,
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
            f"🎉 5% profile completion discount applied — you save ₦{discount_amount:,.2f}!"
            if has_discount else None
        ),
    })

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
            "split_value": 0.7,  # vendor gets 70%
        }

        if existing and existing.paystack_subaccount_code:
            res = requests.put(
                f"{FLW_BASE}/subaccounts/{existing.paystack_subaccount_code}",
                headers=FLW_HEADERS, json=payload,
            )
        else:
            res = requests.post(
                f"{FLW_BASE}/subaccounts",
                headers=FLW_HEADERS, json=payload,
            )

        if res.status_code in [200, 201]:
            return res.json()["data"]["id"]

        logger.error(f"Flutterwave subaccount error: {res.text}")
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


# ─────────────────────────────────────────
# FLUTTERWAVE WEBHOOK
# ─────────────────────────────────────────

import hashlib
import hmac
import json
from django.views.decorators.csrf import csrf_exempt
from django.http import HttpResponse

@csrf_exempt
def flutterwave_webhook(request):
    if request.method != "POST":
        return HttpResponse(status=405)

    # Verify Flutterwave signature
    flw_signature = request.headers.get("verif-hash", "")
    secret_hash = settings.FLW_WEBHOOK_HASH

    if flw_signature != secret_hash:
        logger.warning("Flutterwave webhook: invalid signature")
        return HttpResponse(status=401)

    try:
        payload = json.loads(request.body)
    except Exception:
        return HttpResponse(status=400)

    event = payload.get("event")
    data = payload.get("data", {})

    logger.info(f"Flutterwave webhook received: {event}")

    if event == "charge.completed":
        if data.get("status") == "successful":
            tx_ref = data.get("tx_ref")
            transaction_id = data.get("id")
            amount = Decimal(str(data.get("amount", 0)))

            if PaymentTransaction.objects.filter(reference=tx_ref, status="success").exists():
                logger.info(f"Webhook: {tx_ref} already processed")
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
                seller_rate, platform_rate = get_commission_split(amount)
                seller_amount = (amount * seller_rate).quantize(Decimal("0.01"))
                platform_amount = (amount * platform_rate).quantize(Decimal("0.01"))

                PaymentTransaction.objects.get_or_create(
                    reference=tx_ref,
                    defaults={
                        "buyer": buyer, "seller": seller, "amount": amount,
                        "seller_amount": seller_amount, "platform_amount": platform_amount,
                        "status": "success", "order_type": meta.get("type", "product"),
                        "buyer_email": customer_email,
                        "buyer_name": buyer.get_full_name() or buyer.username,
                        "paystack_response": data,
                    }
                )

    return HttpResponse(status=200)