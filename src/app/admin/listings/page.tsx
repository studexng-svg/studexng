// src/app/admin/listings/page.tsx
"use client";

import { Package, Search, CheckCircle, XCircle, Tag, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AdminTopBar from "@/components/layout/AdminTopBar";
import CenteredLoader from "@/components/CenteredLoader";
import { api, fetchAllPages, BASE_URL } from "@/lib/api";
import { CampusPills, type Campus } from "@/components/admin/CampusPills";
import { toast } from "sonner";

const TYPE_COLOR: Record<string, string> = {
  service: "bg-blue-100 text-blue-700",
  product: "bg-purple-100 text-purple-700",
};

const TABS = [
  { label: "All",     value: "" },
  { label: "Pending", value: "false" },
  { label: "Live",    value: "true" },
];

interface Category { id: number; title: string; slug: string; campus: string; }

export default function AdminListingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("");
  const [campus, setCampus] = useState<Campus>((searchParams.get("campus") || "") as Campus);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showModal, setShowModal] = useState(false);
  const [bulkCategory, setBulkCategory] = useState("");
  const [applying, setApplying] = useState(false);

  const selectAllRef = useRef<HTMLInputElement>(null);
  const filtersRef = useRef({ search, tab, campus, categoryFilter });

  const load = (q = search, av = tab, c = campus, cat = categoryFilter, silent = false) => {
    if (!silent) { setLoading(true); setSelected(new Set()); }
    let url = `${BASE_URL}/api/admin/listings/?`;
    if (q) url += `search=${encodeURIComponent(q)}&`;
    if (av !== "") url += `is_available=${av}&`;
    if (c) url += `campus=${c}&`;
    if (cat) url += `category=${cat}&`;
    fetchAllPages(url)
      .then(d => setListings(d))
      .catch(() => {})
      .finally(() => { if (!silent) setLoading(false); });
  };

  useEffect(() => {
    load();
    api.admin.categories()
      .then(r => r.ok ? r.json() : [])
      .then(d => setCategories(Array.isArray(d) ? d : []))
      .catch(() => {});

    const interval = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      const f = filtersRef.current;
      load(f.search, f.tab, f.campus, f.categoryFilter, true);
    }, 60000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  filtersRef.current = { search, tab, campus, categoryFilter };

  const allSelected = listings.length > 0 && selected.size === listings.length;
  const someSelected = selected.size > 0 && !allSelected;

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected;
  }, [someSelected]);

  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(listings.map(l => l.id)));

  const toggleOne = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const openBulkModal = () => {
    setBulkCategory(categories[0] ? String(categories[0].id) : "");
    setShowModal(true);
  };

  const handleBulkApply = async () => {
    if (!bulkCategory) { toast.error("Select a category first."); return; }
    setApplying(true);
    try {
      const res = await api.admin.bulkUpdateCategory({ listing_ids: Array.from(selected), category_id: Number(bulkCategory) });
      if (res.ok) {
        const data = await res.json();
        toast.success(`${data.updated} listing(s) moved to "${data.category_name}".`);
        setShowModal(false);
        setSelected(new Set());
        setBulkCategory("");
        load();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to update listings.");
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F5F5]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <AdminTopBar title="Listings" back="/admin" />

      <div className="px-6 pt-5 pb-28 space-y-3">

        {/* Campus filter */}
        <CampusPills value={campus} onChange={c => {
          setCampus(c);
          const params = new URLSearchParams(searchParams.toString());
          if (c) params.set("campus", c); else params.delete("campus");
          router.replace(`/admin/listings?${params.toString()}`);
          load(search, tab, c, categoryFilter);
        }} />

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input
            className="w-full bg-white border border-stone-200 rounded-xl pl-9 pr-4 py-2.5 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-teal-400"
            placeholder="Search title, vendor…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === "Enter" && load(search, tab, campus, categoryFilter)}
          />
        </div>

        {/* Category filter */}
        {categories.length > 0 && (
          <select
            value={categoryFilter}
            onChange={e => { setCategoryFilter(e.target.value); load(search, tab, campus, e.target.value); }}
            className="w-full bg-white border border-stone-200 rounded-xl px-4 py-2.5 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-teal-400"
          >
            <option value="">All categories</option>
            {categories.map(c => (
              <option key={c.id} value={String(c.id)}>{c.title} ({c.campus.toUpperCase()})</option>
            ))}
          </select>
        )}

        {/* Tabs */}
        <div className="flex gap-2">
          {TABS.map(t => (
            <button key={t.value}
              onClick={() => { setTab(t.value); load(search, t.value, campus, categoryFilter); }}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition ${tab === t.value ? "bg-teal-600 text-white" : "bg-white border border-stone-200 text-stone-600"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Bulk action bar */}
        {selected.size > 0 && (
          <div className="flex items-center justify-between bg-teal-50 border border-teal-200 rounded-xl px-4 py-2.5">
            <span className="text-sm font-semibold text-teal-800">{selected.size} selected</span>
            <button
              onClick={openBulkModal}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded-lg text-xs font-semibold hover:bg-teal-700 transition"
            >
              <Tag className="w-3.5 h-3.5" /> Change Category
            </button>
          </div>
        )}

        {/* Count + select all */}
        {!loading && listings.length > 0 && (
          <div className="flex items-center justify-between px-1">
            <p className="text-xs text-stone-400">{listings.length} listing{listings.length !== 1 ? "s" : ""}</p>
            <label className="flex items-center gap-2 text-xs text-stone-500 cursor-pointer select-none">
              <input
                type="checkbox"
                ref={selectAllRef}
                checked={allSelected}
                onChange={toggleAll}
                className="w-4 h-4 accent-teal-600"
              />
              Select all
            </label>
          </div>
        )}

        {/* List */}
        {loading ? (
          <CenteredLoader fullScreen={false} />
        ) : listings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Package className="w-10 h-10 text-stone-300" />
            <p className="text-stone-400 text-sm">No listings found</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
            {listings.map((l: any) => (
              <div
                key={l.id}
                className={`flex items-start gap-3 border-b border-stone-100 last:border-0 p-4 transition ${selected.has(l.id) ? "bg-teal-50/40" : "hover:bg-stone-50/50"}`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(l.id)}
                  onChange={() => toggleOne(l.id)}
                  onClick={e => e.stopPropagation()}
                  className="mt-0.5 w-4 h-4 accent-teal-600 flex-shrink-0 cursor-pointer"
                />
                <button className="flex-1 text-left min-w-0" onClick={() => router.push(`/admin/listings/${l.id}`)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-stone-900 text-sm truncate">{l.title}</p>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold flex-shrink-0 ${TYPE_COLOR[l.listing_type] || "bg-stone-100 text-stone-600"}`}>
                          {l.listing_type}
                        </span>
                        {l.category?.title && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-stone-100 text-stone-500 flex-shrink-0">
                            {l.category.title}
                          </span>
                        )}
                      </div>
                      <p className="text-stone-500 text-xs mt-0.5">
                        {l.vendor?.username || l.vendor} · ₦{Number(l.price).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex-shrink-0">
                      {l.is_available ? (
                        <span className="flex items-center gap-1 px-2.5 py-0.5 bg-teal-100 text-teal-700 rounded-full text-xs font-semibold">
                          <CheckCircle className="w-3 h-3" /> Live
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 px-2.5 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-semibold">
                          <XCircle className="w-3 h-3" /> Pending
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bulk Category Modal */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => !applying && setShowModal(false)}
        >
          <div
            className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-stone-900">Change Category</h3>
              <button onClick={() => !applying && setShowModal(false)} aria-label="Close modal" className="p-2 rounded-full hover:bg-stone-100">
                <X className="w-4 h-4 text-stone-500" />
              </button>
            </div>
            <p className="text-sm text-stone-500 mb-4">
              Moving{" "}
              <span className="font-semibold text-stone-900">{selected.size}</span>
              {" "}listing{selected.size !== 1 ? "s" : ""} to a new category.
            </p>
            <select
              value={bulkCategory}
              onChange={e => setBulkCategory(e.target.value)}
              className="w-full border border-stone-200 rounded-xl px-4 py-2.5 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-400 mb-5"
            >
              <option value="">Select a category…</option>
              {categories.map(c => (
                <option key={c.id} value={String(c.id)}>{c.title} ({c.campus.toUpperCase()})</option>
              ))}
            </select>
            <div className="flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                disabled={applying}
                className="flex-1 py-2.5 bg-stone-100 text-stone-700 rounded-full text-sm font-semibold disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkApply}
                disabled={applying || !bulkCategory}
                className="flex-1 py-2.5 bg-teal-600 text-white rounded-full text-sm font-semibold disabled:opacity-50 hover:bg-teal-700 transition"
              >
                {applying ? "Applying…" : "Apply"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
