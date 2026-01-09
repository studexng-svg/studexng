# StudEx Production Deployment Checklist

Complete checklist for deploying StudEx to production with PostgreSQL.

## Pre-Deployment Checklist

### 1. Environment Configuration

- [ ] **Generate new SECRET_KEY for production**
  ```bash
  python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
  ```

- [ ] **Set DEBUG=False**
  ```env
  DEBUG=False
  ```

- [ ] **Configure ALLOWED_HOSTS**
  ```env
  ALLOWED_HOSTS=your-backend-domain.com,your-backend.railway.app
  ```

- [ ] **Configure CORS_ALLOWED_ORIGINS**
  ```env
  CORS_ALLOWED_ORIGINS=https://your-frontend.vercel.app,https://your-domain.com
  ```

- [ ] **Set secure cookie settings**
  ```env
  SESSION_COOKIE_SECURE=True
  CSRF_COOKIE_SECURE=True
  ```

### 2. Database Setup

- [ ] **PostgreSQL database created**
  - Railway: Auto-created with PostgreSQL plugin
  - Manual: `createdb studex_db`

- [ ] **Database credentials configured**
  ```env
  DB_ENGINE=django.db.backends.postgresql
  DB_NAME=studex_db
  DB_USER=postgres
  DB_PASSWORD=secure_password_here
  DB_HOST=containers-us-west-xxx.railway.app
  DB_PORT=5432
  ```

- [ ] **Database connection tested**
  ```bash
  python manage.py check --database default
  ```

### 3. Static & Media Files

- [ ] **Collect static files**
  ```bash
  python manage.py collectstatic --noinput
  ```

- [ ] **Configure media storage (if using cloud storage)**
  - AWS S3
  - Google Cloud Storage
  - Cloudinary

- [ ] **Update STATIC_URL and MEDIA_URL for production**

### 4. Payment Gateway

- [ ] **Paystack production keys configured**
  ```env
  PAYSTACK_PUBLIC_KEY=pk_live_your_key
  PAYSTACK_SECRET_KEY=sk_live_your_key
  ```

- [ ] **Test payment flow in production**
  - Fund wallet
  - Place order
  - Verify escrow
  - Test withdrawal

### 5. Firebase Authentication

- [ ] **Production Firebase project created**
- [ ] **Service account JSON downloaded**
- [ ] **Firebase config environment variable set**
- [ ] **Test Firebase auth in production**

### 6. Email Configuration

- [ ] **SMTP credentials configured**
  ```env
  EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
  EMAIL_HOST=smtp.gmail.com
  EMAIL_PORT=587
  EMAIL_USE_TLS=True
  EMAIL_HOST_USER=your-email@gmail.com
  EMAIL_HOST_PASSWORD=your-app-password
  ```

- [ ] **Test email sending**
  ```python
  from django.core.mail import send_mail
  send_mail('Test', 'Testing email', 'from@email.com', ['to@email.com'])
  ```

### 7. Security Hardening

- [ ] **Rate limiting configured**
  ```env
  RATE_LIMIT_LOGIN=10
  RATE_LIMIT_REGISTER=5
  RATE_LIMIT_API=60
  ```

- [ ] **File upload limits set**
  ```env
  MAX_UPLOAD_SIZE_MB=10
  ALLOWED_IMAGE_EXTENSIONS=jpg,jpeg,png,gif,webp
  ```

- [ ] **Security headers enabled** (automatic in production)

- [ ] **SSL/HTTPS certificate configured**

### 8. Performance Optimization

- [ ] **Database indexes verified**
  ```bash
  python manage.py dbshell
  \d+ orders_order  # Check indexes
  ```

- [ ] **Gunicorn workers configured**
  ```
  workers = 4
  timeout = 120
  ```

- [ ] **Connection pooling enabled** (optional)

### 9. Monitoring & Logging

- [ ] **Error tracking setup** (Sentry recommended)
  ```bash
  pip install sentry-sdk
  ```

- [ ] **Log level configured**
  ```env
  LOG_LEVEL=INFO  # or WARNING for production
  ```

- [ ] **Database monitoring enabled** (Railway auto-monitors)

- [ ] **Uptime monitoring** (UptimeRobot, Pingdom)

### 10. Backup Strategy

- [ ] **Automated database backups enabled**
  - Railway: Automatic daily backups
  - Manual: Cron job with pg_dump

- [ ] **Backup retention policy set**
  - Daily: 7 days
  - Weekly: 4 weeks
  - Monthly: 12 months

- [ ] **Test backup restoration**
  ```bash
  psql -U postgres -d studex_db < backup.sql
  ```

---

## Railway Deployment Steps

### Step 1: Create Railway Project

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Initialize project
railway init
```

### Step 2: Add PostgreSQL Database

1. Go to Railway Dashboard
2. Click "+ New" → "Database" → "PostgreSQL"
3. Wait for database to provision
4. Railway auto-sets: `DATABASE_URL`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`, `PGHOST`, `PGPORT`

### Step 3: Configure Environment Variables

Add all required variables in Railway dashboard:

```env
# Django Core
SECRET_KEY=<generate-new-secret-key>
DEBUG=False
ALLOWED_HOSTS=${{RAILWAY_PUBLIC_DOMAIN}}
FRONTEND_BASE_URL=https://your-frontend.vercel.app

# Database (auto-set by Railway PostgreSQL plugin)
DB_ENGINE=django.db.backends.postgresql
DB_NAME=${{Postgres.PGDATABASE}}
DB_USER=${{Postgres.PGUSER}}
DB_PASSWORD=${{Postgres.PGPASSWORD}}
DB_HOST=${{Postgres.PGHOST}}
DB_PORT=${{Postgres.PGPORT}}

# CORS
CORS_ALLOWED_ORIGINS=https://your-frontend.vercel.app

# Security
SESSION_COOKIE_SECURE=True
CSRF_COOKIE_SECURE=True

# Paystack
PAYSTACK_PUBLIC_KEY=pk_live_xxx
PAYSTACK_SECRET_KEY=sk_live_xxx

# Rate Limiting
RATE_LIMIT_LOGIN=10
RATE_LIMIT_REGISTER=5
RATE_LIMIT_API=60

# Email
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USE_TLS=True
EMAIL_HOST_USER=your-email@gmail.com
EMAIL_HOST_PASSWORD=your-app-password
```

### Step 4: Deploy

```bash
# Link to Railway project
railway link

# Deploy
railway up

# Or connect GitHub repo for auto-deploy
# Railway → Settings → Connect GitHub
```

### Step 5: Run Migrations

```bash
# SSH into Railway
railway run python manage.py migrate

# Create superuser
railway run python manage.py createsuperuser

# Collect static files
railway run python manage.py collectstatic --noinput
```

### Step 6: Verify Deployment

- [ ] Visit admin panel: `https://your-app.railway.app/admin/`
- [ ] Test API endpoints: `https://your-app.railway.app/api/`
- [ ] Check health: `https://your-app.railway.app/admin/`
- [ ] Monitor logs in Railway dashboard

---

## Post-Deployment Checklist

### Immediate Testing

- [ ] **Admin panel accessible**
- [ ] **API endpoints working**
- [ ] **User registration working**
- [ ] **Login working (Firebase + JWT)**
- [ ] **Listings visible**
- [ ] **Order creation working**
- [ ] **Payment flow working**
- [ ] **Wallet operations working**
- [ ] **File uploads working**
- [ ] **Email notifications sending**

### Performance Testing

- [ ] **Load test with 100 concurrent users**
- [ ] **Check database query performance**
- [ ] **Monitor memory usage**
- [ ] **Check response times (<200ms for API)**

### Security Testing

- [ ] **SSL certificate valid** (https://)
- [ ] **Security headers present** (check with securityheaders.com)
- [ ] **Rate limiting working**
- [ ] **File upload validation working**
- [ ] **CORS configured correctly**
- [ ] **Admin panel accessible only to superusers**

### Monitoring Setup

- [ ] **Error tracking active** (Sentry)
- [ ] **Uptime monitoring active** (UptimeRobot)
- [ ] **Database metrics visible** (Railway dashboard)
- [ ] **Alert notifications configured**

### Documentation

- [ ] **API documentation updated**
- [ ] **Deployment process documented**
- [ ] **Environment variables documented**
- [ ] **Backup/restore procedure documented**

---

## Rollback Plan

If deployment fails:

### Option 1: Rollback to Previous Version

```bash
# Railway auto-keeps previous deployments
# Go to Railway Dashboard → Deployments → Select previous version → Redeploy
```

### Option 2: Restore Database Backup

```bash
# Railway backups
railway run psql $DATABASE_URL < backup.sql

# Or from local backup
psql -h $DB_HOST -U $DB_USER -d $DB_NAME < backup.sql
```

### Option 3: Switch Back to SQLite (Development Only)

```env
# Update .env
DB_ENGINE=django.db.backends.sqlite3

# Restore from backup
python scripts/backup_database.py restore --file backups/studex_backup_latest.json
```

---

## Maintenance Tasks

### Daily
- [ ] Check error logs
- [ ] Monitor uptime status
- [ ] Review failed transactions

### Weekly
- [ ] Review database performance
- [ ] Check disk usage
- [ ] Test backup restoration
- [ ] Update dependencies if needed

### Monthly
- [ ] Security audit
- [ ] Performance optimization
- [ ] Database vacuum/analyze
- [ ] Review and rotate API keys
- [ ] Update Django/dependencies

---

## Support Contacts

**Platform Issues:**
- Railway: https://railway.app/help
- Vercel: https://vercel.com/support
- Paystack: https://paystack.com/contact

**Django Resources:**
- Docs: https://docs.djangoproject.com/
- Community: https://forum.djangoproject.com/

**Emergency Contacts:**
- Database Admin: [Your email]
- DevOps: [Your email]
- On-call: [Phone number]

---

## Success Criteria

Deployment is successful when:

✅ All environment variables configured
✅ PostgreSQL database connected and migrated
✅ Static files serving correctly
✅ Admin panel accessible
✅ User registration/login working
✅ Payment flow end-to-end working
✅ Email notifications sending
✅ SSL certificate active
✅ Monitoring and alerts configured
✅ Backup strategy implemented
✅ Load tested with expected traffic

---

**Last Updated**: 2026-01-08
**Version**: 1.0
**Deployment Platform**: Railway
**Database**: PostgreSQL 14+
