# StudEx Authentication System

Complete guide to authentication and authorization in the StudEx platform.

## Table of Contents

1. [Overview](#overview)
2. [Authentication Methods](#authentication-methods)
3. [Permission Classes](#permission-classes)
4. [API Endpoints](#api-endpoints)
5. [Frontend Integration](#frontend-integration)
6. [Security Best Practices](#security-best-practices)
7. [Troubleshooting](#troubleshooting)

---

## Overview

StudEx uses a dual authentication system:

- **Firebase Authentication**: Primary authentication method for new users
- **JWT (JSON Web Tokens)**: Legacy support for existing tokens

### Authentication Flow

```
1. User registers/logs in via Firebase on frontend
2. Frontend receives Firebase ID token
3. Frontend sends token in Authorization header to backend
4. Backend verifies Firebase token and creates/retrieves Django user
5. Backend returns user data to frontend
6. Frontend stores Firebase token for subsequent requests
```

---

## Authentication Methods

### 1. Firebase Authentication

**Primary authentication method** - Handles user registration, login, and token verification.

#### Configuration

Located in `studex/settings.py`:

```python
# Firebase Admin SDK initialization
service_account_path = os.path.join(BASE_DIR.parent, 'firebase_service_account.json')
cred = credentials.Certificate(service_account_path)
firebase_admin.initialize_app(cred)
```

#### Implementation

Located in `studex/authentication.py`:

```python
class FirebaseAuthentication(BaseAuthentication):
    """
    Verifies Firebase ID tokens and creates/retrieves Django users.
    """
```

**Features:**
- Auto-creates Django users from Firebase UID
- Links Firebase users to Django User model via `firebase_uid` field
- Updates email if changed in Firebase
- Handles tokens with or without 'kid' claim
- Comprehensive error logging

**Usage in requests:**

```http
GET /api/user/profile/
Authorization: Bearer <firebase_id_token>
```

### 2. JWT Authentication (Legacy)

**Secondary authentication** - Maintains compatibility with existing JWT-based frontend code.

#### Configuration

Located in `studex/settings.py`:

```python
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(days=1),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': False,
    'BLACKLIST_AFTER_ROTATION': False,
    'UPDATE_LAST_LOGIN': True,
    'ALGORITHM': 'HS256',
    'SIGNING_KEY': SECRET_KEY,
    'AUTH_HEADER_TYPES': ('Bearer',),
    'USER_ID_FIELD': 'id',
    'USER_ID_CLAIM': 'user_id',
}
```

**Token Endpoints:**

```python
POST /api/auth/login/     # Returns JWT access + refresh tokens
POST /api/auth/refresh/   # Refresh access token
POST /api/auth/logout/    # Blacklist refresh token
```

---

## Permission Classes

StudEx provides comprehensive permission classes for fine-grained access control.

### Available Permission Classes

Located in `studex/permissions.py`:

#### 1. **IsAdminUser**

Only allows staff users (admins) to access.

```python
from studex.permissions import IsAdminUser

class AdminDashboardView(APIView):
    permission_classes = [IsAdminUser]
```

**Requirements:**
- User must be authenticated
- User must have `is_staff=True`

---

#### 2. **IsSuperAdminUser**

Only allows superusers to access (for dangerous operations).

```python
from studex.permissions import IsSuperAdminUser

class DeleteUserView(APIView):
    permission_classes = [IsSuperAdminUser]
```

**Requirements:**
- User must be authenticated
- User must have `is_superuser=True`

---

#### 3. **IsVendorUser**

Only allows verified vendor users.

```python
from studex.permissions import IsVendorUser

class CreateListingView(APIView):
    permission_classes = [IsAuthenticated, IsVendorUser]
```

**Requirements:**
- User must be authenticated
- User must have `user_type='vendor'`
- User must have `is_verified_vendor=True`

---

#### 4. **IsStudentUser**

Only allows student users.

```python
from studex.permissions import IsStudentUser

class StudentOnlyView(APIView):
    permission_classes = [IsAuthenticated, IsStudentUser]
```

**Requirements:**
- User must be authenticated
- User must have `user_type='student'`

---

#### 5. **IsOwner**

Only allows owners of an object to access it.

```python
from studex.permissions import IsOwner

class ProfileViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, IsOwner]
```

**Supports objects with:**
- `user` field
- `owner` field
- `buyer` field
- `vendor` field

---

#### 6. **IsOwnerOrReadOnly**

Allows owners to edit, anyone to read.

```python
from studex.permissions import IsOwnerOrReadOnly

class ListingViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, IsOwnerOrReadOnly]
```

**Behavior:**
- Read operations (GET): Allowed for all authenticated users
- Write operations (POST, PUT, PATCH, DELETE): Only for owners

---

#### 7. **IsOrderParticipant**

Only allows buyer or seller of an order to access it.

```python
from studex.permissions import IsOrderParticipant

class OrderViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, IsOrderParticipant]
```

**Requirements:**
- User is the buyer, OR
- User is the seller (via listing.vendor), OR
- User is staff (admin override)

---

#### 8. **IsConversationParticipant**

Only allows participants of a conversation to access it.

```python
from studex.permissions import IsConversationParticipant

class ConversationViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, IsConversationParticipant]
```

**Requirements:**
- User is the buyer, OR
- User is the seller, OR
- User is staff (admin override)

---

#### 9. **ReadOnlyOrIsAuthenticated**

Allows unauthenticated read access, requires authentication for write.

```python
from studex.permissions import ReadOnlyOrIsAuthenticated

class CategoryViewSet(viewsets.ModelViewSet):
    permission_classes = [ReadOnlyOrIsAuthenticated]
```

**Behavior:**
- Read operations (GET): Allowed for anyone
- Write operations (POST, PUT, PATCH, DELETE): Requires authentication

---

## API Endpoints

### Authentication Endpoints

All located in `accounts/views.py`:

#### Register User

```http
POST /api/auth/register/
Content-Type: application/json

{
  "email": "student@pau.edu.ng",
  "password": "securepassword",
  "username": "johndoe",
  "user_type": "student"  // or "vendor"
}
```

**Response:**

```json
{
  "user": {
    "id": 1,
    "username": "johndoe",
    "email": "student@pau.edu.ng",
    "user_type": "student"
  },
  "tokens": {
    "access": "eyJ0eXAiOiJKV1QiLC...",
    "refresh": "eyJ0eXAiOiJKV1QiLC..."
  }
}
```

**Permission:** `AllowAny`

---

#### Login User

```http
POST /api/auth/login/
Content-Type: application/json

{
  "email": "student@pau.edu.ng",
  "password": "securepassword"
}
```

**Response:**

```json
{
  "user": {
    "id": 1,
    "username": "johndoe",
    "email": "student@pau.edu.ng"
  },
  "tokens": {
    "access": "eyJ0eXAiOiJKV1QiLC...",
    "refresh": "eyJ0eXAiOiJKV1QiLC..."
  }
}
```

**Permission:** `AllowAny`

---

#### Get User Profile

```http
GET /api/user/profile/
Authorization: Bearer <firebase_id_token>
```

**Response:**

```json
{
  "id": 1,
  "username": "johndoe",
  "email": "student@pau.edu.ng",
  "user_type": "student",
  "profile": {
    "whatsapp": "+234...",
    "rating": 4.5,
    "total_orders": 10
  }
}
```

**Permission:** `IsAuthenticated`

---

#### Update User Profile

```http
PUT /api/user/profile/
Authorization: Bearer <firebase_id_token>
Content-Type: application/json

{
  "first_name": "John",
  "last_name": "Doe",
  "phone": "+234...",
  "bio": "Computer Science student"
}
```

**Permission:** `IsAuthenticated`

---

#### Logout User

```http
POST /api/auth/logout/
Authorization: Bearer <firebase_id_token>
Content-Type: application/json

{
  "refresh_token": "eyJ0eXAiOiJKV1QiLC..."
}
```

**Permission:** `IsAuthenticated`

---

### Admin Endpoints

All located in `accounts/admin_views.py`:

#### Admin Dashboard

```http
GET /api/admin/dashboard/
Authorization: Bearer <firebase_id_token>
```

**Permission:** `IsAdminUser`

#### List All Users

```http
GET /api/admin/users/?search=john&user_type=vendor&is_active=true
Authorization: Bearer <firebase_id_token>
```

**Permission:** `IsAdminUser`

#### Update User

```http
PATCH /api/admin/users/{user_id}/
Authorization: Bearer <firebase_id_token>
Content-Type: application/json

{
  "is_active": false,
  "is_verified_vendor": true
}
```

**Permission:** `IsAdminUser` (superuser required for `is_staff` changes)

---

## Frontend Integration

### Firebase Setup (Frontend)

```javascript
// Initialize Firebase
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
```

### Login Example

```javascript
// Login and get Firebase ID token
async function login(email, password) {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const idToken = await userCredential.user.getIdToken();

    // Send token to backend
    const response = await fetch('http://localhost:8000/api/user/profile/', {
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
    });

    const userData = await response.json();
    return userData;
  } catch (error) {
    console.error('Login failed:', error);
  }
}
```

### Protected API Calls

```javascript
// Get current Firebase ID token
async function getIdToken() {
  const user = auth.currentUser;
  if (!user) return null;
  return await user.getIdToken();
}

// Make authenticated API call
async function makeAuthenticatedRequest(url, options = {}) {
  const idToken = await getIdToken();

  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
  });

  return response.json();
}
```

---

## Security Best Practices

### 1. Environment Variables

**Always set these in production:**

```bash
# Django
SECRET_KEY=<long-random-secret-key-here>
DEBUG=False

# CORS
CORS_ALLOWED_ORIGINS=https://your-frontend.vercel.app

# Firebase
# Place firebase_service_account.json in project root
# NEVER commit this file to git

# JWT
JWT_ACCESS_TOKEN_LIFETIME=1  # days
JWT_REFRESH_TOKEN_LIFETIME=7  # days

# Security Headers
SESSION_COOKIE_SECURE=True
CSRF_COOKIE_SECURE=True
```

### 2. Rate Limiting

Rate limiting is automatic via `RateLimitMiddleware`:

- **Login:** 10 requests/minute per IP
- **Register:** 5 requests/minute per IP
- **API calls:** 60 requests/minute per IP
- **Wallet/Payments:** 60 requests/minute per IP

### 3. Security Headers

Automatic via `SecurityHeadersMiddleware`:

- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `X-XSS-Protection: 1; mode=block`
- `Content-Security-Policy` (production only)
- `Strict-Transport-Security` (HTTPS only)

### 4. Token Security

**Firebase ID Tokens:**
- Valid for 1 hour
- Auto-refreshed by Firebase client SDK
- Verified on backend using Firebase Admin SDK

**JWT Tokens:**
- Access token: 1 day (configurable)
- Refresh token: 7 days (configurable)
- Tokens are blacklisted on logout

### 5. User Data Protection

- Passwords hashed with Django's PBKDF2 (100,000 iterations)
- Sensitive fields excluded from serializers
- `firebase_uid` field links Firebase to Django users
- Email verification recommended (implement in Firebase)

---

## Troubleshooting

### Firebase Token Verification Fails

**Error:** `Firebase token missing 'kid' claim`

**Solution:** This is handled automatically. The authentication class decodes tokens without 'kid' claim.

**Check:**
1. Verify `firebase_service_account.json` exists in project root
2. Check Firebase project configuration
3. Ensure token is fresh (not expired)

---

### Permission Denied Errors

**Error:** `You must be an admin to access this resource.`

**Check:**
1. User is authenticated (valid token)
2. User has required permission:
   - Admin: `is_staff=True`
   - Superuser: `is_superuser=True`
   - Vendor: `user_type='vendor'` AND `is_verified_vendor=True`

**Solution:**
- Use Django admin panel to grant permissions
- Or via `accounts/admin_views.py` admin API

---

### CORS Errors

**Error:** `Access-Control-Allow-Origin` header missing

**Check:**
1. Frontend URL in `CORS_ALLOWED_ORIGINS` (settings.py)
2. Correct protocol (http vs https)
3. Port number matches

**Solution:**

```bash
# .env
CORS_ALLOWED_ORIGINS=http://localhost:3000,https://your-frontend.vercel.app
```

---

### Rate Limiting

**Error:** `Rate limit exceeded. Please try again later.`

**Solution:**
- Wait 60 seconds
- Reduce request frequency
- Contact admin to adjust limits

**Adjust limits in .env:**

```bash
RATE_LIMIT_LOGIN=10
RATE_LIMIT_REGISTER=5
RATE_LIMIT_API=60
```

---

## Summary

**Authentication System:**
- ✅ Dual authentication (Firebase + JWT)
- ✅ Auto-creates users from Firebase
- ✅ Comprehensive permission classes
- ✅ Rate limiting and security headers
- ✅ Admin and user endpoints
- ✅ CORS configured
- ✅ Production-ready security

**Next Steps:**
1. Test authentication flows
2. Implement email verification
3. Add password reset functionality
4. Monitor authentication logs

---

**Last Updated:** 2026-01-08
**Version:** 2.0
**Django Version:** 4.2+
**DRF Version:** 3.14+
