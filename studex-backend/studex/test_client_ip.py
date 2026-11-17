"""
Security regression tests for trusted client-IP resolution.

These lock in the fix for the rate-limit / lockout / webhook-allowlist bypass
that existed when the code trusted the left-most X-Forwarded-For value. A test
here fails if anyone reintroduces XFF trust.
"""
from django.test import TestCase, RequestFactory, override_settings

from studex.ip import get_client_ip, DEFAULT_CLIENT_IP_HEADER
from studex.middleware import RateLimitMiddleware


class GetClientIpTests(TestCase):
    def setUp(self):
        self.rf = RequestFactory()

    def test_spoofed_left_most_xff_is_ignored(self):
        """A client-set X-Forwarded-For must NOT become the client IP."""
        req = self.rf.get("/api/", HTTP_X_FORWARDED_FOR="6.6.6.6", REMOTE_ADDR="10.0.0.1")
        self.assertEqual(get_client_ip(req), "10.0.0.1")

    @override_settings(CLIENT_IP_HEADER=DEFAULT_CLIENT_IP_HEADER)
    def test_cf_connecting_ip_is_trusted(self):
        """The trusted proxy header wins over everything, including XFF."""
        req = self.rf.get(
            "/api/",
            HTTP_CF_CONNECTING_IP="203.0.113.7",
            HTTP_X_FORWARDED_FOR="6.6.6.6",
            REMOTE_ADDR="10.0.0.1",
        )
        self.assertEqual(get_client_ip(req), "203.0.113.7")

    def test_falls_back_to_remote_addr(self):
        req = self.rf.get("/api/", REMOTE_ADDR="198.51.100.9")
        self.assertEqual(get_client_ip(req), "198.51.100.9")

    @override_settings(CLIENT_IP_HEADER="HTTP_TRUE_CLIENT_IP")
    def test_configurable_header(self):
        req = self.rf.get(
            "/api/",
            HTTP_TRUE_CLIENT_IP="203.0.113.50",
            HTTP_CF_CONNECTING_IP="1.1.1.1",
            REMOTE_ADDR="10.0.0.1",
        )
        self.assertEqual(get_client_ip(req), "203.0.113.50")

    def test_proxy_list_in_header_takes_first_entry(self):
        req = self.rf.get("/api/", HTTP_CF_CONNECTING_IP="203.0.113.7, 10.0.0.2")
        self.assertEqual(get_client_ip(req), "203.0.113.7")


# Force the middleware to actually run: it short-circuits under DEBUG/TESTING.
@override_settings(DEBUG=False, TESTING=False)
class RateLimitSpoofBypassTests(TestCase):
    ADMIN_LOGIN = "/studex-portal-9f3a2/login/"

    def setUp(self):
        self.rf = RequestFactory()
        self.mw = RateLimitMiddleware(lambda r: None)
        from django.core.cache import cache
        cache.clear()

    def _post_admin(self, **extra):
        return self.mw.process_request(self.rf.post(self.ADMIN_LOGIN, **extra))

    def test_rotating_xff_cannot_bypass_admin_lockout(self):
        """
        Old bug: a new X-Forwarded-For each request = a fresh attempt bucket.
        Now the key is the trusted IP, so rotating XFF does nothing: the same
        real client is locked out after ADMIN_MAX_ATTEMPTS.
        """
        same_real_ip = "10.0.0.1"  # REMOTE_ADDR, i.e. the real peer
        # Lockout fires ON the Nth attempt, so the first N-1 pass.
        for i in range(RateLimitMiddleware.ADMIN_MAX_ATTEMPTS - 1):
            resp = self._post_admin(
                HTTP_X_FORWARDED_FOR=f"6.6.6.{i}",  # attacker rotates this
                REMOTE_ADDR=same_real_ip,
            )
            self.assertIsNone(resp, f"attempt {i} should pass")
        # Next attempt, still rotating XFF, must now be locked out.
        resp = self._post_admin(HTTP_X_FORWARDED_FOR="6.6.6.99", REMOTE_ADDR=same_real_ip)
        self.assertIsNotNone(resp)
        self.assertEqual(resp.status_code, 403)

    def test_distinct_trusted_ips_are_tracked_separately(self):
        for _ in range(RateLimitMiddleware.ADMIN_MAX_ATTEMPTS - 1):
            self.assertIsNone(self._post_admin(HTTP_CF_CONNECTING_IP="1.1.1.1"))
        # A different real client is unaffected by the first one's attempts.
        self.assertIsNone(self._post_admin(HTTP_CF_CONNECTING_IP="2.2.2.2"))
        # But the first client's next attempt trips the lockout.
        locked = self._post_admin(HTTP_CF_CONNECTING_IP="1.1.1.1")
        self.assertEqual(locked.status_code, 403)
