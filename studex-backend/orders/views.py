# orders/views.py
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db import models
from django.utils import timezone
from django.contrib.auth import get_user_model
from decimal import Decimal
from .models import Order, OrderStatus, Booking, Dispute
from .serializers import OrderSerializer, OrderStatusSerializer, DisputeSerializer, BookingSerializer
import logging

logger = logging.getLogger(__name__)
User = get_user_model()

TRACKING_STATUS_ORDER = ['paid', 'confirmed', 'preparing', 'ready', 'delivered']

TRACKING_NOTIFICATIONS = {
    'confirmed': ('✅ Order Confirmed!', 'Your order has been confirmed! The vendor is getting started.'),
    'preparing': ('🍳 Order Being Prepared!', 'Your order is being prepared! 🍳'),
    'ready':     ('📦 Order Ready for Pickup!', 'Your order is ready for pickup! 📦'),
    'delivered': ('🎉 Order Delivered!', 'Order delivered! Hope you enjoy it 🎉'),
    'cancelled': ('❌ Order Cancelled', 'Your order has been cancelled. Please contact support if you have concerns.'),
}


def _notify(recipient, notification_type, title, message, action_url=""):
    try:
        from accounts.utils import send_notification
        send_notification(
            recipient=recipient, notification_type=notification_type,
            title=title, message=message, action_url=action_url,
        )
    except Exception as e:
        logger.warning(f"Notification failed: {e}")


class OrderViewSet(viewsets.ModelViewSet):
    queryset = Order.objects.all()
    serializer_class = OrderSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        from services.models import Listing
        role = self.request.query_params.get('role')
        base = self.queryset.select_related('buyer', 'listing', 'listing__vendor')
        if role == 'buyer':
            return base.filter(buyer=user).order_by('-created_at')
        vendor_listing_ids = Listing.objects.filter(vendor=user).values_list('id', flat=True)
        return base.filter(
            models.Q(buyer=user) | models.Q(listing__id__in=vendor_listing_ids)
        ).order_by('-created_at')

    def perform_create(self, serializer):
        serializer.save(buyer=self.request.user)

    @action(detail=False, methods=['get'], url_path='vendor-orders')
    def vendor_orders(self, request):
        """Returns paid/in-progress orders for this vendor's listings."""
        from services.models import Listing
        vendor_listing_ids = Listing.objects.filter(vendor=request.user).values_list('id', flat=True)
        qs = Order.objects.filter(
            listing__id__in=vendor_listing_ids,
            status__in=['paid', 'seller_completed'],
        ).select_related('buyer', 'listing').order_by('-created_at')
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['patch'], url_path='mark-complete')
    def mark_complete(self, request, pk=None):
        """Vendor marks their order as seller_completed."""
        order = self.get_object()
        if order.listing.vendor != request.user:
            return Response({"detail": "You are not the vendor for this order."}, status=403)
        if order.status not in ['paid']:
            return Response({"detail": f"Cannot mark an order with status '{order.status}' as complete."}, status=400)

        # Minimum 15 minutes must elapse after payment before vendor can claim completion.
        # Prevents marking complete before any service/delivery is even possible.
        from datetime import timedelta
        paid_time = order.paid_at or order.created_at
        elapsed = timezone.now() - paid_time
        if elapsed < timedelta(minutes=15):
            mins_left = max(1, int((timedelta(minutes=15) - elapsed).total_seconds() / 60) + 1)
            return Response(
                {"detail": f"Please wait {mins_left} more minute(s) before marking this order as complete."},
                status=400,
            )

        # Delivery proof required for physical/food orders only.
        listing_type = order.listing.listing_type
        if listing_type in ['product', 'food']:
            proof_1 = request.FILES.get('proof_1')
            if not proof_1:
                return Response(
                    {"detail": "At least one delivery proof photo is required for product/food orders."},
                    status=400,
                )
            from services.views import upload_to_cloudinary
            url_1 = upload_to_cloudinary(proof_1, folder='studex/delivery_proofs')
            if not url_1:
                return Response({"detail": "Failed to upload proof image. Please try again."}, status=500)
            order.delivery_proof_1 = url_1

            proof_2 = request.FILES.get('proof_2')
            if proof_2:
                url_2 = upload_to_cloudinary(proof_2, folder='studex/delivery_proofs')
                if url_2:
                    order.delivery_proof_2 = url_2

        order.status = 'seller_completed'
        order.seller_completed_at = timezone.now()
        order.save()
        _notify(
            recipient=order.buyer,
            notification_type='order_update',
            title=f'📦 Confirm Your Delivery — {order.listing.title}',
            message=(
                f'Your order for "{order.listing.title}" has been marked delivered by '
                f'{request.user.username}. Please open your orders and tap '
                f'"Confirm Delivery" to release payment to the vendor. '
                f'If you have an issue, you can file a dispute instead.'
            ),
            action_url='/account/orders',
        )
        return Response({"message": "Order marked as complete.", "order": self.get_serializer(order).data})

    @action(detail=True, methods=['patch'], url_path='update-status')
    def update_status(self, request, pk=None):
        """Vendor updates order tracking status with optional note and estimated time."""
        order = self.get_object()

        if order.listing.vendor != request.user:
            return Response({"detail": "Only the listing vendor can update this order's status."}, status=403)

        if order.status not in ['paid', 'seller_completed']:
            return Response({"detail": "Can only update tracking status of active paid orders."}, status=400)

        new_status = request.data.get('status')
        note = request.data.get('note', '')
        estimated_time = request.data.get('estimated_time')

        if not new_status:
            return Response({"detail": "status is required."}, status=400)

        valid_statuses = [s[0] for s in OrderStatus.TRACKING_STATUS_CHOICES]
        if new_status not in valid_statuses:
            return Response({"detail": f"Invalid status. Must be one of: {', '.join(valid_statuses)}"}, status=400)

        current = order.current_status
        if new_status != 'cancelled':
            if current not in TRACKING_STATUS_ORDER or new_status not in TRACKING_STATUS_ORDER:
                return Response({"detail": "Invalid status transition."}, status=400)
            if TRACKING_STATUS_ORDER.index(new_status) <= TRACKING_STATUS_ORDER.index(current):
                return Response(
                    {"detail": f"Cannot move from '{current}' to '{new_status}'. Status can only move forward."},
                    status=400,
                )

        order.current_status = new_status
        if estimated_time is not None:
            try:
                order.estimated_time = int(estimated_time)
            except (ValueError, TypeError):
                pass

        if new_status == 'delivered' and order.status == 'paid':
            order.status = 'seller_completed'
            order.seller_completed_at = timezone.now()
        elif new_status == 'cancelled':
            order.status = 'cancelled'

        order.save()

        OrderStatus.objects.create(order=order, status=new_status, note=note, updated_by=request.user)

        notif = TRACKING_NOTIFICATIONS.get(new_status)
        if notif:
            try:
                from accounts.utils import send_notification
                send_notification(
                    recipient=order.buyer,
                    notification_type='order_update',
                    title=notif[0],
                    message=notif[1],
                    action_url=f'/account/orders/{order.id}',
                    send_email=new_status == 'cancelled',
                )
            except Exception as e:
                logger.warning(f"Tracking notification failed: {e}")

        return Response({"message": f"Status updated to '{new_status}'.", "order": self.get_serializer(order).data})

    @action(detail=True, methods=['get'], url_path='tracking')
    def tracking(self, request, pk=None):
        """Returns full tracking history for an order (buyer or vendor)."""
        order = self.get_object()

        history_qs = OrderStatus.objects.filter(order=order).order_by('created_at')
        history = OrderStatusSerializer(history_qs, many=True).data

        synthetic_start = {
            "id": None,
            "status": "paid",
            "note": "Payment confirmed.",
            "updated_by": order.buyer.username,
            "created_at": (order.paid_at or order.created_at).isoformat(),
        }
        if not history or history[0]['status'] != 'paid':
            history = [synthetic_start] + list(history)

        return Response({
            "current_status": order.current_status,
            "estimated_time": order.estimated_time,
            "history": history,
            "order": self.get_serializer(order).data,
        })

    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        """Buyer confirms order is complete."""
        order = self.get_object()

        if order.buyer != request.user:
            return Response({"detail": "You are not the buyer of this order."}, status=403)

        if order.status == 'completed':
            return Response({"message": "Order already confirmed.", "order": self.get_serializer(order).data})

        if order.status not in ['seller_completed']:
            return Response({"detail": f"Cannot confirm an order with status: '{order.status}'."}, status=400)

        order.status = 'completed'
        order.buyer_confirmed_at = timezone.now()
        order.save()

        # Trigger vendor payout now that the buyer has confirmed delivery.
        # Deferring to this point (rather than on payment) protects buyers from vendors
        # who take payment but never deliver.
        try:
            from payments.models import PaymentTransaction
            from payments.views import _transfer_to_vendor
            txn = PaymentTransaction.objects.filter(
                reference=order.reference, status="success"
            ).first()
            if txn and not txn.transfer_reference:
                _transfer_to_vendor(txn, order.listing.title)
        except Exception as pe:
            logger.warning(f"Payout trigger failed for order {order.id}: {pe}")

        _notify(
            recipient=order.listing.vendor,
            notification_type='order_confirmed',
            title=f'✅ Order Confirmed — {order.listing.title}',
            message=(
                f'{request.user.username} has confirmed the order for '
                f'"{order.listing.title}". Your payout is being processed now.'
            ),
            action_url='/vendor/dashboard',
        )

        # Loyalty credits
        credits_awarded = False
        credits_amount = 0
        try:
            from loyalty.models import LoyaltyAccount, LoyaltyTransaction
            MILESTONE = 10
            REWARD = Decimal('200')
            account, _ = LoyaltyAccount.objects.get_or_create(user=request.user)
            account.total_completed_orders += 1
            account.save(update_fields=['total_completed_orders'])
            if account.total_completed_orders % MILESTONE == 0:
                account.credit_balance = (account.credit_balance or Decimal('0')) + REWARD
                account.save(update_fields=['credit_balance'])
                LoyaltyTransaction.objects.create(
                    account=account, type='earned', amount=REWARD,
                    description=f"Loyalty reward: {account.total_completed_orders} orders completed!",
                    order=order,
                )
                credits_awarded = True
                credits_amount = 200
        except Exception as e:
            logger.warning(f"Loyalty award skipped for order {order.id}: {e}")

        # Vendor badge + completion rate
        try:
            vendor = order.listing.vendor
            vp = vendor.profile
            old_badge = vp.vendor_badge or 'none'
            vp.on_platform_sales = (vp.on_platform_sales or 0) + 1
            sales = vp.on_platform_sales
            if sales >= 50: vp.vendor_badge = 'top'
            elif sales >= 30: vp.vendor_badge = 'trusted'
            elif sales >= 10: vp.vendor_badge = 'rising'

            vendor_orders = Order.objects.filter(listing__vendor=vendor)
            completed_count = vendor_orders.filter(status='completed').count()
            finalized_count = vendor_orders.filter(
                status__in=['completed', 'cancelled', 'disputed']
            ).count()
            vp.completion_rate = round(
                (completed_count / finalized_count * 100), 2
            ) if finalized_count > 0 else 0

            vp.save(update_fields=['on_platform_sales', 'vendor_badge', 'completion_rate'])

            if vp.vendor_badge != old_badge and vp.vendor_badge != 'none':
                badge_labels = {
                    'rising': ('🌟 Rising Vendor', 'You just earned the Rising Vendor badge — 10 completed sales!'),
                    'trusted': ('⭐ Trusted Vendor', 'Amazing! You just earned the Trusted Vendor badge — 30 completed sales!'),
                    'top': ('👑 Top Vendor', 'Outstanding! You just earned the Top Vendor badge — 50 completed sales!'),
                }
                title, msg = badge_labels.get(vp.vendor_badge, (f'Badge Upgrade: {vp.vendor_badge}', ''))
                _notify(
                    recipient=vendor,
                    notification_type='badge_upgrade',
                    title=title,
                    message=f'{msg} Keep delivering great service to maintain your badge.',
                    action_url='/vendor/dashboard',
                )
        except Exception as e:
            logger.warning(f"Vendor badge/completion update skipped: {e}")

        response_data = {
            "message": "Order confirmed! Paystack will transfer payment to the vendor.",
            "order": self.get_serializer(order).data,
            "can_review": True,
        }
        if credits_awarded:
            response_data["loyalty_reward"] = {
                "awarded": True, "amount": credits_amount,
                "message": f"🎉 You earned ₦{credits_amount} loyalty credits!",
            }

        return Response(response_data)


class DisputeViewSet(viewsets.ModelViewSet):
    queryset = Dispute.objects.all()
    serializer_class = DisputeSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.is_staff or user.is_superuser:
            return self.queryset.all()
        return self.queryset.filter(
            models.Q(order__buyer=user) | models.Q(order__listing__vendor=user)
        ).distinct()

    def create(self, request, *args, **kwargs):
        import logging as _logging
        _logger = _logging.getLogger(__name__)

        image_urls = ['', '']
        for i, field_name in enumerate(['evidence_image_1', 'evidence_image_2']):
            img = request.FILES.get(field_name)
            if img:
                try:
                    import cloudinary.uploader
                    result = cloudinary.uploader.upload(
                        img,
                        folder='studex/dispute_evidence',
                        transformation=[{'quality': 'auto', 'fetch_format': 'auto'}],
                    )
                    image_urls[i] = result.get('secure_url', '')
                except Exception as e:
                    _logger.warning(f"Cloudinary dispute image upload failed ({field_name}): {e}")

        data = request.data.copy() if hasattr(request.data, 'copy') else dict(request.data)
        data['evidence_image_1'] = image_urls[0]
        data['evidence_image_2'] = image_urls[1]

        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)

        dispute = serializer.instance
        self._send_dispute_notifications(dispute)

        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    @action(detail=True, methods=['post'])
    def respond(self, request, pk=None):
        dispute = self.get_object()
        vendor = dispute.order.listing.vendor if dispute.order.listing else None

        if request.user != vendor:
            return Response({'error': 'Only the vendor can respond to this dispute.'}, status=403)
        if dispute.provider_response:
            return Response({'error': 'You have already submitted a response.'}, status=400)
        if dispute.status == 'resolved':
            return Response({'error': 'This dispute is already resolved.'}, status=400)

        from .serializers import DisputeResponseSerializer
        serializer = DisputeResponseSerializer(dispute, data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()

        self._send_response_notifications(dispute)

        return Response({'success': True, 'status': dispute.status})

    def _send_response_notifications(self, dispute):
        try:
            order = dispute.order
            vendor = order.listing.vendor if order.listing else None
            buyer = order.buyer

            # Notify the buyer
            _notify(
                recipient=buyer,
                notification_type='dispute_response',
                title=f'Vendor responded to your dispute — Order #{order.reference}',
                message=(
                    f'{vendor.username if vendor else "The vendor"} has submitted their side of the story '
                    f'on dispute #{dispute.id}. Our support team is now reviewing both sides.'
                ),
                action_url=f'/account/orders/{order.id}',
            )

            # Email admin
            from django.conf import settings as _settings
            from studex.email import send_email, _html_wrapper
            admin_email = getattr(_settings, 'ADMIN_EMAIL', '')
            if not admin_email:
                return

            reason_label = dict(Dispute.REASON_CHOICES).get(dispute.reason, dispute.reason)
            django_admin_url = f"https://studex.com.ng/admin/orders/dispute/{dispute.id}/change/"
            body = f"""
            <p style="font-size:15px;color:#44403C;line-height:1.7;margin:0 0 12px;">
              The vendor has submitted their response. This dispute is now <strong>under review</strong>.
            </p>
            <table style="width:100%;border-collapse:collapse;font-size:14px;color:#44403C;">
              <tr><td style="padding:6px 0;font-weight:600;width:140px;">Dispute</td>
                  <td>#{dispute.id}</td></tr>
              <tr><td style="padding:6px 0;font-weight:600;">Order</td>
                  <td>#{order.reference}</td></tr>
              <tr><td style="padding:6px 0;font-weight:600;">Reason</td>
                  <td>{reason_label}</td></tr>
              <tr><td style="padding:6px 0;font-weight:600;">Buyer complaint</td>
                  <td>{dispute.complaint}</td></tr>
              <tr><td style="padding:6px 0;font-weight:600;">Vendor response</td>
                  <td>{dispute.provider_response}</td></tr>
            </table>
            <a href="{django_admin_url}"
               style="display:inline-block;margin-top:20px;padding:12px 24px;
                      background:linear-gradient(135deg,#0D9488,#7C3AED);
                      color:#ffffff;text-decoration:none;border-radius:10px;
                      font-size:14px;font-weight:600;">
              Resolve in Admin
            </a>
            """
            send_email(
                to=admin_email,
                subject=f'[StudEx] Vendor responded to Dispute #{dispute.id} — ready for review',
                html=_html_wrapper(f'Vendor Response Received — Dispute #{dispute.id}', body),
            )
        except Exception as e:
            import logging as _logging
            _logging.getLogger(__name__).error(f"dispute response notification failed: {e}")

    def _send_dispute_notifications(self, dispute):
        import logging as _logging
        _logger = _logging.getLogger(__name__)
        try:
            order = dispute.order
            filer = dispute.filer
            vendor = order.listing.vendor if order.listing else None
            reason_label = dict(Dispute.REASON_CHOICES).get(dispute.reason, dispute.reason)

            # ── Notify the vendor ────────────────────────────────────────────
            if vendor and vendor != filer:
                _notify(
                    recipient=vendor,
                    notification_type='dispute_filed',
                    title=f'⚠️ Dispute Filed — Order #{order.reference}',
                    message=(
                        f'{filer.username} has opened a dispute on order #{order.reference} '
                        f'({reason_label}). Our support team will contact you. '
                        f'Please do not attempt to contact the buyer directly.'
                    ),
                    action_url='/vendor/dashboard',
                )

            # ── Email the admin ──────────────────────────────────────────────
            from django.conf import settings as _settings
            from studex.email import send_email, _html_wrapper
            frontend_base = getattr(_settings, 'FRONTEND_BASE_URL', 'https://studex.com.ng')
            admin_email = getattr(_settings, 'ADMIN_EMAIL', '')
            if not admin_email:
                return

            django_admin_url = f"{frontend_base.rstrip('/')}/admin/orders/dispute/{dispute.id}/change/"
            img_links = ""
            if dispute.evidence_image_1:
                img_links += f'<br><a href="{dispute.evidence_image_1}" style="color:#0D9488;">Evidence Photo 1</a>'
            if dispute.evidence_image_2:
                img_links += f'<br><a href="{dispute.evidence_image_2}" style="color:#0D9488;">Evidence Photo 2</a>'

            body = f"""
            <p style="font-size:15px;color:#44403C;line-height:1.7;margin:0 0 12px;">
              A new dispute has been filed and requires your attention.
            </p>
            <table style="width:100%;border-collapse:collapse;font-size:14px;color:#44403C;">
              <tr><td style="padding:6px 0;font-weight:600;width:140px;">Order</td>
                  <td>#{order.reference}</td></tr>
              <tr><td style="padding:6px 0;font-weight:600;">Filed by</td>
                  <td>{filer.username} ({filer.email})</td></tr>
              <tr><td style="padding:6px 0;font-weight:600;">Vendor</td>
                  <td>{vendor.username if vendor else 'N/A'}</td></tr>
              <tr><td style="padding:6px 0;font-weight:600;">Reason</td>
                  <td>{reason_label}</td></tr>
              <tr><td style="padding:6px 0;font-weight:600;">Complaint</td>
                  <td>{dispute.complaint}</td></tr>
              {"<tr><td style='padding:6px 0;font-weight:600;'>Evidence text</td><td>" + dispute.evidence + "</td></tr>" if dispute.evidence else ""}
            </table>
            {img_links}
            <a href="{django_admin_url}"
               style="display:inline-block;margin-top:20px;padding:12px 24px;
                      background:linear-gradient(135deg,#0D9488,#7C3AED);
                      color:#ffffff;text-decoration:none;border-radius:10px;
                      font-size:14px;font-weight:600;">
              Review in Admin
            </a>
            """
            send_email(
                to=admin_email,
                subject=f'[StudEx] New Dispute #{dispute.id} — Order #{order.reference}',
                html=_html_wrapper(f'New Dispute Filed — #{dispute.id}', body),
            )
        except Exception as e:
            import logging as _logging
            _logging.getLogger(__name__).error(f"dispute notification failed: {e}")


class BookingViewSet(viewsets.ModelViewSet):
    serializer_class = BookingSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        from services.models import Listing
        vendor_listing_ids = Listing.objects.filter(vendor=user).values_list('id', flat=True)
        return Booking.objects.filter(
            models.Q(buyer=user) | models.Q(listing__id__in=vendor_listing_ids)
        ).select_related('buyer', 'listing', 'listing__vendor')

    def perform_create(self, serializer):
        booking = serializer.save(buyer=self.request.user)
        _notify(
            recipient=booking.listing.vendor,
            notification_type='new_booking_request',
            title=f'📅 New Booking Request — {booking.listing.title}',
            message=(
                f'{self.request.user.username} has requested a booking for '
                f'"{booking.listing.title}" on {booking.scheduled_date} at '
                f'{booking.scheduled_time}. Please confirm or cancel.'
            ),
            action_url='/vendor/dashboard',
        )

    @action(detail=True, methods=['post'], url_path='confirm')
    def confirm_booking(self, request, pk=None):
        booking = self.get_object()
        if booking.listing.vendor != request.user:
            return Response({'detail': 'Only the vendor can confirm.'}, status=403)
        if booking.status != 'pending':
            return Response({'detail': f'Booking is already {booking.status}.'}, status=400)

        booking.status = 'confirmed'
        booking.save()

        _notify(
            recipient=booking.buyer,
            notification_type='booking_confirmed',
            title=f'✅ Booking Accepted — {booking.listing.title}',
            message=(
                f'Great news! {request.user.username} has accepted your booking for '
                f'"{booking.listing.title}" on {booking.scheduled_date} at '
                f'{booking.scheduled_time}. You can now proceed to pay.'
            ),
            action_url='/account/bookings',
        )
        return Response({'detail': 'Booking confirmed.', 'status': 'confirmed'})

    @action(detail=True, methods=['post'], url_path='cancel')
    def cancel(self, request, pk=None):
        booking = self.get_object()
        is_buyer = booking.buyer == request.user
        is_vendor = booking.listing.vendor == request.user

        if not (is_buyer or is_vendor):
            return Response({'detail': 'Not allowed.'}, status=403)
        if booking.status in ['completed', 'cancelled']:
            return Response({'detail': f'Cannot cancel a {booking.status} booking.'}, status=400)

        booking.status = 'cancelled'
        booking.save()

        if is_vendor:
            _notify(
                recipient=booking.buyer,
                notification_type='booking_cancelled',
                title=f'❌ Booking Declined — {booking.listing.title}',
                message=(
                    f'Unfortunately, {request.user.username} has declined your booking for '
                    f'"{booking.listing.title}" on {booking.scheduled_date}. '
                    f'You can book again or choose another vendor.'
                ),
                action_url='/account/bookings',
            )
        elif is_buyer:
            _notify(
                recipient=booking.listing.vendor,
                notification_type='booking_cancelled',
                title=f'❌ Booking Cancelled by Buyer — {booking.listing.title}',
                message=(
                    f'{request.user.username} has cancelled their booking for '
                    f'"{booking.listing.title}" on {booking.scheduled_date}.'
                ),
                action_url='/vendor/dashboard',
            )

        return Response({'detail': 'Booking cancelled.', 'status': 'cancelled'})

    @action(detail=True, methods=['get'], url_path='checkout-config')
    def checkout_config(self, request, pk=None):
        """
        Returns Paystack checkout parameters for a confirmed booking.
        Only callable when booking.status == 'confirmed' and by the buyer.
        Feeds directly into the standard initialize_payment flow.
        """
        booking = self.get_object()

        if booking.buyer != request.user:
            return Response({'detail': 'Only the buyer can pay for a booking.'}, status=403)

        if booking.status != 'confirmed':
            return Response(
                {'detail': f'This booking cannot be paid — current status: {booking.status}.'},
                status=400,
            )

        from payments.views import calc_service_fee
        from decimal import Decimal
        amount = Decimal(str(booking.listing.price))
        service_fee = calc_service_fee(amount)
        checkout_amount = amount + service_fee

        return Response({
            'booking_id': booking.id,
            'listing_id': booking.listing.id,
            'listing_title': booking.listing.title,
            'listing_price': float(amount),
            'service_fee': float(service_fee),
            'checkout_amount': float(checkout_amount),
            'checkout_amount_kobo': int(checkout_amount * 100),
            'currency': 'NGN',
            'vendor_username': booking.listing.vendor.username,
            'scheduled_date': str(booking.scheduled_date),
            'scheduled_time': booking.scheduled_time,
        })

    @action(detail=False, methods=['get'], url_path='vendor-paid')
    def vendor_paid_bookings(self, request):
        """
        Returns paid bookings for this vendor's listings.
        Used in Vendor Dashboard → Orders tab.
        """
        from services.models import Listing
        vendor_listing_ids = Listing.objects.filter(
            vendor=request.user
        ).values_list('id', flat=True)

        paid_bookings = Booking.objects.filter(
            listing__id__in=vendor_listing_ids,
            status="paid",
        ).select_related('buyer', 'listing', 'listing__vendor').order_by('-created_at')

        serializer = self.get_serializer(paid_bookings, many=True)
        return Response(serializer.data)