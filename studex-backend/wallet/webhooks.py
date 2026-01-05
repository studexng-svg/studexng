# wallet/webhooks.py
"""
Paystack webhook handler for processing payment events.
This ensures payments are credited even if user closes browser.
"""

import json
import hashlib
import hmac
import logging
from decimal import Decimal

from django.conf import settings
from django.views.decorators.csrf import csrf_exempt
from django.db import transaction
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .models import Wallet, WalletTransaction

logger = logging.getLogger(__name__)


@csrf_exempt
@api_view(['POST'])
@permission_classes([AllowAny])
def paystack_webhook(request):
    """
    Handle Paystack webhook events.

    This endpoint receives notifications from Paystack when payment events occur.
    It verifies the webhook signature and processes the payment idempotently.
    """

    # Get signature from header
    signature = request.headers.get('X-Paystack-Signature')
    if not signature:
        logger.warning("Webhook received without signature")
        return Response({'error': 'No signature'}, status=400)

    # Get request body
    body = request.body.decode('utf-8')

    # Verify signature
    hash_value = hmac.new(
        settings.PAYSTACK_SECRET_KEY.encode('utf-8'),
        body.encode('utf-8'),
        hashlib.sha512
    ).hexdigest()

    if hash_value != signature:
        logger.error("Invalid webhook signature")
        return Response({'error': 'Invalid signature'}, status=400)

    # Parse event
    try:
        event = json.loads(body)
    except json.JSONDecodeError:
        logger.error("Invalid JSON in webhook body")
        return Response({'error': 'Invalid JSON'}, status=400)

    # Handle charge.success event
    if event.get('event') == 'charge.success':
        return handle_payment_success(event)

    # Log other events but don't process
    logger.info(f"Received webhook event: {event.get('event')}")
    return Response({'status': 'received'})


@transaction.atomic
def handle_payment_success(event):
    """
    Process successful payment event.

    This function is idempotent - calling it multiple times with the same
    reference will only credit the wallet once.
    """

    try:
        data = event.get('data', {})
        reference = data.get('reference')
        amount_kobo = data.get('amount', 0)
        customer_email = data.get('customer', {}).get('email')

        # Convert amount from kobo to naira
        amount = Decimal(str(amount_kobo)) / 100

        logger.info(f"Processing payment: {reference} - ₦{amount} for {customer_email}")

        # Check if transaction already processed (idempotency)
        existing = WalletTransaction.objects.filter(reference=reference).first()
        if existing:
            logger.info(f"Transaction {reference} already processed, skipping")
            return Response({'status': 'already_processed'})

        # Find user by email
        from django.contrib.auth import get_user_model
        User = get_user_model()

        try:
            user = User.objects.get(email=customer_email)
        except User.DoesNotExist:
            logger.error(f"User not found for email: {customer_email}")
            return Response({'error': 'User not found'}, status=404)

        # Get or create wallet
        wallet, _ = Wallet.objects.get_or_create(user=user)

        # Credit wallet
        wallet.balance = Decimal(str(wallet.balance)) + amount
        wallet.save()

        # Create transaction record
        WalletTransaction.objects.create(
            wallet=wallet,
            type='credit',
            amount=amount,
            status='success',
            description='Wallet funded via card (webhook)',
            reference=reference
        )

        logger.info(f"Payment processed successfully: {reference} - Wallet balance: ₦{wallet.balance}")

        return Response({
            'status': 'success',
            'message': f'₦{amount} credited to wallet',
            'reference': reference
        })

    except Exception as e:
        logger.error(f"Error processing payment webhook: {str(e)}", exc_info=True)
        return Response({'error': 'Processing failed'}, status=500)
