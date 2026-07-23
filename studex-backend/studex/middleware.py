# studex/middleware.py
"""
Security middleware for rate limiting and additional security headers
"""
import time
from django.core.cache import cache
from django.http import JsonResponse
from django.conf import settings
from django.utils.deprecation import MiddlewareMixin


class RateLimitMiddleware(MiddlewareMixin):
    """
    Rate limiting middleware to prevent abuse
    Tracks requests per IP address and enforces limits
    """

    ADMIN_PREFIX = '/studex-portal-9f3a2/'
    # Max login attempts per IP before lockout
    ADMIN_MAX_ATTEMPTS = 5
    # Lockout window in seconds (15 minutes)
    ADMIN_LOCKOUT_SECONDS = 900

    def process_request(self, request):
        # ── Completely skip rate limiting in development ──────────────────────
        if settings.DEBUG:
            return None

        # Skip rate limiting for static files
        if request.path.startswith('/static/'):
            return None

        # ── Admin login brute-force protection ───────────────────────────────
        if request.path.startswith(self.ADMIN_PREFIX) and request.method == 'POST':
            ip = self.get_client_ip(request)
            lockout_key = f'admin_lockout:{ip}'
            attempt_key = f'admin_attempts:{ip}'

            if cache.get(lockout_key):
                return JsonResponse(
                    {'error': 'Too many failed login attempts. Try again in 15 minutes.'},
                    status=403
                )

            attempts = cache.get(attempt_key, 0) + 1
            cache.set(attempt_key, attempts, self.ADMIN_LOCKOUT_SECONDS)

            if attempts >= self.ADMIN_MAX_ATTEMPTS:
                cache.set(lockout_key, True, self.ADMIN_LOCKOUT_SECONDS)
                cache.delete(attempt_key)
                return JsonResponse(
                    {'error': 'Too many failed login attempts. Try again in 15 minutes.'},
                    status=403
                )

        # Skip general rate limiting for admin pages (handled above)
        if request.path.startswith(self.ADMIN_PREFIX):
            return None

        # Get client IP address
        ip_address = self.get_client_ip(request)

        # Determine rate limit based on endpoint
        rate_limit = self.get_rate_limit(request.path)

        if rate_limit:
            cache_key = f'rate_limit:{ip_address}:{request.path}'
            request_count = cache.get(cache_key, 0)

            if request_count >= rate_limit:
                return JsonResponse({
                    'error': 'Rate limit exceeded. Please try again later.',
                    'detail': f'Maximum {rate_limit} requests per minute allowed.'
                }, status=429)

            cache.set(cache_key, request_count + 1, 60)

        return None

    def get_client_ip(self, request):
        """Extract client IP from request"""
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            ip = x_forwarded_for.split(',')[0].strip()
        else:
            ip = request.META.get('REMOTE_ADDR')
        return ip

    def get_rate_limit(self, path):
        """Get rate limit for specific endpoint"""
        if '/api/auth/login/' in path:
            return getattr(settings, 'RATE_LIMIT_LOGIN', 10)
        if '/api/auth/register/' in path:
            return getattr(settings, 'RATE_LIMIT_REGISTER', 5)
        if '/api/services/listings/' in path or '/upload' in path:
            return getattr(settings, 'RATE_LIMIT_FILE_UPLOAD', 20)
        if '/api/wallet/' in path or '/api/orders/' in path:
            return getattr(settings, 'RATE_LIMIT_API', 60)
        if path.startswith('/api/'):
            return getattr(settings, 'RATE_LIMIT_API', 60)
        return None


class LastSeenMiddleware(MiddlewareMixin):
    """
    Updates user.last_seen on each authenticated API request.
    Throttled via cache to at most one DB write per user per 60 seconds.
    """

    def process_response(self, request, response):
        if not request.path.startswith('/api/'):
            return response
        if not hasattr(request, 'user') or not request.user.is_authenticated:
            return response
        cache_key = f'last_seen:{request.user.pk}'
        if not cache.get(cache_key):
            from django.utils import timezone
            from accounts.models import User
            User.objects.filter(pk=request.user.pk).update(last_seen=timezone.now())
            cache.set(cache_key, 1, 60)
        return response


class SecurityHeadersMiddleware(MiddlewareMixin):
    """
    Add additional security headers to all responses
    """

    def process_response(self, request, response):
        if not response.get('X-Frame-Options'):
            response['X-Frame-Options'] = 'DENY'
        response['X-Content-Type-Options'] = 'nosniff'
        response['X-XSS-Protection'] = '1; mode=block'
        response['Referrer-Policy'] = 'strict-origin-when-cross-origin'
        response['Permissions-Policy'] = 'geolocation=(), microphone=(), camera=()'

        if not settings.DEBUG:
            response['Content-Security-Policy'] = (
                "default-src 'self'; "
                "script-src 'self' 'unsafe-inline' https://js.paystack.co https://checkout.paystack.com; "
                "style-src 'self' 'unsafe-inline'; "
                "img-src 'self' data: https://res.cloudinary.com; "
                "font-src 'self' data:; "
                "connect-src 'self' https://api.studex.com.ng https://api.paystack.co; "
                "frame-src https://checkout.paystack.com;"
            )

        if not settings.DEBUG and request.is_secure():
            response['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains; preload'

        return response


class ApiVersionHeaderMiddleware(MiddlewareMixin):
    """
    Stamps every /api/ response with which API version served it (Blocker 7
    — API Versioning). Purely observational — it does not change routing or
    behavior. `/api/` (legacy unversioned) and `/api/v1/` both currently
    serve identical behavior, so both report "v1" today; this only starts
    reporting something else once a request is actually served by a future
    `/api/v2/` block, at which point that block's views should set this
    header explicitly to override the default.
    """

    def process_response(self, request, response):
        # Both /api/ (legacy alias) and /api/v1/ serve identical behavior today,
        # so both report "v1" — see the class docstring for how a future /api/v2/
        # block should override this.
        if request.path.startswith('/api/') and 'API-Version' not in response:
            response['API-Version'] = 'v1'
        return response