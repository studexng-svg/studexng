# accounts/test_delete_account.py
"""
Self-service account deletion (accounts.views.delete_account) — the
counterpart to AdminUserDetailView.delete, which only an admin can trigger.
Anonymizes PII and deactivates rather than hard-deleting the row (Order/
Review history stays intact, just unattributable), and blocks rather than
orphaning money or an in-flight order.
"""
from decimal import Decimal

from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework import status

from accounts.models import User, Vendor, VendorType, Profile
from orders.models import Order
from services.models import Category, Listing


class DeleteAccountTestBase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='del_user', email='del_user@pau.edu.ng', password='pass12345',
            phone='08011112222', matric_number='PAU/2020/001', hostel='Block A',
        )
        # accounts.models.create_user_profile (post_save on User) already
        # auto-created a blank Profile row — populate it, don't re-create it.
        Profile.objects.filter(user=self.user).update(
            whatsapp='08011112222', instagram='del_user_ig', department='CS', level='300',
        )
        self.client.force_authenticate(user=self.user)

    def _url(self):
        return '/api/auth/delete-account/'

    def _delete(self, password='pass12345'):
        return self.client.delete(self._url(), {'password': password}, format='json')


class DeleteAccountValidationTests(DeleteAccountTestBase):
    def test_requires_authentication(self):
        self.client.force_authenticate(user=None)
        res = self._delete()
        self.assertIn(res.status_code, (401, 403))

    def test_requires_password(self):
        res = self.client.delete(self._url(), {}, format='json')
        self.assertEqual(res.status_code, 400)
        self.user.refresh_from_db()
        self.assertTrue(self.user.is_active)

    def test_rejects_wrong_password(self):
        res = self._delete(password='wrongpass')
        self.assertEqual(res.status_code, 400)
        self.user.refresh_from_db()
        self.assertTrue(self.user.is_active)
        self.assertIsNone(self.user.deleted_at)


class DeleteAccountSafetyBlockTests(DeleteAccountTestBase):
    def _make_order(self, buyer=None, vendor=None, status_='paid'):
        vendor = vendor or User.objects.create_user(
            username=f'del_vendor_{Order.objects.count()}', email=f'del_v{Order.objects.count()}@pau.edu.ng', password='pass123',
        )
        category = Category.objects.create(title=f'DelCat{Order.objects.count()}', slug=f'del-cat-{Order.objects.count()}')
        listing = Listing.objects.create(
            title='Jollof', description='x', payout_amount=Decimal('1000'), price=Decimal('1080'),
            vendor=vendor, category=category, is_available=True,
        )
        return Order.objects.create(
            reference=f'STX-DEL-{Order.objects.count()}', buyer=buyer or self.user, listing=listing,
            amount=Decimal('1080'), status=status_,
        )

    def test_blocked_with_active_order_as_buyer(self):
        self._make_order(buyer=self.user, status_='paid')
        res = self._delete()
        self.assertEqual(res.status_code, 400)
        self.assertIn('order', res.data['error'].lower())
        self.user.refresh_from_db()
        self.assertTrue(self.user.is_active)

    def test_blocked_with_active_order_as_vendor(self):
        buyer = User.objects.create_user(username='del_buyer2', email='del_buyer2@pau.edu.ng', password='pass123')
        self._make_order(buyer=buyer, vendor=self.user, status_='seller_completed')
        res = self._delete()
        self.assertEqual(res.status_code, 400)

    def test_not_blocked_by_terminal_status_orders(self):
        for st in ('completed', 'cancelled', 'vendor_declined'):
            self._make_order(buyer=self.user, status_=st)
        res = self._delete()
        self.assertEqual(res.status_code, 200)

    def test_blocked_with_nonzero_wallet_balance(self):
        self.user.wallet_balance = Decimal('500.00')
        self.user.save(update_fields=['wallet_balance'])
        res = self._delete()
        self.assertEqual(res.status_code, 400)
        self.assertIn('wallet', res.data['error'].lower())
        self.user.refresh_from_db()
        self.assertTrue(self.user.is_active)

    def test_not_blocked_by_zero_wallet_balance(self):
        self.user.wallet_balance = Decimal('0.00')
        self.user.save(update_fields=['wallet_balance'])
        res = self._delete()
        self.assertEqual(res.status_code, 200)


class DeleteAccountEffectTests(DeleteAccountTestBase):
    def test_anonymizes_pii_and_deactivates(self):
        user_id = self.user.id
        res = self._delete()
        self.assertEqual(res.status_code, 200)

        self.user.refresh_from_db()
        self.assertEqual(self.user.username, f'deleted_user_{user_id}')
        self.assertIsNone(self.user.email)
        self.assertIsNone(self.user.phone)
        self.assertIsNone(self.user.matric_number)
        self.assertIsNone(self.user.nin)
        self.assertIsNone(self.user.hostel)
        self.assertIsNone(self.user.business_name)
        self.assertIsNone(self.user.bio)
        self.assertEqual(self.user.first_name, '')
        self.assertEqual(self.user.last_name, '')
        self.assertFalse(self.user.is_active)
        self.assertIsNotNone(self.user.deleted_at)
        self.assertFalse(self.user.check_password('pass12345'))

    def test_clears_profile_fields(self):
        self._delete()
        profile = Profile.objects.get(user=self.user)
        self.assertIsNone(profile.whatsapp)
        self.assertIsNone(profile.instagram)
        self.assertEqual(profile.department, '')
        self.assertEqual(profile.level, '')

    def test_hides_vendor_listings(self):
        food = VendorType.objects.get(name='food')
        Vendor.objects.create(user=self.user, vendor_type=food)
        category = Category.objects.create(title='DelVendCat', slug='del-vend-cat')
        listing = Listing.objects.create(
            title='Jollof', description='x', payout_amount=Decimal('1000'), price=Decimal('1080'),
            vendor=self.user, category=category, is_available=True,
        )
        self._delete()
        listing.refresh_from_db()
        self.assertFalse(listing.is_available)

    def test_pauses_vendor_delivery(self):
        food = VendorType.objects.get(name='food')
        vendor_record = Vendor.objects.create(user=self.user, vendor_type=food)
        self._delete()
        vendor_record.refresh_from_db()
        self.assertTrue(vendor_record.delivery_paused)

    def test_non_vendor_deletion_does_not_error(self):
        """No Vendor row at all — must not crash on Vendor.DoesNotExist."""
        res = self._delete()
        self.assertEqual(res.status_code, 200)

    def test_blacklists_outstanding_tokens(self):
        from rest_framework_simplejwt.tokens import RefreshToken
        from rest_framework_simplejwt.token_blacklist.models import OutstandingToken, BlacklistedToken

        refresh = RefreshToken.for_user(self.user)
        outstanding = OutstandingToken.objects.get(jti=refresh['jti'])
        self.assertFalse(BlacklistedToken.objects.filter(token=outstanding).exists())

        self._delete()

        self.assertTrue(BlacklistedToken.objects.filter(token=outstanding).exists())

    def test_clears_auth_cookies(self):
        res = self._delete()
        self.assertIn('access_token', res.cookies)
        self.assertEqual(res.cookies['access_token'].value, '')
        self.assertIn('refresh_token', res.cookies)
        self.assertEqual(res.cookies['refresh_token'].value, '')

    def test_response_message(self):
        res = self._delete()
        self.assertEqual(res.data['message'], 'Account deleted.')
