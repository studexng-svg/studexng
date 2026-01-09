#!/usr/bin/env python
"""
Database Backup Script for StudEx
Backs up Django database to JSON format
"""
import os
import sys
import json
from datetime import datetime
from pathlib import Path

# Add parent directory to path to import Django settings
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'studex.settings')
import django
django.setup()

from django.core.management import call_command
from django.conf import settings


def create_backup():
    """Create a complete database backup"""

    # Create backups directory
    backup_dir = Path(__file__).resolve().parent.parent / 'backups'
    backup_dir.mkdir(exist_ok=True)

    # Generate timestamp
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')

    # Backup filename
    backup_file = backup_dir / f'studex_backup_{timestamp}.json'

    print(f"Creating database backup...")
    print(f"Backup location: {backup_file}")

    # Backup entire database
    # Exclude: contenttypes, auth.Permission (auto-generated)
    # Exclude: admin.logentry (not critical)
    # Exclude: sessions.session (temporary data)
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

    # Get file size
    file_size = backup_file.stat().st_size / (1024 * 1024)  # Convert to MB

    print(f"✅ Backup completed successfully!")
    print(f"📁 File: {backup_file}")
    print(f"📊 Size: {file_size:.2f} MB")

    # Also create app-specific backups
    apps_to_backup = ['accounts', 'services', 'orders', 'wallet']

    for app in apps_to_backup:
        app_backup_file = backup_dir / f'{app}_backup_{timestamp}.json'

        try:
            with open(app_backup_file, 'w') as f:
                call_command(
                    'dumpdata',
                    app,
                    '--natural-foreign',
                    '--natural-primary',
                    '--indent', '2',
                    stdout=f
                )

            app_size = app_backup_file.stat().st_size / 1024  # KB
            print(f"  └─ {app}: {app_size:.2f} KB")
        except Exception as e:
            print(f"  └─ {app}: ❌ Failed ({str(e)})")

    return backup_file


def restore_backup(backup_file):
    """Restore database from backup file"""

    if not Path(backup_file).exists():
        print(f"❌ Backup file not found: {backup_file}")
        return False

    print(f"Restoring database from: {backup_file}")
    print("⚠️  WARNING: This will replace existing data!")

    response = input("Continue? (yes/no): ")
    if response.lower() != 'yes':
        print("Restore cancelled.")
        return False

    try:
        call_command('loaddata', backup_file)
        print("✅ Database restored successfully!")
        return True
    except Exception as e:
        print(f"❌ Restore failed: {str(e)}")
        return False


def list_backups():
    """List all available backups"""

    backup_dir = Path(__file__).resolve().parent.parent / 'backups'

    if not backup_dir.exists():
        print("No backups directory found.")
        return []

    backups = sorted(backup_dir.glob('studex_backup_*.json'), reverse=True)

    if not backups:
        print("No backups found.")
        return []

    print(f"\n📁 Available backups ({len(backups)} found):")
    print("=" * 60)

    for i, backup in enumerate(backups, 1):
        size = backup.stat().st_size / (1024 * 1024)  # MB
        timestamp = backup.stem.replace('studex_backup_', '')
        print(f"{i}. {backup.name}")
        print(f"   Date: {timestamp[:8]} at {timestamp[9:11]}:{timestamp[11:13]}:{timestamp[13:15]}")
        print(f"   Size: {size:.2f} MB")
        print(f"   Path: {backup}")
        print()

    return backups


if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(description='Database Backup Tool for StudEx')
    parser.add_argument(
        'action',
        choices=['backup', 'restore', 'list'],
        help='Action to perform'
    )
    parser.add_argument(
        '--file',
        help='Backup file to restore (required for restore action)'
    )

    args = parser.parse_args()

    if args.action == 'backup':
        create_backup()

    elif args.action == 'restore':
        if not args.file:
            print("❌ Error: --file argument required for restore")
            print("Usage: python backup_database.py restore --file backups/studex_backup_TIMESTAMP.json")
            sys.exit(1)
        restore_backup(args.file)

    elif args.action == 'list':
        list_backups()
