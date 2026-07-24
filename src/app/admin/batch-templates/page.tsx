"use client";

import { useState, useEffect } from "react";
import AdminTopBar from "@/components/layout/AdminTopBar";
import { api } from "@/lib/api";
import { TEAL } from "@/lib/tokens";
import { CalendarClock, Plus, Pencil, Trash2, X } from "lucide-react";

interface BatchTemplate {
  id: number;
  vendor: number;
  vendor_username: string;
  campus: string;
  display_name: string;
  delivery_time: string;
  cutoff_offset_minutes: number;
  max_orders: number;
  days_of_week: number[];
  is_active: boolean;
}

const DAYS = [
  { value: 0, label: "Mon" }, { value: 1, label: "Tue" }, { value: 2, label: "Wed" },
  { value: 3, label: "Thu" }, { value: 4, label: "Fri" }, { value: 5, label: "Sat" }, { value: 6, label: "Sun" },
];

const EMPTY = {
  vendor: "", campus: "pau", display_name: "", delivery_time: "13:00",
  cutoff_offset_minutes: 15, max_orders: 10, days_of_week: [0, 1, 2, 3, 4] as number[], is_active: true,
};

export default function AdminBatchTemplatesPage() {
  const [templates, setTemplates] = useState<BatchTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<BatchTemplate | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    api.admin.batchTemplates()
      .then(r => r.ok ? r.json() : [])
      .then(data => setTemplates(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm(EMPTY); setError(""); setShowForm(true); };
  const openEdit = (t: BatchTemplate) => {
    setEditing(t);
    setForm({
      vendor: String(t.vendor), campus: t.campus, display_name: t.display_name,
      delivery_time: t.delivery_time.slice(0, 5), cutoff_offset_minutes: t.cutoff_offset_minutes,
      max_orders: t.max_orders, days_of_week: t.days_of_week, is_active: t.is_active,
    });
    setError(""); setShowForm(true);
  };

  const toggleDay = (d: number) => {
    setForm(f => ({ ...f, days_of_week: f.days_of_week.includes(d) ? f.days_of_week.filter(x => x !== d) : [...f.days_of_week, d].sort() }));
  };

  const save = async () => {
    if (!editing && !form.vendor.trim()) { setError("Vendor user id is required."); return; }
    if (!form.display_name.trim()) { setError("Display name is required."); return; }
    setSaving(true); setError("");
    try {
      const body: Record<string, unknown> = {
        campus: form.campus, display_name: form.display_name, delivery_time: `${form.delivery_time}:00`,
        cutoff_offset_minutes: form.cutoff_offset_minutes, max_orders: form.max_orders,
        days_of_week: form.days_of_week, is_active: form.is_active,
      };
      if (!editing) body.vendor = Number(form.vendor);
      const res = editing
        ? await api.admin.updateBatchTemplate(editing.id, body)
        : await api.admin.createBatchTemplate(body);
      if (!res.ok) { const d = await res.json(); setError(Object.values(d)[0]?.toString() || "Could not save."); return; }
      setShowForm(false); load();
    } catch { setError("Network error."); }
    finally { setSaving(false); }
  };

  const remove = async (id: number) => {
    if (!confirm("Delete this batch template? Already-generated batches are unaffected.")) return;
    await api.admin.deleteBatchTemplate(id);
    setTemplates(prev => prev.filter(t => t.id !== id));
  };

  return (
    <div className="min-h-screen bg-[#F5F5F5]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <AdminTopBar />
      <div className="px-4 pt-4 pb-20 max-w-2xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-semibold">Delivery</p>
            <h1 className="text-xl font-extrabold text-stone-900" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Batch Templates</h1>
          </div>
          <button onClick={openCreate} className="flex items-center gap-1.5 px-4 py-2 rounded-full text-white text-sm font-semibold" style={{ background: TEAL }}>
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>

        {loading ? (
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
            {[1, 2, 3].map(i => <div key={i} className="p-4 h-16 animate-pulse border-b border-stone-100 last:border-0 bg-stone-50/50" />)}
          </div>
        ) : templates.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 text-center border border-stone-100 shadow-sm">
            <CalendarClock className="w-10 h-10 text-stone-200 mx-auto mb-3" />
            <p className="text-stone-400 text-sm">No batch templates yet.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
            {templates.map(t => (
              <div key={t.id} className="border-b border-stone-100 last:border-0 p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: TEAL + "20" }}>
                  <CalendarClock className="w-4 h-4" style={{ color: TEAL }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-stone-900 text-sm truncate">{t.display_name} · @{t.vendor_username}</p>
                  <p className="text-xs text-stone-400">
                    {t.campus.toUpperCase()} · {t.delivery_time.slice(0, 5)} · cap {t.max_orders} · {t.days_of_week.map(d => DAYS[d]?.label).join(", ")}
                    {!t.is_active && " · Inactive"}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => openEdit(t)} className="w-7 h-7 rounded-full bg-stone-100 flex items-center justify-center text-stone-500 hover:bg-stone-200 transition">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => remove(t.id)} className="w-7 h-7 rounded-full bg-red-50 flex items-center justify-center text-red-400 hover:bg-red-100 transition">
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
                {editing ? "Edit Batch Template" : "New Batch Template"}
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
                placeholder="e.g. Lunch Run" className="w-full px-4 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:border-teal-500" />
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
              <label className="text-xs font-semibold text-stone-500 mb-1 block">Max orders</label>
              <input type="number" value={form.max_orders} onChange={e => setForm(f => ({ ...f, max_orders: Number(e.target.value) }))}
                className="w-full px-4 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:border-teal-500" />
            </div>
            <div>
              <label className="text-xs font-semibold text-stone-500 mb-1 block">Days</label>
              <div className="flex gap-1.5 flex-wrap">
                {DAYS.map(d => (
                  <button key={d.value} type="button" onClick={() => toggleDay(d.value)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${form.days_of_week.includes(d.value) ? "border-teal-500 text-teal-700 bg-teal-50" : "border-stone-200 text-stone-500 bg-white"}`}>
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-stone-600">
              <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} /> Active
            </label>

            {error && <p className="text-red-500 text-sm">{error}</p>}

            <button onClick={save} disabled={saving}
              className="w-full py-3 rounded-full font-bold text-white text-sm disabled:opacity-50 transition" style={{ background: TEAL }}>
              {saving ? "Saving…" : editing ? "Save Changes" : "Create Template"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
