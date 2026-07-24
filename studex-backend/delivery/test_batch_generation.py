# delivery/test_batch_generation.py
"""
Test suite for scheduler.generate_daily_delivery_batches — the recurring
BatchTemplate -> daily DeliveryBatch generation job (Phase 1 — Food Commerce
Engine, Step 4).
"""
from datetime import date, time, datetime, timedelta
from zoneinfo import ZoneInfo

from django.test import TestCase

from accounts.models import User, Vendor, VendorType
from delivery.models import BatchTemplate, DeliveryBatch
from scheduler import generate_daily_delivery_batches, LAGOS_TZ


class GenerateDailyDeliveryBatchesTests(TestCase):
    def setUp(self):
        self.food = VendorType.objects.get(name='food')
        self.vendor = User.objects.create_user(username='gen_vendor', email='gen_vendor@pau.edu.ng', password='pass123')
        Vendor.objects.create(user=self.vendor, vendor_type=self.food)
        self.today_weekday = datetime.now(LAGOS_TZ).date().weekday()
        self.other_weekday = (self.today_weekday + 1) % 7

    def test_generates_batch_for_template_matching_today(self):
        template = BatchTemplate.objects.create(
            vendor=self.vendor, campus='pau', display_name='Lunch Run',
            delivery_time=time(13, 0), cutoff_offset_minutes=15, max_orders=10,
            days_of_week=[self.today_weekday], is_active=True,
        )
        generate_daily_delivery_batches()
        batch = DeliveryBatch.objects.get(vendor=self.vendor, template=template, batch_date=date.today())
        self.assertEqual(batch.max_orders, 10)
        self.assertEqual(batch.campus, 'pau')
        self.assertEqual(batch.status, 'open')
        self.assertEqual(batch.current_orders, 0)

    def test_cutoff_time_is_delivery_time_minus_offset(self):
        template = BatchTemplate.objects.create(
            vendor=self.vendor, campus='pau', display_name='Lunch Run',
            delivery_time=time(13, 0), cutoff_offset_minutes=20, max_orders=10,
            days_of_week=[self.today_weekday], is_active=True,
        )
        generate_daily_delivery_batches()
        batch = DeliveryBatch.objects.get(template=template)
        expected_delivery = datetime.combine(date.today(), time(13, 0), tzinfo=LAGOS_TZ)
        self.assertEqual(batch.delivery_time, expected_delivery)
        self.assertEqual(batch.cutoff_time, expected_delivery - timedelta(minutes=20))

    def test_skips_template_not_matching_today(self):
        BatchTemplate.objects.create(
            vendor=self.vendor, campus='pau', display_name='Weekend Only',
            delivery_time=time(13, 0), cutoff_offset_minutes=15, max_orders=10,
            days_of_week=[self.other_weekday], is_active=True,
        )
        generate_daily_delivery_batches()
        self.assertEqual(DeliveryBatch.objects.count(), 0)

    def test_skips_inactive_template(self):
        BatchTemplate.objects.create(
            vendor=self.vendor, campus='pau', display_name='Paused',
            delivery_time=time(13, 0), cutoff_offset_minutes=15, max_orders=10,
            days_of_week=[self.today_weekday], is_active=False,
        )
        generate_daily_delivery_batches()
        self.assertEqual(DeliveryBatch.objects.count(), 0)

    def test_idempotent_on_double_run(self):
        BatchTemplate.objects.create(
            vendor=self.vendor, campus='pau', display_name='Lunch Run',
            delivery_time=time(13, 0), cutoff_offset_minutes=15, max_orders=10,
            days_of_week=[self.today_weekday], is_active=True,
        )
        generate_daily_delivery_batches()
        generate_daily_delivery_batches()
        self.assertEqual(DeliveryBatch.objects.count(), 1)

    def test_editing_template_does_not_touch_already_generated_batch(self):
        template = BatchTemplate.objects.create(
            vendor=self.vendor, campus='pau', display_name='Lunch Run',
            delivery_time=time(13, 0), cutoff_offset_minutes=15, max_orders=10,
            days_of_week=[self.today_weekday], is_active=True,
        )
        generate_daily_delivery_batches()
        template.max_orders = 999
        template.save(update_fields=['max_orders'])

        generate_daily_delivery_batches()  # same day, re-run
        batch = DeliveryBatch.objects.get(template=template, batch_date=date.today())
        self.assertEqual(batch.max_orders, 10)  # unchanged — same-day override is a separate admin action

    def test_multiple_templates_generate_independently(self):
        t1 = BatchTemplate.objects.create(
            vendor=self.vendor, campus='pau', display_name='Lunch',
            delivery_time=time(13, 0), cutoff_offset_minutes=15, max_orders=10,
            days_of_week=[self.today_weekday], is_active=True,
        )
        t2 = BatchTemplate.objects.create(
            vendor=self.vendor, campus='pau', display_name='Dinner',
            delivery_time=time(19, 0), cutoff_offset_minutes=15, max_orders=6,
            days_of_week=[self.today_weekday], is_active=True,
        )
        generate_daily_delivery_batches()
        self.assertEqual(DeliveryBatch.objects.filter(vendor=self.vendor).count(), 2)
        self.assertTrue(DeliveryBatch.objects.filter(template=t1, max_orders=10).exists())
        self.assertTrue(DeliveryBatch.objects.filter(template=t2, max_orders=6).exists())
