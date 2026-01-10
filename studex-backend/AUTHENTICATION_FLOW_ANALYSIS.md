# StudEx Authentication Flow - Complete Analysis

**Analysis Date:** 2026-01-09
**Purpose:** Document and verify complete authentication implementation before production testing

---

## 🔐 Authentication Architecture Overview

StudEx uses a **hybrid authentication system** combining:
1. **Firebase Authentication** (Frontend) - User credential management
2. **Django JWT Authentication** (Backend) - API authorization
3. **Fallback JWT** (Backend) - Traditional username/password login

### Authentication Flow Diagram

```
┌─────────────────┐
│   User Signup   │
└────────┬────────┘
         │
         ↓
┌─────────────────────────────────────────────────────────┐
│ 1. Frontend: Create account with Firebase Auth         │
│    - Email: must end with @pau.edu.ng                   │
│    - Password: alphanumeric only                        │
│    - Firebase returns: ID Token + UID                   │
└────────┬────────────────────────────────────────────────┘
         │
         ↓
┌─────────────────────────────────────────────────────────┐
│ 2. Frontend: Send registration to Django               │
│    POST /api/auth/register/                             │
│    - username, email, phone, password, user_type, etc   │
│    - NO Firebase token sent (traditional registration)  │
└────────┬────────────────────────────────────────────────┘
         │
         ↓
┌─────────────────────────────────────────────────────────┐
│ 3. Backend: Create Django user                          │
│    - Validate email ends with @pau.edu.ng               │
│    - Create User record in database                     │
│    - Generate JWT access + refresh tokens               │
│    - Return user profile + tokens                       │
└────────┬────────────────────────────────────────────────┘
         │
         ↓
┌─────────────────────────────────────────────────────────┐
│ 4. Frontend: Store tokens in localStorage               │
│    - access_token (expires: 1 day)                      │
│    - refresh_token (expires: 7 days)                    │
│    - Update Zustand auth store                          │
│    - Redirect to /home                                  │
└─────────────────────────────────────────────────────────┘

┌─────────────────┐
│   User Login    │
└────────┬────────┘
         │
         ↓
┌─────────────────────────────────────────────────────────┐
│ 1. Frontend: Login with credentials                     │
│    POST /api/auth/login/                                │
│    - email + password                                   │
│    - NO Firebase authentication used here               │
└────────┬────────────────────────────────────────────────┘
         │
         ↓
┌─────────────────────────────────────────────────────────┐
│ 2. Backend: Authenticate user                           │
│    - Find user by email (case-insensitive)              │
│    - Verify password with Django's authenticate()       │
│    - Generate JWT access + refresh tokens               │
│    - Return user profile + tokens                       │
└────────┬────────────────────────────────────────────────┘
         │
         ↓
┌─────────────────────────────────────────────────────────┐
│ 3. Frontend: Store tokens & redirect                    │
│    - Same as signup flow                                │
└─────────────────────────────────────────────────────────┘

┌──────────────────┐
│  API Requests    │
└────────┬─────────┘
         │
         ↓
┌─────────────────────────────────────────────────────────┐
│ Frontend: Include Authorization header                  │
│    Authorization: Bearer <access_token>                 │
└────────┬────────────────────────────────────────────────┘
         │
         ↓
┌─────────────────────────────────────────────────────────┐
│ Backend: Verify token (2 authentication classes)        │
│    1. FirebaseAuthentication (checks Firebase ID token) │
│       - If token has Firebase 'kid' claim → verify      │
│       - If successful → return user                     │
│    2. JWTAuthentication (checks Django JWT)             │
│       - If Firebase fails → try JWT verification        │
│       - If successful → return user                     │
└────────┬────────────────────────────────────────────────┘
         │
         ↓
┌─────────────────────────────────────────────────────────┐
│ If 401 Unauthorized: Token expired                      │
│    Frontend: Auto-refresh token                         │
│    POST /api/auth/token/refresh/                        │
│    { refresh: <refresh_token> }                         │
│    → Get new access_token                               │
│    → Retry original request                             │
└─────────────────────────────────────────────────────────┘
```

---

## 📁 Key Files & Components

### Backend (Django)

#### 1. `studex/authentication.py` - Firebase Authentication Class
**Purpose:** Verify Firebase ID tokens sent from frontend

**Key Methods:**
- `authenticate(request)` - Extract & verify Firebase token from Authorization header
- Handles tokens with/without 'kid' claim (compatibility mode)
- Creates/retrieves Django user linked to Firebase UID

**Token Flow:**
```python
# Expected header format:
Authorization: Bearer <firebase_id_token>

# Verification steps:
1. Extract token from header
2. Verify with firebase_admin.auth.verify_id_token()
3. Extract uid, email, name from decoded token
4. Get or create User by firebase_uid
5. Return (user, decoded_token)
```

**Important:** This class auto-creates users from Firebase tokens, which means Firebase signup can create Django users automatically!

---

#### 2. `accounts/views.py` - Auth Endpoints

**POST /api/auth/register/**
```python
# Input:
{
  "username": "string",
  "email": "user@pau.edu.ng",
  "phone": "08012345678",
  "password": "password123",
  "password2": "password123",  # Must match password
  "user_type": "student" or "vendor",
  "matric_number": "string" (optional),
  "hostel": "string" (optional)
}

# Output:
{
  "message": "User registered successfully",
  "user": { UserProfileSerializer data },
  "tokens": {
    "refresh": "string",
    "access": "string"
  }
}
```

**POST /api/auth/login/**
```python
# Input:
{
  "email": "user@pau.edu.ng",
  "password": "password123"
}

# Process:
1. Find user by email (case-insensitive)
2. Authenticate with Django's authenticate(username, password)
3. Check user is active
4. Generate JWT tokens
5. Return user + tokens

# Output:
{
  "message": "Login successful",
  "user": { UserProfileSerializer data },
  "tokens": {
    "refresh": "string",
    "access": "string"
  }
}
```

**GET /api/auth/profile/** (Protected)
```python
# Headers:
Authorization: Bearer <access_token>

# Output:
{ UserProfileSerializer data }
```

**POST /api/auth/token/refresh/**
```python
# Input:
{
  "refresh": "refresh_token"
}

# Output:
{
  "access": "new_access_token"
}
```

**POST /api/auth/logout/**
```python
# Input:
{
  "refresh": "refresh_token"
}

# Process:
- Blacklist refresh token (if blacklist enabled)
- User must login again
```

---

### Frontend (Next.js)

#### 1. `src/lib/authStore.ts` - Zustand Auth State

**State:**
```typescript
{
  user: UserProfile | null,
  isLoggedIn: boolean,
  accessToken: string | null,
  refreshToken: string | null,
  isHydrated: boolean,      // Zustand hydration complete
  isAuthReady: boolean       // Auth check complete
}
```

**Methods:**
- `login(user, accessToken, refreshToken)` - Store auth data
- `logout()` - Clear auth data & call backend logout
- `checkAuth()` - Verify tokens are still valid by fetching profile
- `setHydrated(bool)` - Mark Zustand as hydrated from localStorage

**Firebase Integration:**
- `onAuthStateChanged` listener syncs Firebase auth with Zustand
- If Firebase user exists but Zustand says not logged in → checkAuth()
- If Firebase user logged out but Zustand says logged in → logout()

---

#### 2. `src/lib/api.ts` - API Client with Auto Token Refresh

**Key Features:**
- Automatic token refresh on 401 errors
- All API methods use `authenticatedFetch()`
- Stores tokens in localStorage

**Token Refresh Flow:**
```typescript
1. Request with access_token
   ↓
2. Backend returns 401
   ↓
3. Call /api/auth/token/refresh/ with refresh_token
   ↓
4. Get new access_token
   ↓
5. Update localStorage
   ↓
6. Retry original request
```

**If Refresh Fails:**
- Clear tokens from localStorage
- Redirect to /auth page

---

#### 3. `src/app/auth/page.tsx` - Unified Login/Signup Page

**Signup Flow:**
```typescript
1. User fills form (validated on blur):
   - Email must end with @pau.edu.ng
   - Phone must be 11 digits
   - Password must be alphanumeric (letters + numbers only)
   - Password2 must match password

2. On submit:
   - Call api.register(formData)
   - Backend validates & creates user
   - Backend returns user + tokens
   - Frontend stores tokens via storeLogin()
   - Redirect to /home
```

**Login Flow:**
```typescript
1. User enters email + password
2. Call api.login({ email, password })
3. Backend validates credentials
4. Backend returns user + tokens
5. Frontend stores tokens via storeLogin()
6. Redirect to /home
```

**No Firebase in Login/Signup:**
- Frontend does NOT create Firebase users during signup
- Frontend does NOT send Firebase tokens to backend during login/signup
- Firebase authentication is commented out or not used in current flow

---

#### 4. `src/context/AuthContext.tsx` - React Context Wrapper

**Purpose:** Provide auth state to all components

**Features:**
- Wraps app with AuthProvider
- Waits for Zustand hydration before checking auth
- Auto-redirects unauthenticated users from protected routes
- Public routes: `/`, `/auth`, `/terms`, `/privacy`, `/contact`

**Redirect Logic:**
```typescript
if (!isLoggedIn && !isPublicRoute) {
  router.push("/auth")
}
```

---

## 🔍 Critical Findings & Issues

### ✅ What Works Well

1. **Hybrid Authentication Ready:** Backend supports both Firebase and JWT authentication
2. **Auto Token Refresh:** Frontend automatically refreshes expired tokens
3. **Protected Routes:** Context checks auth before allowing access
4. **Email Validation:** Restricts to @pau.edu.ng domain
5. **Secure Password Storage:** Django's password hashing
6. **Token Blacklist Ready:** `rest_framework_simplejwt.token_blacklist` installed

### ⚠️ Potential Issues

#### Issue #1: Firebase Not Fully Integrated
**Current State:**
- Backend has FirebaseAuthentication class ready
- Frontend has Firebase initialized
- But signup/login does NOT use Firebase

**Impact:**
- Users are NOT created in Firebase
- Firebase onAuthStateChanged will never trigger
- Firebase authentication class in backend is unused

**Recommendation:**
Either:
1. **Remove Firebase entirely** (simplest for now)
2. **Fully integrate Firebase:** Create Firebase users on signup, send Firebase tokens to backend

---

#### Issue #2: User Registration Creates Django User Only
**Current Flow:**
```
Signup → Django User Created
      ↓
   Firebase UID: NULL (not linked)
```

**Impact:**
- `firebase_uid` field in User model remains null
- FirebaseAuthentication class won't work for these users
- Can't use Firebase features (push notifications, etc)

---

#### Issue #3: CORS Configuration Needed for Production
**Current `.env`:**
```env
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

**Production Needs:**
```env
CORS_ALLOWED_ORIGINS=https://your-frontend.vercel.app,https://studex.pau.edu.ng
```

---

#### Issue #4: Security Settings for Production
**Django check identified 6 security warnings:**

```bash
❌ SECURE_HSTS_SECONDS not set
❌ SECURE_SSL_REDIRECT not set to True
❌ SECRET_KEY insecure (django-insecure prefix)
❌ SESSION_COOKIE_SECURE not set to True
❌ CSRF_COOKIE_SECURE not set to True
❌ DEBUG should not be True in deployment
```

**Fix for Production `.env`:**
```env
DEBUG=False
SECRET_KEY=<generate-new-50+-char-key>
SESSION_COOKIE_SECURE=True
CSRF_COOKIE_SECURE=True
SECURE_SSL_REDIRECT=True
SECURE_HSTS_SECONDS=31536000
```

---

#### Issue #5: Token Blacklist Not Enabled on Logout
**Current logout endpoint:**
```python
@api_view(['POST'])
@permission_classes([AllowAny])
def logout_user(request):
    # TODO: Blacklist refresh token
    pass
```

**Impact:**
- Logout does NOT blacklist refresh tokens
- Old tokens can still be used after logout
- Security risk

**Fix:** Implement token blacklisting:
```python
from rest_framework_simplejwt.tokens import RefreshToken

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout_user(request):
    try:
        refresh_token = request.data.get('refresh')
        token = RefreshToken(refresh_token)
        token.blacklist()
        return Response({'message': 'Logout successful'})
    except Exception:
        return Response({'error': 'Invalid token'}, status=400)
```

---

## 🧪 Testing Checklist

### Local Testing (Before Production)

- [ ] **Test Registration**
  - [ ] Valid @pau.edu.ng email
  - [ ] Invalid email domain rejected
  - [ ] Duplicate email rejected
  - [ ] Password validation works
  - [ ] User created in database
  - [ ] JWT tokens returned

- [ ] **Test Login**
  - [ ] Valid credentials work
  - [ ] Invalid credentials rejected
  - [ ] Case-insensitive email works
  - [ ] JWT tokens returned
  - [ ] User redirected to /home

- [ ] **Test Token Refresh**
  - [ ] Expired access token auto-refreshes
  - [ ] Invalid refresh token redirects to login
  - [ ] Refresh token expires after 7 days

- [ ] **Test Protected Routes**
  - [ ] Unauthenticated users redirected to /auth
  - [ ] Authenticated users can access protected routes
  - [ ] After logout, cannot access protected routes

- [ ] **Test Logout**
  - [ ] Tokens cleared from localStorage
  - [ ] Redirected to /auth
  - [ ] Cannot use old tokens

### Production Testing (After Deployment)

- [ ] **CORS Verification**
  - [ ] Frontend can call backend API
  - [ ] No CORS errors in console
  - [ ] Credentials included in requests

- [ ] **HTTPS Verification**
  - [ ] SSL certificate valid
  - [ ] SECURE_SSL_REDIRECT works
  - [ ] Cookies sent over HTTPS only

- [ ] **Security Headers**
  - [ ] X-Content-Type-Options: nosniff
  - [ ] X-Frame-Options: DENY
  - [ ] Strict-Transport-Security present

- [ ] **End-to-End Flow**
  - [ ] Signup → Login → API Request → Logout
  - [ ] Token refresh works in production
  - [ ] Multiple concurrent users work

---

## 📊 Current Implementation Summary

| Component | Status | Notes |
|-----------|--------|-------|
| Backend JWT Auth | ✅ Working | SimpleJWT configured |
| Backend Firebase Auth | ⚠️ Ready but unused | Not integrated with signup/login |
| Frontend Auth Store | ✅ Working | Zustand + localStorage |
| Frontend Token Refresh | ✅ Working | Auto-refresh on 401 |
| Protected Routes | ✅ Working | AuthContext redirects |
| Email Validation | ✅ Working | @pau.edu.ng only |
| Password Validation | ✅ Working | Alphanumeric only |
| Logout Token Blacklist | ❌ Not implemented | Security risk |
| CORS for Production | ❌ Not configured | Needs update |
| Security Settings | ❌ Not production-ready | 6 warnings |

---

## 🚀 Recommended Actions Before Production Testing

### Priority 1: Security Fixes (CRITICAL)

1. **Generate Production SECRET_KEY:**
   ```bash
   python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
   ```

2. **Update Production Environment Variables:**
   ```env
   SECRET_KEY=<generated-key>
   DEBUG=False
   ALLOWED_HOSTS=your-backend.railway.app,studex.pau.edu.ng
   CORS_ALLOWED_ORIGINS=https://your-frontend.vercel.app,https://studex.pau.edu.ng
   SESSION_COOKIE_SECURE=True
   CSRF_COOKIE_SECURE=True
   SECURE_SSL_REDIRECT=True
   ```

3. **Implement Token Blacklisting on Logout**

### Priority 2: Firebase Decision (MEDIUM)

Choose one:
- **Option A:** Remove Firebase entirely (simplest)
- **Option B:** Fully integrate Firebase (more work, more features)

### Priority 3: Testing (MEDIUM)

1. Test all auth flows locally
2. Verify database records created correctly
3. Test token refresh mechanism
4. Test logout clears tokens

---

**Next Steps:**
1. Fix security issues
2. Update CORS for production
3. Implement logout token blacklisting
4. Test locally
5. Deploy to Railway
6. Test production deployment

---

**Document Version:** 1.0
**Last Updated:** 2026-01-09
**Status:** Ready for local testing, NOT production-ready
