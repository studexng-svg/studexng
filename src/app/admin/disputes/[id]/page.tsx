// src/app/admin/disputes/[id]/page.tsx
"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import AdminTopBar from "@/components/layout/AdminTopBar";
import { api } from "@/lib/api";
import { GRAD } from "@/lib/tokens";

const STATUS_STYLE: Record<string, string> = {
  open:         "bg-red-100 text-red-700",
  under_review: "bg-amber-100 text-amber-700",
  resolved:     "bg-teal-100 text-teal-700",
  appealed:     "bg-purple-100 text-purple-700",
  closed:       "bg-stone-100 text-stone-500",
};

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex justify-between py-3 border-b border-stone-100 last:border-0 gap-4">
      <p className="text-stone-500 text-sm flex-shrink-0">{label}</p>
      <p className="font-semibold text-stone-900 text-sm text-right">{value}</p>
    </div>
  );
}

export default function AdminDisputeDetail() {
  const { id } = useParams();
  const router = useRouter();
  const [dispute, setDispute] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [decision, setDecision] = useState("");
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    if (!id) return;
    api.admin.dispute(id as string)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => { setDispute(d); setDecision(d.admin_decision || ""); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const resolve = async (resolution: string) => {
    if (!decision.trim()) { alert("Please enter an admin decision note first."); return; }
    setActionError("");
    setSaving(true);
    try {
      const res = await api.admin.updateDispute(id as string, { status: "resolved", resolution, admin_decision: decision });
      if (res.ok) {
        setDispute(await res.json());
      } else {
        const body = await res.json().catch(() => ({}));
        setActionError(body.error || `Action failed (${res.status}). Check server logs.`);
      }
    } catch (e: any) {
      setActionError("Network error — please try again.");
    } finally { setSaving(false); }
  };

  const markUnderReview = async () => {
    setActionError("");
    setSaving(true);
    try {
      const res = await api.admin.updateDispute(id as string, { status: "under_review" });
      if (res.ok) {
        setDispute(await res.json());
      } else {
        const body = await res.json().catch(() => ({}));
        setActionError(body.error || `Action failed (${res.status}).`);
      }
    } catch {
      setActionError("Network error — please try again.");
    } finally { setSaving(false); }
  };

  if (loading) return (
    <div className="min-h-screen bg-[#F5F5F5] flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-stone-200 border-t-teal-500 rounded-full animate-spin" />
    </div>
  );
  if (!dispute) return (
    <div className="min-h-screen bg-[#F5F5F5] flex flex-col items-center justify-center gap-4">
      <AlertTriangle className="w-12 h-12 text-stone-300" />
      <p className="text-stone-500">Dispute not found</p>
      <button onClick={() => router.back()} className="px-5 py-2.5 bg-white border border-stone-200 rounded-full text-sm font-semibold">Go back</button>
    </div>
  );

  const resolved = dispute.status === "resolved" || dispute.status === "closed";

  return (
    <div className="min-h-screen bg-[#F5F5F5]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <AdminTopBar title={`Dispute #${dispute.id}`} back="/admin/disputes" />

      <div className="px-6 pt-5 pb-28 space-y-4">

        {/* Status */}
        <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <p className="text-stone-600 text-sm font-medium">Status</p>
          <span className={`px-3 py-1 rounded-full text-xs font-bold ${STATUS_STYLE[dispute.status] || "bg-stone-100 text-stone-600"}`}>
            {(dispute.status || "").replace("_", " ")}
          </span>
        </div>

        {/* Order info */}
        <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
          <p className="text-teal-600 text-xs tracking-[0.2em] uppercase font-semibold mb-2">Order Info</p>
          <InfoRow label="Order Ref"  value={dispute.order_reference} />
          <InfoRow label="Amount"     value={dispute.order_amount ? `₦${Number(dispute.order_amount).toLocaleString()}` : null} />
          <InfoRow label="Buyer"      value={dispute.order_buyer} />
          <InfoRow label="Seller"     value={dispute.order_seller} />
          <InfoRow label="Filed by"   value={`@${dispute.filer_username} (${dispute.filed_by})`} />
          <InfoRow label="Reason"     value={(dispute.reason || "").replace(/_/g, " ")} />
          <InfoRow label="Filed"      value={dispute.created_at ? new Date(dispute.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }) : null} />
        </div>

        {/* Complaint */}
        <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
          <p className="text-teal-600 text-xs tracking-[0.2em] uppercase font-semibold mb-2">Complaint</p>
          <p className="text-stone-700 text-sm leading-relaxed">{dispute.complaint}</p>
          {dispute.evidence && (
            <div className="mt-3 pt-3 border-t border-stone-100">
              <p className="text-stone-500 text-xs font-semibold mb-1">Evidence description</p>
              <p className="text-stone-600 text-sm">{dispute.evidence}</p>
            </div>
          )}
          {(dispute.evidence_image_1 || dispute.evidence_image_2) && (
            <div className="mt-3 pt-3 border-t border-stone-100">
              <p className="text-stone-500 text-xs font-semibold mb-2">Evidence photos</p>
              <div className="flex gap-3">
                {[dispute.evidence_image_1, dispute.evidence_image_2].filter(Boolean).map((url: string, i: number) => (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                    className="relative w-28 h-28 rounded-xl overflow-hidden border border-stone-200 block shrink-0 group">
                    <img src={url} alt={`Evidence ${i + 1}`} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition flex items-center justify-center">
                      <span className="text-white text-xs font-semibold opacity-0 group-hover:opacity-100 transition">Open</span>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Provider response */}
        {dispute.provider_response && (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 shadow-sm">
            <p className="text-blue-700 text-xs tracking-[0.2em] uppercase font-semibold mb-2">Provider Response</p>
            <p className="text-stone-700 text-sm leading-relaxed">{dispute.provider_response}</p>
          </div>
        )}

        {/* Resolution info (if already resolved) */}
        {dispute.admin_decision && (
          <div className="bg-teal-50 border border-teal-200 rounded-2xl p-4 shadow-sm">
            <p className="text-teal-700 text-xs tracking-[0.2em] uppercase font-semibold mb-2">Admin Decision</p>
            <p className="text-stone-700 text-sm">{dispute.admin_decision}</p>
            <InfoRow label="Resolution" value={(dispute.resolution || "").replace(/_/g, " ")} />
          </div>
        )}

        {/* Admin Actions */}
        {!resolved && (
          <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm space-y-3">
            <p className="text-teal-600 text-xs tracking-[0.2em] uppercase font-semibold">Admin Actions</p>

            {actionError && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-sm text-red-700">
                {actionError}
              </div>
            )}

            <textarea
              rows={3}
              className="w-full bg-white text-stone-900 border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 placeholder:text-stone-400"
              placeholder="Admin decision note (required to resolve)…"
              value={decision}
              onChange={e => setDecision(e.target.value)}
            />

            {dispute.status === "open" && (
              <button onClick={markUnderReview} disabled={saving || !decision.trim()}
                className="w-full py-3 bg-amber-100 text-amber-700 font-semibold rounded-xl text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:enabled:bg-amber-200 transition">
                {saving ? "Updating…" : "Mark Under Review"}
              </button>
            )}

            <button onClick={() => resolve("release_to_provider")} disabled={saving || !decision.trim()}
              className="w-full py-3 text-white font-semibold rounded-xl text-sm disabled:opacity-40 disabled:cursor-not-allowed transition"
              style={{ background: GRAD }}>
              {saving ? "Resolving…" : "Resolve — Release to Seller"}
            </button>

            <button onClick={() => resolve("refund_customer")} disabled={saving || !decision.trim()}
              className="w-full py-3 bg-red-100 text-red-700 font-semibold rounded-xl text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:enabled:bg-red-200 transition">
              {saving ? "Resolving…" : "Resolve — Refund Buyer"}
            </button>

            <button onClick={() => resolve("hold_pending")} disabled={saving || !decision.trim()}
              className="w-full py-3 bg-stone-100 text-stone-700 font-semibold rounded-xl text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:enabled:bg-stone-200 transition">
              {saving ? "Updating…" : "Hold Pending Investigation"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
