# services/contracts.py
"""
The public interface other apps use to reach into `services` (see
payments/contracts.py, delivery/contracts.py for the same pattern). If
another app needs something from services, it should be importable from
here — not from services.views/services.models directly, and never
anything with a leading underscore (that's this app's private
implementation detail, not a stable contract another app should depend on).

This module does not implement anything itself — it only re-exports the
functions that are the intended integration points.
"""
from services.views import invalidate_listing_cache

__all__ = ["invalidate_listing_cache"]
