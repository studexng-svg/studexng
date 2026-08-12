# orders/models.py
from decimal import Decimal

from django.db import models
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.validators import MaxLengthValidator
from services.models import Listing

User = get_user_model()


class Order(models.Model):
    STATUS_CHOICES = (
        ('pending', 'Pending Payment'),
        # Temporary manual-settlement path (payments.views.
        # initiate_bank_transfer_cart) — buyer says they've sent money
        # directly to the platform's own bank account instead of paying via
        # Paystack, and an admin must manually confirm the transfer actually
        # arrived (accounts.admin_views.AdminOrderDetailView.patch) before
        # this becomes a normal 'paid' order. Deliberately NOT 'pending' —
        # scheduler.auto_cancel_pending_orders only targets status='pending'
        # and would otherwise auto-cancel these before an admin ever gets to
        # confirm them.
        ('pending_bank_transfer', 'Awaiting Bank Transfer Confirmation'),
        ('paid', 'Paid'),                                    # ← was "Paid - In Escrow"
        ('seller_completed', 'Seller Marked Complete'),
        ('completed', 'Buyer Confirmed - Complete'),         # ← was "Buyer Confirmed - Released"
        ('disputed', 'Disputed'),
        ('cancelled', 'Cancelled'),
        ('vendor_declined', 'Vendor Declined'),
    )

    reference = models.CharField(max_length=100, unique=True)
    buyer = models.ForeignKey(User, on_delete=models.CASCADE, related_name='orders')
    listing = models.ForeignKey(Listing, on_delete=models.CASCADE)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    # Receipt/history snapshot for per-unit listings (e.g. "4 clothes"). Not
    # used in settlement math — that's computed from Booking.quantity at
    # payout-split time (see payments/views.py).
    quantity = models.PositiveIntegerField(default=1)
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default='pending')
    current_status = models.CharField(max_length=30, default='paid')
    estimated_time = models.PositiveIntegerField(null=True, blank=True, help_text="Estimated minutes to completion")
    created_at = models.DateTimeField(auto_now_add=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    vendor_accepted_at = models.DateTimeField(null=True, blank=True)
    service_started_at = models.DateTimeField(null=True, blank=True)
    seller_completed_at = models.DateTimeField(null=True, blank=True)
    buyer_confirmed_at = models.DateTimeField(null=True, blank=True)
    auto_released = models.BooleanField(default=False)
    # Buyer-protection counterpart to auto_released above (which protects the
    # *vendor* when a buyer goes silent after seller_completed) — protects
    # the *buyer* when a vendor never fulfils a paid, self-fulfilled
    # marketplace order at all. See scheduler.auto_refund_stale_paid_orders /
    # warn_vendors_of_pending_auto_refund and orders.models.AutoRefundSettings
    # for the configurable window (default 72h). Idempotency flags, same
    # role auto_released plays for its own job.
    vendor_timeout_warned = models.BooleanField(default=False)
    vendor_timeout_refunded = models.BooleanField(default=False)
    delivery_location = models.CharField(max_length=200, blank=True, default="")
    delivery_proof_1 = models.URLField(max_length=500, null=True, blank=True)
    delivery_proof_2 = models.URLField(max_length=500, null=True, blank=True)
    # Buyer-supplied screenshot of the bank transfer they say they sent —
    # optional, attached at payments.views.initiate_bank_transfer_cart time
    # (same pending_bank_transfer path above). Never required: the "I've
    # sent the money" checkbox alone is still enough to submit, this just
    # gives the admin something to check against their bank statement
    # instead of taking the buyer's word for it. Shown on the admin order
    # detail page (AdminOrderDetailView -> OrderSerializer).
    bank_transfer_proof = models.URLField(max_length=500, null=True, blank=True)
    # Null for every order from a vendor that doesn't use delivery slots —
    # identical to today's behavior in that case. Set exactly once, at
    # checkout (see payments.cart_checkout.create_order_from_priced_lines),
    # by the one reservation service (delivery.capacity) — never written to
    # directly anywhere else. String FK to avoid a circular import with
    # delivery, the same convention delivery.models.DeliveryAssignment.order
    # already uses in reverse. "Today's" capacity against this slot is
    # counted live from Order rows placed against it, not a separate
    # generated-per-day row.
    delivery_slot = models.ForeignKey(
        'delivery.DeliverySlot', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='orders',
    )
    # ₦0 for every order from a vendor with no delivery fee configured, or
    # from a non-batching vendor (delivery fee only ever applies alongside
    # delivery_slot). Stamped once at checkout from the frozen amount
    # actually charged (see payments.views.verify_cart_payment) — never
    # re-derived after the fact. Already included in `amount` above; kept
    # here separately for receipt/itemization display and for
    # delivery.fees.get_delivery_fee_quote's live count of past orders.
    delivery_fee = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
    # True only when delivery_fee is ₦0 because the vendor's free-delivery
    # promo quota covered this order — distinct from delivery_fee being ₦0
    # because the vendor simply has no fee configured at all.
    delivery_fee_waived = models.BooleanField(default=False)

    def __str__(self):
        return f"Order {self.reference} - {self.buyer.username}"

    class Meta:
        ordering = ['-created_at']
        verbose_name = "Order"
        verbose_name_plural = "Orders"


class OrderItem(models.Model):
    """
    The multi-item breakdown for an Order (Phase 1 — Food Commerce Engine).
    Generic, not Food-specific — any future vendor type whose orders can
    contain more than one distinct item uses this same table.

    `Order` itself is never modified to support this: `Order.listing` stays
    required and is set to the *anchor* listing — the first item the buyer
    added to their cart — which is always the correct vendor/campus for the
    whole order, since a cart is already constrained to one vendor. Every
    existing code path that reads `order.listing.vendor`/`.campus` keeps
    working unchanged. Only code that needs the full itemized breakdown
    reads `order.items.all()` instead.

    A single-item order (every order type that existed before this phase)
    has zero OrderItem rows — nothing is backfilled, and `order.items.exists()`
    is the signal for "does this order have a multi-item breakdown."
    """
    STATUS_CHOICES = (
        ('fulfilled', 'Fulfilled'),
        ('unavailable', 'Unavailable — Refunded'),
    )

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='items')
    # PROTECT: a menu item can never be deleted out from under a historical
    # order — archive it (MenuItem.is_archived) instead.
    listing = models.ForeignKey(Listing, on_delete=models.PROTECT, related_name='order_items')
    quantity = models.PositiveIntegerField(default=1)
    # Frozen at order-creation time — never re-derived from a live Listing
    # afterward, the same discipline payments.PaymentTransaction already
    # applies to service_charge/platform_amount.
    unit_price_at_order_time = models.DecimalField(max_digits=10, decimal_places=2)
    line_total = models.DecimalField(max_digits=10, decimal_places=2)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='fulfilled')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['order_id', 'id']
        verbose_name = "Order Item"
        verbose_name_plural = "Order Items"

    def __str__(self):
        return f"{self.order.reference} — {self.listing.title} ×{self.quantity}"


class OrderItemAddon(models.Model):
    """
    A frozen, normalized record of one add-on selected on an OrderItem.
    Normalized (FK to Addon) rather than a JSON blob so analytics can
    aggregate "which add-ons sell best" directly; frozen (name_snapshot/
    price_delta_snapshot) so that record survives even if the live Addon's
    price changes or the Addon is deleted later (`on_delete=SET_NULL` —
    the FK goes null, the snapshot fields never change).
    """
    order_item = models.ForeignKey(OrderItem, on_delete=models.CASCADE, related_name='selected_addons')
    addon = models.ForeignKey(
        'services.Addon', on_delete=models.SET_NULL, null=True, blank=True, related_name='order_selections',
    )
    name_snapshot = models.CharField(max_length=100)
    price_delta_snapshot = models.DecimalField(max_digits=10, decimal_places=2)
    # How many units of this add-on were on the dish (e.g. 2x Chicken),
    # frozen at order time same as the other snapshot fields. Default 1
    # keeps every pre-existing row's meaning identical to before this existed.
    quantity = models.PositiveIntegerField(default=1)

    class Meta:
        verbose_name = "Order Item Add-on"
        verbose_name_plural = "Order Item Add-ons"

    def __str__(self):
        return f"{self.order_item} — {self.name_snapshot}"


class OrderStatus(models.Model):
    TRACKING_STATUS_CHOICES = (
        ('paid', 'Payment Confirmed'),
        ('confirmed', 'Order Confirmed'),
        ('preparing', 'Preparing'),
        ('ready', 'Ready for Pickup'),
        ('delivered', 'Delivered'),
        ('cancelled', 'Cancelled'),
    )

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='status_history')
    status = models.CharField(max_length=30, choices=TRACKING_STATUS_CHOICES)
    note = models.TextField(blank=True)
    updated_by = models.ForeignKey(User, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f"Order {self.order.reference} — {self.status}"


class Dispute(models.Model):
    STATUS_CHOICES = (
        ('open', 'Open'),
        ('under_review', 'Under Review'),
        ('resolved', 'Resolved'),
        ('appealed', 'Appealed'),
        ('closed', 'Closed'),
    )

    RESOLUTION_CHOICES = (
        ('pending', 'Pending Decision'),
        ('release_to_provider', 'Release Funds to Provider'),
        ('refund_customer', 'Refund Customer'),
        ('partial_split', 'Partial Split'),
        ('hold_pending', 'Hold Pending Investigation'),
    )

    FILED_BY_CHOICES = (
        ('customer', 'Customer'),
        ('provider', 'Provider'),
    )

    REASON_CHOICES = (
        ('service_not_completed', 'Service Not Completed'),
        ('quality_issue', 'Quality Issue'),
        ('provider_no_show', 'Provider No-Show'),
        ('late_delivery', 'Late Delivery'),
        ('wrong_service', 'Wrong Service Delivered'),
        ('payment_issue', 'Payment Issue'),
        ('other', 'Other'),
    )

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='disputes')
    filed_by = models.CharField(max_length=20, choices=FILED_BY_CHOICES)
    filer = models.ForeignKey(User, on_delete=models.CASCADE, related_name='disputes_filed')
    reason = models.CharField(max_length=50, choices=REASON_CHOICES)
    complaint = models.TextField(help_text="Detailed description of the issue")
    evidence = models.TextField(blank=True, help_text="Evidence or screenshots description")
    evidence_image_1 = models.URLField(blank=True, help_text="Cloudinary URL for first evidence image")
    evidence_image_2 = models.URLField(blank=True, help_text="Cloudinary URL for second evidence image")

    provider_response = models.TextField(blank=True, null=True)
    provider_responded_at = models.DateTimeField(null=True, blank=True)

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='open')
    resolution = models.CharField(max_length=30, choices=RESOLUTION_CHOICES, default='pending')
    assigned_to = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='assigned_disputes',
        help_text="Support staff assigned to this dispute"
    )
    admin_decision = models.TextField(blank=True, help_text="Admin's reasoning for resolution")
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolved_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='disputes_resolved'
    )

    appeal_text = models.TextField(blank=True, null=True)
    appealed_at = models.DateTimeField(null=True, blank=True)
    appeal_decision = models.TextField(blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Dispute #{self.id} - Order {self.order.reference}"

    class Meta:
        ordering = ['-created_at']
        verbose_name = "Dispute"
        verbose_name_plural = "Disputes"
        indexes = [
            models.Index(fields=['-created_at']),
            models.Index(fields=['status']),
            models.Index(fields=['order']),
        ]


class Booking(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('confirmed', 'Confirmed'),
        ('paid', 'Paid'),
        ('cancelled', 'Cancelled'),
        ('completed', 'Completed'),
    ]

    buyer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='bookings_made'
    )
    listing = models.ForeignKey(
        'services.Listing',
        on_delete=models.CASCADE,
        related_name='bookings'
    )
    # Set when the listing offers named variants (e.g. "Washing Only" vs
    # "Washing & Ironing") — PROTECT so a variant with real bookings can't be
    # silently deleted out from under order history.
    variant = models.ForeignKey(
        'services.ListingVariant',
        on_delete=models.PROTECT,
        null=True, blank=True,
        related_name='bookings',
    )
    scheduled_date = models.DateField()
    scheduled_time = models.CharField(max_length=20)
    # Only meaningful when listing.is_per_unit is True (e.g. "4 clothes").
    # Defaults to 1 for ordinary flat-priced service bookings.
    quantity = models.PositiveIntegerField(default=1)
    note = models.TextField(blank=True, validators=[MaxLengthValidator(250)])
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    confirmed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Booking by {self.buyer.username} for {self.listing.title} on {self.scheduled_date}"


class BookingReferenceImage(models.Model):
    booking = models.ForeignKey(Booking, on_delete=models.CASCADE, related_name='reference_images')
    image_url = models.URLField(max_length=500)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f"Reference image for booking #{self.booking_id}"


class AutoRefundSettings(models.Model):
    """
    Singleton (same pattern as payments.models.BankTransferSettings) —
    admin-configurable window for scheduler.auto_refund_stale_paid_orders.
    A self-fulfilled marketplace order (no DeliveryAssignment, no
    delivery_slot — a food/batched-delivery order already resolves through
    its own rider pipeline) that sits in 'paid' this many hours past
    paid_at with no seller_completed gets auto-refunded, same full-refund
    call orders.views.OrderViewSet.vendor_decline already uses for a
    manually-declined order. Service bookings are never touched — they're
    pinned to their own scheduled_date, not a fulfillment-speed window.
    """
    hours = models.PositiveIntegerField(default=72)
    updated_at = models.DateTimeField(auto_now=True)

    @classmethod
    def get(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Auto-Refund Settings ({self.hours}h)"