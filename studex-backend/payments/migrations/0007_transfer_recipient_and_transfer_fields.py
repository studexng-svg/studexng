from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('payments', '0006_rename_flw_response_paymenttransaction_paystack_response_and_more'),
    ]

    operations = [
        # Paystack Transfer recipient code for instant vendor payouts (RCP_xxx)
        migrations.AddField(
            model_name='sellerbankaccount',
            name='paystack_recipient_code',
            field=models.CharField(blank=True, max_length=100, null=True),
        ),
        # Transfer reference returned by POST /transfer
        migrations.AddField(
            model_name='paymenttransaction',
            name='transfer_reference',
            field=models.CharField(blank=True, max_length=200, null=True),
        ),
        # Transfer status (e.g. "pending", "success", "failed")
        migrations.AddField(
            model_name='paymenttransaction',
            name='transfer_status',
            field=models.CharField(blank=True, max_length=50, null=True),
        ),
    ]
