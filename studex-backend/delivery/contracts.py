# delivery/contracts.py
"""
The public interface other apps use to reach into `delivery` (Blocker 8 —
Internal Service Contracts). If another app needs something from delivery,
it should be importable from here — not from delivery.admin/delivery.views/
delivery.models directly, and never anything with a leading underscore.

This module re-exports the one function orders/admin.py needs — no other
app currently reaches into delivery, so this list is short by design; add
to it only when a real caller needs a new integration point, not
speculatively.
"""
from delivery.admin import notify_rider_assignment

__all__ = ["notify_rider_assignment"]
