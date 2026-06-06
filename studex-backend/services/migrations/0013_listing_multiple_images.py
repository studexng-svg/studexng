from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('services', '0012_add_created_at_indexes'),
    ]

    operations = [
        migrations.AddField(
            model_name='listing',
            name='image2',
            field=models.URLField(blank=True, max_length=500, null=True),
        ),
        migrations.AddField(
            model_name='listing',
            name='image3',
            field=models.URLField(blank=True, max_length=500, null=True),
        ),
        migrations.AddField(
            model_name='listing',
            name='image4',
            field=models.URLField(blank=True, max_length=500, null=True),
        ),
        migrations.AddField(
            model_name='listing',
            name='image5',
            field=models.URLField(blank=True, max_length=500, null=True),
        ),
    ]
