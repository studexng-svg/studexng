# accounts/test_otp_rate_limit.py
"""
Test suite for rate limiting on verify_otp (accounts/views.py). send_otp
already throttled requesting a code (3 per email+IP per 5 min); verify_otp —
the actual guessing endpoint — had nothing at all. A 6-digit code is only
1,000,000 combinations, trivially brute-forceable within its own 10-minute
validity window with zero requests/sec limit on the guess itself.

Same two-guard shape as login_user/ResetPasswordView: a per-email lock
(5 failed guesses, scoped to the targeted email regardless of source IP)
plus a per-IP volumetric guard (20 attempts/15 min, blocks a sweep across
many emails). Only failures count — a correct guess clears the counter,
and requesting a fresh code (send_otp) clears it too, so neither punishes
legitimate retries.
"""
from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User


class VerifyOtpRateLimitTests(TestCase):
    def setUp(self):
        # The test client shares one fixed IP across every test in this
        # class, and the cache (unlike the DB) isn't rolled back between
        # tests — without this, the IP-scoped guard's counter would leak
        # across test methods.
        cache.clear()
        self.client = APIClient()
        self.email = 'otp_rl@pau.edu.ng'
        cache.set(f'otp_{self.email}', '123456', timeout=600)
        self.verify_url = '/api/auth/verify-otp/'

    def test_correct_otp_succeeds(self):
        response = self.client.post(self.verify_url, {'email': self.email, 'otp': '123456'})
        self.assertEqual(response.status_code, 200)

    def test_wrong_otp_rejected_with_400_below_threshold(self):
        response = self.client.post(self.verify_url, {'email': self.email, 'otp': '000000'})
        self.assertEqual(response.status_code, 400)

    def test_locks_after_5_wrong_guesses(self):
        for _ in range(5):
            self.client.post(self.verify_url, {'email': self.email, 'otp': '000000'})

        response = self.client.post(self.verify_url, {'email': self.email, 'otp': '123456'})
        self.assertEqual(response.status_code, 429)
        self.assertIn('Too many incorrect attempts', response.data['error'])

    def test_correct_otp_before_lockout_threshold_still_works(self):
        for _ in range(4):
            response = self.client.post(self.verify_url, {'email': self.email, 'otp': '000000'})
            self.assertEqual(response.status_code, 400)

        response = self.client.post(self.verify_url, {'email': self.email, 'otp': '123456'})
        self.assertEqual(response.status_code, 200)

    def test_successful_verification_clears_the_failure_counter(self):
        for _ in range(4):
            self.client.post(self.verify_url, {'email': self.email, 'otp': '000000'})
        response = self.client.post(self.verify_url, {'email': self.email, 'otp': '123456'})
        self.assertEqual(response.status_code, 200)

        # A fresh code + 4 more wrong guesses (below threshold again) must
        # not be blocked by the counter from before the successful verify.
        cache.set(f'otp_{self.email}', '654321', timeout=600)
        for _ in range(4):
            response = self.client.post(self.verify_url, {'email': self.email, 'otp': '000000'})
            self.assertEqual(response.status_code, 400)

    def test_lockout_is_scoped_to_the_targeted_email(self):
        other_email = 'otp_rl_other@pau.edu.ng'
        cache.set(f'otp_{other_email}', '111111', timeout=600)

        for _ in range(5):
            self.client.post(self.verify_url, {'email': self.email, 'otp': '000000'})

        # A different email, same source IP, is unaffected by self.email's lockout.
        response = self.client.post(self.verify_url, {'email': other_email, 'otp': '111111'})
        self.assertEqual(response.status_code, 200)

    def test_requesting_a_new_code_clears_a_stale_failure_counter(self):
        for _ in range(5):
            self.client.post(self.verify_url, {'email': self.email, 'otp': '000000'})
        # Confirm it's actually locked first.
        locked = self.client.post(self.verify_url, {'email': self.email, 'otp': '123456'})
        self.assertEqual(locked.status_code, 429)

        with patch('studex.email.send_email'):
            send_response = self.client.post('/api/auth/send-otp/', {'email': self.email})
        self.assertEqual(send_response.status_code, 200, send_response.data)

        new_otp = cache.get(f'otp_{self.email}')
        self.assertIsNotNone(new_otp)
        response = self.client.post(self.verify_url, {'email': self.email, 'otp': new_otp})
        self.assertEqual(response.status_code, 200)

    def test_ip_guard_blocks_after_20_attempts_across_many_emails(self):
        # Spread attempts across distinct emails so the per-email lockout
        # (threshold 5) never fires — isolates the IP-scoped guard.
        for i in range(20):
            email = f'otp_rl_spray{i}@pau.edu.ng'
            cache.set(f'otp_{email}', '999999', timeout=600)
            response = self.client.post(self.verify_url, {'email': email, 'otp': '000000'})
            self.assertEqual(response.status_code, 400)

        response = self.client.post(self.verify_url, {'email': self.email, 'otp': '123456'})
        self.assertEqual(response.status_code, 429)
        self.assertIn('Too many verification attempts', response.data['error'])

    def test_expired_or_missing_otp_still_returns_400_not_a_lockout_error(self):
        response = self.client.post(self.verify_url, {'email': 'no_otp_here@pau.edu.ng', 'otp': '123456'})
        self.assertEqual(response.status_code, 400)
        self.assertIn('expired', response.data['error'].lower())
