# delivery/test_admin_batch_views.py
"""
Test suite for the admin batch-management API (Phase 1 — Food Commerce
Engine, Step 7 — FR-12 capacity visibility, FR-13 same-day overrides) and
the DeliveryBatchAdmin.force_close Django Admin action (§14 — "same shape
as VendorDebtAdmin.write_off").
"""
from datetime import date, time, timedelta

from django.contrib.admin.sites import AdminSite
from django.test import TestCase, RequestFactory
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from delivery.models import BatchTemplate, DeliveryBatch


class AdminBatchViewsTestBase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            username='abv_admin', email='abv_admin@pau.edu.ng', password='pass123', is_staff=True,
        )
        self.non_admin = User.objects.create_user(
            username='abv_user', email='abv_user@pau.edu.ng', password='pass123',
        )
        self.vendor = User.objects.create_user(
            username='abv_vendor', email='abv_vendor@pau.edu.ng', password='pass123',
        )


class AdminBatchTemplateViewsTests(AdminBatchViewsTestBase):
    def test_non_admin_forbidden(self):
        self.client.force_authenticate(user=self.non_admin)
        response = self.client.get('/api/admin/batch-templates/')
        self.assertEqual(response.status_code, 403)

    def test_admin_can_create_template(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post('/api/admin/batch-templates/', {
            'vendor': self.vendor.id, 'campus': 'pau', 'display_name': 'Lunch Run',
            'delivery_time': '13:00:00', 'cutoff_offset_minutes': 15, 'max_orders': 10,
            'days_of_week': [0, 1, 2, 3, 4],
        }, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(BatchTemplate.objects.count(), 1)

    def test_admin_can_list_templates_filtered_by_vendor(self):
        BatchTemplate.objects.create(
            vendor=self.vendor, campus='pau', display_name='Lunch', delivery_time=time(13, 0),
            cutoff_offset_minutes=15, max_orders=10, days_of_week=[0, 1, 2, 3, 4],
        )
        other_vendor = User.objects.create_user(username='abv_vendor2', email='abv_vendor2@pau.edu.ng', password='pass123')
        BatchTemplate.objects.create(
            vendor=other_vendor, campus='pau', display_name='Dinner', delivery_time=time(19, 0),
            cutoff_offset_minutes=15, max_orders=5, days_of_week=[0, 1, 2, 3, 4],
        )

        self.client.force_authenticate(user=self.admin)
        response = self.client.get(f'/api/admin/batch-templates/?vendor_id={self.vendor.id}')

        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['display_name'], 'Lunch')

    def test_admin_can_edit_template_without_affecting_others(self):
        template = BatchTemplate.objects.create(
            vendor=self.vendor, campus='pau', display_name='Lunch', delivery_time=time(13, 0),
            cutoff_offset_minutes=15, max_orders=10, days_of_week=[0, 1, 2, 3, 4],
        )
        self.client.force_authenticate(user=self.admin)
        response = self.client.patch(f'/api/admin/batch-templates/{template.id}/', {'max_orders': 20}, format='json')

        self.assertEqual(response.status_code, 200)
        template.refresh_from_db()
        self.assertEqual(template.max_orders, 20)

    def test_admin_can_delete_template(self):
        template = BatchTemplate.objects.create(
            vendor=self.vendor, campus='pau', display_name='Lunch', delivery_time=time(13, 0),
            cutoff_offset_minutes=15, max_orders=10, days_of_week=[0, 1, 2, 3, 4],
        )
        self.client.force_authenticate(user=self.admin)
        response = self.client.delete(f'/api/admin/batch-templates/{template.id}/')

        self.assertEqual(response.status_code, 204)
        self.assertFalse(BatchTemplate.objects.filter(id=template.id).exists())

    def test_edit_nonexistent_template_404(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.patch('/api/admin/batch-templates/999999/', {'max_orders': 5}, format='json')
        self.assertEqual(response.status_code, 404)


class AdminDeliveryBatchViewsTests(AdminBatchViewsTestBase):
    def setUp(self):
        super().setUp()
        self.template = BatchTemplate.objects.create(
            vendor=self.vendor, campus='pau', display_name='Lunch', delivery_time=time(13, 0),
            cutoff_offset_minutes=15, max_orders=10, days_of_week=[0, 1, 2, 3, 4],
        )
        now = timezone.now()
        self.batch = DeliveryBatch.objects.create(
            vendor=self.vendor, template=self.template, campus='pau', batch_date=date.today(),
            display_name='Lunch', delivery_time=now + timedelta(hours=2), cutoff_time=now + timedelta(hours=1),
            max_orders=10, current_orders=4, status='open',
        )

    def test_non_admin_forbidden(self):
        self.client.force_authenticate(user=self.non_admin)
        response = self.client.get('/api/admin/delivery-batches/')
        self.assertEqual(response.status_code, 403)

    def test_capacity_visible_in_list(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get('/api/admin/delivery-batches/')

        self.assertEqual(response.status_code, 200)
        row = response.data[0]
        self.assertEqual(row['current_orders'], 4)
        self.assertEqual(row['max_orders'], 10)
        self.assertEqual(row['vendor_username'], 'abv_vendor')

    def test_list_filtered_by_campus_and_date(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(f'/api/admin/delivery-batches/?campus=pau&batch_date={date.today().isoformat()}')
        self.assertEqual(len(response.data), 1)

        response_empty = self.client.get('/api/admin/delivery-batches/?campus=futo')
        self.assertEqual(len(response_empty.data), 0)

    def test_admin_can_override_one_days_capacity_time_and_name(self):
        """FR-13: override this day's fields without touching the template."""
        self.client.force_authenticate(user=self.admin)
        response = self.client.patch(f'/api/admin/delivery-batches/{self.batch.id}/', {
            'max_orders': 25, 'display_name': 'Special Lunch Run',
        }, format='json')

        self.assertEqual(response.status_code, 200)
        self.batch.refresh_from_db()
        self.assertEqual(self.batch.max_orders, 25)
        self.assertEqual(self.batch.display_name, 'Special Lunch Run')

        self.template.refresh_from_db()
        self.assertEqual(self.template.max_orders, 10)  # template untouched
        self.assertEqual(self.template.display_name, 'Lunch')  # template untouched

    def test_current_orders_is_read_only(self):
        """The live reservation counter must only ever move via delivery.capacity."""
        self.client.force_authenticate(user=self.admin)
        response = self.client.patch(f'/api/admin/delivery-batches/{self.batch.id}/', {
            'current_orders': 999,
        }, format='json')

        self.assertEqual(response.status_code, 200)
        self.batch.refresh_from_db()
        self.assertEqual(self.batch.current_orders, 4)  # unchanged despite the attempted override

    def test_vendor_and_batch_date_are_read_only(self):
        other_vendor = User.objects.create_user(username='abv_vendor3', email='abv_vendor3@pau.edu.ng', password='pass123')
        self.client.force_authenticate(user=self.admin)
        response = self.client.patch(f'/api/admin/delivery-batches/{self.batch.id}/', {
            'vendor': other_vendor.id, 'batch_date': '2099-01-01',
        }, format='json')

        self.assertEqual(response.status_code, 200)
        self.batch.refresh_from_db()
        self.assertEqual(self.batch.vendor_id, self.vendor.id)
        self.assertEqual(self.batch.batch_date, date.today())

    def test_edit_nonexistent_batch_404(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.patch('/api/admin/delivery-batches/999999/', {'max_orders': 5}, format='json')
        self.assertEqual(response.status_code, 404)


class DeliveryBatchAdminForceCloseTests(TestCase):
    """Same admin-action test convention as payments/test_vendor_debt.py::VendorDebtAdminTests."""

    def setUp(self):
        from delivery.admin import DeliveryBatchAdmin
        self.admin_instance = DeliveryBatchAdmin(DeliveryBatch, AdminSite())
        self.factory = RequestFactory()
        self.superuser = User.objects.create_superuser(
            username='fc_admin', email='fc_admin@pau.edu.ng', password='pass12345',
        )
        self.vendor = User.objects.create_user(username='fc_vendor', email='fc_vendor@pau.edu.ng', password='pass123')

    def _request(self):
        req = self.factory.post('/admin/delivery/deliverybatch/')
        req.user = self.superuser
        from django.contrib.messages.storage.fallback import FallbackStorage
        setattr(req, 'session', {})
        setattr(req, '_messages', FallbackStorage(req))
        return req

    def _make_batch(self, status='open'):
        now = timezone.now()
        return DeliveryBatch.objects.create(
            vendor=self.vendor, campus='pau', batch_date=date.today(), display_name='Lunch',
            delivery_time=now + timedelta(hours=1), cutoff_time=now - timedelta(minutes=5),  # past cutoff
            max_orders=10, current_orders=8, status=status,
        )

    def test_force_close_closes_open_batch(self):
        batch = self._make_batch(status='open')
        self.admin_instance.force_close(self._request(), DeliveryBatch.objects.filter(id=batch.id))
        batch.refresh_from_db()
        self.assertEqual(batch.status, 'closed')

    def test_force_close_does_not_recount_already_closed_batches(self):
        batch = self._make_batch(status='closed')
        # Just confirming it's a no-op / doesn't error on an already-closed row.
        self.admin_instance.force_close(self._request(), DeliveryBatch.objects.filter(id=batch.id))
        batch.refresh_from_db()
        self.assertEqual(batch.status, 'closed')
