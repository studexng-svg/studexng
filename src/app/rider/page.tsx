"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/authStore";
import { api } from "@/lib/api";
import { TEAL, GRAD } from "@/lib/tokens";
import TopNav from "@/components/layout/TopNav";
import { Package, MapPin, CheckCircle, Truck, ChevronRight, Clock } from "lucide-react";

interface Assignment {
  id: number;
  order_id: number;
  order_reference: string;
  order_status: string;
  listing_title: string;
  vendor_username: string;
  buyer_username: string;
  pickup_point_name: string;
  pickup_point_campus: string;
  status: string;
  assigned_at: string;
  picked_up_at: string | null;
  at_pickup_point_at: string | null;
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

export default function RiderDashboard() {
  const { user, isLoggedIn, isHydrated } = useAuth();
  const router = useRouter();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<number | null>(null);

  useEffect(() => {
    if (!isHydrated) return;
    if (!isLoggedIn) { router.push("/auth"); return; }
    if (user?.user_type !== "rider") { router.push("/home"); return; }

    api.delivery.myAssignments()
      .then(r => r.ok ? r.json() : [])
      .then(data => setAssignments(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isHydrated, isLoggedIn, user, router]);

  const updateStatus = async (assignment: Assignment) => {
    const next = STATUS_NEXT[assignment.status];
    if (!next) return;
    setUpdating(assignment.id);
    try {
      const res = await api.delivery.updateStatus(assignment.id, next);
      if (res.ok) {
        if (next === "completed") {
          setAssignments(prev => prev.filter(a => a.id !== assignment.id));
        } else {
          const updated = await res.json();
          setAssignments(prev => prev.map(a => a.id === assignment.id ? { ...a, status: updated.status } : a));
        }
      }
    } catch {}
    setUpdating(null);
  };

  return (
    <div className="min-h-screen bg-[#F5F5F5]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <TopNav showBack />

      <div className="px-4 pt-4 pb-28 max-w-lg mx-auto space-y-4">
        <div className="animate-fadeUp">
          <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-semibold">Rider Portal</p>
          <h1 className="text-2xl font-extrabold text-stone-900 mt-0.5" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            My Deliveries
          </h1>
        </div>

        {loading ? (
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
          <div className="space-y-3 animate-fadeUp">
            {assignments.map(a => (
              <div key={a.id} className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
                <div className="p-4 space-y-3">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-stone-900 text-sm">{a.listing_title}</p>
                      <p className="text-xs text-stone-400 mt-0.5">Order #{a.order_reference}</p>
                    </div>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${STATUS_COLOR[a.status] || "bg-stone-100 text-stone-500"}`}>
                      {STATUS_LABELS[a.status] || a.status}
                    </span>
                  </div>

                  {/* Details */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-xs text-stone-500">
                      <Package className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" />
                      <span>Pick up from <span className="font-semibold text-stone-700">@{a.vendor_username}</span></span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-stone-500">
                      <MapPin className="w-3.5 h-3.5 text-teal-500 flex-shrink-0" />
                      <span>Drop at <span className="font-semibold text-stone-700">{a.pickup_point_name}</span> · {a.pickup_point_campus}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-stone-500">
                      <Clock className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" />
                      <span>Assigned {new Date(a.assigned_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                    {a.picked_up_at && (
                      <div className="flex items-center gap-2 text-xs text-teal-600">
                        <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>Picked up {new Date(a.picked_up_at).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Action button */}
                {STATUS_NEXT[a.status] && (
                  <button
                    onClick={() => updateStatus(a)}
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
