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
