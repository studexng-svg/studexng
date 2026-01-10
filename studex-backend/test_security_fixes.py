#!/usr/bin/env python
"""
Security Fixes Test Suite
Tests for Phase 1: Race Condition and Idempotency Fixes

Run: python test_security_fixes.py
"""

import os
import sys
import django
import threading
import time
from decimal import Decimal
from datetime import datetime

# Setup Django
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'studex.settings')
django.setup()

from django.contrib.auth import get_user_model
from django.db import transaction
from orders.models import Order
from wallet.models import Wallet, WalletTransaction, EscrowTransaction
from services.models import Listing, Category

User = get_user_model()


class Colors:
    """ANSI color codes for terminal output"""
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'


def print_header(text):
    print(f"\n{Colors.HEADER}{Colors.BOLD}{'='*80}{Colors.ENDC}")
    print(f"{Colors.HEADER}{Colors.BOLD}{text.center(80)}{Colors.ENDC}")
    print(f"{Colors.HEADER}{Colors.BOLD}{'='*80}{Colors.ENDC}\n")


def print_success(text):
    print(f"{Colors.OKGREEN}[PASS] {text}{Colors.ENDC}")


def print_error(text):
    print(f"{Colors.FAIL}[FAIL] {text}{Colors.ENDC}")


def print_warning(text):
    print(f"{Colors.WARNING}[WARN] {text}{Colors.ENDC}")


def print_info(text):
    print(f"{Colors.OKCYAN}[INFO] {text}{Colors.ENDC}")


class SecurityTestSuite:
    """Test suite for security fixes"""

    def __init__(self):
        self.test_results = []
        self.setup_complete = False

    def setup_test_data(self):
        """Create test users, wallet, and orders"""
        print_header("SETUP: Creating Test Data")

        try:
            # Clean up existing test data
            print_info("Cleaning up old test data...")
            User.objects.filter(email__startswith='test_security_').delete()

            # Create test buyer
            print_info("Creating test buyer...")
            self.buyer = User.objects.create_user(
                username='test_security_buyer',
                email='test_security_buyer@test.com',
                password='testpass123',
                user_type='student'
            )

            # Create test vendor
            print_info("Creating test vendor...")
            self.vendor = User.objects.create_user(
                username='test_security_vendor',
                email='test_security_vendor@test.com',
                password='testpass123',
                user_type='vendor'
            )

            # Create buyer wallet with NGN 10,000
            print_info("Creating buyer wallet with NGN 10,000...")
            self.wallet = Wallet.objects.create(
                user=self.buyer,
                balance=Decimal('10000.00')
            )

            # Create test category
            category, _ = Category.objects.get_or_create(
                slug='test-category',
                defaults={'title': 'Test Category'}
            )

            # Create test listing
            print_info("Creating test listing...")
            self.listing = Listing.objects.create(
                vendor=self.vendor,
                category=category,
                title='Test Product',
                description='Test product for security testing',
                price=Decimal('4000.00'),
                is_available=True
            )

            print_success("Test data setup complete!\n")
            self.setup_complete = True

        except Exception as e:
            print_error(f"Setup failed: {str(e)}")
            raise

    def create_test_order(self, amount=None):
        """Create a test order"""
        import uuid
        if amount is None:
            amount = self.listing.price

        order = Order.objects.create(
            reference=f"TEST-{uuid.uuid4().hex[:10].upper()}",
            buyer=self.buyer,
            listing=self.listing,
            amount=amount,
            status='pending'
        )
        return order

    def test_1_race_condition_concurrent_payments(self):
        """
        TEST 1: Race Condition - Concurrent Wallet Payments

        Scenario: User with NGN 10,000 tries to make two NGN 7,000 payments simultaneously
        Expected: First succeeds, second fails with "Insufficient balance"
        """
        print_header("TEST 1: Race Condition - Concurrent Payments")

        test_name = "Race Condition Prevention"

        try:
            # Reset wallet to NGN 10,000
            self.wallet.balance = Decimal('10000.00')
            self.wallet.save()

            initial_balance = self.wallet.balance
            print_info(f"Initial wallet balance: NGN {initial_balance}")

            # Create two orders of NGN 7,000 each
            order1 = self.create_test_order(Decimal('7000.00'))
            order2 = self.create_test_order(Decimal('7000.00'))

            print_info(f"Order 1: NGN {order1.amount} (ID: {order1.id})")
            print_info(f"Order 2: NGN {order2.amount} (ID: {order2.id})")
            print_info("Attempting concurrent payments...\n")

            # Track results
            results = {'order1': None, 'order2': None}
            errors = {'order1': None, 'order2': None}

            def pay_order_1():
                try:
                    from orders.views import OrderViewSet
                    from rest_framework.test import APIRequestFactory
                    from django.contrib.auth.models import AnonymousUser

                    factory = APIRequestFactory()
                    request = factory.post('/')
                    request.user = self.buyer

                    view = OrderViewSet()
                    view.kwargs = {'pk': order1.id}

                    with transaction.atomic():
                        response = view.confirm_payment(request, pk=order1.id)
                        results['order1'] = response.status_code

                except Exception as e:
                    errors['order1'] = str(e)

            def pay_order_2():
                try:
                    from orders.views import OrderViewSet
                    from rest_framework.test import APIRequestFactory

                    factory = APIRequestFactory()
                    request = factory.post('/')
                    request.user = self.buyer

                    view = OrderViewSet()
                    view.kwargs = {'pk': order2.id}

                    with transaction.atomic():
                        response = view.confirm_payment(request, pk=order2.id)
                        results['order2'] = response.status_code

                except Exception as e:
                    errors['order2'] = str(e)

            # Create threads
            thread1 = threading.Thread(target=pay_order_1)
            thread2 = threading.Thread(target=pay_order_2)

            # Start both threads simultaneously
            thread1.start()
            thread2.start()

            # Wait for completion
            thread1.join()
            thread2.join()

            # Refresh wallet
            self.wallet.refresh_from_db()
            final_balance = self.wallet.balance

            # Check results
            print_info(f"Order 1 result: {results['order1']} (Error: {errors['order1']})")
            print_info(f"Order 2 result: {results['order2']} (Error: {errors['order2']})")
            print_info(f"Final wallet balance: NGN {final_balance}\n")

            # Refresh orders
            order1.refresh_from_db()
            order2.refresh_from_db()

            paid_orders = [order1, order2]
            paid_count = sum(1 for o in paid_orders if o.status == 'paid')

            # Verify results
            checks = []

            # Check 1: Exactly one order should succeed
            if paid_count == 1:
                print_success("Check 1: Exactly ONE order paid (correct)")
                checks.append(True)
            else:
                print_error(f"Check 1: {paid_count} orders paid (expected 1)")
                checks.append(False)

            # Check 2: Final balance should be NGN 3,000 (NGN 10,000 - NGN 7,000)
            expected_balance = Decimal('3000.00')
            if final_balance == expected_balance:
                print_success(f"Check 2: Balance is NGN {final_balance} (correct)")
                checks.append(True)
            else:
                print_error(f"Check 2: Balance is NGN {final_balance} (expected NGN {expected_balance})")
                checks.append(False)

            # Check 3: Balance should never go negative
            if final_balance >= 0:
                print_success(f"Check 3: Balance is positive (NGN {final_balance})")
                checks.append(True)
            else:
                print_error(f"Check 3: Balance went NEGATIVE (NGN {final_balance})")
                checks.append(False)

            # Check 4: Transaction count matches
            transaction_count = WalletTransaction.objects.filter(
                wallet=self.wallet,
                type='debit',
                status='success'
            ).count()

            if transaction_count == paid_count:
                print_success(f"Check 4: Transaction count matches paid orders ({transaction_count})")
                checks.append(True)
            else:
                print_error(f"Check 4: {transaction_count} transactions but {paid_count} paid orders")
                checks.append(False)

            # Overall result
            if all(checks):
                print_success(f"\nTEST 1 PASSED: Race condition prevented!\n")
                self.test_results.append((test_name, True, "All checks passed"))
                return True
            else:
                print_error(f"\nTEST 1 FAILED: Race condition not prevented!\n")
                self.test_results.append((test_name, False, f"{checks.count(False)} checks failed"))
                return False

        except Exception as e:
            print_error(f"\nTEST 1 ERROR: {str(e)}\n")
            import traceback
            traceback.print_exc()
            self.test_results.append((test_name, False, str(e)))
            return False

    def test_2_idempotency_duplicate_status_check(self):
        """
        TEST 2: Idempotency - Order Already Paid Check

        Scenario: Try to pay the same order twice
        Expected: Second attempt returns success without re-processing
        """
        print_header("TEST 2: Idempotency - Duplicate Status Check")

        test_name = "Order Already Paid Check"

        try:
            # Reset wallet
            self.wallet.balance = Decimal('10000.00')
            self.wallet.save()

            initial_balance = self.wallet.balance
            print_info(f"Initial wallet balance: NGN {initial_balance}")

            # Create order
            order = self.create_test_order(Decimal('2000.00'))
            print_info(f"Created order: NGN {order.amount} (ID: {order.id})")

            # First payment
            print_info("Attempting first payment...")
            from orders.views import OrderViewSet
            from rest_framework.test import APIRequestFactory

            factory = APIRequestFactory()
            request1 = factory.post('/', {'payment_method': 'wallet'})
            request1.user = self.buyer

            view = OrderViewSet()
            view.kwargs = {'pk': order.id}

            response1 = view.confirm_payment(request1, pk=order.id)

            print_info(f"First payment response: {response1.status_code}")

            # Refresh
            order.refresh_from_db()
            self.wallet.refresh_from_db()

            balance_after_first = self.wallet.balance
            print_info(f"Balance after first payment: NGN {balance_after_first}")

            # Second payment (should be idempotent)
            print_info("Attempting second payment (duplicate)...")
            request2 = factory.post('/', {'payment_method': 'wallet'})
            request2.user = self.buyer

            response2 = view.confirm_payment(request2, pk=order.id)

            print_info(f"Second payment response: {response2.status_code}\n")

            # Refresh again
            self.wallet.refresh_from_db()
            balance_after_second = self.wallet.balance

            # Verify results
            checks = []

            # Check 1: First payment should succeed
            if response1.status_code == 200:
                print_success("Check 1: First payment succeeded")
                checks.append(True)
            else:
                print_error(f"Check 1: First payment failed ({response1.status_code})")
                checks.append(False)

            # Check 2: Second payment should return 200 (idempotent success)
            if response2.status_code == 200:
                print_success("Check 2: Second payment returned success (idempotent)")
                checks.append(True)
            else:
                print_error(f"Check 2: Second payment failed ({response2.status_code})")
                checks.append(False)

            # Check 3: Balance should only be deducted ONCE
            expected_balance = initial_balance - order.amount
            if balance_after_second == expected_balance == balance_after_first:
                print_success(f"Check 3: Balance deducted only once (NGN {balance_after_second})")
                checks.append(True)
            else:
                print_error(f"Check 3: Balance incorrect (NGN {balance_after_second}, expected NGN {expected_balance})")
                checks.append(False)

            # Check 4: Only ONE wallet transaction created
            transaction_count = WalletTransaction.objects.filter(
                wallet=self.wallet,
                order=order,
                type='debit'
            ).count()

            if transaction_count == 1:
                print_success(f"Check 4: Only ONE transaction created")
                checks.append(True)
            else:
                print_error(f"Check 4: {transaction_count} transactions created (expected 1)")
                checks.append(False)

            # Check 5: Only ONE escrow created
            escrow_count = EscrowTransaction.objects.filter(order=order).count()

            if escrow_count == 1:
                print_success(f"Check 5: Only ONE escrow created")
                checks.append(True)
            else:
                print_error(f"Check 5: {escrow_count} escrows created (expected 1)")
                checks.append(False)

            # Overall result
            if all(checks):
                print_success(f"\nTEST 2 PASSED: Idempotency working correctly!\n")
                self.test_results.append((test_name, True, "All checks passed"))
                return True
            else:
                print_error(f"\nTEST 2 FAILED: Idempotency not working!\n")
                self.test_results.append((test_name, False, f"{checks.count(False)} checks failed"))
                return False

        except Exception as e:
            print_error(f"\nTEST 2 ERROR: {str(e)}\n")
            import traceback
            traceback.print_exc()
            self.test_results.append((test_name, False, str(e)))
            return False

    def test_3_stress_test_multiple_concurrent(self):
        """
        TEST 3: Stress Test - Multiple Concurrent Payments

        Scenario: 10 concurrent payments with limited balance
        Expected: Exactly 5 succeed (NGN 10,000 / NGN 2,000 = 5)
        """
        print_header("TEST 3: Stress Test - Multiple Concurrent Payments")

        test_name = "Stress Test (10 concurrent)"

        try:
            # Reset wallet to NGN 10,000
            self.wallet.balance = Decimal('10000.00')
            self.wallet.save()

            initial_balance = self.wallet.balance
            print_info(f"Initial wallet balance: NGN {initial_balance}")
            print_info("Creating 10 orders of NGN 2,000 each...")

            # Create 10 orders
            orders = []
            for i in range(10):
                order = self.create_test_order(Decimal('2000.00'))
                orders.append(order)

            print_info(f"Created {len(orders)} orders")
            print_info("Starting concurrent payment attempts...\n")

            # Track results
            results = {}

            def pay_order(order_id, index):
                try:
                    from orders.views import OrderViewSet
                    from rest_framework.test import APIRequestFactory

                    factory = APIRequestFactory()
                    request = factory.post('/', {'payment_method': 'wallet'})
                    request.user = self.buyer

                    view = OrderViewSet()
                    view.kwargs = {'pk': order_id}

                    with transaction.atomic():
                        response = view.confirm_payment(request, pk=order_id)
                        results[index] = {
                            'status': response.status_code,
                            'order_id': order_id
                        }

                except Exception as e:
                    results[index] = {
                        'status': 'error',
                        'order_id': order_id,
                        'error': str(e)
                    }

            # Create threads
            threads = []
            for i, order in enumerate(orders):
                thread = threading.Thread(target=pay_order, args=(order.id, i))
                threads.append(thread)

            # Start all threads
            start_time = time.time()
            for thread in threads:
                thread.start()

            # Wait for all to complete
            for thread in threads:
                thread.join()

            elapsed_time = time.time() - start_time

            print_info(f"All threads completed in {elapsed_time:.2f} seconds\n")

            # Analyze results
            success_count = sum(1 for r in results.values() if r['status'] == 200)
            failed_count = len(results) - success_count

            print_info(f"Successful payments: {success_count}")
            print_info(f"Failed payments: {failed_count}")

            # Refresh wallet
            self.wallet.refresh_from_db()
            final_balance = self.wallet.balance

            print_info(f"Final wallet balance: NGN {final_balance}\n")

            # Verify results
            checks = []

            # Check 1: Exactly 5 orders should succeed
            if success_count == 5:
                print_success(f"Check 1: Exactly 5 payments succeeded (correct)")
                checks.append(True)
            else:
                print_error(f"Check 1: {success_count} payments succeeded (expected 5)")
                checks.append(False)

            # Check 2: Final balance should be NGN 0
            if final_balance == Decimal('0.00'):
                print_success(f"Check 2: Final balance is NGN 0 (correct)")
                checks.append(True)
            else:
                print_error(f"Check 2: Final balance is NGN {final_balance} (expected NGN 0)")
                checks.append(False)

            # Check 3: Balance should not be negative
            if final_balance >= 0:
                print_success(f"Check 3: Balance is not negative")
                checks.append(True)
            else:
                print_error(f"Check 3: Balance went NEGATIVE (NGN {final_balance})")
                checks.append(False)

            # Check 4: Transaction count matches successful payments
            transaction_count = WalletTransaction.objects.filter(
                wallet=self.wallet,
                type='debit',
                status='success'
            ).count()

            # Note: May have old transactions from previous tests
            recent_transactions = WalletTransaction.objects.filter(
                wallet=self.wallet,
                type='debit',
                status='success',
                order__in=orders
            ).count()

            if recent_transactions == success_count:
                print_success(f"Check 4: Transaction count matches ({recent_transactions})")
                checks.append(True)
            else:
                print_error(f"Check 4: {recent_transactions} transactions but {success_count} payments")
                checks.append(False)

            # Check 5: All transactions are for NGN 2,000
            transactions = WalletTransaction.objects.filter(
                wallet=self.wallet,
                order__in=orders,
                type='debit'
            )

            all_correct_amount = all(t.amount == Decimal('2000.00') for t in transactions)

            if all_correct_amount:
                print_success(f"Check 5: All transactions are NGN 2,000")
                checks.append(True)
            else:
                print_error(f"Check 5: Some transactions have wrong amount")
                checks.append(False)

            # Overall result
            if all(checks):
                print_success(f"\nTEST 3 PASSED: Stress test successful!\n")
                self.test_results.append((test_name, True, "All checks passed"))
                return True
            else:
                print_error(f"\nTEST 3 FAILED: Stress test failed!\n")
                self.test_results.append((test_name, False, f"{checks.count(False)} checks failed"))
                return False

        except Exception as e:
            print_error(f"\nTEST 3 ERROR: {str(e)}\n")
            import traceback
            traceback.print_exc()
            self.test_results.append((test_name, False, str(e)))
            return False

    def print_summary(self):
        """Print test summary"""
        print_header("TEST SUMMARY")

        total_tests = len(self.test_results)
        passed_tests = sum(1 for _, passed, _ in self.test_results if passed)
        failed_tests = total_tests - passed_tests

        print(f"\nTotal Tests: {total_tests}")
        print(f"Passed: {Colors.OKGREEN}{passed_tests}{Colors.ENDC}")
        print(f"Failed: {Colors.FAIL}{failed_tests}{Colors.ENDC}\n")

        for test_name, passed, message in self.test_results:
            if passed:
                print_success(f"{test_name}: {message}")
            else:
                print_error(f"{test_name}: {message}")

        print("\n")

        if failed_tests == 0:
            print_success("=" * 80)
            print_success(" ALL TESTS PASSED! Security fixes working correctly! ".center(80))
            print_success("=" * 80)
        else:
            print_error("=" * 80)
            print_error(f" {failed_tests} TEST(S) FAILED! Please review issues above. ".center(80))
            print_error("=" * 80)

        print("\n")

    def run_all_tests(self):
        """Run all security tests"""
        print_header("STUDEX SECURITY FIXES TEST SUITE")
        print_info(f"Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print_info("Testing: Race Condition and Idempotency Fixes\n")

        # Setup
        self.setup_test_data()

        if not self.setup_complete:
            print_error("Setup failed! Cannot continue with tests.")
            return False

        # Run tests
        self.test_1_race_condition_concurrent_payments()
        self.test_2_idempotency_duplicate_status_check()
        self.test_3_stress_test_multiple_concurrent()

        # Summary
        self.print_summary()

        # Return overall success
        return all(passed for _, passed, _ in self.test_results)


def main():
    """Main test runner"""
    suite = SecurityTestSuite()
    success = suite.run_all_tests()

    # Exit with appropriate code
    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()
