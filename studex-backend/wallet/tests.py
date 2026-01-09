"""
Test suite for wallet app - wallet operations, transactions, escrow
"""
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient, APITestCase
from rest_framework import status
from decimal import Decimal

from accounts.models import User
from services.models import Category, Listing
from orders.models import Order
from wallet.models import Wallet, WalletTransaction, EscrowTransaction, BankAccount


class WalletModelTests(TestCase):
    """Test Wallet model functionality"""

    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            email='test@pau.edu.ng',
            password='pass123'
        )

    def test_create_wallet(self):
        """Test creating a wallet"""
        wallet = Wallet.objects.create(user=self.user)

        self.assertEqual(wallet.user, self.user)
        self.assertEqual(wallet.balance, Decimal('0.00'))
        self.assertIsNotNone(wallet.account_number)

    def test_wallet_account_number_generated(self):
        """Test wallet account number is auto-generated"""
        wallet = Wallet.objects.create(user=self.user)

        self.assertIsNotNone(wallet.account_number)
        self.assertTrue(len(wallet.account_number) == 10)
        self.assertTrue(wallet.account_number.isdigit())

    def test_wallet_balance_operations(self):
        """Test wallet balance can be updated"""
        wallet = Wallet.objects.create(user=self.user)

        # Credit wallet
        wallet.balance += Decimal('1000.00')
        wallet.save()
        self.assertEqual(wallet.balance, Decimal('1000.00'))

        # Debit wallet
        wallet.balance -= Decimal('500.00')
        wallet.save()
        self.assertEqual(wallet.balance, Decimal('500.00'))

    def test_wallet_str_method(self):
        """Test Wallet string representation"""
        wallet = Wallet.objects.create(user=self.user)

        self.assertIn(self.user.username, str(wallet))
        self.assertIn('Wallet', str(wallet))


class WalletTransactionTests(TestCase):
    """Test WalletTransaction model functionality"""

    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            email='test@pau.edu.ng',
            password='pass123'
        )
        self.wallet = Wallet.objects.create(user=self.user)

    def test_create_transaction(self):
        """Test creating a wallet transaction"""
        transaction = WalletTransaction.objects.create(
            wallet=self.wallet,
            type='credit',
            amount=Decimal('1000.00'),
            status='success',
            description='Test deposit'
        )

        self.assertEqual(transaction.wallet, self.wallet)
        self.assertEqual(transaction.type, 'credit')
        self.assertEqual(transaction.amount, Decimal('1000.00'))
        self.assertEqual(transaction.status, 'success')

    def test_transaction_types(self):
        """Test credit and debit transaction types"""
        # Credit transaction
        credit = WalletTransaction.objects.create(
            wallet=self.wallet,
            type='credit',
            amount=Decimal('1000.00'),
            status='success'
        )
        self.assertEqual(credit.type, 'credit')

        # Debit transaction
        debit = WalletTransaction.objects.create(
            wallet=self.wallet,
            type='debit',
            amount=Decimal('500.00'),
            status='success'
        )
        self.assertEqual(debit.type, 'debit')

    def test_transaction_status(self):
        """Test transaction status options"""
        statuses = ['pending', 'success', 'failed']

        for status_option in statuses:
            transaction = WalletTransaction.objects.create(
                wallet=self.wallet,
                type='credit',
                amount=Decimal('100.00'),
                status=status_option
            )
            self.assertEqual(transaction.status, status_option)
            transaction.delete()

    def test_transaction_reference(self):
        """Test transaction reference can be set"""
        transaction = WalletTransaction.objects.create(
            wallet=self.wallet,
            type='credit',
            amount=Decimal('1000.00'),
            status='success',
            reference='TXN-TEST-123'
        )

        self.assertEqual(transaction.reference, 'TXN-TEST-123')


class EscrowTransactionTests(TestCase):
    """Test EscrowTransaction model functionality"""

    def setUp(self):
        # Create buyer and seller
        self.buyer = User.objects.create_user(
            username='buyer',
            email='buyer@pau.edu.ng',
            password='pass123'
        )

        self.seller = User.objects.create_user(
            username='seller',
            email='seller@pau.edu.ng',
            password='pass123',
            user_type='vendor',
            is_verified_vendor=True
        )

        # Create listing and order
        self.category = Category.objects.create(
            title='Test Category',
            slug='test-category'
        )

        self.listing = Listing.objects.create(
            title='Test Product',
            description='Test Description',
            price=Decimal('1000.00'),
            vendor=self.seller,
            category=self.category
        )

        self.order = Order.objects.create(
            buyer=self.buyer,
            listing=self.listing,
            amount=Decimal('1000.00')
        )

    def test_create_escrow(self):
        """Test creating an escrow transaction"""
        escrow = EscrowTransaction.objects.create(
            order=self.order,
            buyer=self.buyer,
            seller=self.seller,
            total_amount=Decimal('1000.00'),
            seller_amount=Decimal('950.00'),
            platform_fee=Decimal('50.00'),
            status='held'
        )

        self.assertEqual(escrow.order, self.order)
        self.assertEqual(escrow.buyer, self.buyer)
        self.assertEqual(escrow.seller, self.seller)
        self.assertEqual(escrow.total_amount, Decimal('1000.00'))
        self.assertEqual(escrow.status, 'held')

    def test_escrow_fee_calculation(self):
        """Test escrow fee calculation (5%)"""
        total = Decimal('1000.00')
        platform_fee = total * Decimal('0.05')
        seller_amount = total - platform_fee

        escrow = EscrowTransaction.objects.create(
            order=self.order,
            buyer=self.buyer,
            seller=self.seller,
            total_amount=total,
            seller_amount=seller_amount,
            platform_fee=platform_fee,
            status='held'
        )

        self.assertEqual(escrow.platform_fee, Decimal('50.00'))
        self.assertEqual(escrow.seller_amount, Decimal('950.00'))

    def test_escrow_status_options(self):
        """Test escrow status options"""
        statuses = ['held', 'released', 'refunded']

        for status_option in statuses:
            escrow = EscrowTransaction.objects.create(
                order=self.order,
                buyer=self.buyer,
                seller=self.seller,
                total_amount=Decimal('1000.00'),
                seller_amount=Decimal('950.00'),
                platform_fee=Decimal('50.00'),
                status=status_option
            )
            self.assertEqual(escrow.status, status_option)
            escrow.delete()

    def test_escrow_release(self):
        """Test escrow release timestamp"""
        escrow = EscrowTransaction.objects.create(
            order=self.order,
            buyer=self.buyer,
            seller=self.seller,
            total_amount=Decimal('1000.00'),
            seller_amount=Decimal('950.00'),
            platform_fee=Decimal('50.00'),
            status='held'
        )

        # Release escrow
        escrow.status = 'released'
        escrow.released_at = timezone.now()
        escrow.save()

        self.assertEqual(escrow.status, 'released')
        self.assertIsNotNone(escrow.released_at)

    def test_escrow_refund(self):
        """Test escrow refund timestamp"""
        escrow = EscrowTransaction.objects.create(
            order=self.order,
            buyer=self.buyer,
            seller=self.seller,
            total_amount=Decimal('1000.00'),
            seller_amount=Decimal('950.00'),
            platform_fee=Decimal('50.00'),
            status='held'
        )

        # Refund escrow
        escrow.status = 'refunded'
        escrow.refunded_at = timezone.now()
        escrow.save()

        self.assertEqual(escrow.status, 'refunded')
        self.assertIsNotNone(escrow.refunded_at)


class BankAccountTests(TestCase):
    """Test BankAccount model functionality"""

    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            email='test@pau.edu.ng',
            password='pass123'
        )

    def test_create_bank_account(self):
        """Test creating a bank account"""
        bank_account = BankAccount.objects.create(
            user=self.user,
            account_holder_name='Test User',
            account_number='0123456789',
            bank_name='Test Bank',
            bank_code='001'
        )

        self.assertEqual(bank_account.user, self.user)
        self.assertEqual(bank_account.account_number, '0123456789')
        self.assertFalse(bank_account.is_verified)

    def test_bank_account_verification(self):
        """Test bank account verification"""
        bank_account = BankAccount.objects.create(
            user=self.user,
            account_holder_name='Test User',
            account_number='0123456789',
            bank_name='Test Bank',
            bank_code='001'
        )

        # Verify account
        bank_account.is_verified = True
        bank_account.save()

        self.assertTrue(bank_account.is_verified)

    def test_user_can_have_multiple_bank_accounts(self):
        """Test user can have multiple bank accounts"""
        BankAccount.objects.create(
            user=self.user,
            account_holder_name='Test User',
            account_number='0123456789',
            bank_name='Bank 1',
            bank_code='001'
        )

        BankAccount.objects.create(
            user=self.user,
            account_holder_name='Test User',
            account_number='9876543210',
            bank_name='Bank 2',
            bank_code='002'
        )

        accounts = BankAccount.objects.filter(user=self.user)
        self.assertEqual(accounts.count(), 2)


class WalletAPITests(APITestCase):
    """Test Wallet API endpoints"""

    def setUp(self):
        self.client = APIClient()

        self.user = User.objects.create_user(
            username='testuser',
            email='test@pau.edu.ng',
            password='pass123'
        )

        self.wallet = Wallet.objects.create(user=self.user)
        self.wallet_url = '/api/wallet/'

    def test_get_wallet_authenticated(self):
        """Test getting wallet with authentication"""
        self.client.force_authenticate(user=self.user)

        response = self.client.get(self.wallet_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_get_wallet_unauthenticated(self):
        """Test getting wallet without authentication fails"""
        response = self.client.get(self.wallet_url)
        self.assertIn(response.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])


class WalletBalanceCalculationTests(TestCase):
    """Test wallet balance calculations"""

    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            email='test@pau.edu.ng',
            password='pass123'
        )
        self.wallet = Wallet.objects.create(user=self.user)

    def test_calculate_total_credits(self):
        """Test calculating total credits"""
        WalletTransaction.objects.create(
            wallet=self.wallet,
            type='credit',
            amount=Decimal('1000.00'),
            status='success'
        )

        WalletTransaction.objects.create(
            wallet=self.wallet,
            type='credit',
            amount=Decimal('500.00'),
            status='success'
        )

        total_credits = WalletTransaction.objects.filter(
            wallet=self.wallet,
            type='credit',
            status='success'
        ).count()

        self.assertEqual(total_credits, 2)

    def test_calculate_total_debits(self):
        """Test calculating total debits"""
        WalletTransaction.objects.create(
            wallet=self.wallet,
            type='debit',
            amount=Decimal('300.00'),
            status='success'
        )

        WalletTransaction.objects.create(
            wallet=self.wallet,
            type='debit',
            amount=Decimal('200.00'),
            status='success'
        )

        total_debits = WalletTransaction.objects.filter(
            wallet=self.wallet,
            type='debit',
            status='success'
        ).count()

        self.assertEqual(total_debits, 2)

    def test_pending_transactions_not_counted(self):
        """Test pending transactions are not counted in balance"""
        WalletTransaction.objects.create(
            wallet=self.wallet,
            type='credit',
            amount=Decimal('1000.00'),
            status='pending'
        )

        successful_transactions = WalletTransaction.objects.filter(
            wallet=self.wallet,
            status='success'
        ).count()

        self.assertEqual(successful_transactions, 0)


class EscrowFlowTests(TestCase):
    """Test complete escrow flow"""

    def setUp(self):
        # Create buyer with wallet balance
        self.buyer = User.objects.create_user(
            username='buyer',
            email='buyer@pau.edu.ng',
            password='pass123'
        )
        self.buyer.wallet_balance = Decimal('5000.00')
        self.buyer.save()

        # Create seller
        self.seller = User.objects.create_user(
            username='seller',
            email='seller@pau.edu.ng',
            password='pass123',
            user_type='vendor',
            is_verified_vendor=True
        )

        # Create listing
        self.category = Category.objects.create(
            title='Test Category',
            slug='test-category'
        )

        self.listing = Listing.objects.create(
            title='Test Product',
            description='Test Description',
            price=Decimal('1000.00'),
            vendor=self.seller,
            category=self.category
        )

        # Create order
        self.order = Order.objects.create(
            buyer=self.buyer,
            listing=self.listing,
            amount=Decimal('1000.00')
        )

    def test_escrow_creation_flow(self):
        """Test complete escrow creation"""
        # Create escrow when order is paid
        escrow = EscrowTransaction.objects.create(
            order=self.order,
            buyer=self.buyer,
            seller=self.seller,
            total_amount=Decimal('1000.00'),
            seller_amount=Decimal('950.00'),
            platform_fee=Decimal('50.00'),
            status='held'
        )

        self.assertEqual(escrow.status, 'held')
        self.assertEqual(escrow.total_amount, Decimal('1000.00'))

    def test_escrow_release_flow(self):
        """Test escrow release to seller"""
        # Create escrow
        escrow = EscrowTransaction.objects.create(
            order=self.order,
            buyer=self.buyer,
            seller=self.seller,
            total_amount=Decimal('1000.00'),
            seller_amount=Decimal('950.00'),
            platform_fee=Decimal('50.00'),
            status='held'
        )

        # Release to seller
        escrow.status = 'released'
        escrow.released_at = timezone.now()
        escrow.save()

        # Update seller wallet (would be done in view)
        self.seller.wallet_balance += escrow.seller_amount
        self.seller.save()

        self.assertEqual(escrow.status, 'released')
        self.assertEqual(self.seller.wallet_balance, Decimal('950.00'))

    def test_escrow_refund_flow(self):
        """Test escrow refund to buyer"""
        # Deduct buyer balance (simulating payment)
        original_balance = self.buyer.wallet_balance
        self.buyer.wallet_balance -= Decimal('1000.00')
        self.buyer.save()

        # Create escrow
        escrow = EscrowTransaction.objects.create(
            order=self.order,
            buyer=self.buyer,
            seller=self.seller,
            total_amount=Decimal('1000.00'),
            seller_amount=Decimal('950.00'),
            platform_fee=Decimal('50.00'),
            status='held'
        )

        # Refund to buyer
        escrow.status = 'refunded'
        escrow.refunded_at = timezone.now()
        escrow.save()

        # Refund full amount to buyer
        self.buyer.wallet_balance += escrow.total_amount
        self.buyer.save()

        self.assertEqual(escrow.status, 'refunded')
        self.assertEqual(self.buyer.wallet_balance, original_balance)


class WithdrawalTests(TestCase):
    """Test withdrawal functionality"""

    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            email='test@pau.edu.ng',
            password='pass123'
        )
        self.user.wallet_balance = Decimal('5000.00')
        self.user.save()

        self.bank_account = BankAccount.objects.create(
            user=self.user,
            account_holder_name='Test User',
            account_number='0123456789',
            bank_name='Test Bank',
            bank_code='001',
            is_verified=True
        )

    def test_user_can_withdraw_with_verified_account(self):
        """Test user can withdraw with verified bank account"""
        self.assertTrue(self.bank_account.is_verified)
        self.assertGreater(self.user.wallet_balance, 0)

    def test_withdrawal_reduces_balance(self):
        """Test withdrawal reduces wallet balance"""
        withdrawal_amount = Decimal('1000.00')
        original_balance = self.user.wallet_balance

        # Simulate withdrawal
        self.user.wallet_balance -= withdrawal_amount
        self.user.save()

        self.assertEqual(
            self.user.wallet_balance,
            original_balance - withdrawal_amount
        )
