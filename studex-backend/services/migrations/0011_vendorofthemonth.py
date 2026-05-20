import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('services', '0010_rename_services_li_campus_idx_services_li_campus_74c2dc_idx_and_more'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='VendorOfTheMonth',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('month', models.DateField(help_text='First day of the month this award covers')),
                ('score', models.FloatField(default=0)),
                ('total_orders', models.IntegerField(default=0)),
                ('avg_rating', models.FloatField(default=0)),
                ('completion_rate', models.FloatField(default=0)),
                ('is_manual_override', models.BooleanField(default=False)),
                ('nominated_at', models.DateTimeField(auto_now_add=True)),
                ('vendor', models.ForeignKey(
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='vendor_of_month_awards',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'verbose_name': 'Vendor of the Month',
                'verbose_name_plural': 'Vendors of the Month',
                'ordering': ['-month'],
                'unique_together': {('month',)},
            },
        ),
    ]
