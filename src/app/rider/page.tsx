"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/authStore";
import { api } from "@/lib/api";
import { compressImage } from "@/lib/utils";
import { TEAL } from "@/lib/tokens";
import TopNav from "@/components/layout/TopNav";
import {
  Package, CheckCircle, Truck, Clock, Camera, X, AlertCircle,
  TrendingUp, CalendarCheck, ListChecks, Activity, Phone,
  ChevronRight, MapPin, RotateCcw, Receipt, Hash,
} from "lucide-react";
import { BarChart, Bar, ResponsiveContainer, Tooltip, XAxis } from "recharts";

interface Assignment {
  id: number;
  order_id: number;
  order_reference: string;
  order_status: string;
  listing_title: string;
  vendor_username: string;
  buyer_username: string;
  buyer_phone: string | null;
  pickup_point_name: string | null;
  pickup_point_campus: string | null;
  delivery_location: string | null;
  status: string;
  assigned_at: string;
  picked_up_at: string | null;
  at_pickup_point_at: string | null;
  completed_at?: string | null;
  pickup_proof_image?: string | null;
  completion_proof_image?: string | null;
  batch_id?: number | null;
  batch_display_name?: string | null;
  // Full receipt total the buyer paid at checkout (delivery fee folded in)
  // — frozen at checkout, so it does NOT drop if an item is later refunded;
  // see the "Refunded" note computed client-side in OrderDetailModal instead.
  order_amount?: string;
  order_delivery_fee?: string;
  items?: {
    id: number; listing_title: string; image: string | null; quantity: number; status: string;
    unit_price?: string; line_total?: string;
    addons: { name: string; price_delta?: string; quantity?: number }[];
  }[];
}

interface BatchGroup {
  batch_id: number;
  display_name: string;
  vendor_username: string;
  delivery_time: string;
  cutoff_time: string;
  status: string;
  assignments: Assignment[];
}

interface Stats {
  active_count: number;
  completed_today: number;
  completed_this_week: number;
  total_completed: number;
  daily_counts: { date: string; label: string; count: number }[];
}

const STATUS_LABELS: Record<string, string> = {
  assigned: "Collect from vendor",
  picked_up: "Take to pickup point",
  at_pickup_point: "Awaiting buyer",
};

const STATUS_NEXT: Record<string, string> = {
  assigned: "picked_up",
  picked_up: "at_pickup_point",
  at_pickup_point: "completed",
};

const STATUS_ACTION: Record<string, string> = {
  assigned: "Mark as Picked Up",
  picked_up: "Mark as Delivered to Pickup Point",
  at_pickup_point: "Mark as Collected by Buyer",
};

const STATUS_COLOR: Record<string, string> = {
  assigned: "bg-amber-100 text-amber-700",
  picked_up: "bg-blue-100 text-blue-700",
  at_pickup_point: "bg-teal-100 text-teal-700",
};

// 'picked_up' (proof of collection from vendor) and 'completed' (delivery
// code + proof of handoff to buyer) both require extra input the rider must
// provide before the status can advance — see delivery/views.py
// RiderUpdateStatusView. 'at_pickup_point' needs nothing extra.
const REQUIRES_PROOF: Record<string, boolean> = {
  picked_up: true,
  completed: true,
};

function naira(v: string | number | undefined | null): string {
  const n = Number(v ?? 0);
  return `₦${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function StatCard({
  label, value, sub, icon: Icon, color, bg,
}: {
  label: string; value: string | number; sub?: string; icon: any; color: string; bg: string;
}) {
  return (
    <div className={`${bg} rounded-2xl p-5 border flex items-start gap-4 shadow-sm`}>
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-stone-400 font-medium leading-none mb-1">{label}</p>
        <p className="text-2xl font-black text-stone-900 leading-tight">{value}</p>
        {sub && <p className="text-xs text-stone-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function ProofModal({
  assignment, nextStatus, onClose, onSubmit, submitting, error,
}: {
  assignment: Assignment;
  nextStatus: string;
  onClose: () => void;
  onSubmit: (args: { proofImage: File; deliveryCode?: string }) => void;
  submitting: boolean;
  error: string;
}) {
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [code, setCode] = useState("");

  const pickImage = async (file?: File) => {
    if (!file) return;
    const compressed = await compressImage(file);
    setImage(compressed);
    setPreview(URL.createObjectURL(compressed));
  };

  const isCompletion = nextStatus === "completed";
  const canSubmit = !!image && (!isCompletion || code.trim().length > 0);

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => !submitting && onClose()}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-5 space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="font-bold text-stone-900 text-base">
            {isCompletion ? "Confirm Handoff to Buyer" : "Confirm Pickup from Vendor"}
          </p>
          <button onClick={onClose} disabled={submitting} className="p-1 text-stone-400 hover:text-stone-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-stone-400">
          {isCompletion
            ? `Ask ${assignment.buyer_username} for the delivery code shown on their order page, and take a photo of the handoff.`
            : `Take a photo proving you collected "${assignment.listing_title}" from @${assignment.vendor_username}.`}
        </p>

        {isCompletion && (
          <div>
            <label className="text-xs font-semibold text-stone-600 mb-1 block">Delivery code</label>
            <input
              value={code}
              onChange={e => setCode(e.target.value)}
              placeholder="e.g. 4821"
              className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-900 tracking-widest focus:outline-none focus:ring-2 focus:ring-teal-400 transition"
            />
          </div>
        )}

        <label className="w-full aspect-video rounded-xl border-2 border-dashed border-stone-200 flex flex-col items-center justify-center cursor-pointer hover:border-teal-400 transition overflow-hidden bg-stone-50">
          {preview ? (
            <img src={preview} alt="" className="w-full h-full object-cover" />
          ) : (
            <>
              <Camera className="w-7 h-7 text-stone-300 mb-1" />
              <span className="text-xs text-stone-400 font-medium">Tap to take a photo</span>
            </>
          )}
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => pickImage(e.target.files?.[0])} />
        </label>

        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-600">{error}</p>
          </div>
        )}

        <button
          onClick={() => image && onSubmit({ proofImage: image, deliveryCode: isCompletion ? code.trim() : undefined })}
          disabled={!canSubmit || submitting}
          className="w-full py-3.5 rounded-full font-bold text-white text-sm disabled:opacity-50 transition"
          style={{ background: TEAL }}
        >
          {submitting ? "Submitting…" : "Confirm"}
        </button>
      </div>
    </div>
  );
}

const ORDER_STATUS_LABELS: Record<string, string> = {
  cancelled: "Refunded",
  completed: "Delivered",
  seller_completed: "Delivered",
};

function OrderDetailModal({ a, onClose }: { a: Assignment; onClose: () => void }) {
  const dropoffLabel = a.pickup_point_name
    ? `${a.pickup_point_name} · ${a.pickup_point_campus}`
    : (a.delivery_location || "Location not provided");

  const items = a.items ?? [];
  const itemsSubtotal = items.reduce((sum, item) => sum + Number(item.line_total ?? 0), 0);
  const refundedAmount = items
    .filter(item => item.status === "unavailable")
    .reduce((sum, item) => sum + Number(item.line_total ?? 0), 0);

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-3xl shadow-2xl w-full sm:max-w-md max-h-[92vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-stone-100 px-5 py-4 flex items-start justify-between z-10">
          <div>
            <p className="text-xs text-stone-400 flex items-center gap-1"><Hash className="w-3 h-3" /> Order {a.order_reference}</p>
            <p className="text-[11px] text-stone-300 mt-0.5">Order ID: {a.order_id}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLOR[a.status] || "bg-stone-100 text-stone-500"}`}>
              {ORDER_STATUS_LABELS[a.order_status] || STATUS_LABELS[a.status] || a.status}
            </span>
            <button onClick={onClose} className="p-1 text-stone-400 hover:text-stone-700">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* Route */}
          <div className="flex gap-3 bg-stone-50 rounded-2xl p-3">
            <div className="flex flex-col items-center pt-1">
              <span className="w-2 h-2 rounded-full bg-stone-300 flex-shrink-0" />
              <span className="w-px flex-1 bg-stone-200 my-1" />
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: TEAL }} />
            </div>
            <div className="flex-1 min-w-0 space-y-3">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-stone-400 font-bold">Pickup</p>
                <p className="text-sm text-stone-800 font-semibold truncate">@{a.vendor_username}</p>
              </div>
              <div className="flex items-end justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wide text-stone-400 font-bold flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> Drop-off
                  </p>
                  <p className="text-sm text-stone-800 font-semibold">{dropoffLabel}</p>
                  <p className="text-xs text-stone-400">@{a.buyer_username}{a.buyer_phone ? ` · ${a.buyer_phone}` : ""}</p>
                </div>
                {a.buyer_phone && (
                  <a href={`tel:${a.buyer_phone}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-white flex-shrink-0"
                    style={{ background: TEAL }}>
                    <Phone className="w-3.5 h-3.5" /> Call
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Itemized breakdown */}
          <div>
            <p className="text-xs font-bold text-stone-400 uppercase tracking-wide mb-2">
              What they ordered ({items.length} item{items.length !== 1 ? "s" : ""})
            </p>
            <div className="space-y-2.5">
              {items.map(item => (
                <div key={item.id} className={`rounded-xl border px-3 py-2.5 ${item.status === "unavailable" ? "border-red-100 bg-red-50" : "border-stone-100 bg-stone-50"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm font-bold ${item.status === "unavailable" ? "text-stone-400 line-through" : "text-stone-900"}`}>
                      {item.quantity}x {item.listing_title}
                    </p>
                    <div className="text-right flex-shrink-0">
                      <p className={`text-sm font-bold ${item.status === "unavailable" ? "text-stone-400 line-through" : "text-stone-900"}`}>
                        {naira(item.line_total)}
                      </p>
                      {item.status === "unavailable" && (
                        <span className="text-[10px] font-semibold text-red-500">Refunded</span>
                      )}
                    </div>
                  </div>
                  {!!item.unit_price && Number(item.quantity) > 1 && (
                    <p className="text-[11px] text-stone-400 mt-0.5">{naira(item.unit_price)} each</p>
                  )}
                  {!!item.addons?.length && (
                    <div className="mt-1.5 pt-1.5 border-t border-stone-200/70 space-y-0.5">
                      {item.addons.map((ad, i) => (
                        <div key={i} className="flex items-center justify-between text-xs text-stone-500">
                          <span>+ {ad.quantity && ad.quantity > 1 ? `${ad.quantity}x ` : ""}{ad.name}</span>
                          {!!ad.price_delta && Number(ad.price_delta) > 0 && (
                            <span>{naira(Number(ad.price_delta) * (ad.quantity || 1))}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div className="bg-stone-50 rounded-2xl p-4 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-stone-500">
              <span>Items subtotal</span>
              <span>{naira(itemsSubtotal)}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-stone-500">
              <span>Delivery fee</span>
              <span>{Number(a.order_delivery_fee) > 0 ? naira(a.order_delivery_fee) : "Free"}</span>
            </div>
            {refundedAmount > 0 && (
              <div className="flex items-center justify-between text-xs text-red-500">
                <span>Refunded to buyer</span>
                <span>-{naira(refundedAmount)}</span>
              </div>
            )}
            <div className="flex items-center justify-between pt-1.5 mt-1.5 border-t border-stone-200">
              <span className="text-sm font-bold text-stone-900 flex items-center gap-1.5"><Receipt className="w-4 h-4" /> Total paid at checkout</span>
              <span className="text-base font-black text-stone-900">{naira(a.order_amount)}</span>
            </div>
          </div>

          {/* Timeline */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-400">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 flex-shrink-0" />
              <span>Assigned {new Date(a.assigned_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
            </div>
            {a.picked_up_at && (
              <span>Picked up {new Date(a.picked_up_at).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" })}</span>
            )}
            {a.completed_at && (
              <span>Delivered {new Date(a.completed_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AssignmentCard({
  a, updating, onUpdate, error, onMarkUnavailable, markingItem, onViewDetails,
}: {
  a: Assignment;
  updating: number | null;
  onUpdate: (a: Assignment) => void;
  error?: string;
  onMarkUnavailable: (a: Assignment, itemId: number) => void;
  markingItem: number | null;
  onViewDetails: (a: Assignment) => void;
}) {
  const heroImage = a.items?.find(item => item.image)?.image;
  const dropoffLabel = a.pickup_point_name
    ? `${a.pickup_point_name} · ${a.pickup_point_campus}`
    : (a.delivery_location || "Location not provided");

  return (
    <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
      <button onClick={() => onViewDetails(a)} className="w-full p-3 flex gap-3 text-left hover:bg-stone-50 transition">
        <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 bg-stone-100">
          {heroImage ? (
            <img src={heroImage} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-stone-100 to-stone-200">
              <Package className="w-6 h-6 text-stone-300" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs text-stone-400 truncate">Order #{a.order_reference}</p>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_COLOR[a.status] || "bg-stone-100 text-stone-500"}`}>
              {STATUS_LABELS[a.status] || a.status}
            </span>
          </div>
          {a.items?.length ? (
            <p className="text-sm font-bold text-stone-900 truncate mt-0.5">
              {a.items[0].quantity}x {a.items[0].listing_title}
              {a.items.length > 1 && <span className="text-stone-400 font-normal"> +{a.items.length - 1} more</span>}
            </p>
          ) : (
            <p className="text-sm font-bold text-stone-900 truncate mt-0.5">{a.listing_title}</p>
          )}
          {!!a.items?.[0]?.addons?.length && (
            <p className="text-xs text-stone-500 truncate">+ {a.items[0].addons.map(ad => ad.name).join(", ")}</p>
          )}
          <p className="text-[11px] text-teal-600 font-semibold flex items-center gap-0.5 mt-1">
            Full order details <ChevronRight className="w-3 h-3" />
          </p>
        </div>
      </button>

      <div className="px-4 pb-4 space-y-4">
        {/* Route timeline: vendor -> drop-off */}
        <div className="flex gap-3 bg-stone-50 rounded-2xl p-3">
          <div className="flex flex-col items-center pt-1">
            <span className="w-2 h-2 rounded-full bg-stone-300 flex-shrink-0" />
            <span className="w-px flex-1 bg-stone-200 my-1" />
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: TEAL }} />
          </div>
          <div className="flex-1 min-w-0 space-y-3">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-stone-400 font-bold">Pickup</p>
              <p className="text-sm text-stone-800 font-semibold truncate">@{a.vendor_username}</p>
            </div>
            <div className="flex items-end justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wide text-stone-400 font-bold">Drop-off</p>
                <p className="text-sm text-stone-800 font-semibold truncate">{dropoffLabel}</p>
                <p className="text-xs text-stone-400 truncate">@{a.buyer_username}</p>
              </div>
              {a.buyer_phone ? (
                <a href={`tel:${a.buyer_phone}`}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-white flex-shrink-0"
                  style={{ background: TEAL }}>
                  <Phone className="w-3.5 h-3.5" /> Call
                </a>
              ) : (
                <span className="text-[11px] text-stone-400 flex-shrink-0">No phone on file</span>
              )}
            </div>
          </div>
        </div>

        {/* Item availability — only actionable before pickup verification;
            the backend rejects this once responsibility has transferred. */}
        {a.status === "assigned" && !!a.items?.length && (
          <div className="space-y-1.5">
            {a.items.map(item => (
              <div key={item.id} className="flex items-center justify-between gap-2 bg-stone-50 rounded-xl px-3 py-2">
                <div className="min-w-0">
                  <p className={`text-xs font-medium ${item.status === "unavailable" ? "text-stone-400 line-through" : "text-stone-700"}`}>
                    {item.quantity}x {item.listing_title}
                  </p>
                </div>
                {item.status === "unavailable" ? (
                  <span className="text-[11px] font-semibold text-red-500 flex-shrink-0">Refunded</span>
                ) : (
                  <button
                    onClick={() => onMarkUnavailable(a, item.id)}
                    disabled={markingItem === item.id}
                    className="text-[11px] font-semibold text-red-500 bg-red-50 px-2.5 py-1 rounded-full flex-shrink-0 disabled:opacity-50 hover:bg-red-100 transition"
                  >
                    {markingItem === item.id ? "…" : "Mark Unavailable"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Meta */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-400">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 flex-shrink-0" />
            <span>Assigned {new Date(a.assigned_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
          </div>
          {a.picked_up_at && (
            <div className="flex items-center gap-1.5 text-teal-600 font-medium">
              <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>Picked up {new Date(a.picked_up_at).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" })}</span>
            </div>
          )}
        </div>

        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-600">{error}</p>
          </div>
        )}
      </div>

      {STATUS_NEXT[a.status] && (
        <button
          onClick={() => onUpdate(a)}
          disabled={updating === a.id}
          className="w-full py-3.5 text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-60 transition"
          style={{ background: TEAL }}
        >
          {updating === a.id ? (
            <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
          ) : (
            <>
              <CheckCircle className="w-4 h-4" />
              {STATUS_ACTION[a.status]}
            </>
          )}
        </button>
      )}
    </div>
  );
}

function HistoryCard({ a, onViewDetails }: { a: Assignment; onViewDetails: (a: Assignment) => void }) {
  return (
    <button onClick={() => onViewDetails(a)} className="w-full bg-white rounded-2xl border border-stone-100 shadow-sm p-4 flex gap-3 text-left hover:bg-stone-50 transition">
      {a.completion_proof_image ? (
        <img src={a.completion_proof_image} alt="" className="w-14 h-14 rounded-xl object-cover flex-shrink-0" />
      ) : (
        <div className="w-14 h-14 rounded-xl bg-stone-100 flex items-center justify-center flex-shrink-0">
          <CheckCircle className="w-5 h-5 text-stone-300" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="font-bold text-stone-900 text-sm truncate">{a.listing_title}</p>
        <p className="text-xs text-stone-400 mt-0.5">Order #{a.order_reference} · @{a.vendor_username} → @{a.buyer_username}</p>
        {a.completed_at && (
          <p className="text-xs text-teal-600 mt-1 font-medium">
            Delivered {new Date(a.completed_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
          </p>
        )}
      </div>
      <ChevronRight className="w-4 h-4 text-stone-300 flex-shrink-0 self-center" />
    </button>
  );
}

function RefundedCard({ a, onViewDetails }: { a: Assignment; onViewDetails: (a: Assignment) => void }) {
  const label = a.items?.length
    ? `${a.items[0].quantity}x ${a.items[0].listing_title}${a.items.length > 1 ? ` +${a.items.length - 1} more` : ""}`
    : a.listing_title;
  return (
    <button onClick={() => onViewDetails(a)} className="w-full bg-white rounded-2xl border border-red-100 shadow-sm p-4 flex gap-3 text-left hover:bg-red-50/40 transition">
      <div className="w-14 h-14 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
        <RotateCcw className="w-5 h-5 text-red-400" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="font-bold text-stone-900 text-sm truncate">{label}</p>
          <span className="text-[10px] font-semibold text-red-500 bg-red-100 px-2 py-0.5 rounded-full flex-shrink-0">Refunded</span>
        </div>
        <p className="text-xs text-stone-400 mt-0.5">Order #{a.order_reference} · @{a.vendor_username} → @{a.buyer_username}</p>
        <p className="text-xs text-stone-400 mt-1">Buyer was refunded — no delivery needed.</p>
      </div>
      <ChevronRight className="w-4 h-4 text-stone-300 flex-shrink-0 self-center" />
    </button>
  );
}

export default function RiderDashboard() {
  const { user, isLoggedIn, isHydrated } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<"active" | "refunded" | "history">("active");
  const [batches, setBatches] = useState<BatchGroup[]>([]);
  const [unbatched, setUnbatched] = useState<Assignment[]>([]);
  const [refunded, setRefunded] = useState<Assignment[]>([]);
  const [history, setHistory] = useState<Assignment[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refundedLoading, setRefundedLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [updating, setUpdating] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [proofModal, setProofModal] = useState<{ assignment: Assignment; nextStatus: string } | null>(null);
  const [modalError, setModalError] = useState("");
  const [markingItem, setMarkingItem] = useState<number | null>(null);
  const [detailAssignment, setDetailAssignment] = useState<Assignment | null>(null);

  const loadActive = () => {
    Promise.all([
      api.delivery.myBatches().then(r => r.ok ? r.json() : { batches: [], unbatched: [] }).catch(() => ({ batches: [], unbatched: [] })),
      api.delivery.myStats().then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([batchData, statsData]) => {
      setBatches(Array.isArray(batchData?.batches) ? batchData.batches : []);
      setUnbatched(Array.isArray(batchData?.unbatched) ? batchData.unbatched : []);
      setStats(statsData);
    }).finally(() => setLoading(false));
  };

  // Fully-refunded orders (delivery.views.RiderRefundedListView) — kept out
  // of myBatches() so a dead order stops obstructing the active list.
  const loadRefunded = () => {
    setRefundedLoading(true);
    api.delivery.myRefunded()
      .then(r => r.ok ? r.json() : [])
      .then(data => setRefunded(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setRefundedLoading(false));
  };

  const loadHistory = () => {
    setHistoryLoading(true);
    api.delivery.myHistory()
      .then(r => r.ok ? r.json() : [])
      .then(data => setHistory(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  };

  useEffect(() => {
    if (!isHydrated) return;
    if (!isLoggedIn) { router.push("/auth"); return; }
    if (user?.user_type !== "rider") { router.push("/home"); return; }
    loadActive();
  }, [isHydrated, isLoggedIn, user, router]);

  useEffect(() => {
    if (tab === "history" && history.length === 0) loadHistory();
    if (tab === "refunded" && refunded.length === 0) loadRefunded();
  }, [tab]);

  const assignments = [...batches.flatMap(b => b.assignments), ...unbatched];

  const submitStatus = async (
    assignment: Assignment, next: string, extra?: { proofImage: File; deliveryCode?: string },
  ) => {
    setUpdating(assignment.id);
    setErrors(prev => { const p = { ...prev }; delete p[assignment.id]; return p; });
    if (extra) setModalError("");
    try {
      const res = await api.delivery.updateStatus(assignment.id, next, extra);
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setProofModal(null);
        loadActive();
      } else {
        const message = data.error || "Could not update status. Please try again.";
        if (extra) setModalError(message);
        else setErrors(prev => ({ ...prev, [assignment.id]: message }));
      }
    } catch {
      const message = "Network error. Please try again.";
      if (extra) setModalError(message);
      else setErrors(prev => ({ ...prev, [assignment.id]: message }));
    }
    setUpdating(null);
  };

  const updateStatus = (assignment: Assignment) => {
    const next = STATUS_NEXT[assignment.status];
    if (!next) return;
    if (REQUIRES_PROOF[next]) {
      setModalError("");
      setProofModal({ assignment, nextStatus: next });
      return;
    }
    submitStatus(assignment, next);
  };

  const markItemUnavailable = async (assignment: Assignment, itemId: number) => {
    if (!confirm("Mark this item unavailable? The buyer will be refunded for it automatically.")) return;
    setMarkingItem(itemId);
    setErrors(prev => { const p = { ...prev }; delete p[assignment.id]; return p; });
    try {
      const res = await api.orders.markItemUnavailable(assignment.order_id, itemId);
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        loadActive();
      } else {
        setErrors(prev => ({ ...prev, [assignment.id]: data.detail || "Could not mark item unavailable." }));
      }
    } catch {
      setErrors(prev => ({ ...prev, [assignment.id]: "Network error. Please try again." }));
    }
    setMarkingItem(null);
  };

  const greeting = user?.username ? `Hello, ${user.username}!` : "Rider Dashboard";

  return (
    <div className="h-screen overflow-y-auto hide-scrollbar bg-[#F5F5F5]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <TopNav showBack />

      <div className="px-4 pt-4 pb-28 max-w-2xl mx-auto space-y-5">

        {/* ── GREETING ── */}
        <div className="animate-fadeUp">
          <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-semibold">Rider Portal</p>
          <h1 className="text-2xl font-black text-stone-900 mt-0.5" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{greeting}</h1>
          <p className="text-stone-400 text-sm mt-0.5">Here's your delivery activity.</p>
        </div>

        {/* ── STAT CARDS ── */}
        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-white rounded-2xl p-5 border border-stone-100 shadow-sm animate-pulse">
                <div className="w-11 h-11 rounded-xl bg-stone-200 mb-3" />
                <div className="h-3 bg-stone-200 rounded w-3/4 mb-2" />
                <div className="h-6 bg-stone-200 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Active Deliveries" value={stats?.active_count ?? 0} sub="In progress"
              icon={Truck} color="bg-teal-100 text-teal-700" bg="bg-white border-teal-100" />
            <StatCard label="Completed Today" value={stats?.completed_today ?? 0} sub="Since midnight"
              icon={CalendarCheck} color="bg-blue-100 text-blue-700" bg="bg-white border-blue-100" />
            <StatCard label="This Week" value={stats?.completed_this_week ?? 0} sub="Last 7 days"
              icon={TrendingUp} color="bg-purple-100 text-purple-700" bg="bg-white border-purple-100" />
            <StatCard label="Total Delivered" value={stats?.total_completed ?? 0} sub="All time"
              icon={ListChecks} color="bg-amber-100 text-amber-700" bg="bg-white border-amber-100" />
          </div>
        )}

        {/* ── ACTIVITY CHART ── */}
        <div className="bg-white rounded-2xl p-5 border border-stone-100 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs text-stone-400 uppercase font-bold tracking-wider">This Week</p>
              <h3 className="font-black text-stone-900 text-base mt-0.5">Deliveries Overview</h3>
            </div>
            <div className="flex items-center gap-1.5 text-teal-600 text-xs font-semibold">
              <Activity className="w-4 h-4" /> 7-day
            </div>
          </div>
          {!stats?.daily_counts?.some(d => d.count > 0) ? (
            <div className="h-32 flex items-center justify-center text-stone-300 text-sm">
              No completed deliveries yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={stats.daily_counts} barSize={24}>
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#a8a29e" }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(v: number) => [v, "Delivered"]}
                  contentStyle={{ borderRadius: 12, border: "1px solid #e7e5e4", fontSize: 12 }}
                  cursor={{ fill: "rgba(13,148,136,0.06)" }}
                />
                <Bar dataKey="count" fill="#0d9488" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* ── TAB SWITCHER ── */}
        <div className="flex gap-2 bg-white rounded-full p-1 border border-stone-100 shadow-sm w-fit">
          <button
            onClick={() => setTab("active")}
            className={`px-4 py-2 rounded-full text-sm font-semibold transition-all ${tab === "active" ? "text-white" : "text-stone-500 hover:bg-stone-50"}`}
            style={tab === "active" ? { background: TEAL } : {}}
          >
            Active {assignments.length > 0 && `(${assignments.length})`}
          </button>
          <button
            onClick={() => setTab("refunded")}
            className={`px-4 py-2 rounded-full text-sm font-semibold transition-all ${tab === "refunded" ? "text-white" : "text-stone-500 hover:bg-stone-50"}`}
            style={tab === "refunded" ? { background: TEAL } : {}}
          >
            Refunded {refunded.length > 0 && `(${refunded.length})`}
          </button>
          <button
            onClick={() => setTab("history")}
            className={`px-4 py-2 rounded-full text-sm font-semibold transition-all ${tab === "history" ? "text-white" : "text-stone-500 hover:bg-stone-50"}`}
            style={tab === "history" ? { background: TEAL } : {}}
          >
            History
          </button>
        </div>

        {/* ── ACTIVE TAB ── */}
        {tab === "active" && (
          loading ? (
            <div className="space-y-3">
              {[1, 2].map(i => (
                <div key={i} className="bg-white rounded-2xl p-4 animate-pulse border border-stone-100">
                  <div className="h-4 bg-stone-200 rounded-full w-1/2 mb-3" />
                  <div className="h-3 bg-stone-100 rounded-full w-3/4" />
                </div>
              ))}
            </div>
          ) : assignments.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-stone-100 shadow-sm animate-fadeUp">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center" style={{ background: TEAL }}>
                <Truck className="w-8 h-8 text-white" strokeWidth={1.5} />
              </div>
              <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-semibold mb-2">All Clear</p>
              <h3 className="text-lg font-extrabold text-stone-900" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                No active deliveries
              </h3>
              <p className="text-stone-400 text-sm mt-1">Check back when you have a new assignment.</p>
            </div>
          ) : (
            <div className="space-y-5 animate-fadeUp">
              {batches.map(batch => (
                <div key={batch.batch_id} className="space-y-2.5">
                  <div className="flex items-center justify-between px-1">
                    <div>
                      <p className="font-bold text-stone-800 text-sm">{batch.display_name}</p>
                      <p className="text-xs text-stone-400">@{batch.vendor_username} · {batch.assignments.length} order{batch.assignments.length !== 1 ? "s" : ""}</p>
                    </div>
                    <span className="text-xs font-semibold text-teal-600">
                      Cutoff {new Date(batch.cutoff_time).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  {batch.assignments.map(a => (
                    <AssignmentCard key={a.id} a={a} updating={updating} onUpdate={updateStatus} error={errors[a.id]} onMarkUnavailable={markItemUnavailable} markingItem={markingItem} onViewDetails={setDetailAssignment} />
                  ))}
                </div>
              ))}

              {unbatched.length > 0 && (
                <div className="space-y-2.5">
                  {batches.length > 0 && <p className="text-xs font-bold text-stone-400 uppercase tracking-wide px-1">Other Deliveries</p>}
                  {unbatched.map(a => (
                    <AssignmentCard key={a.id} a={a} updating={updating} onUpdate={updateStatus} error={errors[a.id]} onMarkUnavailable={markItemUnavailable} markingItem={markingItem} onViewDetails={setDetailAssignment} />
                  ))}
                </div>
              )}
            </div>
          )
        )}

        {/* ── REFUNDED TAB ── */}
        {tab === "refunded" && (
          refundedLoading ? (
            <div className="space-y-3">
              {[1, 2].map(i => (
                <div key={i} className="bg-white rounded-2xl p-4 animate-pulse border border-stone-100 flex gap-3">
                  <div className="w-14 h-14 rounded-xl bg-stone-200 flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-stone-200 rounded w-2/3" />
                    <div className="h-2.5 bg-stone-100 rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : refunded.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-stone-100 shadow-sm animate-fadeUp">
              <RotateCcw className="w-10 h-10 text-stone-200 mx-auto mb-2" />
              <p className="text-stone-400 text-sm">No refunded orders</p>
            </div>
          ) : (
            <div className="space-y-2.5 animate-fadeUp">
              {refunded.map(a => <RefundedCard key={a.id} a={a} onViewDetails={setDetailAssignment} />)}
            </div>
          )
        )}

        {/* ── HISTORY TAB ── */}
        {tab === "history" && (
          historyLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-white rounded-2xl p-4 animate-pulse border border-stone-100 flex gap-3">
                  <div className="w-14 h-14 rounded-xl bg-stone-200 flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-stone-200 rounded w-2/3" />
                    <div className="h-2.5 bg-stone-100 rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : history.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-stone-100 shadow-sm animate-fadeUp">
              <ListChecks className="w-10 h-10 text-stone-200 mx-auto mb-2" />
              <p className="text-stone-400 text-sm">No completed deliveries yet</p>
            </div>
          ) : (
            <div className="space-y-2.5 animate-fadeUp">
              {history.map(a => <HistoryCard key={a.id} a={a} onViewDetails={setDetailAssignment} />)}
            </div>
          )
        )}
      </div>

      {proofModal && (
        <ProofModal
          assignment={proofModal.assignment}
          nextStatus={proofModal.nextStatus}
          onClose={() => setProofModal(null)}
          onSubmit={extra => submitStatus(proofModal.assignment, proofModal.nextStatus, extra)}
          submitting={updating === proofModal.assignment.id}
          error={modalError}
        />
      )}

      {detailAssignment && (
        <OrderDetailModal a={detailAssignment} onClose={() => setDetailAssignment(null)} />
      )}
    </div>
  );
}
