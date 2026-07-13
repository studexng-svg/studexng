"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader } from "lucide-react";
import { Stepper, type StepperStep } from "@/components/ui/stepper";
import { api } from "@/lib/api";

interface OrderTimelineProps {
  orderId: number | string;
}

/**
 * Renders the 7-step buyer-facing order timeline (Booking Created, Payment
 * Completed, Chat Unlocked, Vendor Accepted, Service Started, Completed, Payment
 * Released) — sourced from GET /orders/{id}/tracking/'s `timeline` field
 * (orders/views.py OrderViewSet._booking_timeline), which derives every step from
 * an existing timestamp rather than a separate history table.
 */
export default function OrderTimeline({ orderId }: OrderTimelineProps) {
  const { data, isPending } = useQuery<{ timeline: StepperStep[] }>({
    queryKey: ["order-tracking", orderId],
    queryFn: async () => {
      const res = await api.orders.tracking(orderId);
      if (!res.ok) throw new Error("Failed to load order timeline");
      return res.json();
    },
    staleTime: 15_000,
  });

  if (isPending) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader className="w-5 h-5 text-teal-500 animate-spin" />
      </div>
    );
  }

  if (!data?.timeline?.length) return null;

  return <Stepper steps={data.timeline} />;
}
