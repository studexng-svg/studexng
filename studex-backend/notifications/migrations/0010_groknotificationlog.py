from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('notifications', '0009_alter_notification_notification_type'),
    ]

    operations = [
        migrations.AlterField(
            model_name='notification',
            name='notification_type',
            field=models.CharField(
                max_length=30,
                choices=[
                    ('vendor_application', 'New Vendor Application'),
                    ('new_listing', 'New Listing Needs Approval'),
                    ('listing_approved', 'Listing Approved by Admin'),
                    ('vendor_approved', 'Vendor Account Approved'),
                    ('vendor_revoked', 'Vendor Account Deactivated'),
                    ('new_booking_request', 'New Booking Request'),
                    ('booking_paid', 'Booking Paid'),
                    ('order_confirmed', 'Order Confirmed by Buyer'),
                    ('booking_reminder_5min', 'Booking Starting in 5 Minutes'),
                    ('booking_time_now', 'Booking Time Now'),
                    ('booking_confirmed', 'Booking Confirmed by Vendor'),
                    ('booking_cancelled', 'Booking Cancelled'),
                    ('payment_received', 'Payment Received'),
                    ('order_completed', 'Order Completed'),
                    ('seller_approved', 'Seller Application Approved'),
                    ('seller_rejected', 'Seller Application Rejected'),
                    ('seller_revoked', 'Seller Status Revoked'),
                    ('message', 'New Message'),
                    ('admin_message', 'Message from Admin'),
                    ('bank_account_added', 'Bank Account Added'),
                    ('ai_tip', 'AI Tip / Engagement Message'),
                ],
            ),
        ),
        migrations.CreateModel(
            name='GrokNotificationLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('audience', models.CharField(
                    max_length=20,
                    choices=[('students', 'Students'), ('vendors', 'Vendors'), ('all', 'All Users')],
                )),
                ('school', models.CharField(max_length=20, blank=True, default='')),
                ('title', models.CharField(max_length=200)),
                ('message', models.TextField()),
                ('sent_count', models.IntegerField(default=0)),
                ('triggered_by', models.CharField(max_length=20, default='scheduler')),
                ('grok_model', models.CharField(max_length=50, default='grok-3-mini')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={'ordering': ['-created_at'], 'verbose_name': 'Grok Notification Log'},
        ),
    ]
