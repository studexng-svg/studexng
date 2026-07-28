import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    """
    Step 2 of 3 in the DeliverySlot simplification. Replaces BatchTemplate +
    DeliveryBatch (a recurring template that needed a nightly job to
    generate a separate per-day row) with one DeliverySlot model that just
    applies every day forever — capacity is counted live from Order rows,
    never stored on a generated row. No real production data existed in
    either old model at the time of this migration (confirmed via a direct
    count before writing it), so both are dropped outright rather than
    migrated field-by-field.
    """

    dependencies = [
        ('delivery', '0005_batchtemplate_deliverybatch_deliveryassignment_batch'),
        ('orders', '0017_remove_order_delivery_batch'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.RemoveField(
            model_name='deliveryassignment',
            name='batch',
        ),
        migrations.DeleteModel(
            name='DeliveryBatch',
        ),
        migrations.DeleteModel(
            name='BatchTemplate',
        ),
        migrations.CreateModel(
            name='DeliverySlot',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('campus', models.CharField(choices=[('pau', 'PAU'), ('futo', 'FUTO'), ('imsu', 'IMSU')], max_length=20)),
                ('display_name', models.CharField(max_length=100)),
                ('delivery_time', models.TimeField()),
                ('cutoff_offset_minutes', models.PositiveIntegerField(default=15, help_text='Ordering closes this many minutes before delivery_time.')),
                ('max_orders', models.PositiveIntegerField()),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('vendor', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='delivery_slots', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'Delivery Slot',
                'verbose_name_plural': 'Delivery Slots',
                'ordering': ['vendor_id', 'delivery_time'],
            },
        ),
        migrations.AddField(
            model_name='deliveryassignment',
            name='delivery_slot',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='assignments', to='delivery.deliveryslot'),
        ),
    ]
