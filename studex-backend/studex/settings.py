"""
Django settings for StudEx project.
"""

from datetime import timedelta
from pathlib import Path
from decouple import config
import os
import dj_database_url

BASE_DIR = Path(__file__).resolve().parent.parent

# =======================================
# SECURITY
# =======================================
_SECRET_KEY = config('SECRET_KEY', default='')
if not _SECRET_KEY:
    raise ValueError("SECRET_KEY environment variable is not set. Refusing to start.")
SECRET_KEY = _SECRET_KEY

# Comma-separated list of emails that have admin API access
# (in addition to users with is_staff=True)
ADMIN_EMAILS = [
    e.strip()
    for e in config('ADMIN_EMAILS', default='studex.ng@gmail.com').split(',')
    if e.strip()
]

DEBUG = config('DEBUG', default='False') == 'True'

ALLOWED_HOSTS = config(
    'ALLOWED_HOSTS',
    default='localhost,127.0.0.1,.onrender.com,.vercel.app,.railway.app'
).split(',')

import socket
try:
    local_ip = socket.gethostbyname(socket.gethostname())
    if local_ip not in ALLOWED_HOSTS:
        ALLOWED_HOSTS.append(local_ip)
except Exception:
    pass

if DEBUG:
    ALLOWED_HOSTS.append('*')

# =======================================
# APPLICATIONS
# =======================================
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',

    # Third party
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
    'corsheaders',
    'django_filters',
    'django_apscheduler',

    # Cloud storage
    'cloudinary',
    'cloudinary_storage',

    # StudEx apps
    'accounts',
    'services',
    'orders',
    'payments',
    'cart',
    'wishlist',
    'chat',
    'reviews',
    'loyalty',
    'notifications',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'studex.middleware.RateLimitMiddleware',
    'studex.middleware.LastSeenMiddleware',
    'studex.middleware.SecurityHeadersMiddleware',
]

ROOT_URLCONF = 'studex.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
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
# DATABASE
# =======================================
DATABASE_URL = config('DATABASE_URL', default='')

if DATABASE_URL:
    DATABASES = {
        'default': dj_database_url.parse(DATABASE_URL, conn_max_age=600)
    }
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }

# =======================================
# PASSWORD VALIDATION
# =======================================
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# =======================================
# INTERNATIONALISATION
# =======================================
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'Africa/Lagos'
USE_I18N = True
USE_TZ = True

# =======================================
# STATIC & MEDIA FILES
# =======================================
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_DIRS = [BASE_DIR / 'static']

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# =======================================
# FILE UPLOAD SIZE LIMITS
# Increased from Django's default 2.5MB to support:
# - iPhone camera HEIC/HEIF photos (can be 6–15MB)
# - High-resolution JPEG photos from Android cameras
# - Professional photography portfolio images
# =======================================
DATA_UPLOAD_MAX_MEMORY_SIZE = 20 * 1024 * 1024   # 20MB — max size of non-file POST data
FILE_UPLOAD_MAX_MEMORY_SIZE = 20 * 1024 * 1024   # 20MB — files larger than this go to disk

# =======================================
# CLOUDINARY MEDIA STORAGE
# =======================================
CLOUDINARY_STORAGE = {
    'CLOUD_NAME': config('CLOUDINARY_CLOUD_NAME', default=''),
    'API_KEY': config('CLOUDINARY_API_KEY', default=''),
    'API_SECRET': config('CLOUDINARY_API_SECRET', default=''),
}

# Explicitly configure the raw Cloudinary SDK so direct uploads in views.py
# work regardless of whether django-cloudinary-storage's storage class is active.
# CLOUDINARY_STORAGE only configures the Django storage backend; it does not
# call cloudinary.config() until a file-field save triggers the storage class.
import cloudinary
cloudinary.config(
    cloud_name=config('CLOUDINARY_CLOUD_NAME', default=''),
    api_key=config('CLOUDINARY_API_KEY', default=''),
    api_secret=config('CLOUDINARY_API_SECRET', default=''),
)

_use_cloudinary = bool(config('CLOUDINARY_CLOUD_NAME', default=''))

STORAGES = {
    "default": {
        "BACKEND": (
            "cloudinary_storage.storage.MediaCloudinaryStorage"
            if _use_cloudinary
            else "django.core.files.storage.FileSystemStorage"
        ),
    },
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}

AUTH_USER_MODEL = 'accounts.User'

# =======================================
# CORS — explicit allowlist in all environments (no wildcard)
# =======================================
_DEFAULT_ORIGINS = (
    'http://localhost:3000,'
    'http://127.0.0.1:3000,'
    'https://studex.com.ng,'
    'https://www.studex.com.ng,'
    'https://studexng.vercel.app'
)
CORS_ALLOWED_ORIGINS = config('CORS_ALLOWED_ORIGINS', default=_DEFAULT_ORIGINS).split(',')
CORS_ALLOW_ALL_ORIGINS = False

CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_HEADERS = [
    'accept', 'accept-encoding', 'authorization', 'content-type',
    'dnt', 'origin', 'user-agent', 'x-csrftoken', 'x-requested-with',
]

# =======================================
# REST FRAMEWORK
# =======================================
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'accounts.authentication.JWTCookieAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_FILTER_BACKENDS': [
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ],
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 20,
}

# =======================================
# JWT
# =======================================
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(days=1),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=30),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'AUTH_HEADER_TYPES': ('Bearer',),
}

# =======================================
# RESEND EMAIL
# =======================================
RESEND_API_KEY = config('RESEND_API_KEY', default='')
ADMIN_EMAIL = config('ADMIN_EMAIL', default='studex.ng@gmail.com')
FRONTEND_BASE_URL = config('FRONTEND_BASE_URL', default='https://studex.com.ng')

# =======================================
# PAYSTACK
# =======================================
PAYSTACK_SECRET_KEY = config('PAYSTACK_SECRET_KEY', default='')
PAYSTACK_PUBLIC_KEY = config('PAYSTACK_PUBLIC_KEY', default='')
PAYSTACK_WEBHOOK_SECRET = config('PAYSTACK_WEBHOOK_SECRET', default='')
# Set PAYSTACK_SKIP_IP_CHECK=true if your hosting layer doesn't forward the real Paystack IP
PAYSTACK_SKIP_IP_CHECK = config('PAYSTACK_SKIP_IP_CHECK', default='false')

# =======================================
# CACHE
# =======================================
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.db.DatabaseCache',
        'LOCATION': 'studex_cache_table',
    }
}

# Fernet key for NIN and other PII field encryption.
# Generate with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
FIELD_ENCRYPTION_KEY = config('FIELD_ENCRYPTION_KEY', default='')

# =======================================
# EMAIL
# =======================================
EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'

# =======================================
# APSCHEDULER
# =======================================
APSCHEDULER_DATETIME_FORMAT = "N j, Y, f:s a"
APSCHEDULER_RUN_NOW_TIMEOUT = 25

# =======================================
# SECURITY HEADERS (production only)
# =======================================
if not DEBUG:
    SECURE_SSL_REDIRECT = True
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_BROWSER_XSS_FILTER = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    X_FRAME_OPTIONS = 'DENY'