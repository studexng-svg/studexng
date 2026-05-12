from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0016_id_fields_to_filefield_add_nin'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='nin',
            field=models.CharField(blank=True, max_length=11, null=True),
        ),
        migrations.AddField(
            model_name='user',
            name='verification_type',
            field=models.CharField(
                blank=True,
                choices=[('matric', 'Matric Number'), ('nin', 'NIN')],
                max_length=10,
                null=True,
            ),
        ),
    ]
