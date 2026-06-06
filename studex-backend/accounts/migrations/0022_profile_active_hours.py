from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0021_vendor'),
    ]

    operations = [
        migrations.AddField(
            model_name='profile',
            name='available_days',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name='profile',
            name='opening_time',
            field=models.TimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='profile',
            name='closing_time',
            field=models.TimeField(blank=True, null=True),
        ),
    ]
