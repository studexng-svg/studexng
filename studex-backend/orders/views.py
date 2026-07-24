# orders/views.py
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db import models
from django.utils import timezone
from django.contrib.auth import get_user_model
from decimal import Decimal
from .models import Order, OrderStatus, Booking, BookingReferenceImage, Dispute
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

    @action(detail=True, methods=['post'], url_path='vendor-accept')
    def vendor_accept(self, request, pk=None):
        """
        Vendor accepts an already-paid order. Under the payment-first booking flow the
        buyer pays immediately with no pre-payment vendor approval, so this is the
        vendor's first chance to act on the order — it unlocks nothing by itself (chat
        unlocks at payment, not at acceptance) but confirms the vendor will do the work.
        """
        order = self.get_object()
        if order.listing.vendor != request.user:
            return Response({"detail": "You are not the vendor for this order."}, status=403)
        if order.status != 'paid':
            return Response({"detail": f"Cannot accept an order with status '{order.status}'."}, status=400)
        if order.vendor_accepted_at is not None:
            return Response({"detail": "Order already accepted."}, status=400)

        order.vendor_accepted_at = timezone.now()
        order.save(update_fields=['vendor_accepted_at'])

        _notify(
            recipient=order.buyer,
            notification_type='order_update',
            title=f'✅ Vendor Accepted — {order.listing.title}',
            message=f'{request.user.username} has accepted your order for "{order.listing.title}" and will begin shortly.',
            action_url=f'/account/orders/{order.id}',
        )
        return Response({"message": "Order accepted.", "order": self.get_serializer(order).data})

    @action(detail=True, methods=['post'], url_path='vendor-decline')
    def vendor_decline(self, request, pk=None):
        """
        Vendor declines an already-paid order (e.g. can't make the slot). Since payout is
        deferred to buyer confirmation, no money has left StudEx's Paystack balance yet —
        a full refund is safe with no dispute needed.
        """
        order = self.get_object()
        if order.listing.vendor != request.user:
            return Response({"detail": "You are not the vendor for this order."}, status=403)
        if order.status != 'paid':
            return Response({"detail": f"Cannot decline an order with status '{order.status}'."}, status=400)
        if order.vendor_accepted_at is not None:
            return Response({"detail": "Order was already accepted and can no longer be declined."}, status=400)

        from payments.views import refund_paystack_transaction
        refunded = refund_paystack_transaction(order.reference)
        if not refunded:
            return Response({"detail": "Refund could not be initiated. Please try again shortly."}, status=502)

        order.status = 'vendor_declined'
        order.save(update_fields=['status'])

        _notify(
            recipient=order.buyer,
            notification_type='order_update',
            title=f'Order Declined — {order.listing.title}',
            message=(
                f'{request.user.username} is unable to fulfil your order for "{order.listing.title}". '
                f'A full refund has been issued.'
            ),
            action_url='/account/orders',
        )
        return Response({"message": "Order declined and buyer refunded.", "order": self.get_serializer(order).data})

    @action(detail=True, methods=['post'], url_path='start-service')
    def start_service(self, request, pk=None):
        """Vendor marks that they've begun work — distinct from acceptance and completion."""
        order = self.get_object()
        if order.listing.vendor != request.user:
            return Response({"detail": "You are not the vendor for this order."}, status=403)
        if order.vendor_accepted_at is None:
            return Response({"detail": "Accept the order before starting the service."}, status=400)
        if order.status != 'paid':
            return Response({"detail": f"Cannot start service on an order with status '{order.status}'."}, status=400)
        if order.service_started_at is not None:
            return Response({"detail": "Service already started."}, status=400)

        order.service_started_at = timezone.now()
        order.save(update_fields=['service_started_at'])

        _notify(
            recipient=order.buyer,
            notification_type='order_update',
            title=f'🚀 Service Started — {order.listing.title}',
            message=f'{request.user.username} has started your service for "{order.listing.title}".',
            action_url=f'/account/orders/{order.id}',
        )
        return Response({"message": "Service started.", "order": self.get_serializer(order).data})

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

        # Delivery proof required for physical product orders only.
        listing_type = order.listing.listing_type
        if listing_type == 'product':
            proof_1 = request.FILES.get('proof_1')
            if not proof_1:
                return Response(
                    {"detail": "At least one delivery proof photo is required for product orders."},
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

        # Phase 1 — Food Commerce Engine, Step 4 (Delivery Batch Reservation):
        # the one call site that reopens reserved capacity — orders/views.py
        # never implements batch business logic itself, just invokes the
        # reservation service. No-op for every order that never reserved
        # capacity (delivery_batch is None), and for a cancellation landing
        # after the batch's cutoff (see delivery.capacity.release_capacity).
        if new_status == 'cancelled' and order.delivery_batch_id:
            try:
                from delivery.capacity import release_capacity
                release_capacity(order)
            except Exception as e:
                logger.warning(f"release_capacity failed for order {order.id}: {e}")

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
            "timeline": self._booking_timeline(order),
            "delivery": self._delivery_evidence(order),
            "order": self.get_serializer(order).data,
        })

    def _delivery_evidence(self, order):
        """
        Rider pickup/completion evidence for orders fulfilled through the
        delivery app (see delivery.models.DeliveryAssignment) — additive to
        the response, null for any order with no rider assignment (services,
        vendor-self-fulfilled products), so this never changes the shape of
        the response for existing order types.
        """
        try:
            from delivery.models import DeliveryAssignment
            assignment = DeliveryAssignment.objects.select_related('rider').filter(order=order).first()
        except Exception:
            assignment = None
        if not assignment:
            return None
        return {
            "status": assignment.status,
            "responsibility": assignment.responsibility,
            "rider_username": assignment.rider.username if assignment.rider else None,
            "picked_up_at": assignment.picked_up_at.isoformat() if assignment.picked_up_at else None,
            "pickup_proof_image": assignment.pickup_proof_image,
            "at_pickup_point_at": assignment.at_pickup_point_at.isoformat() if assignment.at_pickup_point_at else None,
            "completed_at": assignment.completed_at.isoformat() if assignment.completed_at else None,
            "completion_proof_image": assignment.completion_proof_image,
        }

    def _booking_timeline(self, order):
        """
        The 7-step buyer-facing timeline (distinct from the delivery-tracking `history`
        above). Every step is derived from an existing timestamp — no separate history
        table for this, it's presentation logic over Order/Booking fields.
        """
        booking = Booking.objects.filter(buyer=order.buyer, listing=order.listing).order_by('-created_at').first()
        payout_released = order.status == 'completed' and order.buyer_confirmed_at is not None
        steps = [
            {"key": "booking_created", "label": "Booking Created",
             "done": booking is not None, "at": booking.created_at.isoformat() if booking else None},
            {"key": "payment_completed", "label": "Payment Completed",
             "done": order.paid_at is not None, "at": order.paid_at.isoformat() if order.paid_at else None},
            {"key": "chat_unlocked", "label": "Chat Unlocked",
             "done": order.paid_at is not None, "at": order.paid_at.isoformat() if order.paid_at else None},
            {"key": "vendor_accepted", "label": "Vendor Accepted",
             "done": order.vendor_accepted_at is not None,
             "at": order.vendor_accepted_at.isoformat() if order.vendor_accepted_at else None},
            {"key": "service_started", "label": "Service Started",
             "done": order.service_started_at is not None,
             "at": order.service_started_at.isoformat() if order.service_started_at else None},
            {"key": "completed", "label": "Completed",
             "done": order.seller_completed_at is not None,
             "at": order.seller_completed_at.isoformat() if order.seller_completed_at else None},
            {"key": "payment_released", "label": "Payment Released",
             "done": payout_released, "at": order.buyer_confirmed_at.isoformat() if payout_released else None},
        ]
        return steps

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
            from payments.views import trigger_vendor_payout
            txn = PaymentTransaction.objects.filter(
                reference=order.reference, status="success"
            ).first()
            if txn and not txn.transfer_reference:
                trigger_vendor_payout(txn, order.listing.title)
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
            from studex.email import send_email, html_wrapper
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
                html=html_wrapper(f'Vendor Response Received — Dispute #{dispute.id}', body),
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
            from studex.email import send_email, html_wrapper
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
                html=html_wrapper(f'New Dispute Filed — #{dispute.id}', body),
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

    MAX_REFERENCE_IMAGES = 5
    ALLOWED_REFERENCE_IMAGE_TYPES = {'image/jpeg', 'image/png', 'image/webp'}

    def perform_create(self, serializer):
        booking = serializer.save(buyer=self.request.user)

        images = self.request.FILES.getlist('reference_images')[:self.MAX_REFERENCE_IMAGES]
        if images:
            from services.views import upload_to_cloudinary
            for image in images:
                if image.content_type not in self.ALLOWED_REFERENCE_IMAGE_TYPES:
                    continue
                url = upload_to_cloudinary(image, folder='studex/booking_references')
                if url:
                    BookingReferenceImage.objects.create(booking=booking, image_url=url)

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
        booking.confirmed_at = timezone.now()
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
        Returns Paystack checkout parameters for a booking. Callable from 'pending'
        (the normal case under the payment-first flow — buyer pays immediately after
        booking, no vendor pre-approval) or 'confirmed' (legacy bookings that went
        through the old pre-payment vendor-approval step). Buyer-only.
        Feeds directly into the standard initialize_payment flow.
        """
        booking = self.get_object()

        if booking.buyer != request.user:
            return Response({'detail': 'Only the buyer can pay for a booking.'}, status=403)

        if booking.status not in ('pending', 'confirmed'):
            return Response(
                {'detail': f'This booking cannot be paid — current status: {booking.status}.'},
                status=400,
            )

        from decimal import Decimal
        # booking.listing.price is already all-inclusive (vendor payout + platform
        # fee baked in at listing-creation time) — no fee gets added at checkout.
        # Per-unit listings (e.g. laundry priced per cloth) instead compute the fee
        # once against the true quantity-scaled payout, not the flat listing price.
        # Uses the variant's payout_amount when the booking picked one.
        if booking.listing.is_per_unit or booking.variant_id:
            from payments.pricing import calculate_final_price
            unit_payout = booking.variant.payout_amount if booking.variant_id else booking.listing.payout_amount
            qty = booking.quantity if booking.listing.is_per_unit else 1
            from payments.settlement import get_vendor_type
            checkout_amount = calculate_final_price(
                Decimal(str(unit_payout)) * qty, campus=booking.listing.campus,
                vendor_type=get_vendor_type(booking.listing.vendor),
            )
        else:
            checkout_amount = Decimal(str(booking.listing.price))

        return Response({
            'booking_id': booking.id,
            'listing_id': booking.listing.id,
            'listing_title': booking.listing.title,
            'variant_title': booking.variant.title if booking.variant_id else None,
            'quantity': booking.quantity,
            'listing_price': float(checkout_amount),
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