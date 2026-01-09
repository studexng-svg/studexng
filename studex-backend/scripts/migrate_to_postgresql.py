#!/usr/bin/env python
"""
SQLite to PostgreSQL Migration Script for StudEx
Automates the migration process from SQLite to PostgreSQL
"""
import os
import sys
import json
from pathlib import Path
from datetime import datetime

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def check_environment():
    """Check if PostgreSQL environment is configured"""
    print("Checking environment configuration...")

    required_vars = ['DB_ENGINE', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'DB_HOST']
    missing_vars = []

    for var in required_vars:
        value = os.getenv(var)
        if not value:
            missing_vars.append(var)
        else:
            # Mask password
            if var == 'DB_PASSWORD':
                print(f"  ✅ {var}=****")
            else:
                print(f"  ✅ {var}={value}")

    if missing_vars:
        print(f"\n❌ Missing environment variables: {', '.join(missing_vars)}")
        print("\nPlease configure these in your .env file:")
        print("DB_ENGINE=django.db.backends.postgresql")
        print("DB_NAME=studex_db")
        print("DB_USER=studex_user")
        print("DB_PASSWORD=your_password")
        print("DB_HOST=localhost")
        print("DB_PORT=5432")
        return False

    # Check if using PostgreSQL
    db_engine = os.getenv('DB_ENGINE', '')
    if 'postgresql' not in db_engine:
        print(f"\n❌ DB_ENGINE is not set to PostgreSQL: {db_engine}")
        print("   Set DB_ENGINE=django.db.backends.postgresql in .env")
        return False

    return True


def test_postgresql_connection():
    """Test connection to PostgreSQL database"""
    print("\nTesting PostgreSQL connection...")

    # Setup Django
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'studex.settings')
    import django
    django.setup()

    from django.db import connection
    from django.core.management import call_command

    try:
        # Test connection
        with connection.cursor() as cursor:
            cursor.execute("SELECT version();")
            version = cursor.fetchone()[0]
            print(f"  ✅ Connected to PostgreSQL")
            print(f"  📊 Version: {version[:50]}...")

        # Check if database is empty
        cursor.execute("""
            SELECT COUNT(*) FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_type = 'BASE TABLE'
        """)
        table_count = cursor.fetchone()[0]

        if table_count > 0:
            print(f"  ⚠️  Warning: Database has {table_count} existing tables")
            response = input("  Continue anyway? This may cause conflicts (yes/no): ")
            if response.lower() != 'yes':
                print("  Migration cancelled.")
                return False

        return True

    except Exception as e:
        print(f"  ❌ Connection failed: {str(e)}")
        print("\nTroubleshooting:")
        print("1. Ensure PostgreSQL is running")
        print("2. Check database credentials in .env")
        print("3. Verify database exists: createdb studex_db")
        print("4. Check user permissions: GRANT ALL ON DATABASE studex_db TO studex_user;")
        return False


def backup_sqlite():
    """Backup SQLite database before migration"""
    print("\nBacking up SQLite database...")

    # Setup Django with SQLite (temporarily override)
    old_db_engine = os.environ.get('DB_ENGINE')
    os.environ['DB_ENGINE'] = 'django.db.backends.sqlite3'

    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'studex.settings')
    import django
    django.setup()

    from django.core.management import call_command

    # Create backups directory
    backup_dir = Path(__file__).resolve().parent.parent / 'backups'
    backup_dir.mkdir(exist_ok=True)

    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    backup_file = backup_dir / f'sqlite_before_migration_{timestamp}.json'

    try:
        with open(backup_file, 'w') as f:
            call_command(
                'dumpdata',
                '--natural-foreign',
                '--natural-primary',
                '--exclude', 'contenttypes',
                '--exclude', 'auth.Permission',
                '--exclude', 'admin.logentry',
                '--exclude', 'sessions.session',
                '--indent', '2',
                stdout=f
            )

        size = backup_file.stat().st_size / (1024 * 1024)
        print(f"  ✅ SQLite backup created: {backup_file}")
        print(f"  📊 Size: {size:.2f} MB")

        # Restore environment
        if old_db_engine:
            os.environ['DB_ENGINE'] = old_db_engine

        return backup_file

    except Exception as e:
        print(f"  ❌ Backup failed: {str(e)}")
        return None


def migrate_database():
    """Run Django migrations on PostgreSQL"""
    print("\nRunning migrations on PostgreSQL...")

    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'studex.settings')
    import django
    django.setup()

    from django.core.management import call_command

    try:
        # Run migrations
        call_command('migrate', '--run-syncdb', verbosity=2)
        print("  ✅ Migrations completed successfully")
        return True

    except Exception as e:
        print(f"  ❌ Migration failed: {str(e)}")
        return False


def load_data(backup_file):
    """Load data from SQLite backup into PostgreSQL"""
    print(f"\nLoading data into PostgreSQL...")

    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'studex.settings')
    import django
    django.setup()

    from django.core.management import call_command

    try:
        # Load data
        call_command('loaddata', str(backup_file), verbosity=2)
        print("  ✅ Data loaded successfully")
        return True

    except Exception as e:
        print(f"  ❌ Data load failed: {str(e)}")
        print("\nTroubleshooting:")
        print("- Check for foreign key constraint errors")
        print("- Ensure migrations ran successfully")
        print("- Try loading data in smaller chunks (by app)")
        return False


def verify_migration():
    """Verify that migration was successful"""
    print("\nVerifying migration...")

    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'studex.settings')
    import django
    django.setup()

    from django.contrib.auth import get_user_model
    from services.models import Category, Listing
    from orders.models import Order
    from wallet.models import Wallet

    User = get_user_model()

    try:
        # Count records
        stats = {
            'Users': User.objects.count(),
            'Categories': Category.objects.count(),
            'Listings': Listing.objects.count(),
            'Orders': Order.objects.count(),
            'Wallets': Wallet.objects.count(),
        }

        print("  📊 Record counts:")
        for model, count in stats.items():
            print(f"    - {model}: {count}")

        # Test a query
        if User.objects.exists():
            user = User.objects.first()
            print(f"  ✅ Sample query successful: {user.username}")

        print("\n  ✅ Migration verification completed")
        return True

    except Exception as e:
        print(f"  ❌ Verification failed: {str(e)}")
        return False


def main():
    """Main migration workflow"""
    print("=" * 60)
    print("StudEx: SQLite → PostgreSQL Migration")
    print("=" * 60)

    # Step 1: Check environment
    if not check_environment():
        sys.exit(1)

    # Step 2: Test PostgreSQL connection
    if not test_postgresql_connection():
        sys.exit(1)

    # Step 3: Backup SQLite
    print("\n" + "=" * 60)
    print("STEP 1: Backup SQLite Database")
    print("=" * 60)

    # Check if SQLite database exists
    sqlite_db = Path(__file__).resolve().parent.parent / 'db.sqlite3'
    if not sqlite_db.exists():
        print("  ℹ️  No SQLite database found. Skipping backup.")
        print("  This appears to be a fresh installation.")
        backup_file = None
    else:
        backup_file = backup_sqlite()
        if not backup_file:
            print("  ❌ Backup failed. Cannot proceed.")
            sys.exit(1)

    # Step 4: Run migrations on PostgreSQL
    print("\n" + "=" * 60)
    print("STEP 2: Create PostgreSQL Tables")
    print("=" * 60)

    if not migrate_database():
        print("  ❌ Migration failed. Cannot proceed.")
        sys.exit(1)

    # Step 5: Load data (if we have a backup)
    if backup_file:
        print("\n" + "=" * 60)
        print("STEP 3: Transfer Data to PostgreSQL")
        print("=" * 60)

        if not load_data(backup_file):
            print("  ❌ Data transfer failed.")
            print(f"  💾 Backup preserved at: {backup_file}")
            sys.exit(1)

    # Step 6: Verify migration
    print("\n" + "=" * 60)
    print("STEP 4: Verify Migration")
    print("=" * 60)

    if not verify_migration():
        print("  ⚠️  Verification had issues. Please review manually.")

    # Success!
    print("\n" + "=" * 60)
    print("✅ MIGRATION COMPLETED SUCCESSFULLY!")
    print("=" * 60)
    print("\nNext steps:")
    print("1. Test your application thoroughly")
    print("2. Create a superuser if needed:")
    print("   python manage.py createsuperuser")
    print("3. Collect static files for production:")
    print("   python manage.py collectstatic")
    print("4. Keep your SQLite backup safe:")
    if backup_file:
        print(f"   {backup_file}")
    print("\n🚀 Your application is now running on PostgreSQL!")


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n❌ Migration cancelled by user.")
        sys.exit(1)
    except Exception as e:
        print(f"\n\n❌ Unexpected error: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
