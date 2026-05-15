from django.db import migrations
import accounts.fields


def _encrypt_existing_nins(apps, schema_editor):
    from accounts.fields import encrypt_field, _ENC_PREFIX
    User = apps.get_model('accounts', 'User')
    to_update = []
    for user in User.objects.filter(nin__isnull=False).exclude(nin=''):
        raw = user.nin
        if not raw.startswith(_ENC_PREFIX):
            encrypted = encrypt_field(raw)
            if encrypted != raw:  # Only update if key is configured and value changed
                user.nin = encrypted
                to_update.append(user)
    if to_update:
        User.objects.bulk_update(to_update, ['nin'])


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0017_user_nin_verification_type'),
    ]

    operations = [
        # Create the shared database cache table.
        # Replaces per-worker LocMemCache so OTP rate limits, payment init data,
        # and other security-relevant cached state is shared across all workers.
        migrations.RunSQL(
            sql="""
                CREATE TABLE IF NOT EXISTS studex_cache_table (
                    cache_key varchar(255) NOT NULL PRIMARY KEY,
                    value text NOT NULL,
                    expires timestamp with time zone NOT NULL
                );
            """,
            reverse_sql="DROP TABLE IF EXISTS studex_cache_table;",
        ),

        # Extend NIN field to hold Fernet-encrypted ciphertext (~110 chars).
        # Falls back to storing plaintext if FIELD_ENCRYPTION_KEY is not set.
        migrations.AlterField(
            model_name='user',
            name='nin',
            field=accounts.fields.EncryptedCharField(blank=True, max_length=200, null=True),
        ),

        # Immediately encrypt any existing plaintext NINs in the database.
        # Skips gracefully if FIELD_ENCRYPTION_KEY is not configured.
        migrations.RunPython(
            code=_encrypt_existing_nins,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
