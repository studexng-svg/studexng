from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0008_order_delivery_proof'),
    ]

    operations = [
        migrations.AddField(
            model_name='dispute',
            name='evidence_image_1',
            field=models.URLField(blank=True, help_text='Cloudinary URL for first evidence image'),
        ),
        migrations.AddField(
            model_name='dispute',
            name='evidence_image_2',
            field=models.URLField(blank=True, help_text='Cloudinary URL for second evidence image'),
        ),
    ]
