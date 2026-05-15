# accounts/analytics.py
"""
Analytics service for admin dashboard.

Provides aggregated statistics and metrics for the admin panel.
All calculations happen at the database level for performance.
"""

from django.db.models import Count, Sum, Avg, Q
from django.utils import timezone
from datetime import timedelta
from accounts.models import User, Profile


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

        # Users registered in the last 30 days
        thirty_days_ago = timezone.now() - timedelta(days=30)
        new_users = User.objects.filter(
            date_joined__gte=thirty_days_ago
        ).count()

        return {
            'total_users': total_users,
            'active_users': active_users,
            'inactive_users': total_users - active_users,
            'vendors': vendors,
            'verified_vendors': verified_vendors,
            'pending_vendors': vendors - verified_vendors,
            'new_users_30d': new_users,
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
        Financial breakdown from PaymentTransaction records (status='success').

        transaction_volume — total money buyers paid into the platform
        vendor_payouts     — total money transferred out to vendors
        platform_fees      — net platform earnings (service charge minus discounts)
        """
        try:
            from payments.models import PaymentTransaction

            thirty_days_ago = timezone.now() - timedelta(days=30)
            successful = PaymentTransaction.objects.filter(status='success')

            totals = successful.aggregate(
                transaction_volume=Sum('amount'),
                vendor_payouts=Sum('seller_amount'),
                platform_fees=Sum('platform_amount'),
            )
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
        except Exception:
            return {
                'transaction_volume': 0.0,
                'vendor_payouts': 0.0,
                'platform_fees': 0.0,
                'transaction_volume_30d': 0.0,
                'vendor_payouts_30d': 0.0,
                'platform_fees_30d': 0.0,
            }

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
            'timestamp': timezone.now().isoformat(),
        }
