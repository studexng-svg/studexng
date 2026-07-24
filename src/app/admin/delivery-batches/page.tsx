"use client";

import { useState, useEffect } from "react";
import AdminTopBar from "@/components/layout/AdminTopBar";
import { api } from "@/lib/api";
import { TEAL } from "@/lib/tokens";
import { Truck, Pencil, X } from "lucide-react";

interface DeliveryBatch {
  id: number;
  vendor: number;
  vendor_username: string;
  campus: string;
  batch_date: string;
  display_name: string;
  delivery_time: string;
  cutoff_time: string;
  max_orders: number;
  current_orders: number;
  status: "open" | "full" | "closed" | "suspended";
}

const STATUS_COLOR: Record<string, string> = {
  open: "bg-emerald-100 text-emerald-700", full: "bg-amber-100 text-amber-700",
  closed: "bg-stone-100 text-stone-500", suspended: "bg-red-100 text-red-700",
};

export default function AdminDeliveryBatchesPage() {
  const [batches, setBatches] = useState<DeliveryBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [campus, setCampus] = useState("");
  const [editing, setEditing] = useState<DeliveryBatch | null>(null);
  const [form, setForm] = useState({ display_name: "", delivery_time: "", cutoff_time: "", max_orders: 0, status: "open" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    api.admin.deliveryBatches(campus ? { campus } : undefined)
      .then(r => r.ok ? r.json() : [])
      .then(data => setBatches(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [campus]);

  const openEdit = (b: DeliveryBatch) => {
    setEditing(b);
    setForm({
      display_name: b.display_name,
      delivery_time: toLocalInput(b.delivery_time),
      cutoff_time: toLocalInput(b.cutoff_time),
      max_orders: b.max_orders,
      status: b.status,
    });
    setError("");
  };

  const save = async () => {
    if (!editing) return;
    setSaving(true); setError("");
    try {
      const res = await api.admin.updateDeliveryBatch(editing.id, {
        display_name: form.display_name,
        delivery_time: new Date(form.delivery_time).toISOString(),
        cutoff_time: new Date(form.cutoff_time).toISOString(),
        max_orders: form.max_orders,
        status: form.status,
      });
      if (!res.ok) { const d = await res.json(); setError(Object.values(d)[0]?.toString() || "Could not save."); return; }
      setEditing(null); load();
    } catch { setError("Network error."); }
    finally { setSaving(false); }
  };

  return (
    <div className="min-h-screen bg-[#F5F5F5]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <AdminTopBar />
      <div className="px-4 pt-4 pb-20 max-w-2xl mx-auto space-y-4">
        <div>
          <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-semibold">Delivery</p>
          <h1 className="text-xl font-extrabold text-stone-900" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Delivery Batches</h1>
          <p className="text-stone-400 text-xs mt-1">Capacity across all vendors — override a single day's time, cutoff, or capacity without touching its template.</p>
        </div>

        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setCampus("")} className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${!campus ? "border-teal-500 text-teal-700 bg-teal-50" : "border-stone-200 text-stone-500 bg-white"}`}>All</button>
          {["pau", "futo", "imsu"].map(c => (
            <button key={c} onClick={() => setCampus(c)} className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${campus === c ? "border-teal-500 text-teal-700 bg-teal-50" : "border-stone-200 text-stone-500 bg-white"}`}>{c.toUpperCase()}</button>
          ))}
        </div>

        {loading ? (
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
            {[1, 2, 3].map(i => <div key={i} className="p-4 h-16 animate-pulse border-b border-stone-100 last:border-0 bg-stone-50/50" />)}
          </div>
        ) : batches.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 text-center border border-stone-100 shadow-sm">
            <Truck className="w-10 h-10 text-stone-200 mx-auto mb-3" />
            <p className="text-stone-400 text-sm">No delivery batches yet.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
            {batches.map(b => (
              <div key={b.id} className="border-b border-stone-100 last:border-0 p-4 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-stone-900 text-sm truncate">{b.display_name} · @{b.vendor_username}</p>
                  <p className="text-xs text-stone-400">
                    {b.batch_date} · {new Date(b.delivery_time).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" })} ·{" "}
                    <span className="font-semibold text-stone-600">{b.current_orders}/{b.max_orders}</span> orders
                  </p>
                </div>
                <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full flex-shrink-0 ${STATUS_COLOR[b.status] || "bg-stone-100 text-stone-500"}`}>
                  {b.status}
                </span>
                <button onClick={() => openEdit(b)} className="w-7 h-7 rounded-full bg-stone-100 flex items-center justify-center text-stone-500 hover:bg-stone-200 transition flex-shrink-0">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-stone-900 text-lg" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Override Batch</h2>
              <button onClick={() => setEditing(null)} className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-stone-500">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="text-xs font-semibold text-stone-500 mb-1 block">Display name</label>
              <input value={form.display_name} onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))}
                className="w-full px-4 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:border-teal-500" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-stone-500 mb-1 block">Delivery time</label>
                <input type="datetime-local" value={form.delivery_time} onChange={e => setForm(f => ({ ...f, delivery_time: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:border-teal-500" />
              </div>
              <div>
                <label className="text-xs font-semibold text-stone-500 mb-1 block">Cutoff time</label>
                <input type="datetime-local" value={form.cutoff_time} onChange={e => setForm(f => ({ ...f, cutoff_time: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:border-teal-500" />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-stone-500 mb-1 block">Max orders</label>
              <input type="number" value={form.max_orders} onChange={e => setForm(f => ({ ...f, max_orders: Number(e.target.value) }))}
                className="w-full px-4 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:border-teal-500" />
            </div>
            <div>
              <label className="text-xs font-semibold text-stone-500 mb-1 block">Status</label>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                className="w-full px-4 py-2.5 rounded-xl border border-stone-200 text-sm bg-white focus:outline-none focus:border-teal-500">
                <option value="open">Open</option><option value="full">Full</option>
                <option value="closed">Closed</option><option value="suspended">Suspended</option>
              </select>
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button onClick={save} disabled={saving}
              className="w-full py-3 rounded-full font-bold text-white text-sm disabled:opacity-50 transition" style={{ background: TEAL }}>
              {saving ? "Saving…" : "Save Override"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
