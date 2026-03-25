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
PLATFORM_PERCENTAGE = 25.0  # default platform cut (vendor gets 75%)


def get_commission_split(amount: Decimal):
    """
    ✅ UPDATED Tiered commission — vendor-first:
    - Under ₦5,000  → vendor 75%, platform 25%
    - ₦5,000–₦20,000 → vendor 80%, platform 20%
    - Above ₦20,000  → vendor 85%, platform 15%
    """
    if amount < Decimal("5000"):
        platform_rate = Decimal("0.25")
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
                "paystack_subaccount_code": account.paystack_subaccount_code,
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
# VERIFY BANK ACCOUNT
# ─────────────────────────────────────────

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def verify_bank_account(request):
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
# ✅ VERIFY PAYMENT + CREATE ORDER (FIXED)
# ─────────────────────────────────────────

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def verify_payment(request):
    reference = request.data.get("reference")
    order_type = request.data.get("order_type", "product")
    listing_id = request.data.get("listing_id")
    items = request.data.get("items", [])
    use_credits = request.data.get("use_credits", False)
    booking_id = request.data.get("booking_id")

    if not reference:
        return Response({"error": "Payment reference is required."}, status=400)

    # ✅ FIX 1: If already processed, return the existing order immediately
    existing_txn = PaymentTransaction.objects.filter(reference=reference, status="success").first()
    if existing_txn:
        logger.info(f"Reference {reference} already processed, returning order_id={existing_txn.order_id}")
        return Response({
            "order_id": existing_txn.order_id,
            "message": "Payment already verified.",
            "already_processed": True,
        })

    # ✅ FIX 2: Verify with Paystack
    try:
        verify_res = requests.get(
            f"https://api.paystack.co/transaction/verify/{reference}",
            headers=PAYSTACK_HEADERS,
            timeout=15,
        )
    except requests.Timeout:
        return Response({"error": "Payment verification timed out. Please try again."}, status=408)
    except Exception as e:
        logger.error(f"Paystack verify request failed: {e}")
        return Response({"error": "Could not reach payment provider. Try again."}, status=503)

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

    # ✅ FIX 3: Profile discount
    discount_applied = False
    try:
        profile = request.user.profile
        if profile.profile_bonus_eligible and not profile.profile_bonus_used:
            discount_applied = True
            profile.profile_bonus_used = True
            profile.profile_bonus_eligible = False
            profile.save(update_fields=["profile_bonus_used", "profile_bonus_eligible"])
    except Exception as e:
        logger.warning(f"Profile discount check failed: {e}")

    seller_rate, platform_rate = get_commission_split(amount_paid)
    seller_amount = (amount_paid * seller_rate).quantize(Decimal("0.01"))
    platform_amount = (amount_paid * platform_rate).quantize(Decimal("0.01"))

    effective_listing_id = listing_id or (items[0]["listing_id"] if items else None)
    seller = _get_seller_from_listing(effective_listing_id)

    # ✅ FIX 4: Create PaymentTransaction FIRST so we have a record even if order creation fails
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

    order_id = None

    try:
        from services.models import Listing

        if order_type == "service" and listing_id:
            listing = Listing.objects.get(id=listing_id)

            # Stock check
            qty = int(request.data.get("quantity", 1))
            if listing.track_inventory:
                if listing.stock_quantity <= 0:
                    return Response({"error": f'"{listing.title}" is out of stock.'}, status=400)
                if listing.stock_quantity < qty:
                    return Response({"error": f'Only {listing.stock_quantity} of "{listing.title}" available.'}, status=400)

            # ✅ FIX 5: Create order with correct status
            order = Order.objects.create(
                buyer=request.user,
                listing=listing,
                amount=amount_paid,
                reference=reference,
                status="paid",
            )
            order_id = order.id
            logger.info(f"Service order created: id={order_id}, ref={reference}")

            try:
                listing.reduce_stock(1)
            except Exception as e:
                logger.warning(f"reduce_stock failed: {e}")

            # Update booking status
            try:
                from orders.models import Booking
                if booking_id:
                    paid_booking = Booking.objects.filter(
                        id=booking_id,
                        buyer=request.user,
                        listing=listing,
                        status="confirmed",
                    ).first()
                else:
                    paid_booking = Booking.objects.filter(
                        buyer=request.user,
                        listing=listing,
                        status="confirmed",
                    ).order_by("-created_at").first()

                if paid_booking:
                    paid_booking.status = "paid"
                    paid_booking.save(update_fields=["status"])
            except Exception as e:
                logger.warning(f"Could not update booking status: {e}")

            # Notify vendor
            try:
                from notifications.models import Notification
                Notification.objects.create(
                    recipient=listing.vendor,
                    notification_type="booking_paid",
                    title=f"💰 Payment Received — {listing.title}",
                    message=(
                        f"{request.user.username} has paid ₦{amount_paid:,.0f} for "
                        f'"{listing.title}". Funds are held in escrow.'
                    ),
                    action_url="/vendor/dashboard",
                )
            except Exception as e:
                logger.warning(f"Payment notification failed: {e}")

        elif order_type == "product" and items:
            first_order_id = None
            for i, item_data in enumerate(items):
                listing = Listing.objects.get(id=item_data["listing_id"])
                qty = item_data.get("quantity", 1)

                if listing.track_inventory:
                    if listing.stock_quantity <= 0:
                        return Response({"error": f'"{listing.title}" is out of stock.'}, status=400)
                    if listing.stock_quantity < qty:
                        return Response({"error": f'Only {listing.stock_quantity} of "{listing.title}" available.'}, status=400)

                order = Order.objects.create(
                    buyer=request.user,
                    listing=listing,
                    amount=listing.price * qty,
                    reference=f"{reference}-{item_data['listing_id']}-{i}",
                    status="paid",
                )
                logger.info(f"Product order created: id={order.id}, listing={listing.id}")

                if first_order_id is None:
                    first_order_id = order.id

                try:
                    listing.reduce_stock(qty)
                except Exception as e:
                    logger.warning(f"reduce_stock failed: {e}")

                try:
                    from notifications.models import Notification
                    Notification.objects.create(
                        recipient=listing.vendor,
                        notification_type="booking_paid",
                        title=f"💰 Payment Received — {listing.title}",
                        message=(
                            f"{request.user.username} has paid ₦{listing.price * qty:,.0f} for "
                            f'"{listing.title}" (qty: {qty}). Funds held in escrow.'
                        ),
                        action_url="/vendor/dashboard",
                    )
                except Exception as e:
                    logger.warning(f"Product payment notification failed: {e}")

            order_id = first_order_id

        # ✅ FIX 6: Always save order_id to transaction
        if order_id:
            txn.order_id = order_id
            txn.save(update_fields=["order_id"])
            logger.info(f"Transaction {reference} linked to order {order_id}")
        else:
            logger.error(f"No order_id created for reference {reference}")

        # Loyalty credits
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

        # ✅ FIX 7: If order_id is None, return a helpful error instead of crashing
        if not order_id:
            return Response({
                "error": "Payment received but order creation failed. Please contact support.",
                "reference": reference,
                "support_note": "Your payment was received. Quote this reference for support.",
            }, status=500)

        return Response({
            "order_id": order_id,
            "message": "Payment verified. Order created successfully.",
            "credits_used": float(credits_used),
            "discount_applied": discount_applied,
        })

    except Exception as e:
        logger.error(f"Order creation failed after payment: {e}", exc_info=True)
        # ✅ FIX 8: Return reference so user can quote it to support — never show "order not found"
        return Response({
            "error": "Payment was received successfully, but there was an issue creating your order. Please contact support with your reference.",
            "reference": reference,
            "payment_confirmed": True,
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
            "message": "Refund initiated. Amount returns within 3–5 business days.",
            "reference": reference,
            "amount": float(txn.amount),
        })

    error_data = refund_res.json()
    logger.error(f"Paystack refund failed: {error_data}")
    return Response({"error": error_data.get("message", "Refund failed. Contact support.")}, status=400)


# ─────────────────────────────────────────
# ✅ SELLER EARNINGS (updated commission tiers)
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

    # ✅ UPDATED: commission tiers match frontend display
    if total_orders >= 50:
        commission_rate = 15   # platform keeps 15%, vendor gets 85%
        vendor_rate = 85
    elif total_orders >= 10:
        commission_rate = 20   # platform keeps 20%, vendor gets 80%
        vendor_rate = 80
    else:
        commission_rate = 25   # platform keeps 25%, vendor gets 75%
        vendor_rate = 75

    return Response({
        "total_earned": float(total_earned),
        "pending": float(pending),
        "available": float(total_earned),
        "total_orders": total_orders,
        "commission_rate": commission_rate,
        "vendor_rate": vendor_rate,
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

def _create_or_update_paystack_subaccount(user, bank_code, account_number, account_name):
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
    if request.method != "POST":
        return HttpResponse(status=405)

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

        # ✅ Webhook: skip if already processed by verify_payment endpoint
        if PaymentTransaction.objects.filter(reference=reference, status="success").exists():
            logger.info(f"Webhook: reference {reference} already processed, skipping.")
            return HttpResponse(status=200)

        customer_email = data.get("customer", {}).get("email")
        try:
            from django.contrib.auth import get_user_model
            User = get_user_model()
            buyer = User.objects.filter(email=customer_email).first()
        except Exception:
            buyer = None

        if buyer:
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
        logger.info(f"Webhook: transfer succeeded for {data.get('reference')}")

    elif event == "transfer.failed":
        logger.warning(f"Webhook: transfer FAILED for {data.get('reference')} - {data.get('reason')}")

    elif event == "refund.processed":
        reference = data.get("transaction_reference")
        try:
            txn = PaymentTransaction.objects.get(reference=reference)
            txn.status = "refunded"
            txn.save()
        except PaymentTransaction.DoesNotExist:
            pass

    return HttpResponse(status=200)