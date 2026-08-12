# accounts/test_admin_rider_coverage.py
"""
Admin dashboard surface for setting which campus a rider covers
(AdminUserDetailView.patch, accounts/admin_views.py -> User.school). Before
this, the only way to see or change a rider's school was raw Django admin,
and delivery.assignment._pick_least_busy_rider didn't even filter by it —
auto-assignment picked the least-busy rider platform-wide regardless of
campus. Covers the /api/admin/users/{id}/ PATCH path the "Rider Coverage"
section on /admin/users/[id] actually uses.
"""
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status

from accounts.models import User


class AdminRiderCoverageTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            username='rc_admin', email='rc_admin@pau.edu.ng', password='pass123', is_staff=True,
        )
        self.rider = User.objects.create_user(
            username='rc_rider', email='rc_rider@pau.edu.ng', password='pass123',
            user_type='rider', school='pau',
        )
        self.client.force_authenticate(user=self.admin)

    def _url(self, user):
        return f'/api/admin/users/{user.id}/'

    def test_admin_can_set_rider_campus(self):
        res = self.client.patch(self._url(self.rider), {'school': 'futo'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.rider.refresh_from_db()
        self.assertEqual(self.rider.school, 'futo')
        self.assertEqual(res.data['school'], 'futo')

    def test_school_is_normalized_case_and_whitespace(self):
        res = self.client.patch(self._url(self.rider), {'school': ' FUTO '}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.rider.refresh_from_db()
        self.assertEqual(self.rider.school, 'futo')

    def test_invalid_campus_rejected(self):
        res = self.client.patch(self._url(self.rider), {'school': 'unilag'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.rider.refresh_from_db()
        self.assertEqual(self.rider.school, 'pau')  # unchanged

    def test_not_restricted_to_riders(self):
        """school is a general profile field — any user_type can have it corrected."""
        buyer = User.objects.create_user(
            username='rc_buyer', email='rc_buyer@pau.edu.ng', password='pass123', school='pau',
        )
        res = self.client.patch(self._url(buyer), {'school': 'imsu'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        buyer.refresh_from_db()
        self.assertEqual(buyer.school, 'imsu')
