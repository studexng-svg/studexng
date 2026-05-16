from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0005_alter_order_status'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='current_status',
            field=models.CharField(default='paid', max_length=30),
        ),
        migrations.AddField(
            model_name='order',
            name='estimated_time',
            field=models.PositiveIntegerField(
                blank=True,
                null=True,
                help_text='Estimated minutes to completion',
            ),
        ),
        migrations.CreateModel(
            name='OrderStatus',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('status', models.CharField(
                    choices=[
                        ('paid', 'Payment Confirmed'),
                        ('confirmed', 'Order Confirmed'),
                        ('preparing', 'Preparing'),
                        ('ready', 'Ready for Pickup'),
                        ('delivered', 'Delivered'),
                        ('cancelled', 'Cancelled'),
                    ],
                    max_length=30,
                )),
                ('note', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('order', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='status_history',
                    to='orders.order',
                )),
                ('updated_by', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'ordering': ['created_at'],
            },
        ),
    ]
