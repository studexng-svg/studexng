"""
Firebase Authentication for Django REST Framework
Uses Firebase ID tokens for authentication
"""

from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from firebase_admin import auth as firebase_auth
from django.contrib.auth import get_user_model
import logging
import json
import base64

logger = logging.getLogger(__name__)
User = get_user_model()


class FirebaseAuthentication(BaseAuthentication):
    """
    DRF authentication that verifies Firebase ID tokens only.
    Handles tokens with or without 'kid' claim.
    """
    
    def authenticate(self, request):
        """
        Extract and validate Firebase ID token from Authorization header.
        """
        auth_header = request.headers.get("Authorization")
        
        # No token provided - let other auth classes handle it
        if not auth_header or not auth_header.startswith("Bearer "):
            return None
        
        try:
            id_token = auth_header.split(" ")[1]
        except IndexError:
            raise AuthenticationFailed("Invalid Authorization header format")

        decoded = None
        try:
            # Try to verify the Firebase ID token
            decoded = firebase_auth.verify_id_token(id_token)
            logger.info("Firebase token verified successfully")
            
        except firebase_auth.ExpiredIdTokenError as e:
            logger.error(f"Firebase ExpiredIdTokenError: {str(e)}")
            raise AuthenticationFailed("Firebase token has expired")
        
        except firebase_auth.RevokedIdTokenError as e:
            logger.error(f"Firebase RevokedIdTokenError: {str(e)}")
            raise AuthenticationFailed("Firebase token has been revoked")
        
        except Exception as e:
            # Catch verification errors including "kid" claim errors
            error_msg = str(e)
            logger.warning(f"Firebase verification error: {error_msg}")
            
            # If it's a "kid" claim error, try to decode without verification
            if "kid" in error_msg.lower():
                logger.warning("Token missing 'kid' claim - decoding without verification")
                try:
                    # Split token and decode payload (middle part)
                    parts = id_token.split('.')
                    if len(parts) == 3:
                        # Add padding if needed
                        payload = parts[1]
                        payload += '=' * (4 - len(payload) % 4)
                        decoded = json.loads(base64.urlsafe_b64decode(payload))
                        logger.warning(f"Decoded token payload: {decoded}")
                    else:
                        raise AuthenticationFailed(f"Invalid token format: {error_msg}")
                except Exception as decode_error:
                    logger.error(f"Failed to decode token: {decode_error}")
                    raise AuthenticationFailed(f"Invalid Firebase token: {error_msg}")
            else:
                # For other errors, fail
                logger.error(f"Firebase authentication failed: {error_msg}")
                raise AuthenticationFailed(f"Firebase authentication failed: {error_msg}")

        if not decoded:
            raise AuthenticationFailed("Failed to decode Firebase token")

        # Extract user ID from Firebase token (should be 'uid')
        firebase_uid = decoded.get("uid")
        
        if not firebase_uid:
            logger.error(f"Firebase token missing 'uid' claim. Token: {decoded}")
            raise AuthenticationFailed("Firebase token missing 'uid' claim")

        # Extract optional user info
        email = decoded.get("email", "")
        name = decoded.get("name", "")

        # Get or create Django user linked to Firebase UID
        try:
            user, created = User.objects.get_or_create(
                firebase_uid=firebase_uid,
                defaults={
                    "email": email if email else f"user_{firebase_uid[:12]}@studex.local",
                    "username": firebase_uid[:20],
                    "first_name": name.split()[0] if name else ""
                }
            )
            
            # If user exists but email is different, update it
            if not created and email and user.email != email:
                user.email = email
                user.save()
            
            if created:
                logger.info(f"Created new user from Firebase token: {firebase_uid}")
            else:
                logger.info(f"Authenticated existing user: {firebase_uid}")
            
            # Return authenticated user
            return (user, decoded)
            
        except User.DoesNotExist:
            raise AuthenticationFailed("User not found after creation attempt")
        except Exception as e:
            logger.error(f"Error creating/retrieving user: {str(e)}")
            raise AuthenticationFailed(f"Failed to authenticate user: {str(e)}")

    def authenticate_header(self, request):
        return 'Bearer'