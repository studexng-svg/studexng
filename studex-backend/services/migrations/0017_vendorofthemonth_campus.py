from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('services', '0016_listing_discount_percent'),
    ]

    operations = [
        migrations.AddField(
            model_name='vendorofthemonth',
            name='campus',
            field=models.CharField(
                choices=[('pau', 'PAU'), ('futo', 'FUTO'), ('imsu', 'IMSU')],
                default='futo',
                max_length=10,
            ),
        ),
        migrations.AlterUniqueTogether(
            name='vendorofthemonth',
            unique_together={('month', 'campus')},
        ),
    ]
