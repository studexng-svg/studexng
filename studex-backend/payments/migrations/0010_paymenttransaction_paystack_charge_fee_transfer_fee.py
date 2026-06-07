from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('payments', '0009_dynamic_service_fee'),
    ]

    operations = [
        migrations.AddField(
            model_name='paymenttransaction',
            name='paystack_charge_fee',
            field=models.DecimalField(
                decimal_places=2, default=0, max_digits=10,
                help_text="Paystack inbound charge fee absorbed by StudEx (1.5% + ₦100 flat if applicable)",
            ),
        ),
        migrations.AddField(
            model_name='paymenttransaction',
            name='transfer_fee',
            field=models.DecimalField(
                decimal_places=2, default=0, max_digits=10,
                help_text="Paystack outbound transfer fee deducted from StudEx balance when paying vendor",
            ),
        ),
    ]
