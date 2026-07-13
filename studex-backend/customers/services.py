# customers/services.py
from decimal import Decimal
from django.db.models import Sum, Count, Avg, Min, Max

from .models import VendorCustomer


def recompute_vendor_customer(vendor_id: int, customer_id: int):
    """
    Recomputes (never increments) a VendorCustomer row directly from Order/Booking.
    Idempotent by construction — a full aggregate over the buyer's own completed
    orders with this vendor, not a counter bump — so it's safe to call from the
    post_save signal on every 'completed' transition AND from the historical
    backfill command with zero risk of double-counting.

    Returns the VendorCustomer instance, or None if the pair has no completed
    orders (in which case any existing row for the pair is deleted).
    """
    from orders.models import Order, Booking

    completed = Order.objects.filter(
        buyer_id=customer_id, listing__vendor_id=vendor_id, status='completed'
    )
    totals = completed.aggregate(
        total=Sum('amount'), count=Count('id'), avg=Avg('amount'),
        first=Min('created_at'), last=Max('buyer_confirmed_at'),
    )

    if not totals['count']:
        VendorCustomer.objects.filter(vendor_id=vendor_id, customer_id=customer_id).delete()
        return None

    favorite_listing_row = (
        completed.values('listing').annotate(c=Count('id')).order_by('-c', 'listing').first()
    )
    favorite_category_row = (
        completed.values('listing__category').annotate(c=Count('id')).order_by('-c', 'listing__category').first()
    )

    total_successful_bookings = Booking.objects.filter(
        buyer_id=customer_id, listing__vendor_id=vendor_id, status__in=['paid', 'completed']
    ).count()

    vendor_customer, _ = VendorCustomer.objects.update_or_create(
        vendor_id=vendor_id, customer_id=customer_id,
        defaults={
            'first_purchase_at': totals['first'],
            'last_purchase_at': totals['last'] or totals['first'],
            'total_completed_orders': totals['count'],
            'total_amount_spent': totals['total'] or Decimal('0'),
            'average_order_value': totals['avg'] or Decimal('0'),
            'total_successful_bookings': total_successful_bookings,
            'favorite_listing_id': favorite_listing_row['listing'] if favorite_listing_row else None,
            'favorite_category_id': favorite_category_row['listing__category'] if favorite_category_row else None,
        },
    )
    return vendor_customer
