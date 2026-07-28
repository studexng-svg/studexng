from django.db import migrations


class Migration(migrations.Migration):
    """
    Step 1 of 3 in the DeliverySlot simplification (replaces BatchTemplate +
    DeliveryBatch). Removes Order.delivery_batch first, before delivery's own
    migration deletes the DeliveryBatch model it points to — avoids a
    cross-app FK-to-a-model-being-deleted ordering problem.
    """

    dependencies = [
        ('orders', '0016_orderitemaddon_quantity'),
        ('delivery', '0005_batchtemplate_deliverybatch_deliveryassignment_batch'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='order',
            name='delivery_batch',
        ),
    ]
