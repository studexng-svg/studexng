# Testing Fixtures Guide

Comprehensive guide to test fixtures and test data patterns used in the StudEx platform test suite.

## Table of Contents

- [Overview](#overview)
- [Common Fixtures](#common-fixtures)
- [Fixture Patterns by App](#fixture-patterns-by-app)
- [Best Practices](#best-practices)
- [Reusable Fixtures](#reusable-fixtures)
- [Fixture Helpers](#fixture-helpers)

---

## Overview

Test fixtures are predefined data used to set up a known state before running tests. This document describes all common fixture patterns used across the StudEx test suite to help developers write consistent and maintainable tests.

### Why Use Fixtures?

- **Consistency:** Standardized test data across all tests
- **DRY Principle:** Avoid duplicating test data setup code
- **Maintainability:** Single place to update test data patterns
- **Readability:** Clear, self-documenting test data

---

## Common Fixtures

### User Fixtures

#### Student User
```python
def setUp(self):
    self.user = User.objects.create_user(
        username='testuser',
        email='test@pau.edu.ng',
        password='testpass123',
        user_type='student'
    )
```

**Use cases:**
- Testing basic user functionality
- Testing buyer behavior
- Testing user profile features

---

#### Vendor User (Unverified)
```python
def setUp(self):
    self.vendor = User.objects.create_user(
        username='vendor',
        email='vendor@pau.edu.ng',
        password='pass123',
        user_type='vendor',
        business_name='Test Business',
        is_verified_vendor=False
    )
```

**Use cases:**
- Testing vendor registration flow
- Testing vendor verification process
- Testing access control for unverified vendors

---

#### Vendor User (Verified)
```python
def setUp(self):
    self.vendor = User.objects.create_user(
        username='vendor',
        email='vendor@pau.edu.ng',
        password='pass123',
        user_type='vendor',
        is_verified_vendor=True,
        business_name='Test Business'
    )
```

**Use cases:**
- Testing listing creation
- Testing order fulfillment
- Testing vendor-specific features

---

#### Admin User
```python
def setUp(self):
    self.admin = User.objects.create_user(
        username='admin',
        email='admin@pau.edu.ng',
        password='adminpass123',
        is_staff=True,
        is_superuser=True
    )
```

**Use cases:**
- Testing admin panel access
- Testing dispute resolution
- Testing vendor verification by admin

---

### Category Fixtures

#### Single Category
```python
def setUp(self):
    self.category = Category.objects.create(
        title='Food',
        slug='food'
    )
```

**Common categories:**
- `Food` (slug: 'food')
- `Nails` (slug: 'nails')
- `Hair` (slug: 'hair')
- `Study Materials` (slug: 'study-materials')
- `Clothing` (slug: 'clothing')

---

#### Multiple Categories
```python
def setUp(self):
    self.food = Category.objects.create(title='Food', slug='food')
    self.nails = Category.objects.create(title='Nails', slug='nails')
    self.hair = Category.objects.create(title='Hair', slug='hair')
```

**Use cases:**
- Testing category filtering
- Testing category browsing
- Testing multi-category operations

---

### Listing Fixtures

#### Basic Listing
```python
def setUp(self):
    self.listing = Listing.objects.create(
        vendor=self.vendor,
        category=self.category,
        title='Jollof Rice',
        description='Delicious jollof rice with chicken',
        price=Decimal('1000.00'),
        is_available=True
    )
```

**Common test listings:**
- **Food:** Jollof Rice (₦1000), Fried Rice (₦800)
- **Nails:** Gel Nails (₦3000)
- **Study Materials:** Economics Textbook (₦5000)

---

#### Unavailable Listing
```python
def setUp(self):
    self.listing = Listing.objects.create(
        vendor=self.vendor,
        category=self.category,
        title='Out of Stock Item',
        description='Temporarily unavailable',
        price=Decimal('500.00'),
        is_available=False
    )
```

**Use cases:**
- Testing availability filtering
- Testing order creation validation
- Testing vendor listing management

---

### Order Fixtures

#### Basic Order
```python
def setUp(self):
    self.order = Order.objects.create(
        buyer=self.buyer,
        listing=self.listing,
        amount=Decimal('1000.00'),
        status='pending'
    )
```

**Order statuses for testing:**
- `pending` - Initial state
- `paid` - After payment
- `confirmed` - Vendor confirmed
- `in_progress` - Being prepared
- `ready` - Ready for pickup/delivery
- `completed` - Delivered
- `cancelled` - Cancelled by buyer/vendor

---

#### Order with Full Lifecycle
```python
def setUp(self):
    self.order = Order.objects.create(
        buyer=self.buyer,
        listing=self.listing,
        amount=Decimal('1000.00'),
        status='paid',
        paid_at=timezone.now()
    )
```

**Use cases:**
- Testing order progression
- Testing status transitions
- Testing payment verification

---

### Wallet Fixtures

#### Wallet with Balance
```python
def setUp(self):
    self.wallet = Wallet.objects.create(user=self.user)
    self.user.wallet_balance = Decimal('5000.00')
    self.user.save()
```

**Common test balances:**
- Empty wallet: `Decimal('0.00')`
- Small balance: `Decimal('500.00')`
- Medium balance: `Decimal('5000.00')`
- Large balance: `Decimal('50000.00')`

---

#### Wallet Transaction
```python
def setUp(self):
    self.transaction = WalletTransaction.objects.create(
        wallet=self.wallet,
        type='credit',
        amount=Decimal('1000.00'),
        status='success',
        description='Test deposit'
    )
```

**Transaction types:**
- `credit` - Money added to wallet
- `debit` - Money removed from wallet

**Transaction statuses:**
- `pending` - Processing
- `success` - Completed
- `failed` - Failed transaction

---

#### Bank Account
```python
def setUp(self):
    self.bank_account = BankAccount.objects.create(
        user=self.user,
        account_holder_name='Test User',
        account_number='0123456789',
        bank_name='Test Bank',
        bank_code='001',
        is_verified=True
    )
```

**Use cases:**
- Testing withdrawal functionality
- Testing bank account verification
- Testing multiple bank accounts per user

---

### Escrow Fixtures

#### Escrow Transaction (5% Platform Fee)
```python
def setUp(self):
    # Calculate platform fee (5%)
    total_amount = Decimal('1000.00')
    platform_fee = total_amount * Decimal('0.05')  # ₦50
    seller_amount = total_amount - platform_fee     # ₦950

    self.escrow = EscrowTransaction.objects.create(
        order=self.order,
        buyer=self.buyer,
        seller=self.seller,
        total_amount=total_amount,
        seller_amount=seller_amount,
        platform_fee=platform_fee,
        status='held'
    )
```

**Escrow statuses:**
- `held` - Money in escrow
- `released` - Released to seller
- `refunded` - Refunded to buyer

---

### Chat Fixtures

#### Conversation
```python
def setUp(self):
    self.conversation = Conversation.objects.create(
        buyer=self.buyer,
        seller=self.seller,
        listing=self.listing
    )
```

---

#### Text Message
```python
def setUp(self):
    self.message = Message.objects.create(
        conversation=self.conversation,
        sender=self.buyer,
        message_type='text',
        content='Hello, is this available?',
        is_read=False
    )
```

---

#### Offer Message
```python
def setUp(self):
    self.offer = Message.objects.create(
        conversation=self.conversation,
        sender=self.buyer,
        message_type='offer',
        content='I would like to offer ₦800',
        offer_amount=Decimal('800.00'),
        offer_status='pending'
    )
```

**Offer statuses:**
- `pending` - Awaiting seller response
- `accepted` - Seller accepted
- `rejected` - Seller rejected
- `expired` - Offer expired

---

## Fixture Patterns by App

### Accounts App

**Typical setUp:**
```python
def setUp(self):
    # Create test user
    self.user = User.objects.create_user(
        username='testuser',
        email='test@pau.edu.ng',
        password='testpass123',
        user_type='student'
    )

    # Profile is auto-created via signal
    self.profile = self.user.profile
```

**API Testing setUp:**
```python
def setUp(self):
    self.client = APIClient()
    self.register_url = '/api/auth/register/'
    self.login_url = '/api/auth/login/'
    self.profile_url = '/api/user/profile/'

    self.user = User.objects.create_user(
        username='testuser',
        email='test@pau.edu.ng',
        password='testpass123'
    )

    # Authenticate for protected endpoints
    self.client.force_authenticate(user=self.user)
```

---

### Services App

**Typical setUp:**
```python
def setUp(self):
    # Create vendor
    self.vendor = User.objects.create_user(
        username='vendor',
        email='vendor@pau.edu.ng',
        password='pass123',
        user_type='vendor',
        is_verified_vendor=True
    )

    # Create category
    self.category = Category.objects.create(
        title='Food',
        slug='food'
    )

    # Create listing
    self.listing = Listing.objects.create(
        vendor=self.vendor,
        category=self.category,
        title='Jollof Rice',
        description='Delicious jollof rice',
        price=Decimal('1000.00'),
        is_available=True
    )
```

---

### Orders App

**Typical setUp:**
```python
def setUp(self):
    # Create buyer
    self.buyer = User.objects.create_user(
        username='buyer',
        email='buyer@pau.edu.ng',
        password='pass123'
    )

    # Create seller
    self.seller = User.objects.create_user(
        username='seller',
        email='seller@pau.edu.ng',
        password='pass123',
        user_type='vendor',
        is_verified_vendor=True
    )

    # Create listing
    self.category = Category.objects.create(title='Food', slug='food')
    self.listing = Listing.objects.create(
        vendor=self.seller,
        category=self.category,
        title='Jollof Rice',
        price=Decimal('1000.00')
    )

    # Create order
    self.order = Order.objects.create(
        buyer=self.buyer,
        listing=self.listing,
        amount=Decimal('1000.00')
    )
```

---

### Wallet App

**Typical setUp:**
```python
def setUp(self):
    # Create user with wallet balance
    self.user = User.objects.create_user(
        username='testuser',
        email='test@pau.edu.ng',
        password='pass123'
    )
    self.user.wallet_balance = Decimal('5000.00')
    self.user.save()

    # Create wallet
    self.wallet = Wallet.objects.create(user=self.user)

    # Create verified bank account
    self.bank_account = BankAccount.objects.create(
        user=self.user,
        account_holder_name='Test User',
        account_number='0123456789',
        bank_name='Test Bank',
        bank_code='001',
        is_verified=True
    )
```

---

### Chat App

**Typical setUp:**
```python
def setUp(self):
    # Create users
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

    # Create listing
    self.category = Category.objects.create(title='Food', slug='food')
    self.listing = Listing.objects.create(
        vendor=self.seller,
        category=self.category,
        title='Jollof Rice',
        price=Decimal('1000.00')
    )

    # Create conversation
    self.conversation = Conversation.objects.create(
        buyer=self.buyer,
        seller=self.seller,
        listing=self.listing
    )
```

---

## Best Practices

### 1. Use Consistent Test Data

**Good:**
```python
# Always use @pau.edu.ng domain for test emails
self.user = User.objects.create_user(
    username='testuser',
    email='test@pau.edu.ng',  # ✓ Consistent domain
    password='testpass123'
)
```

**Bad:**
```python
# Inconsistent email domains make tests unpredictable
self.user = User.objects.create_user(
    username='testuser',
    email='test@example.com',  # ✗ Wrong domain
    password='pass'
)
```

---

### 2. Use Decimal for Money

**Good:**
```python
from decimal import Decimal

self.listing = Listing.objects.create(
    price=Decimal('1000.00')  # ✓ Correct type
)
```

**Bad:**
```python
self.listing = Listing.objects.create(
    price=1000.00  # ✗ Float can cause precision issues
)
```

---

### 3. Set Realistic Status Values

**Good:**
```python
# Order must be paid before escrow
self.order.status = 'paid'
self.order.paid_at = timezone.now()
self.order.save()
```

**Bad:**
```python
# Creating escrow with pending order doesn't reflect reality
self.order.status = 'pending'  # ✗ Should be 'paid'
# Creating escrow anyway
```

---

### 4. Clean Up Resources

**Good:**
```python
def tearDown(self):
    # Clean up created objects if needed
    self.user.delete()
```

**Note:** Django's `TestCase` automatically rolls back database changes, so explicit cleanup is usually not needed. However, `TransactionTestCase` requires manual cleanup.

---

### 5. Use Descriptive Names

**Good:**
```python
self.verified_vendor = User.objects.create_user(...)
self.unverified_vendor = User.objects.create_user(...)
self.buyer_with_balance = User.objects.create_user(...)
```

**Bad:**
```python
self.user1 = User.objects.create_user(...)
self.user2 = User.objects.create_user(...)
self.user3 = User.objects.create_user(...)
```

---

## Reusable Fixtures

### Option 1: Mixin Classes

Create reusable fixture mixins:

```python
# tests/mixins.py

class UserFixtureMixin:
    """Provides common user fixtures"""

    def create_student(self, username='student', email=None):
        if not email:
            email = f'{username}@pau.edu.ng'
        return User.objects.create_user(
            username=username,
            email=email,
            password='testpass123',
            user_type='student'
        )

    def create_vendor(self, username='vendor', email=None, verified=True):
        if not email:
            email = f'{username}@pau.edu.ng'
        return User.objects.create_user(
            username=username,
            email=email,
            password='testpass123',
            user_type='vendor',
            is_verified_vendor=verified,
            business_name=f'{username} Business'
        )


class ListingFixtureMixin:
    """Provides common listing fixtures"""

    def create_listing(self, vendor, category=None, title='Test Listing',
                      price='1000.00', available=True):
        if not category:
            category = Category.objects.create(
                title='Test Category',
                slug='test-category'
            )

        return Listing.objects.create(
            vendor=vendor,
            category=category,
            title=title,
            description=f'{title} description',
            price=Decimal(price),
            is_available=available
        )


# Usage in tests
class MyTestCase(TestCase, UserFixtureMixin, ListingFixtureMixin):
    def setUp(self):
        self.vendor = self.create_vendor(verified=True)
        self.listing = self.create_listing(self.vendor, price='2000.00')
```

---

### Option 2: Factory Functions

Create factory functions for common objects:

```python
# tests/factories.py

from decimal import Decimal
from django.utils import timezone
from accounts.models import User
from services.models import Category, Listing
from orders.models import Order

def create_test_user(username='testuser', user_type='student', **kwargs):
    """Factory function for creating test users"""
    defaults = {
        'email': f'{username}@pau.edu.ng',
        'password': 'testpass123',
        'user_type': user_type,
    }
    defaults.update(kwargs)
    return User.objects.create_user(username=username, **defaults)


def create_test_category(title='Test Category', **kwargs):
    """Factory function for creating test categories"""
    defaults = {
        'slug': title.lower().replace(' ', '-'),
    }
    defaults.update(kwargs)
    return Category.objects.create(title=title, **defaults)


def create_test_listing(vendor, category=None, **kwargs):
    """Factory function for creating test listings"""
    if not category:
        category = create_test_category()

    defaults = {
        'title': 'Test Listing',
        'description': 'Test description',
        'price': Decimal('1000.00'),
        'is_available': True,
    }
    defaults.update(kwargs)

    return Listing.objects.create(
        vendor=vendor,
        category=category,
        **defaults
    )


def create_test_order(buyer, listing, **kwargs):
    """Factory function for creating test orders"""
    defaults = {
        'amount': listing.price,
        'status': 'pending',
    }
    defaults.update(kwargs)

    return Order.objects.create(
        buyer=buyer,
        listing=listing,
        **defaults
    )


# Usage in tests
from tests.factories import create_test_user, create_test_listing, create_test_order

class MyTestCase(TestCase):
    def setUp(self):
        self.buyer = create_test_user('buyer')
        self.seller = create_test_user('seller', user_type='vendor',
                                       is_verified_vendor=True)
        self.listing = create_test_listing(self.seller)
        self.order = create_test_order(self.buyer, self.listing)
```

---

### Option 3: pytest Fixtures (if using pytest)

```python
# conftest.py

import pytest
from decimal import Decimal
from accounts.models import User
from services.models import Category, Listing

@pytest.fixture
def student_user(db):
    return User.objects.create_user(
        username='student',
        email='student@pau.edu.ng',
        password='testpass123',
        user_type='student'
    )

@pytest.fixture
def verified_vendor(db):
    return User.objects.create_user(
        username='vendor',
        email='vendor@pau.edu.ng',
        password='testpass123',
        user_type='vendor',
        is_verified_vendor=True
    )

@pytest.fixture
def food_category(db):
    return Category.objects.create(title='Food', slug='food')

@pytest.fixture
def test_listing(verified_vendor, food_category):
    return Listing.objects.create(
        vendor=verified_vendor,
        category=food_category,
        title='Jollof Rice',
        price=Decimal('1000.00')
    )

# Usage
def test_something(student_user, test_listing):
    # Fixtures are automatically injected
    assert student_user.user_type == 'student'
    assert test_listing.price == Decimal('1000.00')
```

---

## Fixture Helpers

### Common Helper Methods

```python
class BaseTestCase(TestCase):
    """Base test case with helper methods"""

    def authenticate(self, user):
        """Authenticate user for API tests"""
        self.client.force_authenticate(user=user)

    def create_paid_order(self, buyer, listing):
        """Create an order in paid status"""
        order = Order.objects.create(
            buyer=buyer,
            listing=listing,
            amount=listing.price,
            status='paid',
            paid_at=timezone.now()
        )
        return order

    def create_escrow_for_order(self, order):
        """Create escrow transaction for an order"""
        platform_fee = order.amount * Decimal('0.05')
        seller_amount = order.amount - platform_fee

        return EscrowTransaction.objects.create(
            order=order,
            buyer=order.buyer,
            seller=order.listing.vendor,
            total_amount=order.amount,
            seller_amount=seller_amount,
            platform_fee=platform_fee,
            status='held'
        )

    def fund_wallet(self, user, amount):
        """Add funds to user's wallet"""
        user.wallet_balance = Decimal(str(amount))
        user.save()
        return user
```

---

## Quick Reference

### Test Email Domains
- Use `@pau.edu.ng` for all test emails
- Pattern: `{username}@pau.edu.ng`

### Common Test Passwords
- `testpass123` for users
- `pass123` for simple tests
- `adminpass123` for admin users

### Common Usernames
- `testuser` - Generic user
- `buyer` - Buyer in transactions
- `seller` / `vendor` - Seller in transactions
- `admin` - Admin user

### Common Prices (Nigerian Naira)
- `Decimal('500.00')` - Small item
- `Decimal('1000.00')` - Standard item
- `Decimal('3000.00')` - Premium item
- `Decimal('5000.00')` - Expensive item

### Platform Fee Calculation
```python
platform_fee = total_amount * Decimal('0.05')  # 5%
seller_amount = total_amount - platform_fee     # 95%
```

---

**Last Updated:** 2026-01-09
**Version:** 1.0
**Maintained by:** StudEx Development Team

For more information, see:
- [TEST_COVERAGE.md](TEST_COVERAGE.md) - Complete test suite documentation
- [AUTHENTICATION_TESTING.md](AUTHENTICATION_TESTING.md) - Authentication testing guide
