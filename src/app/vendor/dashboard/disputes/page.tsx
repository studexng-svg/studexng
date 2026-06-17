"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, X, ChevronDown, ChevronUp, CheckCircle, Clock, Image as ImageIcon } from "lucide-react";
import { GRAD } from "@/lib/tokens";
import { EmptyState, LoadingSpinner, HEADING_FONT } from "../_shared";
import { api } from "@/lib/api";

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

function RespondModal({ dispute, onSuccess, onClose }: {
  dispute: any;
  onSuccess: (disputeId: number) => void;
  onClose: () => void;
}) {
  const [response, setResponse] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!response.trim()) return;
    setSubmitting(true); setError("");
    try {
      const res = await api.orders.respondToDispute(dispute.id, response.trim());
      if (res.ok) {
        onSuccess(dispute.id);
      } else {
        const data = await res.json();
        setError(data.error || data.detail || "Failed to submit response.");
      }
    } catch { setError("Network error. Please try again."); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={() => !submitting && onClose()}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl border border-stone-100 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-stone-900">Your Response</h3>
          <button onClick={onClose} disabled={submitting} className="p-1 text-stone-400 hover:text-stone-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="bg-red-50 border border-red-100 rounded-xl p-4 mb-4">
          <p className="text-xs font-semibold text-red-500 mb-1">Buyer's complaint</p>
          <p className="text-sm text-red-900 leading-relaxed">{dispute.complaint}</p>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">{error}</div>
        )}

        <label className="text-xs font-semibold text-stone-500 mb-1.5 block">
          Your side of the story <span className="text-red-400">*</span>
        </label>
        <textarea
          value={response}
          onChange={e => setResponse(e.target.value)}
          disabled={submitting}
          rows={5}
          placeholder="Explain what happened from your perspective. Be clear and factual — the admin will read both sides before deciding."
          className="w-full px-4 py-3 rounded-xl border border-stone-200 text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 bg-white placeholder:text-stone-400 resize-none transition disabled:opacity-50 mb-5"
        />

        <div className="flex gap-3">
          <button onClick={onClose} disabled={submitting}
            className="flex-1 py-3 bg-stone-100 text-stone-700 rounded-full font-semibold text-sm disabled:opacity-50">
            Cancel
          </button>
          <button onClick={submit} disabled={submitting || !response.trim()}
            className="flex-1 py-3 text-white rounded-full font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ background: GRAD }}>
            {submitting
              ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Submitting…</>
              : "Submit Response"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DisputeCard({ dispute, onRespond }: { dispute: any; onRespond: () => void }) {
  const [expanded, setExpanded] = useState(!dispute.provider_response);

  const needsResponse = !dispute.provider_response && dispute.status !== "resolved" && dispute.status !== "closed";

  return (
    <div className={`bg-white border rounded-2xl shadow-sm overflow-hidden ${needsResponse ? "border-red-200" : "border-stone-200"}`}>
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <p className="font-bold text-stone-900 text-sm truncate">{dispute.order_listing_title || `Order #${dispute.order_reference}`}</p>
            <p className="text-xs text-stone-400 mt-0.5">#{dispute.order_reference} · {new Date(dispute.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</p>
          </div>
          <span className={`text-xs px-3 py-1 rounded-full font-semibold shrink-0 ${STATUS_STYLES[dispute.status] || "bg-stone-100 text-stone-500"}`}>
            {dispute.status.replace("_", " ")}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs bg-stone-100 text-stone-600 px-2.5 py-1 rounded-full font-medium">
              {REASON_LABELS[dispute.reason] || dispute.reason}
            </span>
            <span className="text-xs text-stone-400">by {dispute.filer_username}</span>
          </div>
          <button onClick={() => setExpanded(v => !v)} className="text-stone-400 hover:text-stone-600 p-1">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expandable body */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-stone-100 pt-3">
          {/* Buyer complaint */}
          <div>
            <p className="text-xs font-semibold text-stone-400 mb-1">Buyer's complaint</p>
            <p className="text-sm text-stone-700 leading-relaxed bg-red-50 rounded-xl px-3 py-2.5">{dispute.complaint}</p>
          </div>

          {/* Evidence text */}
          {dispute.evidence && (
            <div>
              <p className="text-xs font-semibold text-stone-400 mb-1">Evidence description</p>
              <p className="text-sm text-stone-600 leading-relaxed">{dispute.evidence}</p>
            </div>
          )}

          {/* Evidence images */}
          {(dispute.evidence_image_1 || dispute.evidence_image_2) && (
            <div>
              <p className="text-xs font-semibold text-stone-400 mb-2">Evidence photos</p>
              <div className="flex gap-2">
                {[dispute.evidence_image_1, dispute.evidence_image_2].filter(Boolean).map((url: string, i: number) => (
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

          {/* Vendor response or respond button */}
          {dispute.provider_response ? (
            <div>
              <p className="text-xs font-semibold text-stone-400 mb-1">Your response <span className="text-emerald-500">(submitted)</span></p>
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2.5 flex gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <p className="text-sm text-emerald-900 leading-relaxed">{dispute.provider_response}</p>
              </div>
              <p className="text-xs text-stone-400 mt-1.5">
                Responded {dispute.provider_responded_at ? new Date(dispute.provider_responded_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : ""}. The admin is reviewing both sides.
              </p>
            </div>
          ) : dispute.status !== "resolved" && dispute.status !== "closed" ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
              <div className="flex items-start gap-2 mb-3">
                <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800 leading-relaxed">
                  The admin is waiting for your response before making a decision. Submit your side as soon as possible.
                </p>
              </div>
              <button
                onClick={onRespond}
                className="w-full py-2.5 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2"
                style={{ background: GRAD }}
              >
                <AlertCircle className="w-4 h-4" /> Respond to Dispute
              </button>
            </div>
          ) : (
            <p className="text-xs text-stone-400 italic">No response submitted — dispute {dispute.status}.</p>
          )}

          {/* Admin decision */}
          {dispute.admin_decision && (
            <div>
              <p className="text-xs font-semibold text-stone-400 mb-1">Admin decision</p>
              <p className="text-sm text-stone-700 leading-relaxed bg-stone-50 rounded-xl px-3 py-2.5">{dispute.admin_decision}</p>
            </div>
          )}
        </div>
      )}

      {/* Needs response banner */}
      {needsResponse && !expanded && (
        <div className="px-4 pb-3">
          <button
            onClick={() => { setExpanded(true); onRespond(); }}
            className="w-full py-2.5 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2"
            style={{ background: GRAD }}
          >
            <AlertCircle className="w-4 h-4" /> Respond to Dispute
          </button>
        </div>
      )}
    </div>
  );
}

export default function DisputesPage() {
  const queryClient = useQueryClient();
  const [respondingTo, setRespondingTo] = useState<any | null>(null);

  const { data, isPending } = useQuery({
    queryKey: ["vendor-disputes"],
    queryFn: async () => {
      const res = await api.orders.disputes();
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json();
      return Array.isArray(data) ? data : (data.results || []);
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const disputes: any[] = data ?? [];
  const open = disputes.filter(d => !["resolved", "closed"].includes(d.status));
  const closed = disputes.filter(d => ["resolved", "closed"].includes(d.status));

  if (isPending) return <LoadingSpinner />;

  return (
    <div className="pb-4">
      {respondingTo && (
        <RespondModal
          dispute={respondingTo}
          onSuccess={id => {
            queryClient.setQueryData<any[]>(["vendor-disputes"], prev =>
              prev ? prev.map(d => d.id === id ? { ...d, provider_response: "submitted", status: "under_review" } : d) : prev
            );
            setRespondingTo(null);
          }}
          onClose={() => setRespondingTo(null)}
        />
      )}

      <div className="mb-5">
        <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-bold mb-0.5">Manage</p>
        <h2 className="font-black text-stone-900 text-xl tracking-tight" style={HEADING_FONT}>Disputes</h2>
        <p className="text-stone-400 text-xs mt-0.5">{open.length} open · {closed.length} resolved</p>
      </div>

      {disputes.length === 0 ? (
        <EmptyState icon={AlertCircle} message="No disputes filed against your orders" />
      ) : (
        <div className="space-y-5">
          {open.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-bold text-stone-400 uppercase tracking-widest">Open</p>
              {open.map(d => (
                <DisputeCard key={d.id} dispute={d} onRespond={() => setRespondingTo(d)} />
              ))}
            </div>
          )}
          {closed.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-bold text-stone-400 uppercase tracking-widest">Resolved / Closed</p>
              {closed.map(d => (
                <DisputeCard key={d.id} dispute={d} onRespond={() => setRespondingTo(d)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
