"""
Trusted client-IP resolution.

Production topology: client -> Cloudflare (Render's edge) -> gunicorn.
Cloudflare sets the `CF-Connecting-IP` header to the real client IP and
overwrites any value the client tried to send, so it cannot be forged by the
client. We trust that header (name is configurable via the CLIENT_IP_HEADER
setting) and we NEVER trust the left-most `X-Forwarded-For` entry, which is
attacker-controlled: proxies append to XFF, so its first value is whatever the
client put there. Trusting it let an attacker rotate the value every request
and get a fresh rate-limit / lockout bucket each time, defeating brute-force
protection and the Paystack webhook IP allowlist.

Fallback is REMOTE_ADDR, which is the TCP peer address and cannot be spoofed by
the client. On a correctly-fronted deployment REMOTE_ADDR is the proxy, so the
CF header is what distinguishes real clients; the fallback only matters for
local/dev or any request that did not come through the trusted proxy.
"""
from django.conf import settings

# Django normalises request headers to META keys of the form HTTP_<UPPER_SNAKE>.
DEFAULT_CLIENT_IP_HEADER = "HTTP_CF_CONNECTING_IP"


def get_client_ip(request):
    """Return the trusted client IP for `request`.

    Order: the configured trusted-proxy header (default CF-Connecting-IP),
    then REMOTE_ADDR. The left-most X-Forwarded-For value is intentionally
    ignored because it is client-controlled.
    """
    header = getattr(settings, "CLIENT_IP_HEADER", DEFAULT_CLIENT_IP_HEADER) or DEFAULT_CLIENT_IP_HEADER
    ip = (request.META.get(header) or "").strip()
    if ip:
        # A proxy header may carry "client, proxy1, proxy2"; the client is first
        # here because the trusted proxy itself sets this header to the single
        # real client IP. Guard against an unexpected list just in case.
        return ip.split(",")[0].strip()
    return (request.META.get("REMOTE_ADDR") or "").strip()
