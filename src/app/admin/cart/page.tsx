// src/app/admin/cart/page.tsx
"use client";

import { ShoppingCart, Search, Package, Bell, Clock, ChevronDown, ChevronUp, CheckSquare, Square } from "lucide-react";
import AdminTopBar from "@/components/layout/AdminTopBar";
import { useState, useEffect, useCallback } from "react";
import { fetchAllPages, BASE_URL, api } from "@/lib/api";
import { CampusPills, type Campus } from "@/components/admin/CampusPills";
import { motion, AnimatePresence } from "framer-motion";
import { GRAD } from "@/lib/tokens";

type Tab = "all" | "abandoned";

function hoursLabel(h: number) {
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ${Math.round(h % 24)}h ago`;
}

export default function AdminCartPage() {
  const [tab, setTab] = useState<Tab>("all");

  // ── All items tab ──
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [campus, setCampus] = useState<Campus>("");

  const loadAll = useCallback((s = search, c = campus) => {
    setLoading(true);
    let url = `${BASE_URL}/api/admin/cart/?`;
    if (s) url += `search=${encodeURIComponent(s)}&`;
    if (c) url += `campus=${c}`;
    fetchAllPages(url)
      .then(d => setItems(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Abandoned tab ──
  const [abandoned, setAbandoned] = useState<any[]>([]);
  const [abLoading, setAbLoading] = useState(false);
  const [abCampus, setAbCampus] = useState<Campus>("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState("");

  const loadAbandoned = useCallback((c = abCampus) => {
    setAbLoading(true);
    setSelected(new Set());
    api.admin.abandonedCarts(c || undefined)
      .then(r => r.ok ? r.json() : [])
      .then(d => setAbandoned(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setAbLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab === "abandoned") loadAbandoned(); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const toggleSelect = (uid: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(uid) ? next.delete(uid) : next.add(uid);
      return next;
    });
  };

  const toggleExpand = (uid: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(uid) ? next.delete(uid) : next.add(uid);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === abandoned.length) setSelected(new Set());
    else setSelected(new Set(abandoned.map((u: any) => u.user_id)));
  };

  const sendReminders = async () => {
    if (selected.size === 0) return;
    setSending(true);
    try {
      const res = await api.admin.sendAbandonedCartReminder(Array.from(selected));
      const data = await res.json();
      if (res.ok) {
        showToast(`✅ Reminder sent to ${data.sent} user${data.sent !== 1 ? "s" : ""}${data.failed ? ` (${data.failed} failed)` : ""}`);
        setSelected(new Set());
      } else {
        showToast(data.error || "Failed to send reminders.");
      }
    } catch {
      showToast("Network error. Try again.");
    } finally {
      setSending(false);
    }
  };

  const totalValue = items.reduce((acc, i) => acc + parseFloat(i.listing_price) * i.quantity, 0);
  const uniqueUsers = new Set(items.map(i => i.user_id)).size;

  return (
    <div className="min-h-screen bg-[#F5F5F5]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <AdminTopBar title="Cart Overview" back="/admin" />

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ y: -60, opacity: 0 }} animate={{ y: 70, opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-full text-white text-sm font-semibold shadow-lg whitespace-nowrap"
            style={{ background: GRAD }}>
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="px-6 pt-5 pb-28 space-y-4">

        {/* Tab switcher */}
        <div className="flex bg-stone-100 rounded-full p-1 gap-1">
          {([["all", "All Items"], ["abandoned", "Abandoned (5h+)"]] as [Tab, string][]).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2 rounded-full text-xs font-semibold transition-all ${tab === t ? "bg-white shadow-sm text-stone-900" : "text-stone-500"}`}>
              {label}
            </button>
          ))}
        </div>

        {/* ── ALL ITEMS TAB ── */}
        {tab === "all" && (
          <>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Items",       value: loading ? "—" : items.length },
                { label: "Users",       value: loading ? "—" : uniqueUsers },
                { label: "Total Value", value: loading ? "—" : `₦${totalValue.toLocaleString()}` },
              ].map(({ label, value }) => (
                <div key={label} className="bg-white border border-stone-200 rounded-2xl p-3 text-center shadow-sm">
                  <p className="text-lg font-bold text-stone-900 truncate">{value}</p>
                  <p className="text-xs text-stone-400">{label}</p>
                </div>
              ))}
            </div>

            <CampusPills value={campus} onChange={c => { setCampus(c); loadAll(search, c); }} />

            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                onKeyDown={e => e.key === "Enter" && loadAll(search, campus)}
                placeholder="Search username or listing…"
                className="w-full pl-10 pr-4 py-3 bg-white border border-stone-200 rounded-xl text-stone-900 placeholder:text-stone-400 text-sm focus:outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-400/20" />
            </div>

            {loading ? (
              <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
                {[...Array(5)].map((_, i) => <div key={i} className="p-4 h-16 animate-pulse border-b border-stone-100 last:border-0 bg-stone-50/50" />)}
              </div>
            ) : items.length === 0 ? (
              <div className="bg-white border border-stone-100 rounded-2xl p-14 text-center">
                <ShoppingCart className="w-10 h-10 text-stone-200 mx-auto mb-3" />
                <p className="text-stone-400 text-sm">No cart items found</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
                {items.map(item => (
                  <div key={item.id} className="border-b border-stone-100 last:border-0 p-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-teal-50 flex items-center justify-center flex-shrink-0">
                        <Package className="w-4 h-4 text-teal-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-stone-900 text-sm truncate">{item.listing_title}</p>
                        <p className="text-stone-400 text-xs">
                          by <span className="text-stone-600 font-medium">{item.username}</span>
                          {" · "}qty {item.quantity}
                          {" · "}₦{(parseFloat(item.listing_price) * item.quantity).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                          item.listing_campus === "futo" ? "bg-orange-100 text-orange-700"
                          : item.listing_campus === "imsu" ? "bg-amber-100 text-amber-700"
                          : "bg-teal-50 text-teal-700"
                        }`}>
                          {item.listing_campus?.toUpperCase() || "PAU"}
                        </span>
                        {item.reserved_at && <span className="text-xs text-amber-600 font-medium">Reserved</span>}
                      </div>
                    </div>
                    <p className="text-stone-300 text-xs mt-2 pl-12">
                      Added {new Date(item.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── ABANDONED TAB ── */}
        {tab === "abandoned" && (
          <>
            <CampusPills value={abCampus} onChange={c => { setAbCampus(c); loadAbandoned(c); }} />

            {/* Send bar */}
            <div className="flex items-center justify-between bg-white border border-stone-200 rounded-2xl px-4 py-3 shadow-sm">
              <button onClick={selectAll} className="flex items-center gap-2 text-sm font-semibold text-stone-700">
                {selected.size > 0 && selected.size === abandoned.length
                  ? <CheckSquare className="w-4 h-4 text-teal-600" />
                  : <Square className="w-4 h-4 text-stone-400" />}
                {selected.size === 0 ? "Select all" : selected.size === abandoned.length ? "Deselect all" : `${selected.size} selected`}
              </button>
              <button onClick={sendReminders} disabled={selected.size === 0 || sending}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed transition"
                style={{ background: GRAD }}>
                <Bell className="w-4 h-4" />
                {sending ? "Sending…" : `Send Reminder${selected.size > 1 ? "s" : ""}`}
              </button>
            </div>

            {abLoading ? (
              <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
                {[...Array(4)].map((_, i) => <div key={i} className="p-4 h-20 animate-pulse border-b border-stone-100 last:border-0 bg-stone-50/50" />)}
              </div>
            ) : abandoned.length === 0 ? (
              <div className="bg-white border border-stone-100 rounded-2xl p-14 text-center">
                <ShoppingCart className="w-10 h-10 text-stone-200 mx-auto mb-3" />
                <p className="text-stone-900 font-semibold">No abandoned carts</p>
                <p className="text-stone-400 text-sm mt-1">No users have items sitting in cart for 5+ hours</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
                {abandoned.map((u: any) => {
                  const isSelected = selected.has(u.user_id);
                  const isExpanded = expanded.has(u.user_id);
                  return (
                    <div key={u.user_id}
                      className={`border-b border-stone-100 last:border-0 overflow-hidden transition-colors ${isSelected ? "bg-teal-50/40" : ""}`}>
                      <div className="flex items-center gap-3 p-3.5">
                        {/* Checkbox */}
                        <button onClick={() => toggleSelect(u.user_id)} className="flex-shrink-0">
                          {isSelected
                            ? <CheckSquare className="w-5 h-5 text-teal-600" />
                            : <Square className="w-5 h-5 text-stone-300" />}
                        </button>

                        {/* User info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-stone-900 text-sm truncate">@{u.username}</p>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold flex-shrink-0 ${
                              u.campus === "futo" ? "bg-orange-100 text-orange-700"
                              : u.campus === "imsu" ? "bg-amber-100 text-amber-700"
                              : "bg-teal-50 text-teal-700"
                            }`}>
                              {u.campus.toUpperCase()}
                            </span>
                          </div>
                          <p className="text-stone-400 text-xs mt-0.5">
                            {u.item_count} item{u.item_count !== 1 ? "s" : ""}
                            {" · "}₦{Number(u.total_value).toLocaleString()}
                            {" · "}<span className="text-amber-600 font-medium flex-shrink-0 inline-flex items-center gap-0.5">
                              <Clock className="w-3 h-3" /> {hoursLabel(u.oldest_item_hours)}
                            </span>
                          </p>
                        </div>

                        {/* Expand toggle */}
                        <button onClick={() => toggleExpand(u.user_id)} className="flex-shrink-0 text-stone-400 hover:text-stone-600">
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>

                      {/* Expandable item list */}
                      {isExpanded && (
                        <div className="border-t border-stone-100 px-3.5 pb-3 pt-2 space-y-1.5">
                          {u.items.map((item: any, idx: number) => (
                            <div key={idx} className="flex items-center justify-between text-xs text-stone-600">
                              <span className="flex items-center gap-1.5">
                                <Package className="w-3 h-3 text-stone-300 flex-shrink-0" />
                                <span className="truncate max-w-[180px]">{item.listing_title}</span>
                                {item.quantity > 1 && <span className="text-stone-400">×{item.quantity}</span>}
                              </span>
                              <span className="font-semibold text-stone-700 flex-shrink-0">₦{(parseFloat(item.price) * item.quantity).toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
