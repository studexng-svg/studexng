"use client";

import { useState, useEffect } from "react";
import AdminTopBar from "@/components/layout/AdminTopBar";
import { api } from "@/lib/api";
import { TEAL } from "@/lib/tokens";
import { Truck, MapPin, Package, User } from "lucide-react";

interface Delivery {
  id: number;
  order_id: number;
  order_reference: string;
  order_status: string;
  listing_title: string;
  vendor_username: string;
  buyer_username: string;
  rider_username: string;
  pickup_point_name: string;
  pickup_point_campus: string;
  status: string;
  assigned_at: string;
  picked_up_at: string | null;
  at_pickup_point_at: string | null;
  completed_at: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  assigned: "Assigned",
  picked_up: "Picked Up",
  at_pickup_point: "At Pickup Point",
  completed: "Completed",
};
const STATUS_COLOR: Record<string, string> = {
  assigned: "bg-amber-100 text-amber-700",
  picked_up: "bg-blue-100 text-blue-700",
  at_pickup_point: "bg-teal-100 text-teal-700",
  completed: "bg-stone-100 text-stone-500",
};

const TABS = ["", "assigned", "picked_up", "at_pickup_point", "completed"];
const TAB_LABELS: Record<string, string> = {
  "": "All", assigned: "Assigned", picked_up: "Picked Up",
  at_pickup_point: "At Pickup Point", completed: "Completed",
};

export default function AdminDeliveriesPage() {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("");

  useEffect(() => {
    setLoading(true);
    api.admin.deliveries(tab || undefined)
      .then(r => r.ok ? r.json() : [])
      .then(data => setDeliveries(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tab]);

  return (
    <div className="min-h-screen bg-[#F5F5F5]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <AdminTopBar />
      <div className="px-4 pt-4 pb-20 max-w-2xl mx-auto space-y-4">

        <div>
          <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-semibold">Delivery</p>
          <h1 className="text-xl font-extrabold text-stone-900" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            All Deliveries
          </h1>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap transition flex-shrink-0 ${
                tab === t ? "border-teal-500 text-teal-700 bg-teal-50" : "border-stone-200 text-stone-500 bg-white"
              }`}
            >{TAB_LABELS[t]}</button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <div key={i} className="bg-white rounded-2xl p-4 animate-pulse border border-stone-100 h-20" />)}
          </div>
        ) : deliveries.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 text-center border border-stone-100 shadow-sm">
            <Truck className="w-10 h-10 text-stone-200 mx-auto mb-3" />
            <p className="text-stone-400 text-sm">No deliveries found.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {deliveries.map(d => (
              <div key={d.id} className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-stone-900 text-sm">{d.listing_title}</p>
                    <p className="text-xs text-stone-400">Order #{d.order_reference}</p>
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${STATUS_COLOR[d.status] || "bg-stone-100 text-stone-500"}`}>
                    {STATUS_LABEL[d.status] || d.status}
                  </span>
                </div>
                <div className="flex flex-wrap gap-3">
                  <div className="flex items-center gap-1.5 text-xs text-stone-500">
                    <User className="w-3 h-3" />
                    <span>Rider: <span className="font-semibold text-stone-700">@{d.rider_username}</span></span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-stone-500">
                    <MapPin className="w-3 h-3 text-teal-500" />
                    <span>{d.pickup_point_name} · {d.pickup_point_campus}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-stone-500">
                    <Package className="w-3 h-3" />
                    <span>Buyer: <span className="font-semibold text-stone-700">@{d.buyer_username}</span></span>
                  </div>
                </div>
                {d.assigned_at && (
                  <p className="text-xs text-stone-400">
                    Assigned {new Date(d.assigned_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
