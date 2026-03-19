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

PAYSTACK_SECRET = settings.PAYSTACK_SECRET_KEY
PAYSTACK_HEADERS = {"Authorization": f"Bearer {PAYSTACK_SECRET}", "Content-Type": "application/json"}
PLATFORM_PERCENTAGE = 30.0  # default — overridden by tiered logic at payment time


def get_commission_split(amount: Decimal):
    """
    Tiered commission:
    - Under ₦5,000  → 30% platform, 70% seller
    - ₦5,000–₦20,000 → 20% platform, 80% seller
    - Above ₦20,000  → 15% platform, 85% seller
    """
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
    """GET: return saved bank account. POST: save + create/update Paystack subaccount."""

    if request.method == "GET":
        try:
            account = SellerBankAccount.objects.get(user=request.user)
            return Response({
                "bank_code": account.bank_code,
                "bank_name": account.bank_name,
                "account_number": account.account_number,
                "account_name": account.account_name,
                "paystack_subaccount_code": account.paystack_subaccount_code,
            })
        except SellerBankAccount.DoesNotExist:
            return Response({}, status=200)

    # POST
    bank_code = request.data.get("bank_code")
    account_number = str(request.data.get("account_number", ""))
    account_name = request.data.get("account_name")
    bank_name = request.data.get("bank_name", "") or _get_bank_name(bank_code)

    if not account_number or len(account_number) != 10:
        return Response({"error": "Account number must be 10 digits."}, status=400)

    if not all([bank_code, account_number, account_name]):
        return Response({"error": "bank_code, account_number, and account_name are required."}, status=400)

    subaccount_code = _create_or_update_paystack_subaccount(
        request.user, bank_code, account_number, account_name
    )

    if not subaccount_code:
        return Response({"error": "Failed to register with Paystack. Check your bank details."}, status=400)

    account, _ = SellerBankAccount.objects.update_or_create(
        user=request.user,
        defaults={
            "bank_code": bank_code,
            "bank_name": bank_name,
            "account_number": account_number,
            "account_name": account_name,
            "paystack_subaccount_code": subaccount_code,
        }
    )

    return Response({
        "message": "Bank account saved successfully.",
        "account_name": account.account_name,
        "bank_name": account.bank_name,
        "paystack_subaccount_code": subaccount_code,
    }, status=201)


# ─────────────────────────────────────────
# VERIFY BANK ACCOUNT (auto-fill account name)
# ─────────────────────────────────────────

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def verify_bank_account(request):
    """Calls Paystack to resolve account name from account number + bank code."""
    account_number = request.data.get("account_number")
    bank_code = request.data.get("bank_code")

    if not account_number or not bank_code:
        return Response({"error": "account_number and bank_code required."}, status=400)

    res = requests.get(
        f"https://api.paystack.co/bank/resolve?account_number={account_number}&bank_code={bank_code}",
        headers=PAYSTACK_HEADERS,
    )

    if res.status_code == 200:
        data = res.json().get("data", {})
        return Response({"account_name": data.get("account_name", "")})

    return Response({"error": "Could not verify account. Please check the details."}, status=400)


# ─────────────────────────────────────────
# VERIFY PAYMENT + CREATE ORDER
# ─────────────────────────────────────────

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def verify_payment(request):
    """
    Called after Paystack payment succeeds on the frontend.
    1. Verifies payment with Paystack
    2. Logs the transaction (with split amounts)
    3. Creates the order(s)
    """
    reference = request.data.get("reference")
    order_type = request.data.get("order_type", "product")
    listing_id = request.data.get("listing_id")
    items = request.data.get("items", [])
    use_credits = request.data.get("use_credits", False)

    if not reference:
        return Response({"error": "Payment reference is required."}, status=400)

    # Prevent duplicate processing
    if PaymentTransaction.objects.filter(reference=reference, status="success").exists():
        existing = PaymentTransaction.objects.get(reference=reference, status="success")
        return Response({"order_id": existing.order_id, "message": "Already processed."})

    # Verify with Paystack
    verify_res = requests.get(
        f"https://api.paystack.co/transaction/verify/{reference}",
        headers=PAYSTACK_HEADERS,
    )

    if verify_res.status_code != 200:
        logger.error(f"Paystack verification HTTP error: {verify_res.status_code}")
        return Response({"error": "Payment verification failed."}, status=400)

    verify_data = verify_res.json()

    if not verify_data.get("status") or verify_data.get("data", {}).get("status") != "success":
        logger.error(f"Payment not successful: {verify_data}")
        return Response({"error": "Payment was not completed successfully."}, status=400)

    paystack_data = verify_data["data"]
    amount_paid = Decimal(str(paystack_data["amount"])) / 100
    buyer_email = paystack_data.get("customer", {}).get("email", request.user.email)

    seller_rate, platform_rate = get_commission_split(amount_paid)
    seller_amount = (amount_paid * seller_rate).quantize(Decimal("0.01"))
    platform_amount = (amount_paid * platform_rate).quantize(Decimal("0.01"))

    seller = _get_seller_from_listing(listing_id or (items[0]["listing_id"] if items else None))

    txn = PaymentTransaction.objects.create(
        buyer=request.user,
        seller=seller,
        reference=reference,
        amount=amount_paid,
        seller_amount=seller_amount,
        platform_amount=platform_amount,
        status="success",
        order_type=order_type,
        buyer_email=buyer_email,
        buyer_name=request.user.get_full_name() or request.user.username,
        paystack_response=paystack_data,
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
                buyer=request.user,
                listing=listing,
                amount=amount_paid,
                reference=reference,
                status="paid",
            )
            order_id = order.id
            # Reduce inventory stock if tracked
            try:
                listing.reduce_stock(1)
            except Exception as e:
                logger.warning(f"reduce_stock failed: {e}")
            # Mark the booking as paid so Pay Now button disappears
            try:
                from orders.models import Booking
                Booking.objects.filter(
                    buyer=request.user,
                    listing=listing,
                    status="confirmed"
                ).update(status="paid")
            except Exception as e:
                logger.warning(f"Could not update booking status to paid: {e}")

            # Notify vendor that payment has been received — always fire this
            # Notify vendor of payment
            try:
                from notifications.models import Notification
                Notification.objects.create(
                    recipient=listing.vendor,
                    notification_type='vendor_approved',
                    title=f'💰 Payment Received — {listing.title}',
                    message=(
                        f'{request.user.username} has paid ₦{listing.price:,.0f} for '
                        f'"{listing.title}". Funds are held in escrow.'
                    ),
                    action_url='/vendor/dashboard',
                )
            except Exception as ne:
                logger.warning(f"Payment notification failed: {ne}")

        elif order_type == "product" and items:
            for i, item_data in enumerate(items):
                listing = Listing.objects.get(id=item_data["listing_id"])
                qty = item_data.get("quantity", 1)
                # Block if quantity exceeds stock
                if listing.track_inventory:
                    if listing.stock_quantity <= 0:
                        return Response({"error": f'"{listing.title}" is out of stock.'}, status=400)
                    if listing.stock_quantity < qty:
                        return Response({"error": f'Only {listing.stock_quantity} of "{listing.title}" available. You requested {qty}. Stock limit exceeded.'}, status=400)
                order = Order.objects.create(
                    buyer=request.user,
                    listing=listing,
                    amount=listing.price * item_data.get("quantity", 1),
                    reference=f"{reference}-{item_data['listing_id']}-{i}",
                    status="paid",
                )
                # Reduce inventory stock if tracked
                try:
                    listing.reduce_stock(item_data.get("quantity", 1))
                except Exception as e:
                    logger.warning(f"reduce_stock failed: {e}")
                # Notify vendor of payment
                try:
                    from notifications.models import Notification
                    item_amount = listing.price * item_data.get("quantity", 1)
                    Notification.objects.create(
                        recipient=listing.vendor,
                        notification_type='vendor_approved',
                        title=f'💰 Payment Received — {listing.title}',
                        message=(
                            f'{request.user.username} has paid ₦{item_amount:,.0f} for '
                            f'"{listing.title}" (qty: {item_data.get("quantity", 1)}). '
                            f'Funds are held in escrow until the order is completed.'
                        ),
                        action_url='/vendor/dashboard',
                    )
                except Exception as ne:
                    logger.warning(f"Product payment notification failed: {ne}")
                if order_id is None:
                    order_id = order.id

        txn.order_id = order_id
        txn.save()

        # Deduct loyalty credits if buyer opted in
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
                            account=loyalty_account,
                            transaction_type="redeemed",
                            amount=credits_used,
                            description=f"Credits used on order #{order_id}",
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
            "reference": reference,
        }, status=500)


# ─────────────────────────────────────────
# SELLER TRANSACTIONS
# ─────────────────────────────────────────

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def seller_transactions(request):
    """Returns a list of successful payment transactions for the logged-in vendor."""
    txns = PaymentTransaction.objects.filter(
        seller=request.user, status="success"
    ).order_by("-created_at")[:50]

    data = []
    for t in txns:
        data.append({
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

    refund_res = requests.post(
        "https://api.paystack.co/refund",
        headers=PAYSTACK_HEADERS,
        json={
            "transaction": reference,
            "amount": int(txn.amount * 100),
            "customer_note": reason,
            "merchant_note": f"Refund for order {txn.order_id} - {reason}",
        },
    )

    if refund_res.status_code in [200, 201]:
        txn.status = "refunded"
        txn.save()
        return Response({
            "message": "Refund initiated. Amount returns to original payment method within 3-5 business days.",
            "reference": reference,
            "amount": float(txn.amount),
        })

    error_data = refund_res.json()
    logger.error(f"Paystack refund failed: {error_data}")
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

    # Try escrow model if it exists, else fall back to payment transactions
    try:
        from wallet.models import EscrowTransaction
        escrows = EscrowTransaction.objects.filter(seller=user)
        total_earned = escrows.filter(status="released").aggregate(Sum("seller_amount"))["seller_amount__sum"] or 0
        pending = escrows.filter(status="held").aggregate(Sum("seller_amount"))["seller_amount__sum"] or 0
    except Exception:
        # Fallback: calculate from PaymentTransactions
        txns = PaymentTransaction.objects.filter(seller=user, status="success")
        total_earned = txns.aggregate(Sum("seller_amount"))["seller_amount__sum"] or 0
        pending = 0

    if total_orders >= 50:
        commission_rate = 15
    elif total_orders >= 10:
        commission_rate = 20
    else:
        commission_rate = 30

    return Response({
        "total_earned": float(total_earned),
        "pending": float(pending),
        "available": float(total_earned),
        "total_orders": total_orders,
        "commission_rate": commission_rate,
    })


# ─────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────

def _create_or_update_paystack_subaccount(user, bank_code, account_number, account_name):
    """Creates or updates a Paystack subaccount for the seller."""
    try:
        existing = SellerBankAccount.objects.filter(user=user).first()

        payload = {
            "business_name": getattr(user, "business_name", None) or user.username,
            "settlement_bank": bank_code,
            "account_number": account_number,
            "percentage_charge": PLATFORM_PERCENTAGE,
        }

        if existing and existing.paystack_subaccount_code:
            res = requests.put(
                f"https://api.paystack.co/subaccount/{existing.paystack_subaccount_code}",
                headers=PAYSTACK_HEADERS,
                json=payload,
            )
        else:
            res = requests.post(
                "https://api.paystack.co/subaccount",
                headers=PAYSTACK_HEADERS,
                json=payload,
            )

        if res.status_code in [200, 201]:
            return res.json()["data"]["subaccount_code"]

        logger.error(f"Paystack subaccount error: {res.text}")
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
# PAYSTACK WEBHOOK
# ─────────────────────────────────────────

import hashlib
import hmac
import json
from django.views.decorators.csrf import csrf_exempt
from django.http import HttpResponse

@csrf_exempt
def paystack_webhook(request):
    """
    Paystack sends POST requests here for payment events.
    Verify signature, then handle charge.success to mark orders/bookings paid.
    Set this URL in your Paystack Dashboard → Settings → Webhooks.
    """
    if request.method != "POST":
        return HttpResponse(status=405)

    # Verify Paystack signature
    paystack_signature = request.headers.get("x-paystack-signature", "")
    computed = hmac.new(
        PAYSTACK_SECRET.encode("utf-8"),
        request.body,
        hashlib.sha512
    ).hexdigest()

    if not hmac.compare_digest(computed, paystack_signature):
        logger.warning("Paystack webhook: invalid signature")
        return HttpResponse(status=401)

    try:
        payload = json.loads(request.body)
    except Exception:
        return HttpResponse(status=400)

    event = payload.get("event")
    data = payload.get("data", {})

    logger.info(f"Paystack webhook received: {event}")

    if event == "charge.success":
        reference = data.get("reference")
        amount_kobo = data.get("amount", 0)
        amount = Decimal(str(amount_kobo)) / 100

        # Already processed via verify endpoint? Skip duplicate
        if PaymentTransaction.objects.filter(reference=reference, status="success").exists():
            logger.info(f"Webhook: reference {reference} already processed, skipping.")
            return HttpResponse(status=200)

        # Find buyer from metadata or email
        customer_email = data.get("customer", {}).get("email")
        try:
            from django.contrib.auth import get_user_model
            User = get_user_model()
            buyer = User.objects.filter(email=customer_email).first()
        except Exception:
            buyer = None

        # Log the transaction if not already logged
        if buyer and not PaymentTransaction.objects.filter(reference=reference).exists():
            metadata = data.get("metadata", {})
            custom_fields = {cf["variable_name"]: cf["value"] for cf in metadata.get("custom_fields", [])}
            listing_id = custom_fields.get("listing_id")
            seller = _get_seller_from_listing(listing_id)
            seller_rate, platform_rate = get_commission_split(amount)
            seller_amount = (amount * seller_rate).quantize(Decimal("0.01"))
            platform_amount = (amount * platform_rate).quantize(Decimal("0.01"))

            PaymentTransaction.objects.create(
                buyer=buyer,
                seller=seller,
                reference=reference,
                amount=amount,
                seller_amount=seller_amount,
                platform_amount=platform_amount,
                status="success",
                order_type=custom_fields.get("type", "product"),
                buyer_email=customer_email,
                buyer_name=buyer.get_full_name() or buyer.username,
                paystack_response=data,
            )
            logger.info(f"Webhook: logged transaction {reference} for {customer_email}")

    elif event == "transfer.success":
        # A payout to a vendor completed
        reference = data.get("reference")
        logger.info(f"Webhook: transfer succeeded for {reference}")

    elif event == "transfer.failed":
        reference = data.get("reference")
        logger.warning(f"Webhook: transfer FAILED for {reference} - {data.get('reason')}")

    elif event == "refund.processed":
        reference = data.get("transaction_reference")
        try:
            txn = PaymentTransaction.objects.get(reference=reference)
            txn.status = "refunded"
            txn.save()
            logger.info(f"Webhook: refund processed for {reference}")
        except PaymentTransaction.DoesNotExist:
            pass

    return HttpResponse(status=200)