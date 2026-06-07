from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('services', '0014_add_imsu_campus'),
    ]

    operations = [
        migrations.CreateModel(
            name='Deal',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('discount_percent', models.IntegerField(default=0, help_text='Discount percentage (0-100)')),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('listing', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='deal', to='services.listing')),
            ],
            options={
                'verbose_name': 'Deal',
                'verbose_name_plural': 'Deals',
                'ordering': ['-created_at'],
            },
        ),
    ]
