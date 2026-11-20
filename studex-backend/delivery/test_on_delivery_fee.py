"""
Tests for the 'pay delivery fee on delivery' mode (Vendor.delivery_fee_mode).

The money rule being locked in: an on_delivery vendor is NEVER charged the
delivery fee at checkout (get_delivery_fee_quote returns 0); instead the amount
to collect in cash on arrival is get_on_delivery_fee. The food itself is still
paid online — only the delivery fee moves to on-arrival.
"""
from decimal import Decimal

from django.test import TestCase

from accounts.models import User, Vendor
from delivery.fees import get_delivery_fee_quote, get_on_delivery_fee


class OnDeliveryFeeTests(TestCase):
    def _vendor(self, *, fee, mode):
        u = User.objects.create_user(
            username=f"v_{mode}_{fee}", email=f"v_{mode}_{fee}@pau.edu.ng",
            password="x", user_type="vendor",
        )
        Vendor.objects.create(user=u, delivery_fee=Decimal(str(fee)), delivery_fee_mode=mode)
        return u

    def test_on_delivery_fee_returned_for_on_delivery_vendor(self):
        u = self._vendor(fee=500, mode="on_delivery")
        self.assertEqual(get_on_delivery_fee(u), Decimal("500"))

    def test_on_delivery_vendor_not_charged_at_checkout(self):
        u = self._vendor(fee=500, mode="on_delivery")
        fee, waived = get_delivery_fee_quote(u)
        self.assertEqual(fee, Decimal("0"))
        self.assertFalse(waived)

    def test_prepaid_vendor_has_no_on_delivery_fee(self):
        u = self._vendor(fee=500, mode="prepaid")
        self.assertEqual(get_on_delivery_fee(u), Decimal("0"))

    def test_on_delivery_with_zero_fee_collects_nothing(self):
        u = self._vendor(fee=0, mode="on_delivery")
        self.assertEqual(get_on_delivery_fee(u), Decimal("0"))

    def test_no_vendor_row_is_safe(self):
        u = User.objects.create_user(
            username="plain", email="plain@pau.edu.ng", password="x",
        )
        self.assertEqual(get_on_delivery_fee(u), Decimal("0"))


class OrderOnDeliveryFieldTests(TestCase):
    def test_order_serializer_exposes_on_delivery_fields(self):
        from orders.serializers import OrderSerializer
        fields = OrderSerializer().fields
        self.assertIn("delivery_fee", fields)
        self.assertIn("delivery_fee_on_delivery", fields)
