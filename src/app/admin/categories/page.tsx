// src/app/admin/categories/page.tsx
"use client";

import { Tag, Trash2, Plus, Edit2, Check, X } from "lucide-react";
import { useEffect, useState } from "react";
import AdminTopBar from "@/components/layout/AdminTopBar";
import { fetchWithAuth } from "@/lib/authStore";
import { GRAD } from "@/lib/tokens";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

const CAMPUS_LABEL: Record<string, string> = {
  pau:  "PAU",
  futo: "FUTO",
  imsu: "IMSU",
  all:  "All Campuses",
};

interface Category {
  id: number;
  title: string;
  slug: string;
  image: string | null;
  campus: string;
  listing_count: number;
}

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCampus, setNewCampus] = useState("pau");

  const [editId, setEditId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editCampus, setEditCampus] = useState("pau");

  const load = () => {
    setLoading(true);
    fetchWithAuth(`${API_URL}/api/admin/categories/`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setCategories(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const addCategory = async () => {
    if (!newTitle.trim()) return;
    setSaving(true);
    try {
      const res = await fetchWithAuth(`${API_URL}/api/admin/categories/`, {
        method: "POST",
        body: JSON.stringify({ title: newTitle.trim(), campus: newCampus }),
      });
      if (res.ok) {
        const cat = await res.json();
        setCategories(prev => [...prev, { ...cat, listing_count: 0 }]);
        setNewTitle("");
        setShowAdd(false);
      }
    } catch {}
    finally { setSaving(false); }
  };

  const saveEdit = async (id: number) => {
    setSaving(true);
    try {
      const res = await fetchWithAuth(`${API_URL}/api/admin/categories/${id}/`, {
        method: "PATCH",
        body: JSON.stringify({ title: editTitle.trim(), campus: editCampus }),
      });
      if (res.ok) {
        const updated = await res.json();
        setCategories(prev => prev.map(c => c.id === id ? { ...c, title: updated.title, campus: updated.campus } : c));
        setEditId(null);
      }
    } catch {}
    finally { setSaving(false); }
  };

  const deleteCategory = async (id: number) => {
    if (confirmId !== id) { setConfirmId(id); return; }
    setDeletingId(id);
    setConfirmId(null);
    try {
      const res = await fetchWithAuth(`${API_URL}/api/admin/categories/${id}/`, { method: "DELETE" });
      if (res.status === 204 || res.ok) {
        setCategories(prev => prev.filter(c => c.id !== id));
      }
    } catch {}
    finally { setDeletingId(null); }
  };

  const startEdit = (cat: Category) => {
    setEditId(cat.id);
    setEditTitle(cat.title);
    setEditCampus(cat.campus);
  };

  return (
    <div className="min-h-screen bg-[#F5F5F5]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <AdminTopBar title="Categories" back="/admin" />

      <div className="px-4 pt-4 pb-28 max-w-2xl mx-auto space-y-3">

        {/* Add new */}
        {showAdd ? (
          <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm space-y-3">
            <p className="text-teal-600 text-xs tracking-[0.2em] uppercase font-semibold">New Category</p>
            <input className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
              placeholder="Category title" value={newTitle} onChange={e => setNewTitle(e.target.value)} />
            <select className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white"
              value={newCampus} onChange={e => setNewCampus(e.target.value)}>
              <option value="pau">PAU</option>
              <option value="futo">FUTO</option>
              <option value="imsu">IMSU</option>
              <option value="all">All Campuses</option>
            </select>
            <div className="flex gap-2">
              <button onClick={addCategory} disabled={saving || !newTitle.trim()}
                className="flex-1 py-2.5 text-white font-semibold rounded-xl text-sm disabled:opacity-50 transition"
                style={{ background: GRAD }}>
                {saving ? "Adding…" : "Add Category"}
              </button>
              <button onClick={() => { setShowAdd(false); setNewTitle(""); }}
                className="px-4 py-2.5 bg-stone-100 text-stone-600 font-semibold rounded-xl text-sm">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowAdd(true)}
            className="w-full bg-white border border-stone-200 hover:border-teal-300 rounded-2xl p-4 flex items-center gap-3 transition active:scale-[0.98]">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: GRAD }}>
              <Plus className="w-4 h-4 text-white" />
            </div>
            <p className="font-semibold text-stone-900 text-sm">Add New Category</p>
          </button>
        )}

        {!loading && <p className="text-xs text-stone-400">{categories.length} categor{categories.length !== 1 ? "ies" : "y"}</p>}

        {loading ? (
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white border border-stone-200 rounded-2xl p-4 h-16 animate-pulse" />
            ))}
          </div>
        ) : categories.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Tag className="w-10 h-10 text-stone-300" />
            <p className="text-stone-400 text-sm">No categories yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {categories.map((cat) => (
              <div key={cat.id} className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
                {editId === cat.id ? (
                  <div className="space-y-2">
                    <input className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                      value={editTitle} onChange={e => setEditTitle(e.target.value)} />
                    <select className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white"
                      value={editCampus} onChange={e => setEditCampus(e.target.value)}>
                      <option value="pau">PAU</option>
                      <option value="futo">FUTO</option>
                      <option value="all">All Campuses</option>
                    </select>
                    <div className="flex gap-2">
                      <button onClick={() => saveEdit(cat.id)} disabled={saving}
                        className="flex-1 py-2 text-white font-semibold rounded-xl text-sm disabled:opacity-50 transition flex items-center justify-center gap-1"
                        style={{ background: GRAD }}>
                        <Check className="w-3.5 h-3.5" /> {saving ? "Saving…" : "Save"}
                      </button>
                      <button onClick={() => setEditId(null)}
                        className="px-4 py-2 bg-stone-100 text-stone-600 font-semibold rounded-xl text-sm flex items-center gap-1">
                        <X className="w-3.5 h-3.5" /> Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {cat.image && <img src={cat.image} alt={cat.title} className="w-10 h-10 rounded-xl object-cover flex-shrink-0" />}
                      <div className="min-w-0">
                        <p className="font-semibold text-stone-900 text-sm">{cat.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-stone-400">{CAMPUS_LABEL[cat.campus] || cat.campus}</span>
                          <span className="text-xs text-stone-300">·</span>
                          <span className="text-xs text-stone-400">{cat.listing_count} listing{cat.listing_count !== 1 ? "s" : ""}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button onClick={() => startEdit(cat)} className="p-2 text-stone-400 hover:text-teal-600 hover:bg-teal-50 rounded-xl transition">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => deleteCategory(cat.id)} disabled={deletingId === cat.id}
                        className={`p-2 rounded-xl transition disabled:opacity-50 ${confirmId === cat.id ? "text-red-600 bg-red-50" : "text-stone-400 hover:text-red-500 hover:bg-red-50"}`}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
                {confirmId === cat.id && (
                  <p className="text-xs text-red-500 mt-2 text-center">Tap delete again to confirm</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
