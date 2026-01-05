from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.utils import timezone
from django.contrib.auth import get_user_model
from django.db import transaction
from decimal import Decimal
from .models import Wallet, WalletTransaction, EscrowTransaction, BankAccount
from .serializers import WalletSerializer, WalletTransactionSerializer, EscrowSerializer, BankAccountSerializer
import requests
from django.conf import settings
import logging

logger = logging.getLogger(__name__)

User = get_user_model()


class WalletViewSet(viewsets.ModelViewSet):
    serializer_class = WalletSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Wallet.objects.filter(user=self.request.user)

    @action(detail=False, methods=['get'])
    def balance(self, request):
        """Get user's wallet balance"""
        try:
            wallet, _ = Wallet.objects.get_or_create(user=request.user)
            return Response({
                'balance': float(wallet.balance),
                'account_number': wallet.account_number,
                'blockchain_address': wallet.blockchain_address
            })
        except Exception as e:
            return Response({'error': str(e)}, status=400)

    @action(detail=False, methods=['post'])
    @transaction.atomic
    def fund(self, request):
        """Fund wallet via Paystack"""
        try:
            amount = Decimal(str(request.data.get('amount', 0)))
            paystack_reference = request.data.get('paystack_reference')

            logger.info(f"Funding request: {paystack_reference} - ₦{amount} for user {request.user.email}")

            if amount < Decimal('100'):
                logger.warning(f"Amount too low: ₦{amount}")
                return Response({'error': 'Minimum amount is ₦100'}, status=400)

            if not paystack_reference:
                logger.warning("Missing payment reference")
                return Response({'error': 'Missing payment reference'}, status=400)

            # Check if transaction already processed (idempotency)
            existing = WalletTransaction.objects.filter(reference=paystack_reference).first()
            if existing:
                logger.warning(f"Duplicate transaction attempt: {paystack_reference}")
                return Response({'error': 'Transaction already processed'}, status=409)

            # Verify payment with Paystack
            paystack_key = settings.PAYSTACK_SECRET_KEY
            verify_url = f"https://api.paystack.co/transaction/verify/{paystack_reference}"

            headers = {'Authorization': f'Bearer {paystack_key}'}
            paystack_response = requests.get(verify_url, headers=headers)

            if paystack_response.status_code != 200:
                logger.error(f"Paystack verification failed: {paystack_response.status_code}")
                return Response({'error': 'Failed to verify payment'}, status=400)

            paystack_data = paystack_response.json()

            if not paystack_data.get('status') or paystack_data.get('data', {}).get('status') != 'success':
                logger.error(f"Payment not successful: {paystack_data}")
                return Response({'error': 'Payment not verified'}, status=400)

            # CRITICAL FIX: Verify amount matches Paystack amount
            verified_amount = Decimal(str(paystack_data['data']['amount'])) / 100  # Convert from kobo
            if verified_amount != amount:
                logger.error(f"Amount mismatch! Claimed: ₦{amount}, Verified: ₦{verified_amount}")
                return Response({
                    'error': 'Payment amount mismatch',
                    'claimed': float(amount),
                    'verified': float(verified_amount)
                }, status=400)

            # Get or create wallet
            wallet, _ = Wallet.objects.get_or_create(user=request.user)

            # Add funds - CONVERT BOTH TO DECIMAL ✅
            wallet.balance = Decimal(str(wallet.balance)) + Decimal(str(amount))
            wallet.save()

            # Create transaction record
            WalletTransaction.objects.create(
                wallet=wallet,
                type='credit',
                amount=amount,
                status='success',
                description='Wallet funded via card',
                reference=paystack_reference
            )

            logger.info(f"Payment successful: {paystack_reference} - New balance: ₦{wallet.balance}")

            return Response({
                'success': True,
                'message': f'₦{amount:,.2f} added to wallet',
                'new_balance': float(wallet.balance)
            }, status=201)

        except Exception as e:
            logger.error(f"Error funding wallet: {str(e)}", exc_info=True)
            return Response({'error': 'Payment processing failed'}, status=500)

    @action(detail=False, methods=['get'])
    def transactions(self, request):
        """Get wallet transaction history"""
        try:
            wallet, _ = Wallet.objects.get_or_create(user=request.user)
            transactions = WalletTransaction.objects.filter(wallet=wallet).order_by('-created_at')[:100]
            serializer = WalletTransactionSerializer(transactions, many=True)
            return Response({
                'results': serializer.data,
                'count': transactions.count()
            })
        except Exception as e:
            return Response({'error': str(e)}, status=400)

    @action(detail=False, methods=['post'])
    def withdraw(self, request):
        """Withdraw funds to bank account"""
        try:
            amount = Decimal(str(request.data.get('amount', 0)))
            
            wallet, _ = Wallet.objects.get_or_create(user=request.user)
            
            if wallet.balance < amount:
                return Response({'error': 'Insufficient balance'}, status=400)

            if amount < Decimal('100'):
                return Response({'error': 'Minimum withdrawal is ₦100'}, status=400)

            # Check if user has verified bank account
            try:
                bank_account = BankAccount.objects.get(user=request.user)
                if not bank_account.is_verified:
                    return Response({'error': 'Please verify your bank account first'}, status=400)
            except BankAccount.DoesNotExist:
                return Response({'error': 'No bank account found. Please add one first'}, status=400)

            # Initiate withdrawal via Paystack
            paystack_key = settings.PAYSTACK_SECRET_KEY
            transfer_url = "https://api.paystack.co/transfer"
            
            headers = {
                'Authorization': f'Bearer {paystack_key}',
                'Content-Type': 'application/json'
            }
            
            # Get or create paystack recipient code
            if not bank_account.paystack_recipient_code:
                # Create new recipient
                recipient_payload = {
                    'type': 'nuban',
                    'name': bank_account.account_holder_name,
                    'account_number': bank_account.account_number,
                    'bank_code': bank_account.bank_code
                }
                recipient_url = "https://api.paystack.co/transferrecipient"
                recipient_response = requests.post(recipient_url, json=recipient_payload, headers=headers)
                
                if recipient_response.status_code not in [200, 201]:
                    return Response({'error': 'Failed to create transfer recipient'}, status=400)
                
                recipient_data = recipient_response.json()
                bank_account.paystack_recipient_code = recipient_data['data']['recipient_code']
                bank_account.save()
            
            payload = {
                'source': 'balance',
                'amount': int(amount * 100),  # Convert to kobo
                'recipient': bank_account.paystack_recipient_code,
                'reason': 'StudEx wallet withdrawal'
            }
            
            response = requests.post(transfer_url, json=payload, headers=headers)
            
            if response.status_code not in [200, 201]:
                return Response({'error': 'Withdrawal failed'}, status=400)

            transfer_data = response.json()

            # Deduct from wallet - CONVERT TO DECIMAL ✅
            wallet.balance = Decimal(str(wallet.balance)) - Decimal(str(amount))
            wallet.save()

            # Create transaction record
            WalletTransaction.objects.create(
                wallet=wallet,
                type='debit',
                amount=amount,
                status='success',
                description='Withdrawal to bank account',
                reference=transfer_data['data']['reference']
            )

            return Response({
                'success': True,
                'message': f'₦{amount:,.2f} withdrawn successfully',
                'new_balance': float(wallet.balance),
                'reference': transfer_data['data']['reference']
            }, status=200)

        except Exception as e:
            return Response({'error': str(e)}, status=400)


class BankAccountViewSet(viewsets.ModelViewSet):
    serializer_class = BankAccountSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return BankAccount.objects.filter(user=self.request.user)

    @action(detail=False, methods=['get', 'post', 'put'])
    def detail(self, request):
        """Get or create/update user's bank account"""
        try:
            bank_account, created = BankAccount.objects.get_or_create(user=request.user)
            
            if request.method == 'GET':
                serializer = BankAccountSerializer(bank_account)
                return Response(serializer.data)
            
            elif request.method in ['POST', 'PUT']:
                serializer = BankAccountSerializer(bank_account, data=request.data, partial=True)
                if serializer.is_valid():
                    serializer.save()
                    return Response(serializer.data, status=201 if created else 200)
                return Response(serializer.errors, status=400)
        
        except Exception as e:
            return Response({'error': str(e)}, status=400)


@api_view(['GET'])
@permission_classes([AllowAny])
def get_banks(request):
    """Get list of Nigerian banks"""
    banks = [
        {'code': '007', 'name': 'Zenith Bank'},
        {'code': '009', 'name': 'United Bank for Africa'},
        {'code': '011', 'name': 'First Bank of Nigeria'},
        {'code': '012', 'name': 'First Trust Bank'},
        {'code': '014', 'name': 'Standard Chartered Bank'},
        {'code': '015', 'name': 'Stanbic IBTC Bank'},
        {'code': '016', 'name': 'FCMB Group'},
        {'code': '017', 'name': 'Access Bank Nigeria'},
        {'code': '020', 'name': 'Guaranty Trust Bank'},
        {'code': '023', 'name': 'Bank of The Nigerian State'},
        {'code': '025', 'name': 'Eco Bank Nigeria'},
        {'code': '035', 'name': 'Wema Bank'},
        {'code': '037', 'name': 'Heritage Bank'},
        {'code': '039', 'name': 'Keystone Bank'},
        {'code': '044', 'name': 'Access Bank (Diamond)'},
        {'code': '045', 'name': 'Titan Trust Bank'},
        {'code': '050', 'name': 'Ecobank Transnational Inc'},
        {'code': '051', 'name': 'Ecobank Nigeria'},
        {'code': '056', 'name': 'Guaranty Trust Holding Company'},
        {'code': '063', 'name': 'GTBank'},
        {'code': '070', 'name': 'Bank of Industry'},
    ]
    return Response(banks)


class EscrowViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = EscrowSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        from django.db.models import Q
        return EscrowTransaction.objects.filter(
            Q(buyer=self.request.user) | Q(seller=self.request.user)
        )

    @action(detail=False, methods=['post'])
    @transaction.atomic
    def create_escrow(self, request):
        """Create escrow for order"""
        try:
            from orders.models import Order

            order_id = request.data.get('order_id')

            if not order_id:
                logger.warning("Escrow creation attempted without order_id")
                return Response({'error': 'order_id is required'}, status=400)

            try:
                order = Order.objects.get(id=order_id, buyer=request.user)
            except Order.DoesNotExist:
                logger.error(f"Order not found: {order_id} for user {request.user.email}")
                return Response({'error': 'Order not found or you are not the buyer'}, status=404)

            # CRITICAL FIX: Check for duplicate escrow
            existing_escrow = EscrowTransaction.objects.filter(order=order).first()
            if existing_escrow:
                logger.warning(f"Duplicate escrow attempt for order {order.id}")
                return Response({
                    'error': 'Escrow already exists for this order',
                    'escrow_id': existing_escrow.id,
                    'status': existing_escrow.status
                }, status=409)

            total_amount = Decimal(str(order.amount))
            platform_fee = total_amount * Decimal('0.05')  # 5% fee
            seller_amount = total_amount - platform_fee

            logger.info(f"Creating escrow for order {order.id}: Total=₦{total_amount}, Fee=₦{platform_fee}, Seller=₦{seller_amount}")

            # Get or create wallet
            buyer_wallet, _ = Wallet.objects.get_or_create(user=request.user)

            # CRITICAL FIX: Check if buyer has sufficient balance
            current_balance = Decimal(str(buyer_wallet.balance))
            if current_balance < total_amount:
                logger.error(f"Insufficient balance for user {request.user.email}: Required=₦{total_amount}, Available=₦{current_balance}")
                return Response({
                    'error': 'Insufficient wallet balance',
                    'required': float(total_amount),
                    'available': float(current_balance),
                    'shortfall': float(total_amount - current_balance)
                }, status=400)

            # Create escrow
            escrow = EscrowTransaction.objects.create(
                order=order,
                buyer=request.user,
                seller=order.listing.vendor,
                total_amount=total_amount,
                seller_amount=seller_amount,
                platform_fee=platform_fee,
                status='held'
            )

            # Deduct from buyer's wallet - CONVERT TO DECIMAL ✅
            buyer_wallet.balance = current_balance - total_amount
            buyer_wallet.save()

            # Create transaction record
            WalletTransaction.objects.create(
                wallet=buyer_wallet,
                type='debit',
                amount=total_amount,
                status='success',
                description=f'Payment for order {order.id}',
                order=order
            )

            logger.info(f"Escrow created successfully: {escrow.id} for order {order.id} - Buyer balance: ₦{buyer_wallet.balance}")

            serializer = EscrowSerializer(escrow)
            return Response(serializer.data, status=201)

        except Exception as e:
            logger.error(f"Error creating escrow: {str(e)}", exc_info=True)
            return Response({'error': 'Escrow creation failed'}, status=500)

    @action(detail=False, methods=['post'])
    @transaction.atomic
    def release_escrow(self, request):
        """Release escrow to seller (buyer confirms delivery)"""
        try:
            escrow_id = request.data.get('escrow_id')

            if not escrow_id:
                logger.warning("Escrow release attempted without escrow_id")
                return Response({'error': 'escrow_id is required'}, status=400)

            try:
                escrow = EscrowTransaction.objects.get(id=escrow_id, buyer=request.user)
            except EscrowTransaction.DoesNotExist:
                logger.error(f"Escrow not found: {escrow_id} for user {request.user.email}")
                return Response({'error': 'Escrow not found or you are not the buyer'}, status=404)

            logger.info(f"Releasing escrow {escrow.id} for order {escrow.order.id}")

            # Check if escrow already released
            if escrow.status != 'held':
                logger.warning(f"Escrow {escrow.id} already processed: {escrow.status}")
                return Response({
                    'error': f'Escrow already {escrow.status}',
                    'current_status': escrow.status
                }, status=400)

            # CRITICAL FIX: Check order status (changed from 'delivered' to 'seller_completed')
            if escrow.order.status != 'seller_completed':
                logger.warning(f"Order {escrow.order.id} not ready for release: {escrow.order.status}")
                return Response({
                    'error': 'Order not completed by seller yet',
                    'current_status': escrow.order.status,
                    'required_status': 'seller_completed'
                }, status=400)

            # Release to seller - CONVERT TO DECIMAL ✅
            seller_wallet, _ = Wallet.objects.get_or_create(user=escrow.seller)
            seller_wallet.balance = Decimal(str(seller_wallet.balance)) + Decimal(str(escrow.seller_amount))
            seller_wallet.save()

            # Add to admin wallet (platform fee) - CONVERT TO DECIMAL ✅
            admin = User.objects.filter(is_staff=True, is_superuser=True).first()
            if admin:
                admin_wallet, _ = Wallet.objects.get_or_create(user=admin)
                admin_wallet.balance = Decimal(str(admin_wallet.balance)) + Decimal(str(escrow.platform_fee))
                admin_wallet.save()

                # Create transaction record for platform fee
                WalletTransaction.objects.create(
                    wallet=admin_wallet,
                    type='credit',
                    amount=escrow.platform_fee,
                    status='success',
                    description=f'Platform fee from order {escrow.order.id}',
                    order=escrow.order
                )
                logger.info(f"Platform fee collected: ₦{escrow.platform_fee} for order {escrow.order.id}")
            else:
                logger.error("No admin user found for platform fee collection!")

            # Update escrow status
            escrow.status = 'released_to_seller'
            escrow.released_at = timezone.now()
            escrow.save()

            # Create transaction record for seller
            WalletTransaction.objects.create(
                wallet=seller_wallet,
                type='credit',
                amount=escrow.seller_amount,
                status='success',
                description=f'Payment from order {escrow.order.id}',
                order=escrow.order
            )

            logger.info(f"Escrow released: {escrow.id} - Seller received ₦{escrow.seller_amount}, Platform ₦{escrow.platform_fee}")

            return Response({
                'success': True,
                'message': f'₦{escrow.seller_amount:,.2f} released to seller',
                'seller_amount': float(escrow.seller_amount),
                'platform_fee': float(escrow.platform_fee),
                'seller_new_balance': float(seller_wallet.balance)
            })

        except Exception as e:
            logger.error(f"Error releasing escrow: {str(e)}", exc_info=True)
            return Response({'error': 'Escrow release failed'}, status=500)