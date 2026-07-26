# services/test_hero_slides.py
"""
Regression tests for the admin-uploaded hero slideshow (HeroSlide model +
/api/services/hero-slides/). The home feed hero (HomePageClient.tsx) renders
whatever comes back here, in order — these tests are the proof that "any
image an admin uploads shows up on the hero" actually holds.

HeroSlide.image is a real Cloudinary-backed ImageField (see studex/settings.py
STORAGES) — without overriding storage to local filesystem here, every
.save() would make a real network call to Cloudinary's API and reject the
fake test bytes below with "Invalid image file". override_settings swaps
storage to FileSystemStorage for just this test class.
"""
import shutil
import tempfile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from services.models import HeroSlide

_MEDIA_ROOT = tempfile.mkdtemp()
_TEST_STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}


@override_settings(MEDIA_ROOT=_MEDIA_ROOT, STORAGES=_TEST_STORAGES)
class HeroSlideListViewTests(TestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(_MEDIA_ROOT, ignore_errors=True)

    def setUp(self):
        self.client = APIClient()
        self.url = '/api/services/hero-slides/'

    def _make_slide(self, order, active=True, name='slide.jpg'):
        return HeroSlide.objects.create(
            image=SimpleUploadedFile(name, b'fake-image-bytes', content_type='image/jpeg'),
            display_order=order,
            is_active=active,
        )

    def test_no_slides_returns_empty_list(self):
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data, [])

    def test_active_slides_returned_in_display_order(self):
        self._make_slide(order=2, name='second.jpg')
        self._make_slide(order=0, name='first.jpg')
        self._make_slide(order=1, name='third.jpg')

        res = self.client.get(self.url)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 3)
        self.assertEqual(
            [row['display_order'] for row in res.data],
            [0, 1, 2],
        )

    def test_inactive_slide_excluded(self):
        self._make_slide(order=0, active=True, name='shown.jpg')
        self._make_slide(order=1, active=False, name='hidden.jpg')

        res = self.client.get(self.url)
        self.assertEqual(len(res.data), 1)

    def test_image_url_is_present_and_absolute(self):
        self._make_slide(order=0)
        res = self.client.get(self.url)
        self.assertEqual(len(res.data), 1)
        image_url = res.data[0]['image']
        self.assertIsNotNone(image_url)
        self.assertTrue(image_url.startswith('http'))

    def test_endpoint_is_public_no_auth_required(self):
        self._make_slide(order=0)
        # No force_login/force_authenticate anywhere in this test class.
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, 200)
