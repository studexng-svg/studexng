# payments/models.py
from decimal import Decimal
from django.db import models
from django.conf import settings


class PricingSettings(models.Model):
    """
    Singleton (always pk=1, same pattern as notifications.PlatformSettings) holding
    the admin-configurable platform fee percentage. See payments/pricing.py for the
    one shared pricing service that reads this — nothing else should hardcode the rate.
    """
    service_fee_percent = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("8.00"))
    updated_at = models.DateTimeField(auto_now=True)

    @classmethod
    def get(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Pricing Settings (fee: {self.service_fee_percent}%)"


class BankTransferSettings(models.Model):
    """
    Singleton (same pattern as PricingSettings) — temporary manual-settlement
    switch for menu/food-vendor checkout. Paystack's Transfer API needs
    "Payout on Demand" for a fast/full vendor payout; until that's approved,
    is_enabled=True routes menu-vendor checkout to a direct bank transfer
    into the platform's own account instead of Paystack, with an admin
    manually confirming receipt and manually paying vendors out afterward
    (see payments.views.initiate_bank_transfer_cart and
    accounts.admin_views.AdminOrderDetailView.patch). Flipping is_enabled
    back to False reverts every menu vendor to normal Paystack checkout with
    no other code change needed.
    """
    is_enabled = models.BooleanField(default=False)
    account_name = models.CharField(max_length=150, blank=True)
    account_number = models.CharField(max_length=20, blank=True)
    bank_name = models.CharField(max_length=100, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    @classmethod
    def get(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Bank Transfer Settings ({'enabled' if self.is_enabled else 'disabled'})"


class CampusPricingSettings(models.Model):
    """
    Fee override, resolved in three levels (Blocker 6 — Campus Pricing;
    extended to add VendorType — see the Blocker 6.1 report):

      Level 1: campus + vendor_type (most specific)
      Level 2: campus only (vendor_type is NULL) — the original Blocker 6 shape
      Level 3: global PricingSettings — used when no row matches either level

    A row with vendor_type=NULL is a campus default; every row that existed
    before this field was added became exactly that on migration (NULL is the
    default), which is why this required no data migration — the original
    campus-only behavior is just Level 2 with vendor_type unset.

    vendor_type is a real FK, not a name string: resolution in
    payments/pricing.py always takes and compares VendorType instances,
    never string names — an id is immutable and a join is unambiguous where
    a name string could collide or be renamed. This matches how Settlement
    Policy (payments/settlement.py) already resolves VendorType. The Admin
    API layer (AdminPricingSettingsView) still accepts/returns the friendly
    VendorType.name for convenience — the string-to-instance resolution
    happens once at that boundary, never inside the pricing resolver itself.

    NULL-uniqueness caveat: standard SQL treats two NULLs as unequal, so
    `unique_together` alone will not stop two Level-2 rows for the same
    campus at the database layer. The only writer is the admin-gated
    endpoint, which always uses get_or_create keyed on (campus, vendor_type)
    — so duplicates never occur in practice even though the DB itself
    wouldn't reject one.
    """
    CAMPUS_CHOICES = (
        ('pau', 'PAU'),
        ('futo', 'FUTO'),
        ('imsu', 'IMSU'),
    )

    campus = models.CharField(max_length=20, choices=CAMPUS_CHOICES)
    vendor_type = models.ForeignKey(
        'accounts.VendorType', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='campus_pricing_overrides',
        help_text="Leave blank for a campus-wide default (Level 2).",
    )
    service_fee_percent = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True,
        help_text="Leave blank to inherit the next level up.",
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['campus', 'vendor_type']
        unique_together = [('campus', 'vendor_type')]
        verbose_name = "Campus Pricing Override"
        verbose_name_plural = "Campus Pricing Overrides"

    def __str__(self):
        pct = f"{self.service_fee_percent}%" if self.service_fee_percent is not None else "inherits"
        scope = self.vendor_type.display_name if self.vendor_type_id else "campus default"
        return f"{self.get_campus_display()} — {scope} — {pct}"


class SellerBankAccount(models.Model):
    """Stores seller's bank account for Paystack payouts."""
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="bank_account"
    )
    bank_code = models.CharField(max_length=20)
    bank_name = models.CharField(max_length=100)
    account_number = models.CharField(max_length=20)
    account_name = models.CharField(max_length=200)
    # Paystack subaccount code — format: ACCT_xxxxxxxxxx (kept for backwards compatibility)
    paystack_subaccount_code = models.CharField(max_length=100, blank=True, null=True)
    # Paystack transfer recipient code — format: RCP_xxx (used for instant vendor payouts)
    paystack_recipient_code = models.CharField(max_length=100, blank=True, null=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.username} - {self.bank_name} {self.account_number}"


class PaymentTransaction(models.Model):
    """
    Logs every payment for audit and refund tracking.

    Pricing model:
    ─────────────────────────────────────
    buyer pays:  listing_price + service_charge - discount_amount
    vendor gets: listing_price (their full price, paid by StudEx manually)
    platform keeps: service_charge - discount_amount (min ₦0)

    service_charge: 8% of listing price (covers platform margin + Paystack processing fee), minimum ₦100, maximum ₦3,500.
    discount_amount: profile-completion 5% discount applied to listing price.
                     Comes entirely from the platform fee — vendor is unaffected.
    paystack_charge_fee: Paystack's inbound processing fee absorbed by StudEx (1.5% + ₦100 flat if checkout ≥ ₦2,500).
    transfer_fee: Paystack's outbound transfer fee charged to StudEx when paying vendor (₦10/₦25/₦50 by tier).
    net_platform_amount (computed): service_charge - discount_amount - paystack_charge_fee - transfer_fee = actual cash profit.
    """
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("success", "Success"),
        ("failed", "Failed"),
        ("refunded", "Refunded"),
        # Transient claim state — set the instant a refund_payment() call locks
        # this row, before the (slow, external) Paystack API call is made, so a
        # concurrent request (double-click, client retry-on-timeout) can never
        # also pass the "is this refundable?" check for the same transaction.
        # See refund_payment() and scheduler.recover_stuck_refunds().
        ("refund_pending", "Refund Pending"),
    ]
    ORDER_TYPE_CHOICES = [
        ("product", "Product"),
        ("service", "Service"),
    ]

    buyer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, related_name="payments"
    )
    seller = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, related_name="received_payments"
    )
    reference = models.CharField(max_length=200, unique=True)

    # Paystack transaction ID — used for refunds
    paystack_transaction_id = models.BigIntegerField(null=True, blank=True)

    # Amount buyer actually paid (listing_price + service_charge - discount), in naira
    amount = models.DecimalField(max_digits=12, decimal_places=2)

    # Vendor's full listing price — what StudEx owes the vendor
    seller_amount = models.DecimalField(max_digits=12, decimal_places=2)

    # 8% service charge (min ₦50, max ₦3,500) — set explicitly on every new record
    service_charge = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    # Discount applied from platform fee (5% of listing price, capped at service_charge)
    # Vendor is NOT affected — discount comes from platform revenue only
    discount_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    # Net platform revenue = service_charge - discount_amount
    platform_amount = models.DecimalField(max_digits=12, decimal_places=2)

    # Total deal discount applied at checkout (vendor absorbs this — they receive deal price, not full price)
    deal_discount_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    # Paystack inbound charge fee StudEx absorbed (1.5% + ₦100 flat if checkout ≥ ₦2,500, max ₦2,000)
    paystack_charge_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    # Paystack outbound transfer fee deducted from StudEx balance when paying vendor (₦10/₦25/₦50)
    transfer_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    order_type = models.CharField(max_length=20, choices=ORDER_TYPE_CHOICES, default="product")

    buyer_email = models.EmailField()
    buyer_name = models.CharField(max_length=200, blank=True)
    order_id = models.IntegerField(null=True, blank=True)

    paystack_response = models.JSONField(null=True, blank=True)

    # Populated after a Transfer API call to pay out the vendor
    transfer_reference = models.CharField(max_length=200, blank=True, null=True)
    transfer_status = models.CharField(max_length=50, blank=True, null=True)
    transfer_retry_count = models.IntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.reference} - ₦{self.amount} ({self.status})"


class EscrowReconciliationLog(models.Model):
    """
    One row per escrow reconciliation run (scheduled hourly, or triggered
    manually from admin) — compares Paystack's actual account balance
    against what StudEx's own records say should be sitting there: buyer
    money still held for vendor payout, plus platform fee revenue that has
    accumulated in the same balance.

    Known assumption: this treats all platform fee revenue as still sitting
    in the Paystack balance, since there is no tracking anywhere in this
    codebase for the platform manually withdrawing its own revenue out to a
    separate company account. If that ever happens outside of this system,
    it will correctly show up here as a discrepancy — an admin who knows why
    marks the row resolved with a note, rather than the job pretending to
    understand withdrawals it has no record of.
    """
    checked_at = models.DateTimeField(auto_now_add=True)
    paystack_balance = models.DecimalField(max_digits=14, decimal_places=2)
    expected_held_for_vendors = models.DecimalField(max_digits=14, decimal_places=2)
    expected_platform_revenue = models.DecimalField(max_digits=14, decimal_places=2)
    expected_balance = models.DecimalField(max_digits=14, decimal_places=2)
    # paystack_balance - expected_balance. Positive means Paystack holds MORE
    # than records explain; negative means it holds LESS (the more dangerous case).
    discrepancy = models.DecimalField(max_digits=14, decimal_places=2)
    is_flagged = models.BooleanField(default=False)

    resolved = models.BooleanField(default=False)
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True
    )
    resolved_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True, default="")

    class Meta:
        ordering = ['-checked_at']
        indexes = [
            models.Index(fields=['-checked_at']),
            models.Index(fields=['is_flagged', 'resolved']),
        ]
        verbose_name = "Escrow Reconciliation Log"
        verbose_name_plural = "Escrow Reconciliation Logs"

    def __str__(self):
        flag = " ⚠ FLAGGED" if self.is_flagged and not self.resolved else ""
        return f"Reconciliation {self.checked_at:%Y-%m-%d %H:%M} — discrepancy ₦{self.discrepancy}{flag}"


class VendorDebt(models.Model):
    """
    Money StudEx owes back to itself from a vendor, because a refund had to
    be issued on a transaction that vendor was already paid for.

    Previously, refund_payment() simply refused to refund once a vendor had
    been paid ("contact support"), leaving buyers who win a late dispute (the
    Dispute model allows filing up to 7 days after completion, well past the
    24h auto-release that may have already paid the vendor) with no
    automated way to get their money back.

    The policy this implements: the platform refunds the buyer immediately
    to keep them whole, then creates a VendorDebt for the amount that vendor
    was already paid for this transaction. The debt is deducted from that
    vendor's next payout(s) — possibly across several, oldest debt first —
    before any new transfer is sent. See trigger_vendor_payout.
    """
    STATUS_CHOICES = [
        ("outstanding", "Outstanding"),
        ("settled", "Settled"),
        ("written_off", "Written Off"),
    ]

    vendor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="debts"
    )
    source_transaction = models.ForeignKey(
        PaymentTransaction, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="debts_caused",
    )
    original_amount = models.DecimalField(max_digits=12, decimal_places=2)
    # Decreases as future payouts settle it; reaches 0 when fully settled.
    outstanding_amount = models.DecimalField(max_digits=12, decimal_places=2)
    reason = models.CharField(max_length=255, blank=True, default="")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="outstanding")
    created_at = models.DateTimeField(auto_now_add=True)
    settled_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['created_at']  # oldest debt settled first (FIFO)
        indexes = [models.Index(fields=['vendor', 'status'])]
        verbose_name = "Vendor Debt"
        verbose_name_plural = "Vendor Debts"

    def __str__(self):
        return f"Debt for {self.vendor.username}: ₦{self.outstanding_amount} outstanding ({self.status})"


class PayoutAuditRecord(models.Model):
    """
    Permanent record of every payout resolution attempt for a transaction —
    one row per PaymentTransaction, updated (never replaced) as the payout
    moves through its lifecycle (a retry can turn a "failed" row into a
    "success" one), so the row is always present but never deleted. See
    record_payout_audit() in payments/views.py, called from every place
    that resolves a payout: trigger_vendor_payout and
    scheduler.retry_failed_transfers.

    Cross-references delivery.DeliveryAssignment (string FK to avoid an
    import-order dependency between the two apps) purely to capture who
    physically verified pickup and when, for orders that went through a
    rider — null for orders with no delivery assignment (services,
    vendor-self-fulfilled products).
    """
    transaction = models.OneToOneField(
        PaymentTransaction, on_delete=models.PROTECT, related_name="payout_audit",
    )
    order_id = models.IntegerField(null=True, blank=True)
    vendor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="payout_audits",
    )
    rider = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="payout_audits_as_rider",
    )
    delivery_assignment = models.ForeignKey(
        "delivery.DeliveryAssignment", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="payout_audits",
    )
    pickup_verified_at = models.DateTimeField(null=True, blank=True)
    pickup_evidence_image = models.URLField(max_length=500, null=True, blank=True)

    transfer_reference = models.CharField(max_length=200, blank=True, default="")
    transfer_status = models.CharField(max_length=50, blank=True, default="")
    amount_released = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0"))

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [models.Index(fields=['vendor']), models.Index(fields=['rider'])]
        verbose_name = "Payout Audit Record"
        verbose_name_plural = "Payout Audit Records"

    def __str__(self):
        vendor_name = self.vendor.username if self.vendor else "—"
        return f"Payout audit for {self.transaction.reference} — {vendor_name} (₦{self.amount_released})"
