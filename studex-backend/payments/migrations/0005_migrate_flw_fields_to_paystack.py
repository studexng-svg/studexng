from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('payments', '0004_paymenttransaction_discount_amount_and_more'),
    ]

    operations = [
        migrations.RenameField(
            model_name='paymenttransaction',
            old_name='flw_response',
            new_name='paystack_response',
        ),
        migrations.RenameField(
            model_name='paymenttransaction',
            old_name='flw_transaction_id',
            new_name='paystack_transaction_id',
        ),
        migrations.RenameField(
            model_name='sellerbankaccount',
            old_name='flw_subaccount_id',
            new_name='paystack_subaccount_code',
        ),
    ]
