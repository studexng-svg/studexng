from rest_framework.exceptions import PermissionDenied
from rest_framework_simplejwt.authentication import JWTAuthentication

# Methods that never mutate state — CSRF has nothing to defend there.
SAFE_METHODS = ('GET', 'HEAD', 'OPTIONS')


class JWTCookieAuthentication(JWTAuthentication):
    """
    Read JWT from httpOnly 'access_token' cookie first, Authorization header
    second.

    Cookie-based auth requires a valid CSRF token (header X-CSRF-Token) on
    every unsafe-method request — see accounts.views._generate_csrf_token/
    _csrf_token_valid_for for why this has to be a signed token carried in
    a JSON response body rather than a classic double-submit cookie (the
    frontend and this backend are different domains, so a cookie we set
    isn't something the frontend's JS can ever read back). That check is
    needed because the auth cookies are SameSite=None in production (the
    only setting that lets a cross-origin fetch attach them at all), so a
    browser sends them to us on its own even from a malicious page; nothing
    else here was checking that the request actually originated from
    studex's own frontend.

    Authorization-header auth (no access_token cookie present — e.g. the
    mobile app, which keeps its token in SecureStore, not a cookie jar)
    skips the check entirely: a third-party page has no way to make a
    victim's browser attach an arbitrary header, so that path was never
    exposed to this attack in the first place.
    """

    def authenticate(self, request):
        raw_token = request.COOKIES.get('access_token')
        if raw_token:
            try:
                validated_token = self.get_validated_token(raw_token)
                user = self.get_user(validated_token)
            except Exception:
                return None
            if request.method not in SAFE_METHODS:
                self._enforce_csrf(request, user.id)
            return user, validated_token
        return super().authenticate(request)

    def _enforce_csrf(self, request, user_id):
        from .views import _csrf_token_valid_for

        header_token = request.META.get('HTTP_X_CSRF_TOKEN')
        if not header_token or not _csrf_token_valid_for(header_token, user_id):
            raise PermissionDenied('CSRF token missing or incorrect.')
