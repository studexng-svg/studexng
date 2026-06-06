from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('services', '0013_listing_multiple_images'),
    ]

    operations = [
        migrations.AlterField(
            model_name='category',
            name='campus',
            field=models.CharField(
                choices=[('pau', 'PAU'), ('futo', 'FUTO'), ('imsu', 'IMSU'), ('all', 'All Campuses')],
                default='pau',
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name='listing',
            name='campus',
            field=models.CharField(
                choices=[('pau', 'PAU'), ('futo', 'FUTO'), ('imsu', 'IMSU')],
                default='pau',
                help_text="Set automatically from vendor's school on creation",
                max_length=20,
            ),
        ),
    ]
