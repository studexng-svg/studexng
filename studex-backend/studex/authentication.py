# studex/authentication.py
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from firebase_admin import auth as firebase_auth
from django.contrib.auth.models import User


class FirebaseAuthentication(BaseAuthentication):
    """
    DRF authentication that verifies Firebase ID tokens.
    Returns a Django User (created on-the-fly) attached to request.user.
    """
    def authenticate(self, request):
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            return None                     # no token → let permission classes decide

        id_token = auth_header.split(" ")[1]

        try:
            decoded = firebase_auth.verify_id_token(id_token)
        except Exception as exc:
            raise AuthenticationFailed(f"Invalid Firebase token: {exc}")

        firebase_uid = decoded["uid"]
        email = decoded.get("email", "")
        name = decoded.get("name", "")

        # Create / get Django user (link by Firebase UID)
        user, _ = User.objects.get_or_create(
            username=firebase_uid,
            defaults={"email": email, "first_name": name.split()[0] if name else ""}
        )
        return (user, decoded)   # request.user = Django User, request.auth = decoded token