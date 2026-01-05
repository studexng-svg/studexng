"""
Django settings for StudEx project.
"""

from pathlib import Path
from datetime import timedelta
import os
from decouple import config

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# =======================================
# Firebase Admin Initialization
# =======================================
# This runs at import time and initializes Firebase Admin SDK
try:
    import firebase_admin
    from firebase_admin import credentials

    service_account_path = os.path.join(BASE_DIR.parent, 'firebase_service_account.json')
    
    if os.path.exists(service_account_path):
        cred = credentials.Certificate(service_account_path)
        firebase_admin.initialize_app(cred)
    else:
        # Silent fallback in case file is missing (e.g. CI environment)
        print("Warning: firebase_service_account.json not found. Firebase auth will not work.")
except ImportError:
    print("firebase-admin not installed. Run: pip install firebase-admin")
except Exception as e:
    print(f"Failed to initialize Firebase Admin: {e}")

# SECURITY WARNING: keep the secret key used in production secret!
# SECRET_KEY is now REQUIRED - no default value for security
try:
    SECRET_KEY = config('SECRET_KEY')
except:
    raise ValueError("SECRET_KEY environment variable must be set. Add it to your .env file.")

# SECURITY WARNING: don't run with debug turned on in production!
# DEBUG defaults to False for security
DEBUG = config('DEBUG', default=False, cast=bool)

ALLOWED_HOSTS = config('ALLOWED_HOSTS', default='localhost,127.0.0.1,.vercel.app,.railway.app').split(',')

# Application definition
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    
    # Third party apps
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',  # For proper logout
    'corsheaders',
    'django_filters',
    
    # Your apps
    'accounts',
    'services',
    'orders',
    'wallet',
    'chat',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',  # Must be first
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',  # Add this for static files on Railway
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'studex.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'studex.wsgi.application'

# =======================================
# Database Configuration
# =======================================
DB_ENGINE = config('DB_ENGINE', default='django.db.backends.sqlite3')

if DB_ENGINE == 'django.db.backends.sqlite3':
    DATABASES = {
        'default': {
            'ENGINE': DB_ENGINE,
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }
else:
    # PostgreSQL or other database
    DATABASES = {
        'default': {
            'ENGINE': DB_ENGINE,
            'NAME': config('DB_NAME', default='studex_db'),
            'USER': config('DB_USER', default='postgres'),
            'PASSWORD': config('DB_PASSWORD', default=''),
            'HOST': config('DB_HOST', default='localhost'),
            'PORT': config('DB_PORT', default='5432'),
        }
    }

# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]

# Internationalization
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'Africa/Lagos'
USE_I18N = True
USE_TZ = True

# Static files
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'

# Media files
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# Default primary key field type
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Custom User Model
AUTH_USER_MODEL = 'accounts.User'

# =======================================
# CORS Settings
# =======================================
CORS_ALLOWED_ORIGINS = config(
    'CORS_ALLOWED_ORIGINS',
    default='http://localhost:3000,http://127.0.0.1:3000'
).split(',')

CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_ALL_ORIGINS = False

CORS_ALLOW_HEADERS = [
    'accept',
    'accept-encoding',
    'authorization',
    'content-type',
    'dnt',
    'origin',
    'user-agent',
    'x-csrftoken',
    'x-requested-with',
]

CORS_ALLOW_METHODS = [
    'DELETE',
    'GET',
    'OPTIONS',
    'PATCH',
    'POST',
    'PUT',
]

CORS_PREFLIGHT_MAX_AGE = 86400

# =======================================
# REST Framework & JWT + Firebase Settings
# =======================================
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'studex.authentication.FirebaseAuthentication',  # ← Our new Firebase auth
        'rest_framework_simplejwt.authentication.JWTAuthentication',  # ← Keep old JWT working
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 20,
    'DEFAULT_FILTER_BACKENDS': [
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ],
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(days=int(config('JWT_ACCESS_TOKEN_LIFETIME', default=1))),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=int(config('JWT_REFRESH_TOKEN_LIFETIME', default=7))),
    'ROTATE_REFRESH_TOKENS': False,
    'BLACKLIST_AFTER_ROTATION': False,
    'UPDATE_LAST_LOGIN': True,
    'ALGORITHM': 'HS256',
    'SIGNING_KEY': SECRET_KEY,
    'AUTH_HEADER_TYPES': ('Bearer',),
    'USER_ID_FIELD': 'id',
    'USER_ID_CLAIM': 'user_id',
}

# =======================================
# Paystack Payment Gateway Settings
# =======================================
PAYSTACK_PUBLIC_KEY = config('PAYSTACK_PUBLIC_KEY', default='')
PAYSTACK_SECRET_KEY = config('PAYSTACK_SECRET_KEY', default='')

# =======================================
# University Email Domain Validation
# =======================================
# Set to None to allow any email domain (development mode)
# Set to list of domains to restrict to university emails only (production mode)
ALLOWED_UNIVERSITY_DOMAINS = config(
    'ALLOWED_UNIVERSITY_DOMAINS',
    default=None,  # None = allow all domains (development)
    cast=lambda v: v.split(',') if v else None  # Comma-separated in .env
)
# Example: ALLOWED_UNIVERSITY_DOMAINS=pau.edu.ng,student.pau.edu.ng

# =======================================
# Blockchain Settings (Polygon)
# =======================================
BLOCKCHAIN_RPC_URL = config('BLOCKCHAIN_RPC_URL', default='https://polygon-rpc.com')
BLOCKCHAIN_PRIVATE_KEY = config('BLOCKCHAIN_PRIVATE_KEY', default='')
BLOCKCHAIN_CONTRACT_ADDRESS = config('BLOCKCHAIN_CONTRACT_ADDRESS', default='')

# =======================================
# Email Configuration
# =======================================
EMAIL_BACKEND = config('EMAIL_BACKEND', default='django.core.mail.backends.console.EmailBackend')
EMAIL_HOST = config('EMAIL_HOST', default='smtp.gmail.com')
EMAIL_PORT = config('EMAIL_PORT', default=587, cast=int)
EMAIL_USE_TLS = config('EMAIL_USE_TLS', default=True, cast=bool)
EMAIL_HOST_USER = config('EMAIL_HOST_USER', default='')
EMAIL_HOST_PASSWORD = config('EMAIL_HOST_PASSWORD', default='')

# =======================================
# API & Frontend URLs
# =======================================
API_BASE_URL = config('API_BASE_URL', default='http://localhost:8000')
FRONTEND_BASE_URL = config('FRONTEND_BASE_URL', default='http://localhost:3000')

# =======================================
# Security Settings (Production)
# =======================================
# Cookie security (enable in production with HTTPS)
SESSION_COOKIE_SECURE = config('SESSION_COOKIE_SECURE', default=not DEBUG, cast=bool)
SESSION_COOKIE_HTTPONLY = config('SESSION_COOKIE_HTTPONLY', default=True, cast=bool)
SESSION_COOKIE_SAMESITE = config('SESSION_COOKIE_SAMESITE', default='Lax')

CSRF_COOKIE_SECURE = config('CSRF_COOKIE_SECURE', default=not DEBUG, cast=bool)
CSRF_COOKIE_HTTPONLY = config('CSRF_COOKIE_HTTPONLY', default=True, cast=bool)
CSRF_COOKIE_SAMESITE = config('CSRF_COOKIE_SAMESITE', default='Lax')

# Additional security headers (enable in production)
if not DEBUG:
    SECURE_SSL_REDIRECT = True
    SECURE_BROWSER_XSS_FILTER = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    X_FRAME_OPTIONS = 'DENY'

# =======================================
# Logging Configuration
# =======================================
LOG_LEVEL = config('LOG_LEVEL', default='INFO')

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': LOG_LEVEL,
    },
}