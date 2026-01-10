# accounts/views.py
from rest_framework import status, viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import authenticate
from django.utils import timezone
from firebase_admin import auth as firebase_auth
from .serializers import (
    UserRegistrationSerializer,
    UserLoginSerializer,
    UserProfileSerializer,
    SellerApplicationSerializer
)
from .models import User, SellerApplication


# Existing auth views
@api_view(['POST'])
@permission_classes([AllowAny])
def register_user(request):
    """
    Register a new user with optional Firebase integration.
    Supports both traditional registration and Firebase-linked registration.
    """
    # Check if Firebase token provided (new flow)
    firebase_token = request.data.get('firebase_token')
    firebase_uid = None

    if firebase_token:
        try:
            # Verify Firebase ID token
            decoded_token = firebase_auth.verify_id_token(firebase_token)
            firebase_uid = decoded_token.get('uid')
            firebase_email = decoded_token.get('email')

            # Verify email matches
            if firebase_email and firebase_email != request.data.get('email'):
                return Response({
                    'error': 'Email mismatch between Firebase and registration data'
                }, status=status.HTTP_400_BAD_REQUEST)

            # Check if Firebase UID already registered
            if User.objects.filter(firebase_uid=firebase_uid).exists():
                return Response({
                    'error': 'Firebase account already registered. Please login instead.'
                }, status=status.HTTP_400_BAD_REQUEST)

        except Exception as e:
            return Response({
                'error': f'Invalid Firebase token: {str(e)}'
            }, status=status.HTTP_400_BAD_REQUEST)

    # Validate and create user
    serializer = UserRegistrationSerializer(data=request.data)

    if serializer.is_valid():
        user = serializer.save()

        # Link Firebase UID if provided
        if firebase_uid:
            user.firebase_uid = firebase_uid
            user.save()

        # Generate JWT tokens
        refresh = RefreshToken.for_user(user)

        return Response({
            'message': 'User registered successfully',
            'user': UserProfileSerializer(user).data,
            'tokens': {
                'refresh': str(refresh),
                'access': str(refresh.access_token),
            }
        }, status=status.HTTP_201_CREATED)

    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([AllowAny])
def login_user(request):
    """Login user using email"""
    serializer = UserLoginSerializer(data=request.data)
    
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    email = serializer.validated_data['email'].lower()
    password = serializer.validated_data['password']
    
    # Step 1: Find user by email (case-insensitive)
    try:
        user = User.objects.get(email__iexact=email)
    except User.DoesNotExist:
        return Response({'error': 'Invalid credentials'}, status=status.HTTP_401_UNAUTHORIZED)
    
    # Step 2: Authenticate using the actual username field
    authenticated_user = authenticate(request, username=user.username, password=password)
    
    if authenticated_user is not None:
        if authenticated_user.is_active:
            refresh = RefreshToken.for_user(authenticated_user)
            return Response({
                'message': 'Login successful',
                'user': UserProfileSerializer(authenticated_user).data,
                'tokens': {
                    'refresh': str(refresh),
                    'access': str(refresh.access_token),
                }
            }, status=status.HTTP_200_OK)
        else:
            return Response({'error': 'Account is disabled'}, status=status.HTTP_401_UNAUTHORIZED)
    
    return Response({'error': 'Invalid credentials'}, status=status.HTTP_401_UNAUTHORIZED)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_user_profile(request):
    """Get current user profile"""
    serializer = UserProfileSerializer(request.user)
    return Response(serializer.data)


@api_view(['PUT', 'PATCH'])
@permission_classes([IsAuthenticated])
def update_user_profile(request):
    """Update current user profile"""
    serializer = UserProfileSerializer(request.user, data=request.data, partial=True)
    
    if serializer.is_valid():
        serializer.save()
        return Response({
            'message': 'Profile updated successfully',
            'user': serializer.data
        }, status=status.HTTP_200_OK)
    
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout_user(request):
    """Logout user and blacklist refresh token"""
    try:
        refresh_token = request.data.get('refresh')

        if refresh_token:
            from rest_framework_simplejwt.tokens import RefreshToken
            token = RefreshToken(refresh_token)
            token.blacklist()  # Blacklist the token server-side
            return Response({'message': 'Logged out successfully'}, status=status.HTTP_200_OK)
        else:
            # If no refresh token provided, still return success for client-side logout
            return Response({'message': 'Logged out successfully (client-side only)'}, status=status.HTTP_200_OK)

    except Exception as e:
        return Response({'error': f'Logout failed: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([AllowAny])
def firebase_login(request):
    """
    Login user using Firebase ID token.
    Verifies Firebase token and returns JWT access/refresh tokens.
    """
    firebase_token = request.data.get('firebase_token')

    if not firebase_token:
        return Response({
            'error': 'Firebase token required'
        }, status=status.HTTP_400_BAD_REQUEST)

    try:
        # Verify Firebase ID token
        decoded_token = firebase_auth.verify_id_token(firebase_token)
        firebase_uid = decoded_token.get('uid')
        email = decoded_token.get('email')

        # Find user by Firebase UID
        try:
            user = User.objects.get(firebase_uid=firebase_uid)
        except User.DoesNotExist:
            # Try to find by email and link Firebase UID (migration support)
            if email:
                try:
                    user = User.objects.get(email__iexact=email)
                    # Link Firebase UID to existing user
                    user.firebase_uid = firebase_uid
                    user.save()
                except User.DoesNotExist:
                    return Response({
                        'error': 'User not found. Please register first.'
                    }, status=status.HTTP_404_NOT_FOUND)
            else:
                return Response({
                    'error': 'User not found. Please register first.'
                }, status=status.HTTP_404_NOT_FOUND)

        # Check if user is active
        if not user.is_active:
            return Response({
                'error': 'Account is disabled'
            }, status=status.HTTP_401_UNAUTHORIZED)

        # Generate JWT tokens
        refresh = RefreshToken.for_user(user)

        return Response({
            'message': 'Login successful',
            'user': UserProfileSerializer(user).data,
            'tokens': {
                'refresh': str(refresh),
                'access': str(refresh.access_token),
            }
        }, status=status.HTTP_200_OK)

    except firebase_auth.ExpiredIdTokenError:
        return Response({
            'error': 'Firebase token has expired. Please login again.'
        }, status=status.HTTP_401_UNAUTHORIZED)

    except firebase_auth.RevokedIdTokenError:
        return Response({
            'error': 'Firebase token has been revoked.'
        }, status=status.HTTP_401_UNAUTHORIZED)

    except Exception as e:
        return Response({
            'error': f'Firebase authentication failed: {str(e)}'
        }, status=status.HTTP_401_UNAUTHORIZED)


# Seller Application API
class SellerApplicationViewSet(viewsets.ModelViewSet):
    """API for seller verification applications"""
    queryset = SellerApplication.objects.all()
    serializer_class = SellerApplicationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """Only allow users to see their own application"""
        return self.queryset.filter(user=self.request.user)

    def create(self, request, *args, **kwargs):
        """Submit new application"""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        
        return Response({
            "message": "Application submitted successfully! We'll review it within 48 hours.",
            "status": "pending"
        }, status=status.HTTP_201_CREATED)

    def perform_create(self, serializer):
        """Save application with current user"""
        serializer.save(user=self.request.user) 