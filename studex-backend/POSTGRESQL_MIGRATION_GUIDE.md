# PostgreSQL Migration Guide for StudEx

This guide provides step-by-step instructions for migrating from SQLite to PostgreSQL for production deployment.

## Table of Contents
1. [Why PostgreSQL?](#why-postgresql)
2. [Prerequisites](#prerequisites)
3. [Local Development Setup](#local-development-setup)
4. [Data Migration Process](#data-migration-process)
5. [Production Deployment](#production-deployment)
6. [Troubleshooting](#troubleshooting)

---

## Why PostgreSQL?

**SQLite Limitations (Development Only)**:
- ❌ Not designed for concurrent writes
- ❌ No user/role management
- ❌ Limited data types
- ❌ Not suitable for production traffic
- ❌ File-based (single point of failure)

**PostgreSQL Benefits (Production Ready)**:
- ✅ Handles thousands of concurrent users
- ✅ Advanced data types (JSON, Arrays, etc.)
- ✅ Full ACID compliance
- ✅ Robust backup and replication
- ✅ Industry standard for Django production
- ✅ Better performance at scale
- ✅ Advanced security features

---

## Prerequisites

### Local Development
- Python 3.10+ installed
- PostgreSQL 14+ installed
- psycopg2-binary Python package

### Production (Railway/Vercel/Heroku)
- Platform account (Railway recommended)
- Environment variables configured
- Database addon provisioned

---

## Local Development Setup

### Step 1: Install PostgreSQL

**Windows:**
```bash
# Download from: https://www.postgresql.org/download/windows/
# Or use Chocolatey:
choco install postgresql

# Or use Windows Subsystem for Linux (WSL)
```

**macOS:**
```bash
# Using Homebrew:
brew install postgresql@14
brew services start postgresql@14
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### Step 2: Install Python PostgreSQL Driver

```bash
cd studex-backend

# Install psycopg2-binary (easier for development)
pip install psycopg2-binary

# Or install from source (production recommended)
pip install psycopg2

# Update requirements.txt
pip freeze > requirements.txt
```

### Step 3: Create PostgreSQL Database

**On Windows/macOS/Linux:**
```bash
# Switch to postgres user (Linux only)
sudo -u postgres psql

# Or connect directly (Windows/macOS)
psql -U postgres
```

**In PostgreSQL shell:**
```sql
-- Create database
CREATE DATABASE studex_db;

-- Create user with password
CREATE USER studex_user WITH PASSWORD 'secure_password_here';

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE studex_db TO studex_user;

-- Grant schema privileges (PostgreSQL 15+)
\c studex_db
GRANT ALL ON SCHEMA public TO studex_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO studex_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO studex_user;

-- Exit
\q
```

### Step 4: Update Environment Variables

Create or update `.env` file:
```env
# Database Configuration
DB_ENGINE=django.db.backends.postgresql
DB_NAME=studex_db
DB_USER=studex_user
DB_PASSWORD=secure_password_here
DB_HOST=localhost
DB_PORT=5432

# Keep other settings...
SECRET_KEY=your-secret-key
DEBUG=True
```

### Step 5: Test Database Connection

```bash
# Test connection
python manage.py check --database default

# Should output:
# System check identified no issues (0 silenced).
```

---

## Data Migration Process

### Option A: Fresh Installation (Recommended for New Deployments)

**For new production deployments with no data:**

```bash
# 1. Run migrations on empty PostgreSQL database
python manage.py migrate

# 2. Create superuser
python manage.py createsuperuser

# 3. Load initial data (if you have fixtures)
python manage.py loaddata initial_categories.json

# Done! Start fresh with PostgreSQL
```

### Option B: Migrate Existing SQLite Data

**For migrating existing development data to PostgreSQL:**

#### Step 1: Backup Current SQLite Database

```bash
# Create backup directory
mkdir -p backups

# Copy database file
cp db.sqlite3 backups/db.sqlite3.backup_$(date +%Y%m%d_%H%M%S)

# Or use Django's dumpdata
python manage.py dumpdata --natural-foreign --natural-primary \
  --exclude contenttypes --exclude auth.Permission \
  --exclude admin.logentry --exclude sessions.session \
  --indent 2 > backups/full_data_backup.json
```

#### Step 2: Switch to PostgreSQL

Update `.env`:
```env
DB_ENGINE=django.db.backends.postgresql
DB_NAME=studex_db
DB_USER=studex_user
DB_PASSWORD=secure_password_here
DB_HOST=localhost
DB_PORT=5432
```

#### Step 3: Run Migrations on PostgreSQL

```bash
# Run all migrations on empty PostgreSQL database
python manage.py migrate

# This creates all tables from scratch
```

#### Step 4: Load Data from SQLite Backup

```bash
# Load data from JSON backup
python manage.py loaddata backups/full_data_backup.json

# If you encounter errors, load apps separately:
python manage.py loaddata accounts
python manage.py loaddata services
python manage.py loaddata orders
python manage.py loaddata wallet
```

#### Step 5: Verify Migration

```bash
# Check data integrity
python manage.py shell
```

```python
from django.contrib.auth import get_user_model
from services.models import Category, Listing
from orders.models import Order
from wallet.models import Wallet

User = get_user_model()

# Check record counts
print(f"Users: {User.objects.count()}")
print(f"Categories: {Category.objects.count()}")
print(f"Listings: {Listing.objects.count()}")
print(f"Orders: {Order.objects.count()}")
print(f"Wallets: {Wallet.objects.count()}")

# Verify relationships
user = User.objects.first()
print(f"User {user.username} has {user.listings.count()} listings")
```

### Option C: Using Third-Party Tools (Advanced)

**For complex migrations with large datasets:**

```bash
# Install django-admin-tools for data transfer
pip install django-db-backup

# Or use pgloader (PostgreSQL utility)
pgloader db.sqlite3 postgresql://studex_user:password@localhost/studex_db
```

---

## Production Deployment

### Railway Deployment (Recommended)

Railway provides managed PostgreSQL with automatic backups.

#### Step 1: Create Railway Project

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Initialize project
railway init
```

#### Step 2: Add PostgreSQL Plugin

1. Go to Railway Dashboard
2. Click "+ New" → "Database" → "PostgreSQL"
3. Railway auto-generates connection details

#### Step 3: Configure Environment Variables

In Railway dashboard, add these variables:
```env
# Django Settings
SECRET_KEY=<generate-new-secret-key>
DEBUG=False
ALLOWED_HOSTS=your-app.railway.app
CORS_ALLOWED_ORIGINS=https://your-frontend.vercel.app

# Database (automatically set by Railway PostgreSQL plugin)
# DATABASE_URL is auto-generated, or set manually:
DB_ENGINE=django.db.backends.postgresql
DB_NAME=${{Postgres.PGDATABASE}}
DB_USER=${{Postgres.PGUSER}}
DB_PASSWORD=${{Postgres.PGPASSWORD}}
DB_HOST=${{Postgres.PGHOST}}
DB_PORT=${{Postgres.PGPORT}}

# Security
SESSION_COOKIE_SECURE=True
CSRF_COOKIE_SECURE=True

# Other settings...
```

#### Step 4: Deploy

```bash
# Link to Railway
railway link

# Deploy
railway up

# Run migrations
railway run python manage.py migrate

# Create superuser
railway run python manage.py createsuperuser

# Collect static files
railway run python manage.py collectstatic --noinput
```

### Vercel + Railway Database

**Backend on Railway, Frontend on Vercel:**

1. Deploy PostgreSQL on Railway (follow steps above)
2. Deploy Django backend on Railway
3. Get Railway backend URL (e.g., `https://studex-backend.railway.app`)
4. Deploy Next.js frontend on Vercel with:
   ```env
   NEXT_PUBLIC_API_URL=https://studex-backend.railway.app
   ```

### Heroku Deployment

```bash
# Create Heroku app
heroku create studex-backend

# Add PostgreSQL addon
heroku addons:create heroku-postgresql:mini

# Set environment variables
heroku config:set SECRET_KEY=your-secret-key
heroku config:set DEBUG=False
heroku config:set ALLOWED_HOSTS=studex-backend.herokuapp.com

# Deploy
git push heroku main

# Run migrations
heroku run python manage.py migrate

# Create superuser
heroku run python manage.py createsuperuser
```

---

## Database Maintenance

### Backup Production Database

**Railway:**
```bash
# Automatic backups enabled by default
# Manual backup:
railway run pg_dump -U postgres studex_db > backup.sql
```

**Manual Backup:**
```bash
# Dump entire database
pg_dump -U studex_user -h localhost -d studex_db > studex_backup_$(date +%Y%m%d).sql

# Dump with Django
python manage.py dumpdata > backup_$(date +%Y%m%d).json
```

### Restore Database

```bash
# From PostgreSQL dump
psql -U studex_user -h localhost -d studex_db < studex_backup.sql

# From Django JSON
python manage.py loaddata backup.json
```

### Optimize Database

```bash
# Analyze and vacuum (run weekly)
python manage.py dbshell
```

```sql
-- Analyze tables for query optimization
ANALYZE;

-- Vacuum to reclaim space
VACUUM;

-- Full vacuum (requires more resources)
VACUUM FULL;
```

---

## Troubleshooting

### Error: "relation does not exist"

**Problem**: Tables not created
**Solution**:
```bash
python manage.py migrate --run-syncdb
```

### Error: "password authentication failed"

**Problem**: Wrong credentials or permissions
**Solution**:
```bash
# Reset password
sudo -u postgres psql
ALTER USER studex_user WITH PASSWORD 'new_password';

# Grant permissions
GRANT ALL PRIVILEGES ON DATABASE studex_db TO studex_user;
```

### Error: "could not connect to server"

**Problem**: PostgreSQL not running
**Solution**:
```bash
# Linux
sudo systemctl start postgresql

# macOS
brew services start postgresql@14

# Windows
# Start from Services panel or
net start postgresql-x64-14
```

### Error: "psycopg2 not installed"

**Problem**: Missing PostgreSQL driver
**Solution**:
```bash
pip install psycopg2-binary
```

### Performance Issues

**Problem**: Slow queries
**Solution**:
```bash
# Enable query logging in settings.py
LOGGING = {
    'loggers': {
        'django.db.backends': {
            'level': 'DEBUG',
        },
    },
}

# Add database indexes
python manage.py makemigrations --empty yourapp
# Then add indexes manually
```

---

## Performance Tips

### Add Database Indexes

In models, add indexes for frequently queried fields:
```python
class Order(models.Model):
    reference = models.CharField(max_length=100, db_index=True)

    class Meta:
        indexes = [
            models.Index(fields=['status', 'created_at']),
            models.Index(fields=['buyer', 'status']),
        ]
```

### Connection Pooling

For high traffic, use connection pooling:
```bash
pip install django-db-geventpool
```

In `settings.py`:
```python
DATABASES = {
    'default': {
        'ENGINE': 'django_db_geventpool.backends.postgresql_psycopg2',
        'ATOMIC_REQUESTS': False,
        'CONN_MAX_AGE': 0,
        'OPTIONS': {
            'MAX_CONNS': 20,
            'REUSE_CONNS': 10,
        }
    }
}
```

---

## Security Best Practices

1. **Never commit database credentials**
   - Use `.env` file (in `.gitignore`)
   - Use environment variables in production

2. **Use strong passwords**
   ```bash
   # Generate secure password
   openssl rand -base64 32
   ```

3. **Restrict database access**
   - Only allow specific IP addresses
   - Use SSL for database connections

4. **Regular backups**
   - Automated daily backups
   - Test restore process regularly

5. **Monitor database**
   - Set up alerts for disk usage
   - Monitor slow queries

---

## Next Steps

After successful migration:

1. ✅ Update `requirements.txt` with `psycopg2-binary`
2. ✅ Test all CRUD operations
3. ✅ Run full test suite
4. ✅ Verify file uploads work
5. ✅ Test payment flows
6. ✅ Monitor database performance
7. ✅ Set up automated backups
8. ✅ Configure database monitoring

---

## Support

For issues or questions:
- Check Django docs: https://docs.djangoproject.com/en/stable/ref/databases/#postgresql-notes
- PostgreSQL docs: https://www.postgresql.org/docs/
- Railway docs: https://docs.railway.app/databases/postgresql

**Common Resources**:
- Django + PostgreSQL Guide: https://www.digitalocean.com/community/tutorials/how-to-use-postgresql-with-your-django-application-on-ubuntu-20-04
- Railway PostgreSQL: https://docs.railway.app/databases/postgresql
- Heroku PostgreSQL: https://devcenter.heroku.com/articles/heroku-postgresql
