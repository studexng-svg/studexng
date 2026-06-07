from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('services', '0015_deal'),
    ]

    operations = [
        migrations.AddField(
            model_name='listing',
            name='discount_percent',
            field=models.IntegerField(
                default=0,
                help_text='Vendor-set discount percentage (0 = no discount, 1-100 for a sale)',
            ),
        ),
    ]
