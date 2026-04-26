from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0012_remove_sellerapplication_id_back_url_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='school',
            field=models.CharField(blank=True, max_length=20, null=True),
        ),
    ]
