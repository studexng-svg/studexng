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

    def process_request(self, request):
        # ── Completely skip rate limiting in development ──────────────────────
        if settings.DEBUG:
            return None

        # Skip rate limiting for admin and static files
        if request.path.startswith('/admin/') or request.path.startswith('/static/'):
            return None

        # Get client IP address
        ip_address = self.get_client_ip(request)

        # Determine rate limit based on endpoint
        rate_limit = self.get_rate_limit(request.path)

        if rate_limit:
            # Check if rate limit exceeded
            cache_key = f'rate_limit:{ip_address}:{request.path}'
            request_count = cache.get(cache_key, 0)

            if request_count >= rate_limit:
                return JsonResponse({
                    'error': 'Rate limit exceeded. Please try again later.',
                    'detail': f'Maximum {rate_limit} requests per minute allowed.'
                }, status=429)

            # Increment request count
            cache.set(cache_key, request_count + 1, 60)  # 60 seconds = 1 minute

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
                "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.paystack.co; "
                "style-src 'self' 'unsafe-inline'; "
                "img-src 'self' data: https:; "
                "font-src 'self' data:; "
                "connect-src 'self' https://api.paystack.co; "
                "frame-src 'self' https://checkout.paystack.com;"
            )

        if not settings.DEBUG and request.is_secure():
            response['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains; preload'

        return response