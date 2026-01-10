#!/usr/bin/env python
"""
Setup test data for Task 2.2 & 2.3: Order & Wallet Flow Testing

Creates:
- Test buyer and seller accounts
- Test categories and listings
- Funds buyer's wallet
- Creates bank accounts for testing withdrawals
"""

import os
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'studex.settings')
django.setup()

from django.contrib.auth import get_user_model
from services.models import Category, Listing
from wallet.models import Wallet, BankAccount
from decimal import Decimal

User = get_user_model()

def create_test_users():
    """Create test buyer and vendor accounts"""
    print("\n📝 Creating test users...")

    # Create test buyer
    buyer, created = User.objects.get_or_create(
        email='testbuyer@pau.edu.ng',
        defaults={
            'username': 'testbuyer',
            'user_type': 'student',
            'matric_number': 'PAU/2024/001',
            'hostel': 'Cedar',
        }
    )
    if created:
        buyer.set_password('test1234')
        buyer.save()
        print(f"✅ Created buyer: {buyer.email}")
    else:
        print(f"ℹ️  Buyer already exists: {buyer.email}")

    # Create test vendor (seller)
    vendor, created = User.objects.get_or_create(
        email='testvendor@pau.edu.ng',
        defaults={
            'username': 'testvendor',
            'user_type': 'vendor',
            'is_verified_vendor': True,
            'business_name': 'Test Foods & Services',
        }
    )
    if created:
        vendor.set_password('test1234')
        vendor.save()
        print(f"✅ Created vendor: {vendor.email}")
    else:
        print(f"ℹ️  Vendor already exists: {vendor.email}")

    # Fund buyer's wallet
    wallet, created = Wallet.objects.get_or_create(user=buyer)
    if wallet.balance < Decimal('5000.00'):
        wallet.balance = Decimal('5000.00')
        wallet.save()
        print(f"✅ Funded buyer wallet: ₦{wallet.balance}")
    else:
        print(f"ℹ️  Buyer wallet balance: ₦{wallet.balance}")

    # Fund vendor's wallet (for testing withdrawal)
    vendor_wallet, created = Wallet.objects.get_or_create(user=vendor)
    if vendor_wallet.balance < Decimal('10000.00'):
        vendor_wallet.balance = Decimal('10000.00')
        vendor_wallet.save()
        print(f"✅ Funded vendor wallet: ₦{vendor_wallet.balance}")
    else:
        print(f"ℹ️  Vendor wallet balance: ₦{vendor_wallet.balance}")

    return buyer, vendor


def create_test_categories():
    """Create test categories"""
    print("\n📦 Creating test categories...")

    categories_data = [
        {'title': 'Food', 'slug': 'food'},
        {'title': 'Drinks', 'slug': 'drinks'},
        {'title': 'Services', 'slug': 'services'},
    ]

    categories = []
    for cat_data in categories_data:
        cat, created = Category.objects.get_or_create(
            slug=cat_data['slug'],
            defaults={'title': cat_data['title']}
        )
        categories.append(cat)
        if created:
            print(f"✅ Created category: {cat.title}")
        else:
            print(f"ℹ️  Category already exists: {cat.title}")

    return categories


def create_test_listings(vendor, categories):
    """Create test product listings"""
    print("\n🛍️  Creating test listings...")

    food_category = next((c for c in categories if c.slug == 'food'), categories[0])

    listings_data = [
        {
            'title': 'Jollof Rice + Chicken',
            'description': 'Delicious jollof rice with grilled chicken. Served hot and fresh.',
            'price': Decimal('1000.00'),
            'category': food_category,
        },
        {
            'title': 'Fried Rice Combo',
            'description': 'Fried rice with chicken, plantain, and coleslaw.',
            'price': Decimal('1500.00'),
            'category': food_category,
        },
        {
            'title': 'Spaghetti Bolognese',
            'description': 'Classic spaghetti with meat sauce and vegetables.',
            'price': Decimal('800.00'),
            'category': food_category,
        },
    ]

    listings = []
    for listing_data in listings_data:
        listing, created = Listing.objects.get_or_create(
            vendor=vendor,
            title=listing_data['title'],
            defaults={
                'description': listing_data['description'],
                'price': listing_data['price'],
                'category': listing_data['category'],
                'is_available': True,
            }
        )
        listings.append(listing)
        if created:
            print(f"✅ Created listing: {listing.title} (₦{listing.price})")
        else:
            print(f"ℹ️  Listing already exists: {listing.title} (₦{listing.price})")

    return listings


def create_test_bank_accounts(buyer, vendor):
    """Create test bank accounts for withdrawal testing"""
    print("\n🏦 Creating test bank accounts...")

    # Create bank account for buyer
    buyer_bank, created = BankAccount.objects.get_or_create(
        user=buyer,
        defaults={
            'account_number': '0123456789',
            'bank_code': '058',
            'bank_name': 'Guaranty Trust Bank',
            'account_holder_name': 'Test Buyer',
            'is_verified': True,  # Pre-verified for testing
        }
    )
    if created:
        print(f"✅ Created bank account for buyer: GTBank ****{buyer_bank.account_number[-4:]}")
    else:
        # Update verification if already exists
        if not buyer_bank.is_verified:
            buyer_bank.is_verified = True
            buyer_bank.save()
        print(f"ℹ️  Bank account already exists for buyer: {buyer_bank.bank_name}")

    # Create bank account for vendor
    vendor_bank, created = BankAccount.objects.get_or_create(
        user=vendor,
        defaults={
            'account_number': '9876543210',
            'bank_code': '058',
            'bank_name': 'Guaranty Trust Bank',
            'account_holder_name': 'Test Vendor',
            'is_verified': True,  # Pre-verified for testing
        }
    )
    if created:
        print(f"✅ Created bank account for vendor: GTBank ****{vendor_bank.account_number[-4:]}")
    else:
        # Update verification if already exists
        if not vendor_bank.is_verified:
            vendor_bank.is_verified = True
            vendor_bank.save()
        print(f"ℹ️  Bank account already exists for vendor: {vendor_bank.bank_name}")

    return buyer_bank, vendor_bank


def display_test_data_summary(buyer, vendor, listings, buyer_bank, vendor_bank):
    """Display summary of created test data"""
    print("\n" + "="*60)
    print("📊 TEST DATA SUMMARY")
    print("="*60)

    print(f"\n👤 Test Buyer:")
    print(f"   Email: {buyer.email}")
    print(f"   Password: test1234")
    print(f"   Username: {buyer.username}")
    print(f"   Wallet Balance: ₦{buyer.wallet.balance}")
    print(f"   Bank Account: {buyer_bank.bank_name} ****{buyer_bank.account_number[-4:]}")
    print(f"   Bank Verified: {buyer_bank.is_verified}")

    print(f"\n🏪 Test Vendor:")
    print(f"   Email: {vendor.email}")
    print(f"   Password: test1234")
    print(f"   Username: {vendor.username}")
    print(f"   Business: {vendor.business_name}")
    print(f"   Verified: {vendor.is_verified_vendor}")
    print(f"   Wallet Balance: ₦{vendor.wallet.balance}")
    print(f"   Bank Account: {vendor_bank.bank_name} ****{vendor_bank.account_number[-4:]}")
    print(f"   Bank Verified: {vendor_bank.is_verified}")

    print(f"\n📦 Test Listings ({len(listings)} items):")
    for listing in listings:
        print(f"   - {listing.title}: ₦{listing.price}")

    print("\n" + "="*60)
    print("✅ TEST DATA READY!")
    print("="*60)

    print("\n📝 Testing Tasks:")
    print("\n✅ Task 2.2: Order Flow")
    print("1. Login as buyer: testbuyer@pau.edu.ng / test1234")
    print("2. Browse listings and create an order")
    print("3. Pay with wallet (₦5,000 balance)")
    print("4. Login as vendor to mark order complete")
    print("5. Login as buyer to confirm receipt")
    print("6. Verify escrow released (95% to seller, 5% to platform)")

    print("\n✅ Task 2.3: Wallet & Payout Flow")
    print("1. Fund wallet via Paystack (use test card)")
    print("2. Test withdrawal (vendor has ₦10,000 balance)")
    print("3. Verify bank account details displayed")
    print("4. Check transaction history")
    print("5. Test insufficient balance scenarios")

    print("\n💳 Paystack Test Card:")
    print("   Card: 4084084084084081")
    print("   Expiry: 12/30")
    print("   CVV: 408")
    print("   PIN: 0000")
    print("   OTP: 123456")
    print()


def main():
    """Main setup function"""
    print("\n" + "="*60)
    print("🚀 SETTING UP TEST DATA FOR TASK 2.2 & 2.3")
    print("="*60)

    try:
        # Create test users
        buyer, vendor = create_test_users()

        # Create test categories
        categories = create_test_categories()

        # Create test listings
        listings = create_test_listings(vendor, categories)

        # Create test bank accounts
        buyer_bank, vendor_bank = create_test_bank_accounts(buyer, vendor)

        # Display summary
        display_test_data_summary(buyer, vendor, listings, buyer_bank, vendor_bank)

    except Exception as e:
        print(f"\n❌ Error setting up test data: {e}")
        import traceback
        traceback.print_exc()


if __name__ == '__main__':
    main()
