from django.db import migrations, models


def food_to_product(apps, schema_editor):
    Listing = apps.get_model('services', 'Listing')
    Listing.objects.filter(listing_type='food').update(listing_type='product')


class Migration(migrations.Migration):

    dependencies = [
        ('services', '0025_listingvariant'),
    ]

    operations = [
        migrations.RunPython(food_to_product, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='listing',
            name='listing_type',
            field=models.CharField(
                choices=[('service', 'Service'), ('product', 'Product')],
                default='service',
                help_text='Type of listing — affects inventory tracking',
                max_length=10,
            ),
        ),
    ]
