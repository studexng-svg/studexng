from rest_framework import serializers
from django.contrib.auth import get_user_model, authenticate
from .models import Profile, SellerApplication
import logging

logger = logging.getLogger(__name__)
User = get_user_model()


def _upload_to_cloudinary(file, folder):
    """Upload a file to Cloudinary and return the secure URL. Returns None on failure."""
    try:
        import cloudinary.uploader
        result = cloudinary.uploader.upload(
            file,
            folder=f"studex/{folder}",
            transformation=[{'quality': 'auto', 'fetch_format': 'auto'}],
            resource_type='image',
        )
        url = result.get('secure_url', '')
        logger.info(f"Cloudinary upload success: {url}")
        return url
    except Exception as e:
        logger.warning(f"Cloudinary upload failed for folder={folder}: {e}")
        return None


class UserRegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    password2 = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'phone', 'password', 'password2',
                  'user_type', 'matric_number', 'hostel']
        extra_kwargs = {'email': {'required': True}, 'username': {'required': True}}

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
        if value and User.objects.filter(matric_number=value).exists():
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
            'is_staff', 'is_superuser', 'whatsapp', 'instagram',
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
    profile = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'phone', 'user_type',
                  'is_active', 'is_staff', 'is_superuser', 'date_joined',
                  'matric_number', 'hostel', 'business_name', 'is_verified_vendor', 'profile']
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
    # ✅ Accept file uploads from frontend
    id_front = serializers.ImageField(required=True, write_only=True)
    id_back = serializers.ImageField(required=True, write_only=True)

    # ✅ Read-only URL fields returned to frontend (Cloudinary URLs)
    id_front_url = serializers.SerializerMethodField()
    id_back_url = serializers.SerializerMethodField()

    # ✅ Applicant info for admin panel
    applicant_name = serializers.SerializerMethodField()
    applicant_email = serializers.SerializerMethodField()
    applicant_matric = serializers.SerializerMethodField()

    class Meta:
        model = SellerApplication
        fields = [
            'id',
            'id_front',       # write-only upload
            'id_back',        # write-only upload
            'id_front_url',   # read-only Cloudinary URL
            'id_back_url',    # read-only Cloudinary URL
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
        """Return Cloudinary URL — works even after Render redeploys."""
        return obj.get_id_front_url()

    def get_id_back_url(self, obj):
        return obj.get_id_back_url()

    def get_applicant_name(self, obj):
        return obj.user.get_full_name() or obj.user.username

    def get_applicant_email(self, obj):
        return obj.user.email

    def get_applicant_matric(self, obj):
        return obj.user.matric_number or ''

    def create(self, validated_data):
        user = self.context['request'].user
        id_front_file = validated_data.pop('id_front')
        id_back_file = validated_data.pop('id_back')

        # Delete any previous application
        SellerApplication.objects.filter(user=user).delete()

        # ✅ Upload both images to Cloudinary
        id_front_cloud_url = _upload_to_cloudinary(id_front_file, 'seller_id_front')
        id_back_cloud_url = _upload_to_cloudinary(id_back_file, 'seller_id_back')

        if id_front_cloud_url and id_back_cloud_url:
            # ✅ Both uploaded successfully — store Cloudinary URLs
            application = SellerApplication.objects.create(
                user=user,
                id_front_url=id_front_cloud_url,
                id_back_url=id_back_cloud_url,
                **validated_data
            )
        else:
            # ⚠️ Cloudinary failed — fall back to local storage
            logger.warning(f"Cloudinary upload failed for {user.username}, falling back to local storage")
            application = SellerApplication.objects.create(
                user=user,
                id_front=id_front_file,
                id_back=id_back_file,
                **validated_data
            )

        return application

    def validate(self, data):
        return data