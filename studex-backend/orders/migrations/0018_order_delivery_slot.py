import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    """Step 3 of 3 in the DeliverySlot simplification — adds Order.delivery_slot now that delivery.DeliverySlot exists."""

    dependencies = [
        ('orders', '0017_remove_order_delivery_batch'),
        ('delivery', '0006_deliveryslot'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='delivery_slot',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='orders', to='delivery.deliveryslot'),
        ),
    ]
