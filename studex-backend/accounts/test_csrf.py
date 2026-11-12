# accounts/test_csrf.py
"""
Test suite for the double-submit CSRF defense on cookie-based auth
(accounts.authentication.JWTCookieAuthentication, plus
accounts.views._generate_csrf_token / _csrf_token_valid_for).

This is a signed token carried in a JSON response body, not a classic
double-submit cookie, because the frontend (Vercel) and this backend
(Render) are different domains — a cookie this backend sets lives in this
backend's own cookie jar, invisible to the frontend's document.cookie no
matter what httponly/samesite says. See accounts/views.py's CSRF section
for the full reasoning.

The defense only applies to cookie-authenticated requests (access_token
cookie present and valid) on unsafe methods. Authorization-header auth
(the mobile app, no cookie involved) is exempt by construction — a
third-party page can't make a victim's browser attach an arbitrary header,
so that path was never exposed to the attack this defends against.
"""
from unittest import mock

from django.core import signing
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import User
from accounts.views import _generate_csrf_token, _csrf_token_valid_for, _CSRF_SALT


def _access_token_for(user) -> str:
    return str(RefreshToken.for_user(user).access_token)


class CsrfTokenHelperTests(TestCase):
    """Unit coverage for the stateless sign/verify helpers themselves."""

    def setUp(self):
        self.user = User.objects.create_user(username='csrf_h1', email='csrf_h1@pau.edu.ng', password='pass123')
        self.other_user = User.objects.create_user(username='csrf_h2', email='csrf_h2@pau.edu.ng', password='pass123')

    def test_token_valid_for_its_own_user(self):
        token = _generate_csrf_token(self.user.id)
        self.assertTrue(_csrf_token_valid_for(token, self.user.id))

    def test_token_rejected_for_a_different_user(self):
        """A signed-valid token for one user must not authorize an action as another."""
        token = _generate_csrf_token(self.user.id)
        self.assertFalse(_csrf_token_valid_for(token, self.other_user.id))

    def test_garbage_token_rejected(self):
        self.assertFalse(_csrf_token_valid_for('not-a-real-token', self.user.id))

    def test_empty_token_rejected(self):
        self.assertFalse(_csrf_token_valid_for('', self.user.id))

    def test_tampered_token_rejected(self):
        token = _generate_csrf_token(self.user.id)
        tampered = token[:-1] + ('a' if token[-1] != 'a' else 'b')
        self.assertFalse(_csrf_token_valid_for(tampered, self.user.id))

    def test_expired_token_rejected(self):
        # mock max_age to -1 instead of sleeping — any already-signed token
        # is unconditionally "too old" against a negative ceiling.
        token = _generate_csrf_token(self.user.id)
        with mock.patch('accounts.views._CSRF_MAX_AGE', -1):
            self.assertFalse(_csrf_token_valid_for(token, self.user.id))

    def test_token_from_a_different_salt_rejected(self):
        """Confirms the salt is actually load-bearing, not decorative."""
        token = signing.dumps({'uid': self.user.id}, salt='some-other-salt')
        self.assertFalse(_csrf_token_valid_for(token, self.user.id))


class CookieAuthCsrfEnforcementTests(TestCase):
    """
    Integration coverage against a real endpoint (heartbeat — a trivial,
    harmless POST) through the real authentication class, not
    force_authenticate (which bypasses JWTCookieAuthentication entirely and
    would never exercise this check).
    """

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='csrf_e1', email='csrf_e1@pau.edu.ng', password='pass123')
        self.access = _access_token_for(self.user)

    def _authenticate_via_cookie(self):
        self.client.cookies['access_token'] = self.access

    def test_get_via_cookie_does_not_require_csrf_token(self):
        self._authenticate_via_cookie()
        response = self.client.get('/api/auth/me/')
        self.assertEqual(response.status_code, 200)

    def test_post_via_cookie_without_csrf_header_rejected(self):
        self._authenticate_via_cookie()
        response = self.client.post('/api/auth/heartbeat/')
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data['detail'], 'CSRF token missing or incorrect.')

    def test_post_via_cookie_with_wrong_csrf_token_rejected(self):
        self._authenticate_via_cookie()
        response = self.client.post('/api/auth/heartbeat/', HTTP_X_CSRF_TOKEN='garbage')
        self.assertEqual(response.status_code, 403)

    def test_post_via_cookie_with_another_users_csrf_token_rejected(self):
        """
        This is the actual attack this whole feature defends against: a
        forged cross-site POST carries the victim's auth cookie (browser
        does that automatically) but the attacker's page could never read
        the victim's real token to put it in the header — simulated here
        by a token signed for an unrelated user instead.
        """
        other = User.objects.create_user(username='csrf_e2', email='csrf_e2@pau.edu.ng', password='pass123')
        self._authenticate_via_cookie()
        foreign_token = _generate_csrf_token(other.id)
        response = self.client.post('/api/auth/heartbeat/', HTTP_X_CSRF_TOKEN=foreign_token)
        self.assertEqual(response.status_code, 403)

    def test_post_via_cookie_with_correct_csrf_token_succeeds(self):
        self._authenticate_via_cookie()
        token = _generate_csrf_token(self.user.id)
        response = self.client.post('/api/auth/heartbeat/', HTTP_X_CSRF_TOKEN=token)
        self.assertEqual(response.status_code, 200)

    def test_post_via_authorization_header_never_needs_csrf_token(self):
        """Mobile-app-style auth (no cookie at all) is exempt — nothing to forge via a browser."""
        response = self.client.post('/api/auth/heartbeat/', HTTP_AUTHORIZATION=f'Bearer {self.access}')
        self.assertEqual(response.status_code, 200)


class CsrfBootstrapEndpointTests(TestCase):
    """GET /api/auth/csrf/ — how the frontend obtains a token for a session that already has a valid cookie."""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='csrf_b1', email='csrf_b1@pau.edu.ng', password='pass123')

    def test_requires_authentication(self):
        response = self.client.get('/api/auth/csrf/')
        self.assertIn(response.status_code, (401, 403))

    def test_returns_a_token_valid_for_the_authenticated_user(self):
        self.client.cookies['access_token'] = _access_token_for(self.user)
        response = self.client.get('/api/auth/csrf/')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(_csrf_token_valid_for(response.data['csrf_token'], self.user.id))

    def test_is_a_safe_method_and_does_not_itself_require_a_csrf_token(self):
        """GET is safe — JWTCookieAuthentication must never demand a CSRF header to reach this view at all."""
        self.client.cookies['access_token'] = _access_token_for(self.user)
        response = self.client.get('/api/auth/csrf/')
        self.assertNotEqual(response.status_code, 403)


class LoginRegisterReturnCsrfTokenTests(TestCase):
    """login/register/cookie-refresh all hand back a token the frontend can start using immediately."""

    def setUp(self):
        self.client = APIClient()

    def test_login_response_includes_a_valid_csrf_token(self):
        user = User.objects.create_user(username='csrf_lr1', email='csrf_lr1@pau.edu.ng', password='CorrectPass123')
        response = self.client.post('/api/auth/login/', {'email': user.email, 'password': 'CorrectPass123'})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIn('csrf_token', response.data)
        self.assertTrue(_csrf_token_valid_for(response.data['csrf_token'], user.id))

    def test_register_response_includes_a_valid_csrf_token(self):
        email = 'csrf_lr2@pau.edu.ng'
        cache.set(f'otp_verified:{email}', True, timeout=300)
        response = self.client.post('/api/auth/register/', {
            'username': 'csrf_lr2', 'email': email, 'user_type': 'student',
            'password': 'CorrectPass123', 'password2': 'CorrectPass123',
        })
        self.assertEqual(response.status_code, 201, response.data)
        user = User.objects.get(username='csrf_lr2')
        self.assertIn('csrf_token', response.data)
        self.assertTrue(_csrf_token_valid_for(response.data['csrf_token'], user.id))

    def test_cookie_refresh_response_includes_a_valid_csrf_token(self):
        user = User.objects.create_user(username='csrf_lr3', email='csrf_lr3@pau.edu.ng', password='pass123')
        refresh = RefreshToken.for_user(user)
        client = APIClient()
        client.cookies['refresh_token'] = str(refresh)
        response = client.post('/api/auth/token/cookie-refresh/')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIn('csrf_token', response.data)
        self.assertTrue(_csrf_token_valid_for(response.data['csrf_token'], user.id))


class PreAuthEndpointsIgnoreStaleCookiesTests(TestCase):
    """
    Regression test: login/register/forgot-password/reset-password/token-
    refresh/send-otp/verify-otp never read request.user — they operate on
    whatever email/uid/token is in the request body. DRF still runs
    authentication on every request regardless of permission_classes
    though, so before these views set authentication_classes = [] (see
    accounts/views.py), a valid-but-unrelated access_token cookie already
    sitting in the client (e.g. from an earlier successful login earlier in
    the same browser session) made JWTCookieAuthentication succeed and
    _enforce_csrf then reject the request for lacking a CSRF header —
    even though the view never cared who was logged in. Concretely: this
    broke "log in with the wrong password a second time right after a
    correct one" (400 became 403) and "register a 2nd account while still
    logged into a 1st" (201 became 403) in the real flow, not just tests.
    """

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='preauth_stale', email='preauth_stale@pau.edu.ng', password='CorrectPass123',
        )
        # Simulates "already logged in" — a valid access_token cookie sitting
        # in the client from an earlier, unrelated request.
        self.client.cookies['access_token'] = str(RefreshToken.for_user(self.user).access_token)

    def test_login_with_wrong_password_still_400_not_403(self):
        response = self.client.post('/api/auth/login/', {
            'email': self.user.email, 'password': 'WrongPassword',
        })
        self.assertEqual(response.status_code, 400)

    def test_register_a_second_account_still_succeeds(self):
        email = 'preauth_stale_2@pau.edu.ng'
        cache.set(f'otp_verified:{email}', True, timeout=300)
        response = self.client.post('/api/auth/register/', {
            'username': 'preauth_stale_2', 'email': email, 'user_type': 'student',
            'password': 'CorrectPass123', 'password2': 'CorrectPass123',
        })
        self.assertEqual(response.status_code, 201, response.data)

    def test_forgot_password_still_succeeds(self):
        response = self.client.post('/api/auth/forgot-password/', {'email': self.user.email})
        self.assertEqual(response.status_code, 200, response.data)

    def test_send_otp_still_succeeds(self):
        response = self.client.post('/api/auth/send-otp/', {'email': 'preauth_stale_3@pau.edu.ng'})
        self.assertEqual(response.status_code, 200, response.data)

    def test_token_refresh_still_succeeds(self):
        refresh = RefreshToken.for_user(self.user)
        self.client.cookies['refresh_token'] = str(refresh)
        response = self.client.post('/api/auth/token/cookie-refresh/')
        self.assertEqual(response.status_code, 200, response.data)
