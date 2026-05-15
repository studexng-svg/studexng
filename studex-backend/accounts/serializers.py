# accounts/serializers.py
from rest_framework import serializers
from django.contrib.auth import get_user_model, authenticate
from .models import Profile, SellerApplication
import re

User = get_user_model()

class UserRegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    password2 = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'phone', 'password', 'password2',
            'user_type', 'matric_number', 'nin', 'verification_type', 'hostel', 'school'
        ]
        extra_kwargs = {
            'email': {'required': True},
            'username': {'required': True},
            'matric_number': {'required': False, 'allow_blank': True, 'allow_null': True},
            'nin': {'required': False, 'allow_blank': True, 'allow_null': True},
            'verification_type': {'required': False, 'allow_blank': True, 'allow_null': True},
        }

    # ✅ USERNAME VALIDATION (ADDED PROPERLY)
    def validate_username(self, value):
        value = value.strip()

        if " " in value:
            raise serializers.ValidationError("Username cannot contain spaces")

        if not re.match(r'^[a-zA-Z0-9_]+$', value):
            raise serializers.ValidationError("Only letters, numbers, and underscores allowed")

        if len(value) < 3:
            raise serializers.ValidationError("Username must be at least 3 characters")

        if len(value) > 30:
            raise serializers.ValidationError("Username cannot exceed 30 characters")

        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("Username already taken")

        return value

    # ✅ EMAIL VALIDATION
    def validate_email(self, value):
        value = value.lower().strip()

        allowed_domains = ('@pau.edu.ng', '@futo.edu.ng', '@gmail.com')
        if not any(value.endswith(d) for d in allowed_domains):
            raise serializers.ValidationError(
                "Use your @pau.edu.ng, @futo.edu.ng, or Gmail address"
            )

        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("Email already exists")

        return value

    # ✅ PHONE VALIDATION (IMPROVED)
    def validate_phone(self, value):
        if not value:
            raise serializers.ValidationError("Phone number is required")

        phone = value.replace(' ', '').replace('-', '')

        if not phone.isdigit():
            raise serializers.ValidationError("Phone number must be numeric")

        if len(phone) != 11:
            raise serializers.ValidationError("Phone number must be exactly 11 digits")

        if not phone.startswith("0"):
            raise serializers.ValidationError("Phone number must start with 0")

        return phone

    # ✅ PASSWORD VALIDATION (UPGRADED)
    def validate_password(self, value):
        if len(value) < 8:
            raise serializers.ValidationError("Password must be at least 8 characters")

        if not re.search(r'[A-Z]', value):
            raise serializers.ValidationError("Password must contain at least one uppercase letter")

        if not re.search(r'[a-z]', value):
            raise serializers.ValidationError("Password must contain at least one lowercase letter")

        if not re.search(r'\d', value):
            raise serializers.ValidationError("Password must contain at least one number")

        return value

    # ✅ MATCH PASSWORDS
    def validate(self, data):
        if data['password'] != data['password2']:
            raise serializers.ValidationError({"password": "Passwords do not match"})
        return data

    def validate_matric_number(self, value):
        if value:
            if User.objects.filter(matric_number=value).exists():
                raise serializers.ValidationError("This matriculation number is already registered")
        return value

    def validate_nin(self, value):
        if value:
            import re
            if not re.match(r'^\d{11}$', value):
                raise serializers.ValidationError("NIN must be exactly 11 digits")
            if User.objects.filter(nin=value).exists():
                raise serializers.ValidationError("This NIN is already registered")
        return value

    def create(self, validated_data):
        validated_data.pop('password2')
        password = validated_data.pop('password')

        # Auto-set verification_type if not explicitly provided
        if not validated_data.get('verification_type'):
            if validated_data.get('matric_number'):
                validated_data['verification_type'] = 'matric'
            elif validated_data.get('nin'):
                validated_data['verification_type'] = 'nin'

        user = User.objects.create_user(**validated_data)
        user.set_password(password)
        user.save()

        Profile.objects.get_or_create(user=user)

        return user


class UserLoginSerializer(serializers.Serializer):
    email = serializers.EmailField(required=True)
    password = serializers.CharField(write_only=True, required=True)

    def validate(self, data):
        email = data.get('email').lower()
        password = data.get('password')

        try:
            user = User.objects.get(email__iexact=email)
        except User.DoesNotExist:
            raise serializers.ValidationError("Invalid email or password.")

        user = authenticate(username=user.username, password=password)

        if not user:
            raise serializers.ValidationError("Invalid email or password.")
        if not user.is_active:
            raise serializers.ValidationError("User account is disabled.")

        data['user'] = user
        return data


class UserProfileSerializer(serializers.ModelSerializer):
    profile = serializers.SerializerMethodField()
    profile_image = serializers.SerializerMethodField()
    whatsapp = serializers.CharField(write_only=True, required=False, allow_blank=True, allow_null=True)
    instagram = serializers.CharField(write_only=True, required=False, allow_blank=True, allow_null=True)

    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'phone', 'user_type',
            'matric_number', 'nin', 'verification_type', 'hostel', 'school',
            'business_name', 'is_verified_vendor',
            'bio', 'profile_image', 'wallet_balance', 'created_at', 'profile',
            'is_staff', 'is_superuser',
            'whatsapp', 'instagram',
        ]
        read_only_fields = ['wallet_balance', 'is_verified_vendor', 'created_at', 'is_staff', 'is_superuser']

    def get_profile_image(self, obj):
        """Always return an absolute URL — works with Cloudinary, S3, and local storage."""
        if not obj.profile_image:
            return None
        # Raw field value — could be a full CDN URL (direct Cloudinary upload path)
        name = getattr(obj.profile_image, 'name', None)
        if not name or name == 'profiles/default.jpg':
            return None
        if name.startswith('http'):
            return name
        try:
            url = obj.profile_image.url
            if url and url.startswith('http'):
                return url
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(url)
            return url
        except Exception:
            return None

    def get_profile(self, obj):
        try:
            profile = obj.profile
            return {
                'whatsapp': profile.whatsapp,
                'instagram': profile.instagram,
                'total_orders': profile.total_orders,
                'total_sales': profile.total_sales,
                'rating': str(profile.rating),
                'total_reviews': profile.total_reviews,
                'profile_bonus_eligible': profile.profile_bonus_eligible,
                'profile_bonus_used': profile.profile_bonus_used,
                'vendor_badge': profile.vendor_badge,
            }
        except Profile.DoesNotExist:
            return None

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Hide verification fields for PAU (verified by email); keep for FUTO and non-students
        school = (instance.school or '').lower()
        if school and school != 'futo':
            data.pop('nin', None)
            data.pop('verification_type', None)
        return data

    def update(self, instance, validated_data):
        whatsapp = validated_data.pop('whatsapp', None)
        instagram = validated_data.pop('instagram', None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        try:
            profile = instance.profile
            if whatsapp is not None:
                profile.whatsapp = whatsapp
            if instagram is not None:
                profile.instagram = instagram
            profile.save()
        except Profile.DoesNotExist:
            Profile.objects.create(user=instance, whatsapp=whatsapp or '', instagram=instagram or '')

        return instance


class ProfileSerializer(serializers.ModelSerializer):
    user = serializers.StringRelatedField(read_only=True)

    class Meta:
        model = Profile
        fields = '__all__'
        read_only_fields = ['total_orders', 'total_sales', 'rating', 'total_reviews']


class UserSerializer(serializers.ModelSerializer):
    """Serializer for admin user management endpoints"""
    profile = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'phone', 'user_type',
                  'is_active', 'is_staff', 'is_superuser', 'date_joined',
                  'matric_number', 'hostel', 'business_name', 'school',
                  'is_verified_vendor', 'wallet_balance', 'profile']
        read_only_fields = ['date_joined', 'wallet_balance']

    def get_profile(self, obj):
        try:
            p = obj.profile
        except Profile.DoesNotExist:
            return None
        return {
            'is_verified_vendor': obj.is_verified_vendor,
            'matric_number': obj.matric_number,
            'business_name': obj.business_name,
            'hostel': obj.hostel,
            'whatsapp': getattr(p, 'whatsapp', None) or '',
            'instagram': getattr(p, 'instagram', None) or '',
            'rating': str(getattr(p, 'rating', None) or ''),
            'total_orders': getattr(p, 'total_orders', None) or 0,
            'total_reviews': getattr(p, 'total_reviews', None) or 0,
            'on_platform_sales': str(getattr(p, 'on_platform_sales', None) or '0'),
            'vendor_badge': getattr(p, 'vendor_badge', None) or '',
        }


class SellerApplicationSerializer(serializers.ModelSerializer):
    id_front = serializers.FileField(required=False, allow_null=True)
    id_back = serializers.FileField(required=False, allow_null=True)
    admission_letter = serializers.FileField(required=False, allow_null=True)
    nin_document = serializers.FileField(required=False, allow_null=True)

    id_front_url = serializers.SerializerMethodField()
    id_back_url = serializers.SerializerMethodField()
    admission_letter_url = serializers.SerializerMethodField()
    nin_document_url = serializers.SerializerMethodField()

    applicant_name = serializers.SerializerMethodField()
    applicant_email = serializers.SerializerMethodField()
    applicant_matric = serializers.SerializerMethodField()
    applicant_phone = serializers.SerializerMethodField()
    applicant_business_name = serializers.SerializerMethodField()
    applicant_hostel = serializers.SerializerMethodField()
    applicant_whatsapp = serializers.SerializerMethodField()
    applicant_instagram = serializers.SerializerMethodField()
    applicant_user_id = serializers.SerializerMethodField()

    class Meta:
        model = SellerApplication
        fields = [
            'id',
            'id_front',
            'id_back',
            'admission_letter',
            'nin_document',
            'id_front_url',
            'id_back_url',
            'admission_letter_url',
            'nin_document_url',
            'business_age_confirmed',
            'status',
            'submitted_at',
            'notes',
            'applicant_user_id',
            'applicant_name',
            'applicant_email',
            'applicant_matric',
            'applicant_phone',
            'applicant_business_name',
            'applicant_hostel',
            'applicant_whatsapp',
            'applicant_instagram',
        ]
        read_only_fields = ['status', 'submitted_at', 'notes']

    def _abs_url(self, file_field):
        if not file_field:
            return None
        try:
            url = file_field.url
            request = self.context.get('request')
            if request and url.startswith('/'):
                return request.build_absolute_uri(url)
            return url
        except Exception:
            return None

    def get_id_front_url(self, obj):
        return self._abs_url(obj.id_front)

    def get_id_back_url(self, obj):
        return self._abs_url(obj.id_back)

    def get_admission_letter_url(self, obj):
        return self._abs_url(obj.admission_letter)

    def get_nin_document_url(self, obj):
        return self._abs_url(obj.nin_document)

    def get_applicant_name(self, obj):
        return obj.user.get_full_name() or obj.user.username

    def get_applicant_email(self, obj):
        return obj.user.email

    def get_applicant_matric(self, obj):
        return obj.user.matric_number or ''

    def get_applicant_phone(self, obj):
        return obj.user.phone or ''

    def get_applicant_business_name(self, obj):
        return obj.user.business_name or ''

    def get_applicant_hostel(self, obj):
        return obj.user.hostel or ''

    def get_applicant_whatsapp(self, obj):
        try:
            return obj.user.profile.whatsapp or ''
        except Exception:
            return ''

    def get_applicant_instagram(self, obj):
        try:
            return obj.user.profile.instagram or ''
        except Exception:
            return ''

    def get_applicant_user_id(self, obj):
        return obj.user.id

    def validate(self, data):
        import logging
        logger = logging.getLogger(__name__)
        request = self.context.get('request')
        user_id = getattr(getattr(request, 'user', None), 'pk', 'anonymous')

        for field in ('id_front', 'id_back', 'admission_letter', 'nin_document'):
            f = data.get(field)
            if f:
                logger.info(
                    "[audit] seller_doc_upload: field=%s user=%s name=%s size=%d",
                    field, user_id, f.name, f.size,
                )

        has_id_card = data.get('id_front') and data.get('id_back')
        has_letter = bool(data.get('admission_letter'))
        has_nin = bool(data.get('nin_document'))
        if not has_id_card and not has_letter and not has_nin:
            raise serializers.ValidationError(
                "Upload either both sides of your ID card, an admission letter, or your NIN document."
            )
        return data

    def create(self, validated_data):
        user = validated_data.pop('user', None) or self.context['request'].user
        SellerApplication.objects.filter(user=user).delete()
        return SellerApplication.objects.create(user=user, **validated_data)


class VendorListSerializer(serializers.ModelSerializer):
    profile_picture = serializers.SerializerMethodField()
    vendor_badge = serializers.SerializerMethodField()
    rating = serializers.SerializerMethodField()
    total_reviews = serializers.SerializerMethodField()
    completion_rate = serializers.SerializerMethodField()
    total_listings = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'username', 'business_name', 'profile_picture',
            'bio', 'vendor_badge', 'rating', 'total_reviews',
            'completion_rate', 'total_listings', 'hostel',
        ]

    def get_profile_picture(self, obj):
        if not obj.profile_image:
            return None
        name = getattr(obj.profile_image, 'name', None)
        if not name or name == 'profiles/default.jpg':
            return None
        if name.startswith('http'):
            return name
        try:
            url = obj.profile_image.url
            if url and url.startswith('http'):
                return url
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(url)
            return url
        except Exception:
            return None

    def get_vendor_badge(self, obj):
        try:
            return obj.profile.vendor_badge
        except Profile.DoesNotExist:
            return 'none'

    def get_rating(self, obj):
        try:
            return float(obj.profile.rating)
        except Profile.DoesNotExist:
            return 0.0

    def get_total_reviews(self, obj):
        try:
            return obj.profile.total_reviews
        except Profile.DoesNotExist:
            return 0

    def get_completion_rate(self, obj):
        try:
            return float(obj.profile.completion_rate)
        except Profile.DoesNotExist:
            return 0.0

    def get_total_listings(self, obj):
        return obj.listings.filter(is_available=True).count()