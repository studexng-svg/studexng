# Authentication Testing Guide

Comprehensive testing checklist for StudEx authentication system.

## Test Environment Setup

### Prerequisites

1. **Backend running:**
   ```bash
   cd studex-backend
   python manage.py runserver
   ```

2. **Firebase configured:**
   - `firebase_service_account.json` in project root
   - Firebase project created
   - Authentication enabled in Firebase Console

3. **Environment variables set:**
   ```bash
   SECRET_KEY=<your-secret-key>
   DEBUG=True  # for testing only
   CORS_ALLOWED_ORIGINS=http://localhost:3000
   ```

---

## 1. Firebase Authentication Tests

### Test 1.1: Firebase Token Verification

**Objective:** Verify Firebase tokens are correctly validated.

**Steps:**
1. Register user in Firebase (frontend or Firebase Console)
2. Get Firebase ID token
3. Make request to protected endpoint:

```bash
curl -X GET http://localhost:8000/api/user/profile/ \
  -H "Authorization: Bearer <firebase_id_token>"
```

**Expected Result:**
- ✅ Status: 200 OK
- ✅ Response contains user data
- ✅ User auto-created in Django database

**Failure Cases:**
- ❌ Invalid token → 401 Unauthorized
- ❌ Expired token → 401 Unauthorized
- ❌ Missing token → 403 Forbidden

---

### Test 1.2: Firebase User Auto-Creation

**Objective:** Verify Django users are auto-created from Firebase.

**Steps:**
1. Create new user in Firebase
2. Login with Firebase and get ID token
3. Call `/api/user/profile/` with token
4. Check Django admin panel for user

**Expected Result:**
- ✅ User created in Django database
- ✅ `firebase_uid` field populated
- ✅ Email matches Firebase email
- ✅ Username auto-generated

---

### Test 1.3: Token Without 'kid' Claim

**Objective:** Verify tokens without 'kid' claim are handled.

**Steps:**
1. Use custom token without 'kid' claim
2. Make authenticated request

**Expected Result:**
- ✅ Token decoded without verification
- ✅ User authenticated successfully
- ⚠️ Warning logged about missing 'kid' claim

---

## 2. Permission Class Tests

### Test 2.1: IsAdminUser Permission

**Objective:** Only staff users can access admin endpoints.

**Test Cases:**

| User Type | is_staff | is_authenticated | Expected Result |
|-----------|----------|------------------|-----------------|
| Staff     | True     | True             | ✅ 200 OK       |
| Regular   | False    | True             | ❌ 403 Forbidden |
| Anonymous | -        | False            | ❌ 403 Forbidden |

**Endpoint:** `GET /api/admin/dashboard/`

---

### Test 2.2: IsSuperAdminUser Permission

**Objective:** Only superusers can access dangerous operations.

**Test Cases:**

| User Type  | is_superuser | is_authenticated | Expected Result |
|------------|--------------|------------------|-----------------|
| Superuser  | True         | True             | ✅ 200 OK       |
| Staff      | False        | True             | ❌ 403 Forbidden |
| Regular    | False        | True             | ❌ 403 Forbidden |

**Endpoint:** `DELETE /api/admin/users/{id}/?hard_delete=true`

---

### Test 2.3: IsVendorUser Permission

**Objective:** Only verified vendors can create listings.

**Test Cases:**

| User Type | user_type | is_verified_vendor | Expected Result |
|-----------|-----------|-------------------|-----------------|
| Vendor    | vendor    | True              | ✅ 200 OK       |
| Vendor    | vendor    | False             | ❌ 403 Forbidden |
| Student   | student   | -                 | ❌ 403 Forbidden |

**Endpoint:** `POST /api/services/listings/`

---

### Test 2.4: IsStudentUser Permission

**Objective:** Only students can access student-only features.

**Test Cases:**

| User Type | user_type | Expected Result |
|-----------|-----------|-----------------|
| Student   | student   | ✅ 200 OK       |
| Vendor    | vendor    | ❌ 403 Forbidden |

**Endpoint:** (Student-only endpoints)

---

### Test 2.5: IsOwner Permission

**Objective:** Only resource owners can access their resources.

**Steps:**
1. User A creates a listing
2. User B tries to access User A's listing
3. User A tries to access their own listing

**Expected Result:**
- ✅ User A can access their listing (200 OK)
- ❌ User B cannot access User A's listing (403 Forbidden)

**Endpoint:** `GET /api/services/listings/{id}/`

---

### Test 2.6: IsOwnerOrReadOnly Permission

**Objective:** Owners can edit, anyone can read.

**Test Cases:**

| User      | Action | Owner | Expected Result |
|-----------|--------|-------|-----------------|
| User A    | GET    | No    | ✅ 200 OK       |
| User A    | PUT    | No    | ❌ 403 Forbidden |
| Owner     | GET    | Yes   | ✅ 200 OK       |
| Owner     | PUT    | Yes   | ✅ 200 OK       |

---

### Test 2.7: IsOrderParticipant Permission

**Objective:** Only buyer or seller can access orders.

**Steps:**
1. User A (buyer) creates order from User B's (seller) listing
2. User C tries to access the order
3. User A and User B try to access the order

**Expected Result:**
- ✅ User A (buyer) can access (200 OK)
- ✅ User B (seller) can access (200 OK)
- ❌ User C cannot access (403 Forbidden)
- ✅ Admin can access (200 OK)

**Endpoint:** `GET /api/orders/{id}/`

---

### Test 2.8: IsConversationParticipant Permission

**Objective:** Only conversation participants can access messages.

**Steps:**
1. User A and User B have conversation about listing
2. User C tries to access conversation
3. User A and User B try to access conversation

**Expected Result:**
- ✅ User A can access (200 OK)
- ✅ User B can access (200 OK)
- ❌ User C cannot access (403 Forbidden)
- ✅ Admin can access (200 OK)

**Endpoint:** `GET /api/chat/conversations/{id}/`

---

### Test 2.9: ReadOnlyOrIsAuthenticated Permission

**Objective:** Unauthenticated users can read, authenticated can write.

**Test Cases:**

| User        | Method | Expected Result |
|-------------|--------|-----------------|
| Anonymous   | GET    | ✅ 200 OK       |
| Anonymous   | POST   | ❌ 401/403      |
| Authenticated | GET  | ✅ 200 OK       |
| Authenticated | POST | ✅ 201 Created  |

**Endpoint:** `GET /api/services/categories/`

---

## 3. JWT Authentication Tests

### Test 3.1: JWT Token Generation

**Objective:** Verify JWT tokens are generated on login.

**Steps:**
1. Login with email and password:

```bash
curl -X POST http://localhost:8000/api/auth/login/ \
  -H "Content-Type: application/json" \
  -d '{"email": "test@pau.edu.ng", "password": "password123"}'
```

**Expected Result:**
```json
{
  "user": {...},
  "tokens": {
    "access": "eyJ0eXAiOiJKV1QiLC...",
    "refresh": "eyJ0eXAiOiJKV1QiLC..."
  }
}
```

---

### Test 3.2: JWT Token Validation

**Objective:** Verify JWT tokens work for authentication.

**Steps:**
1. Get JWT access token from login
2. Make authenticated request:

```bash
curl -X GET http://localhost:8000/api/user/profile/ \
  -H "Authorization: Bearer <jwt_access_token>"
```

**Expected Result:**
- ✅ Status: 200 OK
- ✅ User data returned

---

### Test 3.3: JWT Token Refresh

**Objective:** Verify refresh tokens can get new access tokens.

**Steps:**
1. Get refresh token from login
2. Request new access token:

```bash
curl -X POST http://localhost:8000/api/auth/token/refresh/ \
  -H "Content-Type: application/json" \
  -d '{"refresh": "<refresh_token>"}'
```

**Expected Result:**
```json
{
  "access": "eyJ0eXAiOiJKV1QiLC..."
}
```

---

### Test 3.4: JWT Token Blacklisting

**Objective:** Verify logout blacklists tokens.

**Steps:**
1. Login and get tokens
2. Logout:

```bash
curl -X POST http://localhost:8000/api/auth/logout/ \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"refresh_token": "<refresh_token>"}'
```

3. Try to use blacklisted refresh token

**Expected Result:**
- ✅ Logout successful
- ❌ Blacklisted token rejected (401)

---

## 4. Rate Limiting Tests

### Test 4.1: Login Rate Limit

**Objective:** Verify login rate limiting (10 requests/minute).

**Steps:**
1. Make 11 login requests in 1 minute from same IP

**Expected Result:**
- ✅ First 10 requests succeed (200/401)
- ❌ 11th request: 429 Too Many Requests

---

### Test 4.2: Register Rate Limit

**Objective:** Verify register rate limiting (5 requests/minute).

**Steps:**
1. Make 6 register requests in 1 minute from same IP

**Expected Result:**
- ✅ First 5 requests succeed
- ❌ 6th request: 429 Too Many Requests

---

### Test 4.3: API Rate Limit

**Objective:** Verify general API rate limiting (60 requests/minute).

**Steps:**
1. Make 61 API requests in 1 minute

**Expected Result:**
- ✅ First 60 requests succeed
- ❌ 61st request: 429 Too Many Requests

---

## 5. Security Header Tests

### Test 5.1: Security Headers Present

**Objective:** Verify security headers in responses.

**Steps:**
1. Make any API request
2. Check response headers

**Expected Headers:**
```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera=()
```

**In Production (HTTPS):**
```
Content-Security-Policy: ...
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```

---

## 6. CORS Tests

### Test 6.1: CORS Allowed Origins

**Objective:** Verify CORS works for allowed origins.

**Steps:**
1. Make request from allowed origin (localhost:3000)
2. Check CORS headers

**Expected Result:**
- ✅ `Access-Control-Allow-Origin: http://localhost:3000`
- ✅ `Access-Control-Allow-Credentials: true`

---

### Test 6.2: CORS Blocked Origins

**Objective:** Verify CORS blocks non-allowed origins.

**Steps:**
1. Make request from non-allowed origin

**Expected Result:**
- ❌ CORS error
- ❌ No `Access-Control-Allow-Origin` header

---

## 7. Integration Tests

### Test 7.1: Complete Registration Flow

**Steps:**
1. Register user via Firebase
2. Get Firebase ID token
3. Call backend API with token
4. Verify user created in Django
5. Verify user can access protected endpoints

**Expected Result:**
- ✅ All steps complete successfully
- ✅ User can perform authenticated actions

---

### Test 7.2: Complete Order Flow with Permissions

**Steps:**
1. Student user A logs in
2. Vendor user B creates listing
3. User A creates order for B's listing
4. User C tries to access order
5. User A and B try to access order

**Expected Result:**
- ✅ User A and B can access order
- ❌ User C cannot access order

---

### Test 7.3: Admin Management Flow

**Steps:**
1. Regular user tries to access `/api/admin/dashboard/`
2. Admin user accesses `/api/admin/dashboard/`
3. Admin updates user permissions
4. Verify permission changes applied

**Expected Result:**
- ❌ Regular user: 403 Forbidden
- ✅ Admin user: 200 OK with dashboard data
- ✅ Permission changes reflected

---

## 8. Error Handling Tests

### Test 8.1: Invalid Token

**Steps:**
1. Send invalid/malformed token

**Expected Result:**
```json
{
  "detail": "Invalid Firebase token"
}
```
Status: 401

---

### Test 8.2: Expired Token

**Steps:**
1. Send expired token

**Expected Result:**
```json
{
  "detail": "Firebase token has expired"
}
```
Status: 401

---

### Test 8.3: Missing Token

**Steps:**
1. Access protected endpoint without token

**Expected Result:**
```json
{
  "detail": "Authentication credentials were not provided."
}
```
Status: 403

---

## Test Results Checklist

### Firebase Authentication
- [ ] Token verification works
- [ ] User auto-creation works
- [ ] Token without 'kid' handled
- [ ] Email updates work

### Permission Classes
- [ ] IsAdminUser works
- [ ] IsSuperAdminUser works
- [ ] IsVendorUser works
- [ ] IsStudentUser works
- [ ] IsOwner works
- [ ] IsOwnerOrReadOnly works
- [ ] IsOrderParticipant works
- [ ] IsConversationParticipant works
- [ ] ReadOnlyOrIsAuthenticated works

### JWT Authentication
- [ ] Token generation works
- [ ] Token validation works
- [ ] Token refresh works
- [ ] Token blacklisting works

### Rate Limiting
- [ ] Login rate limit enforced
- [ ] Register rate limit enforced
- [ ] API rate limit enforced

### Security
- [ ] Security headers present
- [ ] CORS configured correctly
- [ ] Credentials secured
- [ ] HTTPS enforced (production)

### Integration
- [ ] Complete registration flow works
- [ ] Complete order flow works
- [ ] Admin management works
- [ ] Error handling works

---

## Automated Testing

### Running Django Tests

```bash
cd studex-backend
python manage.py test accounts
python manage.py test services
python manage.py test orders
python manage.py test wallet
python manage.py test chat
```

### Create Test Suite

Create `accounts/tests/test_authentication.py`:

```python
from django.test import TestCase
from rest_framework.test import APIClient
from accounts.models import User

class AuthenticationTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='testuser',
            email='test@pau.edu.ng',
            password='testpass123',
            user_type='student'
        )

    def test_login_success(self):
        """Test user can login with correct credentials"""
        response = self.client.post('/api/auth/login/', {
            'email': 'test@pau.edu.ng',
            'password': 'testpass123'
        })
        self.assertEqual(response.status_code, 200)
        self.assertIn('tokens', response.data)

    def test_login_failure(self):
        """Test login fails with wrong credentials"""
        response = self.client.post('/api/auth/login/', {
            'email': 'test@pau.edu.ng',
            'password': 'wrongpassword'
        })
        self.assertEqual(response.status_code, 401)
```

---

## Production Testing Checklist

Before deploying to production:

- [ ] All tests pass
- [ ] Firebase production project configured
- [ ] Environment variables set correctly
- [ ] DEBUG=False
- [ ] SECRET_KEY is strong and unique
- [ ] ALLOWED_HOSTS configured
- [ ] CORS_ALLOWED_ORIGINS set to production frontend
- [ ] HTTPS enabled
- [ ] Security headers active
- [ ] Rate limiting configured
- [ ] Error tracking enabled (Sentry)
- [ ] Logs monitored
- [ ] Backup strategy in place

---

**Last Updated:** 2026-01-08
**Version:** 1.0
