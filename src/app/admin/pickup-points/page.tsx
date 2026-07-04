"use client";

import { useState, useEffect } from "react";
import AdminTopBar from "@/components/layout/AdminTopBar";
import { api } from "@/lib/api";
import { TEAL } from "@/lib/tokens";
import { MapPin, Plus, Pencil, Trash2, Check, X } from "lucide-react";

interface PickupPoint {
  id: number;
  name: string;
  campus: string;
  description: string;
  is_active: boolean;
}

const CAMPUSES = [
  { value: "pau", label: "PAU" },
  { value: "futo", label: "FUTO" },
  { value: "imsu", label: "IMSU" },
];

const EMPTY = { name: "", campus: "pau", description: "", is_active: true };

export default function AdminPickupPointsPage() {
  const [points, setPoints] = useState<PickupPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [campus, setCampus] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<PickupPoint | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    api.admin.pickupPoints(campus || undefined)
      .then(r => r.ok ? r.json() : [])
      .then(data => setPoints(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [campus]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setError("");
    setShowForm(true);
  };

  const openEdit = (p: PickupPoint) => {
    setEditing(p);
    setForm({ name: p.name, campus: p.campus, description: p.description, is_active: p.is_active });
    setError("");
    setShowForm(true);
  };

  const save = async () => {
    if (!form.name.trim()) { setError("Name is required"); return; }
    setSaving(true); setError("");
    try {
      const res = editing
        ? await api.admin.updatePickupPoint(editing.id, form)
        : await api.admin.createPickupPoint(form);
      if (res.ok) {
        setShowForm(false);
        setLoading(true);
        load();
      } else {
        const d = await res.json();
        setError(d?.name?.[0] || d?.detail || "Failed to save");
      }
    } catch { setError("Network error"); }
    setSaving(false);
  };

  const remove = async (id: number) => {
    if (!confirm("Delete this pickup point?")) return;
    await api.admin.deletePickupPoint(id);
    setPoints(prev => prev.filter(p => p.id !== id));
  };

  const toggleActive = async (p: PickupPoint) => {
    const res = await api.admin.updatePickupPoint(p.id, { is_active: !p.is_active });
    if (res.ok) setPoints(prev => prev.map(x => x.id === p.id ? { ...x, is_active: !x.is_active } : x));
  };

  return (
    <div className="min-h-screen bg-[#F5F5F5]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <AdminTopBar />
      <div className="px-4 pt-4 pb-20 max-w-2xl mx-auto space-y-4">

        <div className="flex items-center justify-between">
          <div>
            <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-semibold">Delivery</p>
            <h1 className="text-xl font-extrabold text-stone-900" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              Pickup Points
            </h1>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-white text-sm font-semibold"
            style={{ background: TEAL }}
          >
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>

        {/* Campus filter */}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setCampus("")}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${!campus ? "border-teal-500 text-teal-700 bg-teal-50" : "border-stone-200 text-stone-500 bg-white"}`}
          >All</button>
          {CAMPUSES.map(c => (
            <button
              key={c.value}
              onClick={() => setCampus(c.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${campus === c.value ? "border-teal-500 text-teal-700 bg-teal-50" : "border-stone-200 text-stone-500 bg-white"}`}
            >{c.label}</button>
          ))}
        </div>

        {/* List */}
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <div key={i} className="bg-white rounded-2xl p-4 animate-pulse border border-stone-100 h-16" />)}
          </div>
        ) : points.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 text-center border border-stone-100 shadow-sm">
            <MapPin className="w-10 h-10 text-stone-200 mx-auto mb-3" />
            <p className="text-stone-400 text-sm">No pickup points yet. Add one above.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {points.map(p => (
              <div key={p.id} className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: TEAL + "20" }}>
                  <MapPin className="w-4 h-4" style={{ color: TEAL }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-stone-900 text-sm truncate">{p.name}</p>
                  <p className="text-xs text-stone-400">{p.campus}{p.description ? ` · ${p.description}` : ""}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => toggleActive(p)}
                    className={`w-7 h-7 rounded-full flex items-center justify-center transition ${p.is_active ? "bg-teal-100 text-teal-600" : "bg-stone-100 text-stone-400"}`}
                    title={p.is_active ? "Active — click to disable" : "Inactive — click to enable"}
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => openEdit(p)}
                    className="w-7 h-7 rounded-full bg-stone-100 flex items-center justify-center text-stone-500 hover:bg-stone-200 transition"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => remove(p.id)}
                    className="w-7 h-7 rounded-full bg-red-50 flex items-center justify-center text-red-400 hover:bg-red-100 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-stone-900 text-lg" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                {editing ? "Edit Pickup Point" : "New Pickup Point"}
              </h2>
              <button onClick={() => setShowForm(false)} className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-stone-500">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-stone-500 mb-1 block">Name</label>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. FUTO Main Gate"
                  className="w-full px-4 py-2.5 rounded-xl border border-stone-200 text-stone-900 text-sm focus:outline-none focus:border-teal-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-stone-500 mb-1 block">Campus</label>
                <select
                  value={form.campus}
                  onChange={e => setForm(f => ({ ...f, campus: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl border border-stone-200 text-stone-900 text-sm focus:outline-none focus:border-teal-500 bg-white"
                >
                  {CAMPUSES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-stone-500 mb-1 block">Description (optional)</label>
                <input
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="e.g. Near the security post"
                  className="w-full px-4 py-2.5 rounded-xl border border-stone-200 text-stone-900 text-sm focus:outline-none focus:border-teal-500"
                />
              </div>
            </div>

            {error && <p className="text-red-500 text-sm">{error}</p>}

            <button
              onClick={save}
              disabled={saving}
              className="w-full py-3 rounded-full font-bold text-white text-sm disabled:opacity-50 transition"
              style={{ background: TEAL }}
            >
              {saving ? "Saving…" : editing ? "Save Changes" : "Create Pickup Point"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
