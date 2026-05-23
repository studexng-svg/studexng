from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0006_order_tracking'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='delivery_location',
            field=models.CharField(blank=True, default='', max_length=200),
        ),
    ]
