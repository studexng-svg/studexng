from django.db import migrations, models
import studex.validators


def clear_default_placeholder(apps, schema_editor):
    User = apps.get_model('accounts', 'User')
    User.objects.filter(profile_image='profiles/default.jpg').update(profile_image=None)


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0013_user_school'),
    ]

    operations = [
        migrations.AlterField(
            model_name='user',
            name='profile_image',
            field=models.ImageField(
                blank=True,
                null=True,
                max_length=500,
                upload_to='profiles/',
                validators=[studex.validators.validate_image],
            ),
        ),
        migrations.RunPython(clear_default_placeholder, migrations.RunPython.noop),
    ]
