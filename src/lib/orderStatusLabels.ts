// src/lib/orderStatusLabels.ts
// Escrow status labels — presentation only. Order.status in the backend still has
// just pending/paid/seller_completed/completed/disputed/cancelled/vendor_declined;
// this maps those (plus the vendor_accepted_at/service_started_at timestamps) onto
// the friendlier copy buyers/vendors see, per the escrow-status spec.

export interface OrderLike {
  status: string;
  vendor_accepted_at?: string | null;
  service_started_at?: string | null;
}

export function escrowStatusLabel(order: OrderLike): string {
  switch (order.status) {
    case "pending":
      return "Waiting for Payment";
    case "paid":
      return order.vendor_accepted_at || order.service_started_at
        ? "Service In Progress"
        : "Escrow Active";
    case "seller_completed":
      return "Awaiting Buyer Confirmation";
    case "completed":
      return "Payment Released";
    case "disputed":
      return "Disputed";
    case "cancelled":
      return "Cancelled";
    case "vendor_declined":
      return "Declined — Refunded";
    default:
      return order.status;
  }
}
