# accounts/analytics.py
"""
Analytics service for admin dashboard.

Provides aggregated statistics and metrics for the admin panel.
All calculations happen at the database level for performance.
"""

import logging
from django.db.models import Count, Sum, Avg, Q, F
from django.utils import timezone
from datetime import timedelta
from accounts.models import User, Profile

logger = logging.getLogger(__name__)


class AdminAnalytics:
    """
    Service class for generating admin dashboard analytics.

    All methods are static and optimized with database-level aggregation.
    """

    @staticmethod
    def get_user_stats():
        """
        Get comprehensive user statistics.

        Returns:
            dict: User statistics including total, active, vendors, etc.
        """
        total_users = User.objects.count()
        active_users = User.objects.filter(is_active=True).count()
        vendors = User.objects.filter(user_type='vendor').count()

        # Get verified vendors count
        verified_vendors = User.objects.filter(
            user_type='vendor',
            is_verified_vendor=True
        ).count()

        now = timezone.now()
        thirty_days_ago = now - timedelta(days=30)
        seven_days_ago  = now - timedelta(days=7)
        today_start     = now.replace(hour=0, minute=0, second=0, microsecond=0)

        new_users_30d = User.objects.filter(date_joined__gte=thirty_days_ago).count()
        new_users_7d  = User.objects.filter(date_joined__gte=seven_days_ago).count()

        # Activity based on last_seen (real logins, not account status)
        active_today  = User.objects.filter(last_seen__gte=today_start).count()
        active_7d     = User.objects.filter(last_seen__gte=seven_days_ago).count()
        active_30d    = User.objects.filter(last_seen__gte=thirty_days_ago).count()

        return {
            'total_users': total_users,
            'active_users': active_users,
            'inactive_users': total_users - active_users,
            'vendors': vendors,
            'verified_vendors': verified_vendors,
            'pending_vendors': vendors - verified_vendors,
            'new_users_30d': new_users_30d,
            'new_users_7d': new_users_7d,
            'active_today': active_today,
            'active_7d': active_7d,
            'active_30d': active_30d,
        }

    @staticmethod
    def get_listing_stats():
        """
        Get comprehensive listing/service statistics.

        Returns:
            dict: Listing statistics
        """
        try:
            from services.models import Listing

            total_listings = Listing.objects.count()
            available_listings = Listing.objects.filter(is_available=True).count()

            # Listings by category (top 5)
            category_breakdown = Listing.objects.values(
                'category__title'
            ).annotate(
                count=Count('id')
            ).order_by('-count')[:5]

            return {
                'total_listings': total_listings,
                'available_listings': available_listings,
                'pending_listings': total_listings - available_listings,
                'category_breakdown': list(category_breakdown),
            }
        except Exception as e:
            return {
                'total_listings': 0,
                'available_listings': 0,
                'pending_listings': 0,
                'category_breakdown': [],
            }

    @staticmethod
    def get_order_stats():
        """
        Get comprehensive order statistics.

        Returns:
            dict: Order statistics and revenue data
        """
        try:
            from orders.models import Order

            total_orders = Order.objects.count()

            pending_orders = Order.objects.filter(status='pending').count()
            completed_orders = Order.objects.filter(status='completed').count()
            cancelled_orders = Order.objects.filter(status='cancelled').count()
            disputed_orders = Order.objects.filter(status='disputed').count()

            total_revenue = Order.objects.filter(
                status='completed'
            ).aggregate(
                total=Sum('amount')
            )['total'] or 0

            thirty_days_ago = timezone.now() - timedelta(days=30)
            revenue_30d = Order.objects.filter(
                status='completed',
                created_at__gte=thirty_days_ago
            ).aggregate(
                total=Sum('amount')
            )['total'] or 0

            avg_order_value = Order.objects.filter(
                status='completed'
            ).aggregate(
                avg=Avg('amount')
            )['avg'] or 0

            return {
                'total_orders': total_orders,
                'pending_orders': pending_orders,
                'completed_orders': completed_orders,
                'cancelled_orders': cancelled_orders,
                'disputed_orders': disputed_orders,
                'total_revenue': float(total_revenue),
                'revenue_30d': float(revenue_30d),
                'avg_order_value': float(avg_order_value),
            }
        except Exception as e:
            return {
                'total_orders': 0,
                'pending_orders': 0,
                'completed_orders': 0,
                'cancelled_orders': 0,
                'disputed_orders': 0,
                'total_revenue': 0.0,
                'revenue_30d': 0.0,
                'avg_order_value': 0.0,
            }

    @staticmethod
    def get_payment_stats():
        """
        Financial breakdown sourced from PaymentTransaction when available,
        falling back to Order data for platforms that pre-date the new payment flow.

        transaction_volume — total money buyers paid into the platform
        vendor_payouts     — total money transferred out to vendors
        platform_fees      — net platform earnings (service charge minus discounts)
        """
        try:
            from payments.models import PaymentTransaction
            from orders.models import Order

            thirty_days_ago = timezone.now() - timedelta(days=30)

            # ── Primary source: PaymentTransaction ────────────────────────────
            successful = PaymentTransaction.objects.filter(status='success')
            totals = successful.aggregate(
                transaction_volume=Sum('amount'),
                vendor_payouts=Sum('seller_amount'),
                platform_fees=Sum('platform_amount'),
            )

            if totals.get('transaction_volume') is not None:
                # PaymentTransaction records exist — use them directly
                totals_30d = successful.filter(created_at__gte=thirty_days_ago).aggregate(
                    transaction_volume_30d=Sum('amount'),
                    vendor_payouts_30d=Sum('seller_amount'),
                    platform_fees_30d=Sum('platform_amount'),
                )
                return {
                    'transaction_volume': float(totals['transaction_volume'] or 0),
                    'vendor_payouts': float(totals['vendor_payouts'] or 0),
                    'platform_fees': float(totals['platform_fees'] or 0),
                    'transaction_volume_30d': float(totals_30d['transaction_volume_30d'] or 0),
                    'vendor_payouts_30d': float(totals_30d['vendor_payouts_30d'] or 0),
                    'platform_fees_30d': float(totals_30d['platform_fees_30d'] or 0),
                }

            # ── Fallback: derive from Order + listing price ───────────────────
            # Covers orders processed before PaymentTransaction records existed.
            PAID_STATUSES = ['paid', 'seller_completed', 'completed']

            def _order_financials(qs):
                vol = float(qs.aggregate(t=Sum('amount'))['t'] or 0)
                vendor = float(qs.aggregate(t=Sum(F('listing__price')))['t'] or 0)
                return vol, vendor, max(vol - vendor, 0.0)

            paid_orders = Order.objects.filter(status__in=PAID_STATUSES)
            paid_orders_30d = paid_orders.filter(created_at__gte=thirty_days_ago)

            vol, vendor, fees = _order_financials(paid_orders)
            vol_30d, vendor_30d, fees_30d = _order_financials(paid_orders_30d)

            return {
                'transaction_volume': vol,
                'vendor_payouts': vendor,
                'platform_fees': fees,
                'transaction_volume_30d': vol_30d,
                'vendor_payouts_30d': vendor_30d,
                'platform_fees_30d': fees_30d,
            }

        except Exception as e:
            logger.error(f"get_payment_stats failed: {e}", exc_info=True)
            return {
                'transaction_volume': 0.0,
                'vendor_payouts': 0.0,
                'platform_fees': 0.0,
                'transaction_volume_30d': 0.0,
                'vendor_payouts_30d': 0.0,
                'platform_fees_30d': 0.0,
            }

    @staticmethod
    def get_category_order_stats():
        """Orders per category in the last 30 days, top 8."""
        try:
            from orders.models import Order
            from datetime import timedelta
            cutoff = timezone.now() - timedelta(days=30)
            rows = (
                Order.objects
                .filter(created_at__gte=cutoff, status__in=['paid', 'preparing', 'ready', 'completed'])
                .values('listing__category__title', 'listing__category__slug')
                .annotate(orders=Count('id'))
                .order_by('-orders')[:8]
            )
            return [
                {
                    'category': r['listing__category__title'] or 'Other',
                    'slug': r['listing__category__slug'] or '',
                    'orders': r['orders'],
                }
                for r in rows
            ]
        except Exception:
            return []

    @staticmethod
    def get_churning_vendors():
        """Verified vendors with zero completed/paid orders in the last 14 days."""
        try:
            from accounts.models import User as UserModel
            from orders.models import Order
            from datetime import timedelta
            from django.db.models import F
            cutoff = timezone.now() - timedelta(days=14)
            active_vendor_ids = (
                Order.objects
                .filter(created_at__gte=cutoff, status__in=['paid', 'preparing', 'ready', 'completed'])
                .values_list('listing__vendor_id', flat=True)
                .distinct()
            )
            # is_menu_vendor read straight off the same relationship
            # get_vendor_type() walks (seller.vendor.vendor_type) — .values()
            # returns plain dicts, not model instances, so the helper itself
            # can't be called here; F() traverses the identical FK chain.
            # NULL (no Vendor row / no vendor_type) needs coercing to False —
            # .values() would otherwise return None, unlike get_vendor_type()'s
            # own bool(vt and vt.supports_menu_ordering).
            churning = (
                UserModel.objects
                .filter(is_verified_vendor=True, is_active=True)
                .exclude(id__in=active_vendor_ids)
                .order_by('username')
                .values('id', 'username', 'business_name', 'school',
                        is_menu_vendor=F('vendor__vendor_type__supports_menu_ordering'))[:20]
            )
            churning = list(churning)
            for row in churning:
                row['is_menu_vendor'] = bool(row['is_menu_vendor'])
            return churning
        except Exception:
            return []

    @staticmethod
    def get_most_searched_products(limit=10, days=None):
        """
        Top search terms by frequency (services.models.SearchQuery, logged from
        ListingViewSet.list() on every non-empty ?search= call). days=None means
        all-time; pass e.g. days=30 to scope to a recent window.
        """
        try:
            from services.models import SearchQuery
            qs = SearchQuery.objects.all()
            if days:
                cutoff = timezone.now() - timedelta(days=days)
                qs = qs.filter(created_at__gte=cutoff)
            rows = (
                qs.values('query')
                .annotate(count=Count('id'))
                .order_by('-count')[:limit]
            )
            return [{'query': r['query'], 'count': r['count']} for r in rows]
        except Exception:
            return []

    @staticmethod
    def get_most_ordered_products(limit=10, days=None):
        """
        Top listings by order count. Excludes pending (never paid) and cancelled
        orders — only counts orders that represent a real purchase attempt.
        days=None means all-time; pass e.g. days=30 to scope to a recent window.
        """
        try:
            from orders.models import Order
            qs = Order.objects.exclude(status__in=['pending', 'cancelled'])
            if days:
                cutoff = timezone.now() - timedelta(days=days)
                qs = qs.filter(created_at__gte=cutoff)
            rows = (
                qs.values('listing_id', 'listing__title', 'listing__vendor__username')
                .annotate(count=Count('id'))
                .order_by('-count')[:limit]
            )
            return [
                {
                    'listing_id': r['listing_id'],
                    'title': r['listing__title'],
                    'vendor': r['listing__vendor__username'],
                    'count': r['count'],
                }
                for r in rows
            ]
        except Exception:
            return []

    @staticmethod
    def get_dashboard_summary():
        """
        Get complete dashboard summary combining all stats.

        Returns:
            dict: Complete analytics data for admin dashboard
        """
        return {
            'users': AdminAnalytics.get_user_stats(),
            'listings': AdminAnalytics.get_listing_stats(),
            'orders': AdminAnalytics.get_order_stats(),
            'payments': AdminAnalytics.get_payment_stats(),
            'category_orders': AdminAnalytics.get_category_order_stats(),
            'churning_vendors': AdminAnalytics.get_churning_vendors(),
            'most_searched_products': AdminAnalytics.get_most_searched_products(),
            'most_ordered_products': AdminAnalytics.get_most_ordered_products(),
            'timestamp': timezone.now().isoformat(),
        }
