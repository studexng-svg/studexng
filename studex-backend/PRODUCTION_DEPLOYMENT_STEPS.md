# StudEx Production Deployment - Step-by-Step Guide

**Target Platform:** Railway (Backend) + Vercel (Frontend)
**Database:** PostgreSQL
**Created:** 2026-01-09

---

## 🚀 Pre-Deployment Checklist

Before deploying to production, ensure all security issues are resolved:

- [ ] Generated production SECRET_KEY (50+ characters)
- [ ] Set DEBUG=False in production environment
- [ ] Configured CORS for production frontend URL
- [ ] Enabled all security cookie settings
- [ ] PostgreSQL database ready
- [ ] Paystack keys configured (test or live)
- [ ] Email SMTP configured
- [ ] Firebase service account JSON ready

---

## 📋 Part 1: Backend Deployment (Railway)

### Step 1: Prepare Backend Repository

```bash
cd studex-backend

# Ensure all changes committed
git status
git add .
git commit -m "Prepare backend for production deployment"
git push origin main
```

### Step 2: Create Railway Project

1. Go to [Railway Dashboard](https://railway.app/)
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"**
4. Connect your GitHub account
5. Select `StudEx_Both` repository
6. Railway will detect Django and start deployment

### Step 3: Add PostgreSQL Database

1. In Railway project dashboard, click **"+ New"**
2. Select **"Database"** → **"PostgreSQL"**
3. Wait for database to provision (1-2 minutes)
4. Railway auto-creates these variables:
   - `DATABASE_URL`
   - `PGDATABASE`
   - `PGUSER`
   - `PGPASSWORD`
   - `PGHOST`
   - `PGPORT`

### Step 4: Configure Environment Variables

Click **"Variables"** tab in Railway dashboard and add:

#### Core Django Settings
```env
SECRET_KEY=<paste-generated-secret-key>
DEBUG=False
ALLOWED_HOSTS=${{RAILWAY_PUBLIC_DOMAIN}}
```

> **Generate SECRET_KEY:**
> ```bash
> python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
> ```

#### Database Settings
```env
DB_ENGINE=django.db.backends.postgresql
DB_NAME=${{Postgres.PGDATABASE}}
DB_USER=${{Postgres.PGUSER}}
DB_PASSWORD=${{Postgres.PGPASSWORD}}
DB_HOST=${{Postgres.PGHOST}}
DB_PORT=${{Postgres.PGPORT}}
```

#### CORS Settings
```env
CORS_ALLOWED_ORIGINS=https://your-frontend.vercel.app
```
> **Note:** Update with actual Vercel frontend URL after frontend deployment

#### Security Settings
```env
SESSION_COOKIE_SECURE=True
CSRF_COOKIE_SECURE=True
SECURE_SSL_REDIRECT=True
```

#### JWT Settings
```env
JWT_ACCESS_TOKEN_LIFETIME=1
JWT_REFRESH_TOKEN_LIFETIME=7
```

#### Paystack Keys (TEST for now)
```env
PAYSTACK_PUBLIC_KEY=pk_test_your_test_key
PAYSTACK_SECRET_KEY=sk_test_your_test_key
```

#### Email Configuration
```env
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USE_TLS=True
EMAIL_HOST_USER=your-email@gmail.com
EMAIL_HOST_PASSWORD=your-gmail-app-password
```

#### Rate Limiting
```env
RATE_LIMIT_LOGIN=10
RATE_LIMIT_REGISTER=5
RATE_LIMIT_API=60
```

#### Frontend URL
```env
FRONTEND_BASE_URL=https://your-frontend.vercel.app
```

### Step 5: Upload Firebase Service Account

**Option A: Upload as File (Recommended)**

1. Go to Railway project **"Settings"**
2. Scroll to **"Volumes"**
3. Click **"Add Volume"**
4. Upload `firebase_service_account.json`
5. Set mount path: `/app/firebase_service_account.json`

**Option B: Base64 Environment Variable**

```bash
# Convert to base64
base64 firebase_service_account.json > firebase_base64.txt

# Add as environment variable
FIREBASE_SERVICE_ACCOUNT_BASE64=<paste-base64-string>
```

### Step 6: Deploy and Run Migrations

Railway auto-deploys when you push to GitHub. After deployment:

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Link to project
railway link

# Run migrations
railway run python manage.py migrate

# Create superuser
railway run python manage.py createsuperuser

# Collect static files
railway run python manage.py collectstatic --noinput
```

### Step 7: Verify Backend Deployment

1. Get your Railway URL from dashboard (e.g., `https://studex-backend-production.up.railway.app`)
2. Test endpoints:

```bash
# Health check
curl https://your-backend.railway.app/admin/

# API check
curl https://your-backend.railway.app/api/services/categories/

# Should return JSON with categories
```

3. Access admin panel: `https://your-backend.railway.app/admin/`
4. Login with superuser credentials
5. Verify database connection works

---

## 🌐 Part 2: Frontend Deployment (Vercel)

### Step 1: Prepare Frontend Repository

```bash
cd studex-frontend

# Update .env.local with Railway backend URL
echo "NEXT_PUBLIC_API_URL=https://your-backend.railway.app" > .env.production
```

### Step 2: Deploy to Vercel

**Option A: Via Vercel CLI**

```bash
# Install Vercel CLI
npm install -g vercel

# Login
vercel login

# Deploy
vercel --prod
```

**Option B: Via Vercel Dashboard**

1. Go to [Vercel Dashboard](https://vercel.com/)
2. Click **"Add New Project"**
3. Import `StudEx_Both` repository
4. Select `studex-frontend` as root directory
5. Configure environment variables (see below)
6. Click **"Deploy"**

### Step 3: Configure Frontend Environment Variables

In Vercel dashboard → **"Settings"** → **"Environment Variables"**:

```env
NEXT_PUBLIC_API_URL=https://your-backend.railway.app

# Firebase Config
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

# Paystack Public Key
NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY=pk_test_your_test_key
```

### Step 4: Update Backend CORS

After getting your Vercel URL, update Railway environment variables:

```env
CORS_ALLOWED_ORIGINS=https://your-app.vercel.app
ALLOWED_HOSTS=${{RAILWAY_PUBLIC_DOMAIN}},studex.pau.edu.ng
```

Railway will auto-redeploy with new settings.

---

## ✅ Part 3: Post-Deployment Verification

### Backend Tests

- [ ] **Admin Panel Accessible:** `https://your-backend.railway.app/admin/`
- [ ] **API Endpoints Working:** Test `/api/services/categories/`
- [ ] **Database Connected:** Check Django admin can read/write data
- [ ] **HTTPS Enabled:** Green padlock in browser
- [ ] **No Migration Errors:** Check Railway logs

### Frontend Tests

- [ ] **Site Loads:** `https://your-app.vercel.app/`
- [ ] **API Connection Works:** Check Network tab, no CORS errors
- [ ] **Registration Works:** Create test account
- [ ] **Login Works:** Login with test account
- [ ] **Protected Routes Work:** Access dashboard after login
- [ ] **Logout Works:** Tokens cleared, redirected to login

### Full Integration Tests

- [ ] **Signup Flow:**
  - [ ] Create new account @pau.edu.ng
  - [ ] User created in database
  - [ ] JWT tokens returned
  - [ ] Can access protected routes immediately

- [ ] **Login Flow:**
  - [ ] Login with existing credentials
  - [ ] Tokens returned and stored
  - [ ] Redirected to home

- [ ] **Token Refresh:**
  - [ ] Make API request with valid token
  - [ ] Token auto-refreshes before expiry
  - [ ] No user interruption

- [ ] **CORS:**
  - [ ] No CORS errors in console
  - [ ] All API requests succeed
  - [ ] Cookies/credentials included

- [ ] **Security Headers:**
  - [ ] Check with: https://securityheaders.com/
  - [ ] Should have A or A+ rating
  - [ ] Verify HSTS, X-Frame-Options, etc.

---

## 🐛 Troubleshooting

### Issue: CORS Errors

**Symptom:** Browser console shows "CORS policy" errors

**Fix:**
1. Verify Railway `CORS_ALLOWED_ORIGINS` includes Vercel URL
2. Ensure no trailing slashes in CORS origins
3. Check Vercel URL is HTTPS (not HTTP)
4. Restart Railway deployment after changing CORS

### Issue: 500 Internal Server Error

**Symptom:** API returns 500 errors

**Fix:**
1. Check Railway logs: `railway logs`
2. Verify all environment variables are set
3. Check database connection: `DB_HOST`, `DB_PASSWORD`, etc.
4. Run migrations: `railway run python manage.py migrate`

### Issue: Static Files Not Loading

**Symptom:** Django admin has no CSS

**Fix:**
```bash
railway run python manage.py collectstatic --noinput
```

### Issue: Firebase Authentication Errors

**Symptom:** 403 errors on protected endpoints

**Fix:**
1. Verify `firebase_service_account.json` uploaded to Railway
2. Check file path: `/app/firebase_service_account.json`
3. Verify Firebase project matches frontend config

### Issue: Database Connection Failed

**Symptom:** "Connection refused" or "Database doesn't exist"

**Fix:**
1. Check PostgreSQL plugin is active in Railway
2. Verify database environment variables:
   ```bash
   railway variables
   ```
3. Test connection:
   ```bash
   railway run python manage.py check --database default
   ```

---

## 📊 Monitoring & Maintenance

### Setup Error Tracking (Recommended)

**Option 1: Sentry**

```bash
pip install sentry-sdk

# Add to settings.py
import sentry_sdk
sentry_sdk.init(
    dsn="your-sentry-dsn",
    environment="production",
)

# Add to Railway environment
SENTRY_DSN=https://xxxxx@sentry.io/xxxxx
```

### Setup Uptime Monitoring

1. **UptimeRobot** (Free): https://uptimerobot.com/
   - Monitor: `https://your-backend.railway.app/admin/`
   - Alert if down for > 5 minutes

2. **Pingdom** or **StatusCake** (Alternatives)

### Regular Maintenance Tasks

**Daily:**
- Check Railway logs for errors
- Monitor uptime status
- Check failed transactions in admin

**Weekly:**
- Review database performance (Railway dashboard)
- Check disk usage
- Test backup restoration

**Monthly:**
- Update Django & dependencies
- Security audit
- Review and rotate API keys
- Database vacuum/analyze (PostgreSQL)

---

## 🔄 Deployment Workflow (After Initial Setup)

### Backend Updates

```bash
git add .
git commit -m "feat: add new feature"
git push origin main
```

Railway auto-deploys on push to main branch.

### Frontend Updates

```bash
git add .
git commit -m "feat: add new UI component"
git push origin main
```

Vercel auto-deploys on push to main branch.

### Rolling Back

**Railway:**
```bash
railway logs  # Check which deployment failed
# Go to Railway dashboard → Deployments → Select previous version → Redeploy
```

**Vercel:**
```bash
# Go to Vercel dashboard → Deployments → Select previous version → Promote to Production
```

---

## 📞 Support & Resources

**Railway:**
- Docs: https://docs.railway.app/
- Discord: https://discord.gg/railway
- Status: https://status.railway.app/

**Vercel:**
- Docs: https://vercel.com/docs
- Support: https://vercel.com/support
- Status: https://www.vercel-status.com/

**Django:**
- Docs: https://docs.djangoproject.com/
- Forum: https://forum.djangoproject.com/

---

## ✅ Production Deployment Complete

When all checks pass:

✅ Backend deployed to Railway
✅ Frontend deployed to Vercel
✅ Database connected and migrated
✅ CORS configured correctly
✅ Security settings enabled
✅ SSL/HTTPS working
✅ Authentication flow tested
✅ Admin panel accessible
✅ Monitoring setup complete

**Next:** Proceed with Task 2.2 - Test Complete Order Flow

---

**Document Version:** 1.0
**Last Updated:** 2026-01-09
**Status:** Ready for deployment
