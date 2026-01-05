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
        verified_vendors = Profile.objects.filter(
            user__user_type='vendor',
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
            published_listings = Listing.objects.filter(is_published=True).count()

            # Listings by category (top 5)
            category_breakdown = Listing.objects.values(
                'category__title'
            ).annotate(
                count=Count('id')
            ).order_by('-count')[:5]

            return {
                'total_listings': total_listings,
                'published_listings': published_listings,
                'draft_listings': total_listings - published_listings,
                'category_breakdown': list(category_breakdown),
            }
        except Exception as e:
            # Return empty stats if services app not available
            return {
                'total_listings': 0,
                'published_listings': 0,
                'draft_listings': 0,
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
            from services.models import Order

            total_orders = Order.objects.count()

            # Orders by status
            pending_orders = Order.objects.filter(status='pending').count()
            completed_orders = Order.objects.filter(status='completed').count()
            cancelled_orders = Order.objects.filter(status='cancelled').count()

            # Revenue calculation
            total_revenue = Order.objects.filter(
                status='completed'
            ).aggregate(
                total=Sum('total_price')
            )['total'] or 0

            # Revenue in last 30 days
            thirty_days_ago = timezone.now() - timedelta(days=30)
            revenue_30d = Order.objects.filter(
                status='completed',
                created_at__gte=thirty_days_ago
            ).aggregate(
                total=Sum('total_price')
            )['total'] or 0

            # Average order value
            avg_order_value = Order.objects.filter(
                status='completed'
            ).aggregate(
                avg=Avg('total_price')
            )['avg'] or 0

            return {
                'total_orders': total_orders,
                'pending_orders': pending_orders,
                'completed_orders': completed_orders,
                'cancelled_orders': cancelled_orders,
                'total_revenue': float(total_revenue),
                'revenue_30d': float(revenue_30d),
                'avg_order_value': float(avg_order_value),
            }
        except Exception as e:
            # Return empty stats if services app not available
            return {
                'total_orders': 0,
                'pending_orders': 0,
                'completed_orders': 0,
                'cancelled_orders': 0,
                'total_revenue': 0.0,
                'revenue_30d': 0.0,
                'avg_order_value': 0.0,
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
            'timestamp': timezone.now().isoformat(),
        }
