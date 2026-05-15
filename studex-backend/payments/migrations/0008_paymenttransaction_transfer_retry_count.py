from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('payments', '0007_transfer_recipient_and_transfer_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='paymenttransaction',
            name='transfer_retry_count',
            field=models.IntegerField(default=0),
        ),
    ]
