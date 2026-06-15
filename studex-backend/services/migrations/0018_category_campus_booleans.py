from django.db import migrations, models


def campus_to_booleans(apps, schema_editor):
    Category = apps.get_model('services', 'Category')
    for cat in Category.objects.all():
        c = getattr(cat, 'campus', '') or ''
        cat.is_pau  = c in ('pau',  'all')
        cat.is_futo = c in ('futo', 'all')
        cat.is_imsu = c in ('imsu', 'all')
        cat.save(update_fields=['is_pau', 'is_futo', 'is_imsu'])


class Migration(migrations.Migration):

    dependencies = [
        ('services', '0017_vendorofthemonth_campus'),
    ]

    operations = [
        # 1. Add the three boolean columns
        migrations.AddField(
            model_name='category',
            name='is_pau',
            field=models.BooleanField(default=False, verbose_name='PAU'),
        ),
        migrations.AddField(
            model_name='category',
            name='is_futo',
            field=models.BooleanField(default=False, verbose_name='FUTO'),
        ),
        migrations.AddField(
            model_name='category',
            name='is_imsu',
            field=models.BooleanField(default=False, verbose_name='IMSU'),
        ),
        # 2. Copy data from old campus field → new booleans
        migrations.RunPython(campus_to_booleans, migrations.RunPython.noop),
        # 3. Drop the old campus field
        migrations.RemoveField(
            model_name='category',
            name='campus',
        ),
    ]
