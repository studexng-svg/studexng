from django.db import migrations, models
import studex.validators


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0014_alter_user_profile_image'),
    ]

    operations = [
        migrations.AddField(
            model_name='sellerapplication',
            name='admission_letter',
            field=models.FileField(
                blank=True,
                null=True,
                upload_to='seller_verification/admission/',
                validators=[studex.validators.validate_document],
                help_text='Admission letter or proof of enrollment (PDF, JPG, PNG)',
            ),
        ),
        migrations.AlterField(
            model_name='sellerapplication',
            name='id_front',
            field=models.ImageField(
                blank=True,
                null=True,
                upload_to='seller_verification/id_front/',
                validators=[studex.validators.validate_image],
                help_text='Front of student ID card',
            ),
        ),
        migrations.AlterField(
            model_name='sellerapplication',
            name='id_back',
            field=models.ImageField(
                blank=True,
                null=True,
                upload_to='seller_verification/id_back/',
                validators=[studex.validators.validate_image],
                help_text='Back of student ID card',
            ),
        ),
    ]
