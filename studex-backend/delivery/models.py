import secrets

from django.db import models
from django.conf import settings

User = settings.AUTH_USER_MODEL


def generate_delivery_code():
    """
    6-digit buyer handoff code — same role as the PIN couriers like Jumia/Bolt
    Food make riders collect from the customer before marking a delivery
    complete. Not a cryptographic secret (a rider only ever gets one attempt
    per assignment, and knowing it requires the buyer to have handed it
    over), just enough to prove the buyer was actually present at handoff.
    """
    return f"{secrets.randbelow(1_000_000):06d}"


class CampusPickupPoint(models.Model):
    CAMPUS_CHOICES = (
        ('pau', 'PAU'),
        ('futo', 'FUTO'),
        ('imsu', 'IMSU'),
    )

    name = models.CharField(max_length=150)
    campus = models.CharField(max_length=20, choices=CAMPUS_CHOICES)
    description = models.CharField(max_length=300, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['campus', 'name']

    def __str__(self):
        return f"{self.name} ({self.campus})"


class BatchTemplate(models.Model):
    """
    A recurring Delivery Batch pattern (Phase 1 — Food Commerce Engine),
    e.g. "every weekday, delivery at 1pm, cutoff 15 min before, cap 10."
    A scheduled job (same APScheduler convention as every existing job in
    scheduler.py) creates each day's DeliveryBatch from active templates
    whose day_of_week matches today. Editing a template only changes what
    *future* days generate — it never retroactively touches an
    already-generated DeliveryBatch (see DeliveryBatch.template below).

    Batching is a vendor capability, not a Food/Restaurant-specific one —
    gated by accounts.VendorType.supports_batched_delivery, never by a
    hardcoded vendor-type check.
    """
    CAMPUS_CHOICES = CampusPickupPoint.CAMPUS_CHOICES

    vendor = models.ForeignKey(User, on_delete=models.CASCADE, related_name='batch_templates')
    campus = models.CharField(max_length=20, choices=CAMPUS_CHOICES)
    display_name = models.CharField(max_length=100)
    delivery_time = models.TimeField()
    cutoff_offset_minutes = models.PositiveIntegerField(
        default=15, help_text="Ordering closes this many minutes before delivery_time.",
    )
    max_orders = models.PositiveIntegerField()
    # Python's date.weekday(): Monday=0 .. Sunday=6.
    days_of_week = models.JSONField(default=list, help_text="List of weekday ints (Monday=0 .. Sunday=6) this template applies to.")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['vendor_id', 'display_name']
        verbose_name = "Batch Template"
        verbose_name_plural = "Batch Templates"

    def __str__(self):
        return f"{self.vendor.username} — {self.display_name} ({self.delivery_time})"


class DeliveryBatch(models.Model):
    """
    One day's time-boxed delivery run for a vendor (Phase 1 — Food Commerce
    Engine) — scoped to (vendor, campus, batch_date), independent of its
    originating BatchTemplate once generated. An admin overriding this day's
    capacity/time/cutoff/name never touches the template or any other day.

    `current_orders` is a denormalized counter, not a live COUNT(*) — kept
    accurate under concurrency via select_for_update() at the point of
    reservation (see delivery/capacity.py), the same lock discipline already
    proven in payments._settle_vendor_debt and refund_payment()'s claim step.
    """
    STATUS_CHOICES = (
        ('open', 'Open'),
        ('full', 'Full'),
        ('closed', 'Closed'),
        ('suspended', 'Suspended'),
    )
    CAMPUS_CHOICES = CampusPickupPoint.CAMPUS_CHOICES

    vendor = models.ForeignKey(User, on_delete=models.CASCADE, related_name='delivery_batches')
    template = models.ForeignKey(
        BatchTemplate, on_delete=models.SET_NULL, null=True, blank=True, related_name='generated_batches',
        help_text="Which template generated this batch, if any — traces provenance only; editing this row never edits the template.",
    )
    campus = models.CharField(max_length=20, choices=CAMPUS_CHOICES)
    batch_date = models.DateField()
    display_name = models.CharField(max_length=100)
    delivery_time = models.DateTimeField()
    cutoff_time = models.DateTimeField()
    max_orders = models.PositiveIntegerField()
    current_orders = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='open')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-batch_date', 'delivery_time']
        # Prevents the daily generation job from double-creating the same
        # template's batch for the same day if it ever runs twice — has no
        # effect on admin-created batches (template=None), which have no
        # such uniqueness requirement (a vendor may create several ad hoc
        # batches on one day with no template at all).
        unique_together = [('vendor', 'template', 'batch_date')]
        verbose_name = "Delivery Batch"
        verbose_name_plural = "Delivery Batches"

    def __str__(self):
        return f"{self.vendor.username} — {self.display_name} — {self.batch_date}"


class DeliveryAssignment(models.Model):
    STATUS_CHOICES = (
        ('assigned', 'Assigned to Rider'),
        ('picked_up', 'Picked Up from Vendor'),
        ('at_pickup_point', 'At Pickup Point'),
        ('completed', 'Collected by Buyer'),
    )

    order = models.OneToOneField(
        'orders.Order',
        on_delete=models.CASCADE,
        related_name='delivery',
    )
    rider = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='deliveries',
    )
    pickup_point = models.ForeignKey(
        CampusPickupPoint,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='deliveries',
    )
    # Phase 1 — Food Commerce Engine. Null for every order from a vendor
    # that doesn't use batching (i.e. every order that existed before this
    # phase, and every non-batching vendor type after it) — identical to
    # today's behavior in that case.
    batch = models.ForeignKey(
        'delivery.DeliveryBatch', on_delete=models.SET_NULL, null=True, blank=True, related_name='assignments',
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='assigned')

    # ── Responsibility transfer ──────────────────────────────────────────────
    # Explicit record of who currently bears responsibility for the physical
    # order — the vendor until a rider has verified pickup, StudEx Delivery
    # from that moment on. Flips exactly once, the instant a "pickup"
    # DeliveryVerificationEvent is successfully recorded (see
    # RiderUpdateStatusView). This is a liability/custody statement, not a
    # payout trigger — see PayoutAuditRecord in payments/models.py for the
    # (separate) money-movement side.
    RESPONSIBILITY_CHOICES = (
        ('vendor', 'Vendor'),
        ('studex_delivery', 'StudEx Delivery'),
    )
    responsibility = models.CharField(max_length=20, choices=RESPONSIBILITY_CHOICES, default='vendor')
    responsibility_transferred_at = models.DateTimeField(null=True, blank=True)

    # Buyer-only handoff code — must be supplied by the rider to transition to
    # "completed". Never exposed on any rider-facing endpoint. Rotated on
    # every (re)assignment. See RiderUpdateStatusView / BuyerDeliveryStatusSerializer.
    delivery_code = models.CharField(max_length=6, default=generate_delivery_code)
    # Failed-attempt counter for the code above — locks out further completion
    # attempts after MAX_CODE_ATTEMPTS wrong guesses (brute-force defense on a
    # 6-digit space). An admin unlocks by regenerating the code (see admin.py).
    code_attempts = models.PositiveSmallIntegerField(default=0)
    code_locked = models.BooleanField(default=False)

    # Photo evidence captured at the two state transitions that previously had
    # none: proof the rider actually received the item from the vendor, and
    # proof of the handoff to the buyer at the pickup point.
    pickup_proof_image = models.URLField(max_length=500, blank=True, null=True)
    completion_proof_image = models.URLField(max_length=500, blank=True, null=True)

    assigned_at = models.DateTimeField(auto_now_add=True)
    picked_up_at = models.DateTimeField(null=True, blank=True)
    at_pickup_point_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    assigned_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='delivery_assignments_made',
    )

    class Meta:
        ordering = ['-assigned_at']

    def __str__(self):
        return f"Delivery for Order {self.order.reference} — {self.get_status_display()}"


MAX_CODE_ATTEMPTS = 5


class DeliveryVerificationEvent(models.Model):
    """
    Permanent, append-only audit trail of every rider verification action —
    separate from DeliveryAssignment's mutable status fields so a bug or a
    future reassignment can never silently erase who did what and when.
    The (assignment, event_type) uniqueness constraint is a hard DB-level
    guarantee against duplicate verification, independent of and in addition
    to the application-level state-machine check in RiderUpdateStatusView.
    """
    EVENT_TYPE_CHOICES = (
        ('pickup', 'Pickup Verification'),
        ('completion', 'Completion Verification'),
    )

    assignment = models.ForeignKey(
        DeliveryAssignment, on_delete=models.CASCADE, related_name='verification_events',
    )
    event_type = models.CharField(max_length=20, choices=EVENT_TYPE_CHOICES)
    rider = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, related_name='delivery_verification_events',
    )
    evidence_image = models.URLField(max_length=500)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    occurred_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['occurred_at']
        constraints = [
            models.UniqueConstraint(
                fields=['assignment', 'event_type'], name='one_event_per_assignment_per_type',
            ),
        ]
        verbose_name = "Delivery Verification Event"
        verbose_name_plural = "Delivery Verification Events"

    def __str__(self):
        return f"{self.get_event_type_display()} — {self.assignment.order.reference} by {self.rider}"
