from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('notifications', '0010_groknotificationlog'),
    ]

    operations = [
        migrations.CreateModel(
            name='PlatformSettings',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('grok_notifications_enabled', models.BooleanField(
                    default=True,
                    help_text='When off, the scheduled Groq AI broadcasts are silently skipped.',
                )),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'Platform Settings',
                'verbose_name_plural': 'Platform Settings',
            },
        ),
    ]
