"use client";

import { useState, useEffect } from "react";
import AdminTopBar from "@/components/layout/AdminTopBar";
import { api } from "@/lib/api";
import { TEAL } from "@/lib/tokens";
import { CalendarClock, Plus, Pencil, Trash2, X } from "lucide-react";

interface DeliverySlot {
  id: number;
  vendor: number;
  vendor_username: string;
  campus: string;
  display_name: string;
  delivery_time: string;
  cutoff_offset_minutes: number;
  max_orders: number;
  used_today: number;
  is_active: boolean;
}

const EMPTY = {
  vendor: "", campus: "pau", display_name: "", delivery_time: "13:00",
  cutoff_offset_minutes: 15, max_orders: 10, is_active: true,
};

export default function AdminDeliverySlotsPage() {
  const [slots, setSlots] = useState<DeliverySlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<DeliverySlot | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    api.admin.deliverySlots()
      .then(r => r.ok ? r.json() : [])
      .then(data => setSlots(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm(EMPTY); setError(""); setShowForm(true); };
  const openEdit = (s: DeliverySlot) => {
    setEditing(s);
    setForm({
      vendor: String(s.vendor), campus: s.campus, display_name: s.display_name,
      delivery_time: s.delivery_time.slice(0, 5), cutoff_offset_minutes: s.cutoff_offset_minutes,
      max_orders: s.max_orders, is_active: s.is_active,
    });
    setError(""); setShowForm(true);
  };

  const save = async () => {
    if (!editing && !form.vendor.trim()) { setError("Vendor user id is required."); return; }
    if (!form.display_name.trim()) { setError("Display name is required."); return; }
    setSaving(true); setError("");
    try {
      const body: Record<string, unknown> = {
        campus: form.campus, display_name: form.display_name, delivery_time: `${form.delivery_time}:00`,
        cutoff_offset_minutes: form.cutoff_offset_minutes, max_orders: form.max_orders,
        is_active: form.is_active,
      };
      if (!editing) body.vendor = Number(form.vendor);
      const res = editing
        ? await api.admin.updateDeliverySlot(editing.id, body)
        : await api.admin.createDeliverySlot(body);
      if (!res.ok) { const d = await res.json(); setError(Object.values(d)[0]?.toString() || "Could not save."); return; }
      setShowForm(false); load();
    } catch { setError("Network error."); }
    finally { setSaving(false); }
  };

  const remove = async (id: number) => {
    if (!confirm("Delete this delivery slot? It stops applying immediately — today's already-placed orders are unaffected.")) return;
    await api.admin.deleteDeliverySlot(id);
    setSlots(prev => prev.filter(s => s.id !== id));
  };

  return (
    <div className="min-h-screen bg-[#F5F5F5]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <AdminTopBar />
      <div className="px-4 pt-4 pb-20 max-w-2xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-semibold">Delivery</p>
            <h1 className="text-xl font-extrabold text-stone-900" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Delivery Slots</h1>
            <p className="text-stone-400 text-xs mt-0.5">Create once — a slot applies every day, no need to re-set it.</p>
          </div>
          <button onClick={openCreate} className="flex items-center gap-1.5 px-4 py-2 rounded-full text-white text-sm font-semibold flex-shrink-0" style={{ background: TEAL }}>
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>

        {loading ? (
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
            {[1, 2, 3].map(i => <div key={i} className="p-4 h-16 animate-pulse border-b border-stone-100 last:border-0 bg-stone-50/50" />)}
          </div>
        ) : slots.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 text-center border border-stone-100 shadow-sm">
            <CalendarClock className="w-10 h-10 text-stone-200 mx-auto mb-3" />
            <p className="text-stone-400 text-sm">No delivery slots yet.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
            {slots.map(s => (
              <div key={s.id} className="border-b border-stone-100 last:border-0 p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: TEAL + "20" }}>
                  <CalendarClock className="w-4 h-4" style={{ color: TEAL }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-stone-900 text-sm truncate">{s.display_name} · @{s.vendor_username}</p>
                  <p className="text-xs text-stone-400">
                    {s.campus.toUpperCase()} · {s.delivery_time.slice(0, 5)} · cutoff {s.cutoff_offset_minutes}min before ·{" "}
                    <span className={s.used_today >= s.max_orders ? "text-red-500 font-semibold" : ""}>
                      {s.used_today}/{s.max_orders} used today
                    </span>
                    {!s.is_active && " · Inactive"}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => openEdit(s)} className="w-7 h-7 rounded-full bg-stone-100 flex items-center justify-center text-stone-500 hover:bg-stone-200 transition">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => remove(s.id)} className="w-7 h-7 rounded-full bg-red-50 flex items-center justify-center text-red-400 hover:bg-red-100 transition">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 space-y-3 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-stone-900 text-lg" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                {editing ? "Edit Delivery Slot" : "New Delivery Slot"}
              </h2>
              <button onClick={() => setShowForm(false)} className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-stone-500">
                <X className="w-4 h-4" />
              </button>
            </div>

            {!editing && (
              <div>
                <label className="text-xs font-semibold text-stone-500 mb-1 block">Vendor user ID</label>
                <input value={form.vendor} onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))}
                  placeholder="e.g. 42" className="w-full px-4 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:border-teal-500" />
              </div>
            )}
            <div>
              <label className="text-xs font-semibold text-stone-500 mb-1 block">Display name</label>
              <input value={form.display_name} onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))}
                placeholder="e.g. Lunch Batch" className="w-full px-4 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:border-teal-500" />
            </div>
            <div>
              <label className="text-xs font-semibold text-stone-500 mb-1 block">Campus</label>
              <select value={form.campus} onChange={e => setForm(f => ({ ...f, campus: e.target.value }))}
                className="w-full px-4 py-2.5 rounded-xl border border-stone-200 text-sm bg-white focus:outline-none focus:border-teal-500">
                <option value="pau">PAU</option><option value="futo">FUTO</option><option value="imsu">IMSU</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-stone-500 mb-1 block">Delivery time</label>
                <input type="time" value={form.delivery_time} onChange={e => setForm(f => ({ ...f, delivery_time: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:border-teal-500" />
              </div>
              <div>
                <label className="text-xs font-semibold text-stone-500 mb-1 block">Cutoff (min before)</label>
                <input type="number" value={form.cutoff_offset_minutes} onChange={e => setForm(f => ({ ...f, cutoff_offset_minutes: Number(e.target.value) }))}
                  className="w-full px-4 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:border-teal-500" />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-stone-500 mb-1 block">Max orders per day</label>
              <input type="number" value={form.max_orders} onChange={e => setForm(f => ({ ...f, max_orders: Number(e.target.value) }))}
                className="w-full px-4 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:border-teal-500" />
            </div>
            <label className="flex items-center gap-2 text-sm text-stone-600">
              <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} /> Active
            </label>

            {error && <p className="text-red-500 text-sm">{error}</p>}

            <button onClick={save} disabled={saving}
              className="w-full py-3 rounded-full font-bold text-white text-sm disabled:opacity-50 transition" style={{ background: TEAL }}>
              {saving ? "Saving…" : editing ? "Save Changes" : "Create Slot"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
