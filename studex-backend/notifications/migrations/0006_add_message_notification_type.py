from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('notifications', '0005_alter_notification_notification_type'),
    ]

    operations = [
        migrations.AlterField(
            model_name='notification',
            name='notification_type',
            field=models.CharField(choices=[('vendor_application', 'New Vendor Application'), ('new_listing', 'New Listing Needs Approval'), ('listing_approved', 'Listing Approved by Admin'), ('vendor_approved', 'Vendor Account Approved'), ('vendor_revoked', 'Vendor Account Deactivated'), ('new_booking_request', 'New Booking Request'), ('booking_paid', 'Booking Paid'), ('order_confirmed', 'Order Confirmed by Buyer'), ('booking_reminder_5min', 'Booking Starting in 5 Minutes'), ('booking_time_now', 'Booking Time Now'), ('booking_confirmed', 'Booking Confirmed by Vendor'), ('booking_cancelled', 'Booking Cancelled'), ('payment_received', 'Payment Received'), ('order_completed', 'Order Completed'), ('seller_approved', 'Seller Application Approved'), ('seller_rejected', 'Seller Application Rejected'), ('seller_revoked', 'Seller Status Revoked'), ('message', 'New Message')], max_length=30),
        ),
    ]
