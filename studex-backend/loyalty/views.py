# loyalty/views.py
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from decimal import Decimal
from .models import LoyaltyAccount, LoyaltyTransaction

CREDITS_PER_MILESTONE = Decimal("100")
MILESTONE_INTERVAL = 5


def award_loyalty_credits(user, order):
    """
    Called after an order is confirmed complete.
    Awards ₦100 credits every 5 completed orders.
    """
    account, _ = LoyaltyAccount.objects.get_or_create(user=user)
    account.total_completed_orders += 1
    account.save()

    if account.total_completed_orders % MILESTONE_INTERVAL == 0:
        account.credit_balance += CREDITS_PER_MILESTONE
        account.save()
        LoyaltyTransaction.objects.create(
            account=account,
            type='earned',
            amount=CREDITS_PER_MILESTONE,
            description=f"🎉 Loyalty reward: {account.total_completed_orders} orders completed!",
            order=order
        )
        return True, CREDITS_PER_MILESTONE
    return False, Decimal("0")


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def loyalty_status(request):
    """Returns loyalty balance and progress toward next reward.
    Syncs total_completed_orders from real DB orders so historical
    orders completed before loyalty was set up are counted correctly.
    """
    from orders.models import Order

    account, created = LoyaltyAccount.objects.get_or_create(user=request.user)

    # Always sync count from real completed orders so nothing is missed
    real_count = Order.objects.filter(
        buyer=request.user,
        status='completed'
    ).count()

    if real_count != account.total_completed_orders:
        account.total_completed_orders = real_count
        account.save(update_fields=['total_completed_orders'])

    completed = account.total_completed_orders
    orders_until_next = MILESTONE_INTERVAL - (completed % MILESTONE_INTERVAL)
    if orders_until_next == MILESTONE_INTERVAL:
        orders_until_next = MILESTONE_INTERVAL  # full interval away from next milestone

    history = [
        {
            'type': t.type,
            'amount': float(t.amount),
            'description': t.description,
            'date': t.created_at.isoformat(),
        }
        for t in account.transactions.order_by('-created_at')[:10]
    ]

    return Response({
        'credit_balance': float(account.credit_balance),
        'total_completed_orders': completed,
        'orders_until_next_reward': orders_until_next,
        'next_reward_amount': float(CREDITS_PER_MILESTONE),
        'recent_transactions': history,
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def repeat_booking_check(request):
    """Check if buyer has booked a specific vendor before."""
    vendor_id = request.query_params.get('vendor_id')
    if not vendor_id:
        return Response({'error': 'vendor_id required'}, status=400)

    from orders.models import Order
    count = Order.objects.filter(
        buyer=request.user,
        listing__vendor_id=vendor_id,
        status='completed'
    ).count()

    account, _ = LoyaltyAccount.objects.get_or_create(user=request.user)
    completed = account.total_completed_orders
    orders_until_next = MILESTONE_INTERVAL - (completed % MILESTONE_INTERVAL)

    return Response({
        'completed_orders_with_vendor': count,
        'is_repeat_customer': count > 0,
        'total_completed_orders': completed,
        'orders_until_next_reward': orders_until_next,
        'credit_balance': float(account.credit_balance),
    })