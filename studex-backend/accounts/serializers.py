# accounts/serializers.py
from rest_framework import serializers
from django.contrib.auth import get_user_model, authenticate
from .models import Profile, SellerApplication

User = get_user_model()


class UserRegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    password2 = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'phone', 'password', 'password2',
                  'user_type', 'matric_number', 'hostel']
        extra_kwargs = {
            'email': {'required': True},
            'username': {'required': True},
        }

    def validate(self, data):
        if data['password'] != data['password2']:
            raise serializers.ValidationError("Passwords do not match")
        return data

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("Email already exists")
        if not value.lower().endswith('@pau.edu.ng'):
            raise serializers.ValidationError("Only @pau.edu.ng email addresses are allowed")
        return value

    def validate_phone(self, value):
        if not value:
            raise serializers.ValidationError("Phone number is required")
        phone_cleaned = value.replace(' ', '').replace('-', '')
        if not phone_cleaned.isdigit():
            raise serializers.ValidationError("Phone number must be numeric")
        if len(phone_cleaned) != 11:
            raise serializers.ValidationError("Phone number must be exactly 11 digits")
        return phone_cleaned

    def validate_password(self, value):
        if len(value) < 8:
            raise serializers.ValidationError("Password must be at least 8 characters.")
        if not any(c.isalpha() for c in value):
            raise serializers.ValidationError("Password must contain at least one letter.")
        if not any(c.isdigit() for c in value):
            raise serializers.ValidationError("Password must contain at least one number.")
        return value

    def validate_matric_number(self, value):
        if value:
            if User.objects.filter(matric_number=value).exists():
                raise serializers.ValidationError("This matriculation number is already registered")
        return value

    def create(self, validated_data):
        validated_data.pop('password2')
        password = validated_data.pop('password')
        user = User.objects.create(**validated_data)
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
    whatsapp = serializers.CharField(write_only=True, required=False, allow_blank=True, allow_null=True)
    instagram = serializers.CharField(write_only=True, required=False, allow_blank=True, allow_null=True)

    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'phone', 'user_type',
            'matric_number', 'hostel', 'business_name', 'is_verified_vendor',
            'bio', 'profile_image', 'wallet_balance', 'created_at', 'profile',
            'is_staff', 'is_superuser',
            'whatsapp', 'instagram',
        ]
        read_only_fields = ['wallet_balance', 'is_verified_vendor', 'created_at', 'is_staff', 'is_superuser']

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
                  'matric_number', 'hostel', 'business_name',
                  'is_verified_vendor', 'profile']
        read_only_fields = ['date_joined']

    def get_profile(self, obj):
        try:
            profile = obj.profile
            return {
                'is_verified_vendor': profile.is_verified_vendor,
                'matric_number': obj.matric_number,
                'business_name': obj.business_name,
                'hostel': obj.hostel,
            }
        except Profile.DoesNotExist:
            return None


class SellerApplicationSerializer(serializers.ModelSerializer):
    # ✅ UPDATED: id_front and id_back only
    id_front = serializers.ImageField(required=True)
    id_back = serializers.ImageField(required=True)

    # ✅ Read-only URL fields so admin frontend can display the images
    id_front_url = serializers.SerializerMethodField()
    id_back_url = serializers.SerializerMethodField()

    # ✅ Applicant info for admin panel display
    applicant_name = serializers.SerializerMethodField()
    applicant_email = serializers.SerializerMethodField()
    applicant_matric = serializers.SerializerMethodField()

    class Meta:
        model = SellerApplication
        fields = [
            'id',
            'id_front',
            'id_back',
            'id_front_url',
            'id_back_url',
            'business_age_confirmed',
            'status',
            'submitted_at',
            'notes',
            'applicant_name',
            'applicant_email',
            'applicant_matric',
        ]
        read_only_fields = ['status', 'submitted_at', 'notes']

    def get_id_front_url(self, obj):
        request = self.context.get('request')
        if obj.id_front and request:
            return request.build_absolute_uri(obj.id_front.url)
        return None

    def get_id_back_url(self, obj):
        request = self.context.get('request')
        if obj.id_back and request:
            return request.build_absolute_uri(obj.id_back.url)
        return None

    def get_applicant_name(self, obj):
        return obj.user.get_full_name() or obj.user.username

    def get_applicant_email(self, obj):
        return obj.user.email

    def get_applicant_matric(self, obj):
        return obj.user.matric_number or ''

    def create(self, validated_data):
        user = self.context['request'].user
        # Delete any previous application (one per user)
        SellerApplication.objects.filter(user=user).delete()
        application = SellerApplication.objects.create(**validated_data)
        return application

    def validate(self, data):
        return data