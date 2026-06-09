from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0007_order_delivery_location'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='delivery_proof_1',
            field=models.URLField(blank=True, max_length=500, null=True),
        ),
        migrations.AddField(
            model_name='order',
            name='delivery_proof_2',
            field=models.URLField(blank=True, max_length=500, null=True),
        ),
    ]
