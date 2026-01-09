# accounts/serializers.py
from rest_framework import serializers
from django.contrib.auth import get_user_model, authenticate
from .models import Profile, SellerApplication  # ← Added SellerApplication

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
        """Validate passwords match"""
        if data['password'] != data['password2']:
            raise serializers.ValidationError("Passwords do not match")
        return data
    
    def validate_email(self, value):
        """Validate email is unique and must end with @pau.edu.ng"""
        # Check uniqueness
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("Email already exists")

        # CRITICAL: Enforce @pau.edu.ng domain
        if not value.lower().endswith('@pau.edu.ng'):
            raise serializers.ValidationError("Only @pau.edu.ng email addresses are allowed")

        return value

    def validate_phone(self, value):
        """Validate phone number is numeric and exactly 11 digits"""
        import re

        if not value:
            raise serializers.ValidationError("Phone number is required")

        # Remove any whitespace
        phone_cleaned = value.replace(' ', '').replace('-', '')

        # Check if numeric
        if not phone_cleaned.isdigit():
            raise serializers.ValidationError("Phone number must be numeric")

        # Check if exactly 11 digits
        if len(phone_cleaned) != 11:
            raise serializers.ValidationError("Phone number must be exactly 11 digits")

        return phone_cleaned

    def validate_password(self, value):
        """Validate password is alphanumeric (contains both letters and numbers)"""
        import re

        # Check if contains at least one letter
        if not re.search(r'[A-Za-z]', value):
            raise serializers.ValidationError("Password must contain letters and numbers only")

        # Check if contains at least one number
        if not re.search(r'[0-9]', value):
            raise serializers.ValidationError("Password must contain letters and numbers only")

        # Check if only alphanumeric (no special characters)
        if not re.match(r'^[A-Za-z0-9]+$', value):
            raise serializers.ValidationError("Password must contain letters and numbers only")

        return value

    def validate_matric_number(self, value):
        """Validate matriculation number is unique and properly formatted"""
        import re

        # If matric number is provided, validate it
        if value:
            # Check uniqueness
            if User.objects.filter(matric_number=value).exists():
                raise serializers.ValidationError("This matriculation number is already registered")

            # Optional: Add format validation (customize pattern for your university)
            # Example pattern: PAU/2023/12345 or 2023/12345
            # pattern = r'^[A-Z]{2,4}/\d{4}/\d{4,6}$|^\d{4}/\d{4,6}$'
            # if not re.match(pattern, value.upper()):
            #     raise serializers.ValidationError(
            #         "Invalid matriculation number format. Expected format: PAU/2023/12345 or 2023/12345"
            #     )

        return value
    
    def create(self, validated_data):
        """Create user with hashed password"""
        validated_data.pop('password2')
        password = validated_data.pop('password')
        
        user = User.objects.create(**validated_data)
        user.set_password(password)
        user.save()
        
        # Create profile automatically (signals also handle this as backup)
        Profile.objects.get_or_create(user=user)
        
        return user


class UserLoginSerializer(serializers.Serializer):
    email = serializers.EmailField(required=True)
    password = serializers.CharField(write_only=True, required=True)

    def validate(self, data):
        email = data.get('email')
        password = data.get('password')

        if email and password:
            user = authenticate(username=email, password=password)
            if user:
                if not user.is_active:
                    raise serializers.ValidationError("User account is disabled.")
                data['user'] = user
                return data
            else:
                raise serializers.ValidationError("Invalid email or password.")
        raise serializers.ValidationError("Both email and password are required.")


class UserProfileSerializer(serializers.ModelSerializer):
    profile = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'phone', 'user_type',
                  'matric_number', 'hostel', 'business_name', 'is_verified_vendor',
                  'bio', 'profile_image', 'wallet_balance', 'created_at', 'profile',
                  'is_staff', 'is_superuser']
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
            }
        except Profile.DoesNotExist:
            return None


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


# FIXED: Seller Application Serializer — for real document upload
class SellerApplicationSerializer(serializers.ModelSerializer):
    id_document = serializers.FileField(required=True)
    admission_letter = serializers.FileField(required=True)

    class Meta:
        model = SellerApplication
        fields = [
            'id',
            'id_document',
            'admission_letter',
            'business_age_confirmed',
            'status',
            'submitted_at',
            'notes'
        ]
        read_only_fields = ['status', 'submitted_at', 'notes']

    def create(self, validated_data):
        user = self.context['request'].user
        
        # Delete any previous application (one per user)
        SellerApplication.objects.filter(user=user).delete()
        
        # Don't pass user here - it's handled by perform_create in the view
        application = SellerApplication.objects.create(
            **validated_data
        )
        return application

    def validate(self, data):
        # FIXED: Remove the vendor type check
        # Anyone (buyer or vendor user_type) can submit a seller application
        # The application process will determine if they get approved
        return data