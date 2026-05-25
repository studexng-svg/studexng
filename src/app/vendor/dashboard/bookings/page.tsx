"use client";

import { useState, useEffect } from "react";
import { useAuth, fetchWithAuth } from "@/lib/authStore";
import { GRAD, toArray } from "@/lib/tokens";
import { Calendar, Check, X, Loader } from "lucide-react";
import { StatusBadge, EmptyState, LoadingSpinner, HEADING_FONT } from "../_shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export default function BookingsPage() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "confirmed" | "all">("pending");
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  useEffect(() => { loadBookings(); }, []);

  const loadBookings = async () => {
    try {
      const res = await fetchWithAuth(`${API_URL}/api/orders/bookings/`);
      const data = await res.json();
      const list = toArray(data);
      setBookings(list.filter((b: any) => b.vendor_username === user?.username));
    } catch {} finally { setLoading(false); }
  };

  const handleAction = async (id: number, action: "confirm" | "cancel") => {
    setActionLoading(id);
    try {
      await fetchWithAuth(`${API_URL}/api/orders/bookings/${id}/${action}/`, { method: "POST" });
      loadBookings();
    } catch {} finally { setActionLoading(null); }
  };

  const filtered = bookings.filter(b => filter === "all" || b.status === filter);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="pb-4">
      <div className="mb-4">
        <p className="text-teal-600 text-[10px] tracking-[0.25em] uppercase font-bold mb-0.5">Manage</p>
        <h2 className="font-black text-stone-900 text-xl tracking-tight" style={HEADING_FONT}>Bookings</h2>
      </div>

      <div className="flex gap-2 mb-5">
        {(["pending", "confirmed", "all"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-full text-sm font-medium capitalize transition-all ${
              filter === f ? "text-white shadow-sm" : "bg-white border border-stone-200 text-stone-600 hover:border-stone-300"
            }`}
            style={filter === f ? { background: GRAD } : {}}>
            {f} {f !== "all" && `(${bookings.filter(b => b.status === f).length})`}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Calendar} message={`No ${filter} bookings`} />
      ) : (
        <div className="space-y-3">
          {filtered.map(booking => (
            <div key={booking.id} className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ background: GRAD }}>
                  {booking.buyer_username?.[0]?.toUpperCase() || "?"}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-stone-900 text-sm">{booking.buyer_username}</p>
                  <p className="text-xs text-stone-400">{booking.listing_title}</p>
                </div>
                <StatusBadge status={booking.status} />
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="bg-stone-50 border border-stone-100 rounded-xl p-3">
                  <p className="text-stone-400 text-xs mb-0.5">Date</p>
                  <p className="font-semibold text-stone-800">{booking.scheduled_date}</p>
                </div>
                <div className="bg-stone-50 border border-stone-100 rounded-xl p-3">
                  <p className="text-stone-400 text-xs mb-0.5">Time</p>
                  <p className="font-semibold text-stone-800">{booking.scheduled_time}</p>
                </div>
                {booking.location && (
                  <div className="bg-stone-50 border border-stone-100 rounded-xl p-3 col-span-2">
                    <p className="text-stone-400 text-xs mb-0.5">Location</p>
                    <p className="font-semibold text-stone-800">{booking.location}</p>
                  </div>
                )}
                <div className="bg-teal-50 border border-teal-100 rounded-xl p-3 col-span-2">
                  <p className="text-teal-500 text-xs mb-0.5">Your payout</p>
                  <p className="font-bold text-teal-600 text-lg">₦{Number(booking.listing_price || 0).toLocaleString()}</p>
                  <p className="text-stone-400 text-xs mt-0.5">Your full listing price (8% service fee charged to buyer)</p>
                </div>
              </div>

              {booking.note && (
                <div className="mt-3 bg-stone-50 border border-stone-100 rounded-xl p-3">
                  <p className="text-stone-400 text-xs mb-0.5">Customer note</p>
                  <p className="text-sm text-stone-600">{booking.note}</p>
                </div>
              )}

              {booking.status === "pending" && (
                <div className="flex gap-3 mt-4">
                  <button onClick={() => handleAction(booking.id, "confirm")}
                    disabled={actionLoading === booking.id}
                    className="flex-1 py-2.5 text-white disabled:opacity-50 rounded-full font-semibold text-sm transition flex items-center justify-center gap-2 active:scale-[0.98]"
                    style={{ background: GRAD }}>
                    {actionLoading === booking.id ? <Loader className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Accept
                  </button>
                  <button onClick={() => handleAction(booking.id, "cancel")}
                    disabled={actionLoading === booking.id}
                    className="px-6 py-2.5 bg-white border border-red-200 disabled:opacity-50 rounded-full font-semibold text-red-500 text-sm transition flex items-center gap-2 hover:bg-red-50">
                    <X className="w-4 h-4" />
                    Decline
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
