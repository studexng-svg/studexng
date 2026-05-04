from rest_framework import status, viewsets
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated, IsAdminUser
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import authenticate
from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from django.utils.encoding import force_bytes
from django.core.mail import send_mail
from django.core.cache import cache
from django.conf import settings
from django.utils import timezone
import resend
import random
import string
from .serializers import (
    UserRegistrationSerializer,
    UserLoginSerializer,
    UserProfileSerializer,
    SellerApplicationSerializer,
)
from .models import User, SellerApplication, Profile
from .utils import send_notification
import re


# ─── OTP helpers ─────────────────────────────────────────────────────────────

def generate_otp():
    return ''.join(random.choices(string.digits, k=6))


@api_view(['POST'])
@permission_classes([AllowAny])
def send_otp(request):
    email = request.data.get('email', '').strip().lower()
    if not email:
        return Response({'error': 'Email is required'}, status=400)

    otp = generate_otp()
    cache.set(f'otp_{email}', otp, timeout=600)

    try:
        resend.api_key = settings.RESEND_API_KEY
        resend.Emails.send({
            'from': 'StudEx <noreply@studex.com.ng>',
            'to': [email],
            'subject': 'Your StudEx Verification Code',
            'html': f'''
                <div style="font-family: DM Sans, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
                    <h1 style="font-size: 24px; color: #1C1917;">Welcome to StudEx 🎓</h1>
                    <p style="color: #78716C;">Your verification code is:</p>
                    <div style="background: linear-gradient(135deg, #0D9488, #7C3AED); border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
                        <span style="font-size: 48px; font-weight: bold; color: white; letter-spacing: 12px;">{otp}</span>
                    </div>
                    <p style="color: #78716C;">This code expires in <strong>10 minutes</strong>.</p>
                    <p style="color: #A8A29E; font-size: 12px;">If you didn&apos;t request this, ignore this email.</p>
                </div>
            ''',
        })
        return Response({'message': 'OTP sent successfully'})
    except Exception as e:
        print(f"Resend error: {e}")
        return Response({'error': 'Failed to send OTP. Please try again.'}, status=500)


@api_view(['POST'])
@permission_classes([AllowAny])
def verify_otp(request):
    email = request.data.get('email', '').strip().lower()
    otp = request.data.get('otp', '').strip()

    if not email or not otp:
        return Response({'error': 'Email and OTP are required'}, status=400)

    stored_otp = cache.get(f'otp_{email}')

    if not stored_otp:
        return Response({'error': 'OTP expired. Please request a new one.'}, status=400)

    if otp != stored_otp:
        return Response({'error': 'Incorrect code. Please try again.'}, status=400)

    cache.delete(f'otp_{email}')
    return Response({'message': 'OTP verified successfully'})


# ─── Username availability check ─────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([AllowAny])
def check_username(request):
    username = request.query_params.get('username', '').strip()
    if not username:
        return Response({'available': False}, status=200)
    try:
        exists = User.objects.filter(username__iexact=username).exists()
        return Response({'available': not exists}, status=200)
    except Exception:
        return Response({'available': None}, status=200)


# ─── Auth Views ───────────────────────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([AllowAny])
def register_user(request):
    serializer = UserRegistrationSerializer(data=request.data)
    if serializer.is_valid():
        user = serializer.save()

        campus = getattr(user, 'school', 'pau') or 'pau'
        campus_name = 'FUTO' if campus.lower() == 'futo' else 'PAU'

        send_notification(
            recipient=user,
            notification_type='welcome',
            title='🎉 Welcome to StudEx!',
            message=f'Your account has been created successfully. Browse services, book vendors, and enjoy the {campus_name} marketplace!',
            action_url='/home',
        )

        refresh = RefreshToken.for_user(user)
        return Response({
            'message': 'User registered successfully',
            'user': UserProfileSerializer(user, context={'request': request}).data,
            'tokens': {
                'refresh': str(refresh),
                'access': str(refresh.access_token),
            }
        }, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([AllowAny])
def login_user(request):
    serializer = UserLoginSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    user = serializer.validated_data['user']
    refresh = RefreshToken.for_user(user)
    return Response({
        'message': 'Login successful',
        'user': UserProfileSerializer(user, context={'request': request}).data,
        'tokens': {
            'refresh': str(refresh),
            'access': str(refresh.access_token),
        }
    }, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_user_profile(request):
    return Response(UserProfileSerializer(request.user, context={'request': request}).data)


@api_view(['PUT', 'PATCH'])
@permission_classes([IsAuthenticated])
def update_user_profile(request):
    """
    Updates user profile fields.
    Now supports username changes with uniqueness validation.
    """
    user = request.user
    data = request.data

    # ── Username update ────────────────────────────────────────────────────
    new_username = data.get('username', '').strip()
    if new_username and new_username != user.username:
        # Validate format: letters, numbers, underscores only
        if not re.match(r'^[a-zA-Z0-9_]+$', new_username):
            return Response(
                {'username': ['Username can only contain letters, numbers, and underscores. No spaces.']},
                status=status.HTTP_400_BAD_REQUEST
            )
        # Validate length
        if len(new_username) < 3:
            return Response(
                {'username': ['Username must be at least 3 characters.']},
                status=status.HTTP_400_BAD_REQUEST
            )
        if len(new_username) > 30:
            return Response(
                {'username': ['Username cannot exceed 30 characters.']},
                status=status.HTTP_400_BAD_REQUEST
            )
        # Check uniqueness (case-insensitive)
        if User.objects.filter(username__iexact=new_username).exclude(pk=user.pk).exists():
            return Response(
                {'username': ['A user with that username already exists.']},
                status=status.HTTP_400_BAD_REQUEST
            )
        user.username = new_username

    # ── Profile image — handle separately since serializer field is read-only ──
    if 'profile_image' in request.FILES:
        user.profile_image = request.FILES['profile_image']
        user.save(update_fields=['profile_image'])
    elif data.get('profile_image') is None and 'profile_image' in data:
        # Explicit null → remove profile picture
        user.profile_image = None
        user.save(update_fields=['profile_image'])

    # ── Other fields handled by serializer ────────────────────────────────
    serializer_data = {k: v for k, v in data.items() if k not in ('username', 'profile_image')}
    serializer = UserProfileSerializer(user, data=serializer_data, partial=True)

    if serializer.is_valid():
        serializer.save()
        user.refresh_from_db()
        return Response({
            'message': 'Profile updated successfully',
            'user': UserProfileSerializer(user, context={'request': request}).data,
        }, status=status.HTTP_200_OK)

    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def check_profile_completion(request):
    user = request.user
    profile, _ = Profile.objects.get_or_create(user=user)
    completion_map = {
        'username': user.username,
        'email': user.email,
        'phone': user.phone,
        'bio': user.bio,
        'whatsapp': profile.whatsapp,
    }
    missing = [field for field, val in completion_map.items() if not val]
    is_complete = len(missing) == 0
    if is_complete and not profile.profile_bonus_eligible:
        profile.profile_bonus_eligible = True
        profile.save(update_fields=['profile_bonus_eligible'])
        return Response({
            'message': 'Profile complete! You earned 5% off your first order 🎉',
            'bonus': True,
            'missing': [],
            'is_complete': True,
        })
    return Response({
        'message': 'Profile not complete yet' if not is_complete else 'Profile already complete',
        'bonus': False,
        'missing': missing,
        'is_complete': is_complete,
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout_user(request):
    try:
        refresh_token = request.data.get('refresh')
        if refresh_token:
            token = RefreshToken(refresh_token)
            token.blacklist()
        return Response({'message': 'Logged out successfully'}, status=status.HTTP_200_OK)
    except Exception as e:
        return Response({'error': f'Logout failed: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def me(request):
    user = request.user
    unread_notifications = 0
    try:
        from notifications.models import Notification
        unread_notifications = Notification.objects.filter(
            recipient=user, is_read=False
        ).count()
    except Exception:
        pass
    profile_data = {}
    try:
        p = user.profile
        profile_data = {
            'whatsapp': p.whatsapp or '',
            'instagram': p.instagram or '',
            'profile_bonus_eligible': p.profile_bonus_eligible,
            'profile_bonus_used': p.profile_bonus_used,
            'vendor_badge': p.vendor_badge,
            'rating': str(p.rating),
            'total_reviews': p.total_reviews,
        }
    except Profile.DoesNotExist:
        pass
    return Response({
        'id': user.id,
        'username': user.username,
        'email': user.email,
        'phone': user.phone or '',
        'bio': user.bio or '',
        'user_type': user.user_type,
        'is_verified_vendor': user.is_verified_vendor,
        'business_name': user.business_name or '',
        'hostel': user.hostel or '',
        'matric_number': user.matric_number or '',
        'school': user.school or '',
        'unread_notifications': unread_notifications,
        **profile_data,
    })


# ─── Seller Application ViewSet ───────────────────────────────────────────────

class SellerApplicationViewSet(viewsets.ModelViewSet):
    queryset = SellerApplication.objects.select_related('user').all()
    serializer_class = SellerApplicationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        if self.request.user.is_staff:
            return self.queryset.order_by('-submitted_at')
        return self.queryset.filter(user=self.request.user)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return Response({
            'message': "Application submitted! We'll review your ID within 48 hours.",
            'status': 'pending',
        }, status=status.HTTP_201_CREATED)

    def perform_create(self, serializer):
        application = serializer.save(user=self.request.user)

        send_notification(
            recipient=self.request.user,
            notification_type='vendor_application',
            title='📋 Application Submitted!',
            message='Your seller application has been submitted and is under review. You will be notified when it is reviewed.',
            action_url='/account',
        )

        try:
            from studex.notifications import notify_admin_new_application
            notify_admin_new_application(application)
        except Exception:
            pass

    @action(detail=True, methods=['post'], permission_classes=[IsAdminUser])
    def approve(self, request, pk=None):
        application = self.get_object()
        if application.status == 'approved':
            return Response({'error': 'Application already approved'}, status=status.HTTP_400_BAD_REQUEST)

        application.status = 'approved'
        application.reviewed_at = timezone.now()
        application.reviewed_by = request.user
        application.notes = request.data.get('notes', '')
        application.save()

        user = application.user
        user.is_verified_vendor = True
        user.user_type = 'vendor'
        user.save()

        send_notification(
            recipient=user,
            notification_type='seller_approved',
            title='🎉 Application Accepted!',
            message='Your seller application has been approved. You are now a verified vendor on StudEx. Start listing your services!',
            action_url='/seller',
        )

        return Response({
            'message': f'{user.username} has been approved as a seller.',
            'status': 'approved',
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], permission_classes=[IsAdminUser])
    def reject(self, request, pk=None):
        application = self.get_object()
        if application.status == 'rejected':
            return Response({'error': 'Application already rejected'}, status=status.HTTP_400_BAD_REQUEST)

        user = application.user
        user.is_verified_vendor = False
        user.user_type = 'student'
        user.save()

        send_notification(
            recipient=user,
            notification_type='seller_rejected',
            title='❌ Application Rejected',
            message='Your seller application was rejected. Please upload your ID card details correctly and try again.',
            action_url='/seller/onboarding',
        )

        application.delete()

        return Response({
            'message': f"{user.username}'s application has been rejected.",
            'status': 'rejected',
        }, status=status.HTTP_200_OK)

    @action(
        detail=False,
        methods=['post'],
        permission_classes=[IsAdminUser],
        url_path='revoke/(?P<user_id>[^/.]+)'
    )
    def revoke(self, request, user_id=None):
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

        if not user.is_verified_vendor:
            return Response({'error': 'User is not a verified vendor'}, status=status.HTTP_400_BAD_REQUEST)

        user.is_verified_vendor = False
        user.user_type = 'student'
        user.save()

        SellerApplication.objects.filter(user=user).delete()

        send_notification(
            recipient=user,
            notification_type='seller_revoked',
            title='⚠️ Vendor Status Removed',
            message='Your vendor status has been removed by admin. Your account has been reset to a student account. If you wish to become a vendor again, please reapply.',
            action_url='/seller/onboarding',
        )

        return Response({
            'message': f"{user.username}'s vendor status has been revoked. They are now a student.",
            'user_type': 'student',
        }, status=status.HTTP_200_OK)


# ─── Password Reset ───────────────────────────────────────────────────────────

class ForgotPasswordView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = request.data.get('email')
        if not email:
            return Response({'detail': 'Email is required'}, status=400)
        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            return Response({'detail': 'If this email exists, a reset link has been sent.'})

        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        reset_url = f"{settings.FRONTEND_BASE_URL}/reset-password?uid={uid}&token={token}"

        send_mail(
            subject='StudEx — Reset Your Password',
            message=(
                f'Hi {user.username},\n\n'
                f'Click the link below to reset your password:\n\n{reset_url}\n\n'
                f'This link expires in 24 hours.'
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[email],
            fail_silently=False,
        )
        return Response({
            'detail': 'Reset link generated successfully.',
            'reset_url': reset_url,
        })


class ResetPasswordView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        uid = request.data.get('uid')
        token = request.data.get('token')
        password = request.data.get('password')

        if not uid or not token or not password:
            return Response({'detail': 'Missing fields'}, status=400)

        try:
            user_id = urlsafe_base64_decode(uid).decode()
            user = User.objects.get(pk=user_id)
        except Exception:
            return Response({'detail': 'Invalid link'}, status=400)

        if not default_token_generator.check_token(user, token):
            return Response({'detail': 'Token expired or invalid'}, status=400)

        user.set_password(password)
        user.save()
        return Response({'detail': 'Password reset successful'})


# ─── Public Vendor List ───────────────────────────────────────────────────────

from rest_framework import generics
from rest_framework.generics import ListAPIView
from rest_framework.pagination import PageNumberPagination
from django.db.models import Case, When, Value, IntegerField
from .serializers import VendorListSerializer


class VendorPagination(PageNumberPagination):
    page_size = 20


class VendorListView(ListAPIView):
    permission_classes = [AllowAny]
    serializer_class = VendorListSerializer
    pagination_class = VendorPagination

    def get_queryset(self):
        from django.db.models import Q
        badge_order = Case(
            When(profile__vendor_badge='top', then=Value(0)),
            When(profile__vendor_badge='trusted', then=Value(1)),
            When(profile__vendor_badge='rising', then=Value(2)),
            default=Value(3),
            output_field=IntegerField(),
        )
        user = self.request.user
        if user.is_authenticated:
            campus = (getattr(user, 'school', '') or 'pau').lower()
        else:
            campus_param = self.request.query_params.get('campus', '').lower()
            campus = campus_param if campus_param in ('pau', 'futo') else 'pau'

        qs = User.objects.filter(is_verified_vendor=True, seller_application__status='approved')
        # Treat null/blank school as PAU (existing vendors pre-dating the school field)
        if campus == 'pau':
            qs = qs.filter(Q(school__iexact='pau') | Q(school='') | Q(school__isnull=True))
        else:
            qs = qs.filter(school__iexact=campus)

        return (
            qs
            .select_related('profile')
            .annotate(badge_order=badge_order)
            .order_by('badge_order', '-profile__rating')
        )


class VendorDetailView(generics.RetrieveAPIView):
    serializer_class = VendorListSerializer
    permission_classes = [AllowAny]
    lookup_field = 'username'

    def get_queryset(self):
        return User.objects.filter(is_verified_vendor=True).select_related('profile')