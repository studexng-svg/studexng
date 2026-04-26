from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('services', '0008_seed_categories'),
    ]

    operations = [
        migrations.AddField(
            model_name='listing',
            name='campus',
            field=models.CharField(
                choices=[('pau', 'PAU'), ('futo', 'FUTO')],
                default='pau',
                help_text="Set automatically from vendor's school on creation",
                max_length=20,
            ),
        ),
        migrations.AddIndex(
            model_name='listing',
            index=models.Index(fields=['campus'], name='services_li_campus_idx'),
        ),
        migrations.AddIndex(
            model_name='listing',
            index=models.Index(fields=['campus', 'is_available'], name='services_li_campus_avail_idx'),
        ),
    ]
