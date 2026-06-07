from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('payments', '0010_paymenttransaction_paystack_charge_fee_transfer_fee'),
    ]

    operations = [
        migrations.AddField(
            model_name='paymenttransaction',
            name='deal_discount_amount',
            field=models.DecimalField(
                decimal_places=2, default=0, max_digits=10,
                help_text="Total deal discount applied at checkout — vendor absorbs this, they receive deal price not full price",
            ),
        ),
    ]
