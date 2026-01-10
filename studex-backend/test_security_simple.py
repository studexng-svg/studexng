#!/usr/bin/env python
"""
Simplified Security Fixes Test
Direct testing without ViewSets

Run: python test_security_simple.py
"""

import os
import sys
import django
import threading
from decimal import Decimal

# Setup Django
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'studex.settings')
django.setup()

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import F
from orders.models import Order
from wallet.models import Wallet, WalletTransaction
from services.models import Listing, Category

User = get_user_model()


def setup_test_data():
    """Create test data"""
    print("\n" + "="*80)
    print("SETUP: Creating Test Data".center(80))
    print("="*80 + "\n")

    # Clean up
    User.objects.filter(email__startswith='test_security_').delete()

    # Create users
    buyer = User.objects.create_user(
        username='test_security_buyer',
        email='test_security_buyer@test.com',
        password='testpass123',
        user_type='student'
    )

    vendor = User.objects.create_user(
        username='test_security_vendor',
        email='test_security_vendor@test.com',
        password='testpass123',
        user_type='vendor'
    )

    # Create wallet
    wallet = Wallet.objects.create(
        user=buyer,
        balance=Decimal('10000.00')
    )

    # Create listing
    category, _ = Category.objects.get_or_create(
        slug='test-category',
        defaults={'title': 'Test Category'}
    )

    listing = Listing.objects.create(
        vendor=vendor,
        category=category,
        title='Test Product',
        description='Test product',
        price=Decimal('4000.00'),
        is_available=True
    )

    print("[PASS] Test data created successfully!\n")
    return buyer, vendor, wallet, listing


def test_race_condition():
    """
    TEST 1: Race Condition - Direct Wallet Test

    Test that select_for_update() prevents race condition
    """
    print("\n" + "="*80)
    print("TEST 1: Race Condition Prevention".center(80))
    print("="*80 + "\n")

    buyer, _, wallet, listing = setup_test_data()

    # Reset wallet
    wallet.balance = Decimal('10000.00')
    wallet.save()

    print(f"[INFO] Initial balance: NGN {wallet.balance}")
    print(f"[INFO] Attempting 2 concurrent NGN 7,000 deductions...")
    print(f"[INFO] Expected: Only ONE should succeed\n")

    results = []
    errors = []

    def deduct_money(amount_to_deduct, thread_id):
        """Simulate wallet payment deduction with locking"""
        try:
            with transaction.atomic():
                # CRITICAL FIX: Use select_for_update() to lock the row
                locked_wallet = Wallet.objects.select_for_update().get(user=buyer)

                # Check balance
                if locked_wallet.balance < amount_to_deduct:
                    results.append((thread_id, False, f"Insufficient balance: {locked_wallet.balance}"))
                    return

                # Deduct using F() for atomic update
                locked_wallet.balance = F('balance') - amount_to_deduct
                locked_wallet.save()

                results.append((thread_id, True, "Success"))

        except Exception as e:
            errors.append((thread_id, str(e)))

    # Create threads
    thread1 = threading.Thread(target=deduct_money, args=(Decimal('7000.00'), 1))
    thread2 = threading.Thread(target=deduct_money, args=(Decimal('7000.00'), 2))

    # Start both
    thread1.start()
    thread2.start()

    # Wait
    thread1.join()
    thread2.join()

    # Check results
    wallet.refresh_from_db()
    final_balance = wallet.balance

    print(f"[INFO] Thread 1: {results[0] if len(results) > 0 else 'Error'}")
    print(f"[INFO] Thread 2: {results[1] if len(results) > 1 else 'Error'}")
    print(f"[INFO] Final balance: NGN {final_balance}\n")

    # Verify
    success_count = sum(1 for _, success, _ in results if success)
    checks = []

    # Check 1: Exactly one should succeed
    if success_count == 1:
        print(f"[PASS] Check 1: Exactly ONE deduction succeeded")
        checks.append(True)
    else:
        print(f"[FAIL] Check 1: {success_count} deductions succeeded (expected 1)")
        checks.append(False)

    # Check 2: Balance should be NGN 3,000
    expected_balance = Decimal('3000.00')
    if final_balance == expected_balance:
        print(f"[PASS] Check 2: Balance is NGN {final_balance} (correct)")
        checks.append(True)
    else:
        print(f"[FAIL] Check 2: Balance is NGN {final_balance} (expected NGN {expected_balance})")
        checks.append(False)

    # Check 3: Balance should not be negative
    if final_balance >= 0:
        print(f"[PASS] Check 3: Balance is not negative")
        checks.append(True)
    else:
        print(f"[FAIL] Check 3: Balance went NEGATIVE (NGN {final_balance})")
        checks.append(False)

    if all(checks):
        print(f"\n[PASS] TEST 1 PASSED: Race condition prevented!\n")
        return True
    else:
        print(f"\n[FAIL] TEST 1 FAILED: Race condition not prevented!\n")
        return False


def test_stress():
    """
    TEST 2: Stress Test - 10 Concurrent Deductions

    Test wallet handles high concurrency correctly
    """
    print("\n" + "="*80)
    print("TEST 2: Stress Test (10 Concurrent)".center(80))
    print("="*80 + "\n")

    buyer, _, wallet, listing = setup_test_data()

    # Reset wallet
    wallet.balance = Decimal('10000.00')
    wallet.save()

    print(f"[INFO] Initial balance: NGN {wallet.balance}")
    print(f"[INFO] Attempting 10 concurrent NGN 2,000 deductions...")
    print(f"[INFO] Expected: Exactly 5 should succeed\n")

    results = []

    def deduct_money(amount_to_deduct, thread_id):
        """Simulate wallet payment deduction"""
        try:
            with transaction.atomic():
                locked_wallet = Wallet.objects.select_for_update().get(user=buyer)

                if locked_wallet.balance < amount_to_deduct:
                    results.append((thread_id, False))
                    return

                locked_wallet.balance = F('balance') - amount_to_deduct
                locked_wallet.save()
                results.append((thread_id, True))

        except Exception as e:
            results.append((thread_id, False))

    # Create 10 threads
    threads = []
    for i in range(10):
        thread = threading.Thread(target=deduct_money, args=(Decimal('2000.00'), i))
        threads.append(thread)

    # Start all
    for thread in threads:
        thread.start()

    # Wait for all
    for thread in threads:
        thread.join()

    # Check results
    wallet.refresh_from_db()
    final_balance = wallet.balance
    success_count = sum(1 for _, success in results if success)

    print(f"[INFO] Successful deductions: {success_count}/10")
    print(f"[INFO] Final balance: NGN {final_balance}\n")

    # Verify
    checks = []

    # Check 1: Exactly 5 should succeed
    if success_count == 5:
        print(f"[PASS] Check 1: Exactly 5 deductions succeeded")
        checks.append(True)
    else:
        print(f"[FAIL] Check 1: {success_count} deductions succeeded (expected 5)")
        checks.append(False)

    # Check 2: Balance should be NGN 0
    if final_balance == Decimal('0.00'):
        print(f"[PASS] Check 2: Final balance is NGN 0 (correct)")
        checks.append(True)
    else:
        print(f"[FAIL] Check 2: Final balance is NGN {final_balance} (expected NGN 0)")
        checks.append(False)

    # Check 3: Balance should not be negative
    if final_balance >= 0:
        print(f"[PASS] Check 3: Balance is not negative")
        checks.append(True)
    else:
        print(f"[FAIL] Check 3: Balance went NEGATIVE (NGN {final_balance})")
        checks.append(False)

    if all(checks):
        print(f"\n[PASS] TEST 2 PASSED: Stress test successful!\n")
        return True
    else:
        print(f"\n[FAIL] TEST 2 FAILED: Stress test failed!\n")
        return False


def main():
    """Run all tests"""
    print("\n" + "="*80)
    print("STUDEX SECURITY FIXES - SIMPLIFIED TEST SUITE".center(80))
    print("="*80)

    test1_passed = test_race_condition()
    test2_passed = test_stress()

    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY".center(80))
    print("="*80 + "\n")

    total = 2
    passed = sum([test1_passed, test2_passed])
    failed = total - passed

    print(f"Total Tests: {total}")
    print(f"Passed: {passed}")
    print(f"Failed: {failed}\n")

    if failed == 0:
        print("="*80)
        print("ALL TESTS PASSED! Security fixes working!".center(80))
        print("="*80 + "\n")
        sys.exit(0)
    else:
        print("="*80)
        print(f"{failed} TEST(S) FAILED!".center(80))
        print("="*80 + "\n")
        sys.exit(1)


if __name__ == '__main__':
    main()
