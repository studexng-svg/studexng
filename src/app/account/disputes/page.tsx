"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle, ChevronDown, ChevronUp, CheckCircle, Clock, Image as ImageIcon, Package,
} from "lucide-react";
import { useAuth } from "@/lib/authStore";
import TopNav from "@/components/layout/TopNav";
import { api } from "@/lib/api";
import { useEffect } from "react";

const REASON_LABELS: Record<string, string> = {
  service_not_completed: "Service Not Completed",
  quality_issue: "Quality Issue",
  provider_no_show: "Provider No-Show",
  late_delivery: "Late Delivery",
  wrong_service: "Wrong Service Delivered",
  payment_issue: "Payment Issue",
  other: "Other",
};

const STATUS_STYLES: Record<string, string> = {
  open:         "bg-red-50 text-red-600 border border-red-200",
  under_review: "bg-amber-50 text-amber-700 border border-amber-200",
  resolved:     "bg-emerald-50 text-emerald-700 border border-emerald-200",
  appealed:     "bg-purple-50 text-purple-700 border border-purple-200",
  closed:       "bg-stone-100 text-stone-500 border border-stone-200",
};

const RESOLUTION_LABELS: Record<string, string> = {
  pending: "Decision pending",
  release_to_provider: "Funds released to vendor",
  refund_customer: "You were refunded",
  partial_split: "Partial refund issued",
  hold_pending: "Held pending further investigation",
};

interface Dispute {
  id: number;
  order: number;
  order_reference: string;
  order_listing_title: string;
  reason: string;
  complaint: string;
  evidence: string;
  evidence_image_1: string;
  evidence_image_2: string;
  provider_response: string | null;
  provider_responded_at: string | null;
  status: "open" | "under_review" | "resolved" | "appealed" | "closed";
  resolution: string;
  admin_decision: string;
  resolved_at: string | null;
  created_at: string;
}

function DisputeCard({ dispute }: { dispute: Dispute }) {
  const [expanded, setExpanded] = useState(false);
  const isResolved = dispute.status === "resolved" || dispute.status === "closed";

  return (
    <div className="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden">
      <button onClick={() => setExpanded(v => !v)} className="w-full p-4 text-left">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <p className="font-bold text-stone-900 text-sm truncate">{dispute.order_listing_title || `Order #${dispute.order_reference}`}</p>
            <p className="text-xs text-stone-400 mt-0.5">
              #{dispute.order_reference} · {new Date(dispute.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            </p>
          </div>
          <span className={`text-xs px-3 py-1 rounded-full font-semibold shrink-0 ${STATUS_STYLES[dispute.status] || "bg-stone-100 text-stone-500"}`}>
            {dispute.status.replace("_", " ")}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs bg-stone-100 text-stone-600 px-2.5 py-1 rounded-full font-medium">
            {REASON_LABELS[dispute.reason] || dispute.reason}
          </span>
          {expanded ? <ChevronUp className="w-4 h-4 text-stone-400" /> : <ChevronDown className="w-4 h-4 text-stone-400" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-stone-100 pt-3">
          <div>
            <p className="text-xs font-semibold text-stone-400 mb-1">Your complaint</p>
            <p className="text-sm text-stone-700 leading-relaxed bg-red-50 rounded-xl px-3 py-2.5">{dispute.complaint}</p>
          </div>

          {dispute.evidence && (
            <div>
              <p className="text-xs font-semibold text-stone-400 mb-1">Your evidence description</p>
              <p className="text-sm text-stone-600 leading-relaxed">{dispute.evidence}</p>
            </div>
          )}

          {(dispute.evidence_image_1 || dispute.evidence_image_2) && (
            <div>
              <p className="text-xs font-semibold text-stone-400 mb-2">Your evidence photos</p>
              <div className="flex gap-2">
                {[dispute.evidence_image_1, dispute.evidence_image_2].filter(Boolean).map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                    className="relative w-20 h-20 rounded-xl overflow-hidden border border-stone-200 block shrink-0 group">
                    <img src={url} alt={`Evidence ${i + 1}`} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition flex items-center justify-center">
                      <ImageIcon className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition" />
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}

          {dispute.provider_response ? (
            <div>
              <p className="text-xs font-semibold text-stone-400 mb-1">Vendor's response</p>
              <div className="bg-stone-50 border border-stone-100 rounded-xl px-3 py-2.5">
                <p className="text-sm text-stone-700 leading-relaxed">{dispute.provider_response}</p>
              </div>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
              <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 leading-relaxed">Waiting for the vendor to respond before admin makes a decision.</p>
            </div>
          )}

          {isResolved && (
            <div>
              <p className="text-xs font-semibold text-stone-400 mb-1">Outcome</p>
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2.5 flex gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-emerald-900 font-semibold leading-relaxed">
                    {RESOLUTION_LABELS[dispute.resolution] || dispute.resolution}
                  </p>
                  {dispute.admin_decision && (
                    <p className="text-xs text-emerald-700 mt-1 leading-relaxed">{dispute.admin_decision}</p>
                  )}
                </div>
              </div>
              {dispute.resolved_at && (
                <p className="text-xs text-stone-400 mt-1.5">
                  Resolved {new Date(dispute.resolved_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              )}
            </div>
          )}

          <Link href={`/account/orders/${dispute.order}`} className="block text-center text-xs font-semibold text-teal-600 hover:text-teal-700 pt-1">
            View Order →
          </Link>
        </div>
      )}
    </div>
  );
}

export default function BuyerDisputesPage() {
  const router = useRouter();
  const { isLoggedIn, isHydrated } = useAuth();

  useEffect(() => {
    if (isHydrated && !isLoggedIn) router.push("/auth");
  }, [isHydrated, isLoggedIn, router]);

  const { data, isPending } = useQuery<Dispute[]>({
    queryKey: ["buyer-disputes"],
    queryFn: async () => {
      const res = await api.orders.disputes();
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json();
      return Array.isArray(data) ? data : (data.results || []);
    },
    enabled: isHydrated && isLoggedIn,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const disputes = data ?? [];
  const open = disputes.filter(d => !["resolved", "closed"].includes(d.status));
  const closed = disputes.filter(d => ["resolved", "closed"].includes(d.status));

  if (!isHydrated || isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F5F5]">
        <div className="animate-spin">
          <Clock className="w-12 h-12 text-teal-600" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F5F5]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <TopNav showBack />

      <div className="px-4 pt-6 pb-24 space-y-4 max-w-2xl mx-auto">
        <div className="mb-2">
          <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-bold mb-0.5">Support</p>
          <h1 className="font-black text-stone-900 text-xl tracking-tight" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>My Disputes</h1>
          <p className="text-stone-400 text-xs mt-0.5">{open.length} open · {closed.length} resolved</p>
        </div>

        {disputes.length === 0 ? (
          <div className="text-center py-20 animate-fadeIn">
            <Package className="w-20 h-20 text-stone-300 mx-auto mb-4" />
            <p className="text-stone-500 font-medium">No disputes filed</p>
            <p className="text-stone-400 text-sm mt-2">If something goes wrong with an order, you can report it from the order's page.</p>
          </div>
        ) : (
          <>
            {open.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-bold text-stone-400 uppercase tracking-widest">Open</p>
                {open.map(d => <DisputeCard key={d.id} dispute={d} />)}
              </div>
            )}
            {closed.length > 0 && (
              <div className="space-y-3 mt-6">
                <p className="text-xs font-bold text-stone-400 uppercase tracking-widest">Resolved / Closed</p>
                {closed.map(d => <DisputeCard key={d.id} dispute={d} />)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
