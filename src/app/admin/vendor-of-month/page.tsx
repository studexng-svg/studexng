"use client";

import { useEffect, useState } from "react";
import AdminTopBar from "@/components/layout/AdminTopBar";
import { api } from "@/lib/api";
import { GRAD } from "@/lib/tokens";
import { Trophy, Star, RefreshCw, Search, CheckCircle, Trash2 } from "lucide-react";
import { motion } from "framer-motion";


interface VotmRecord {
  id: number;
  vendor_id: number;
  vendor_username: string;
  business_name: string;
  profile_picture: string | null;
  rating: number;
  total_reviews: number;
  vendor_badge: string;
  month: string;
  month_raw: string;
  score: number;
  total_orders: number;
  avg_rating: number;
  completion_rate: number;
  is_manual_override: boolean;
  nominated_at: string;
  campus: string;
}

interface VendorResult {
  id: number;
  username: string;
  business_name: string | null;
  profile_picture: string | null;
}

const CAMPUSES = [
  { key: "futo", label: "FUTO" },
  { key: "imsu", label: "IMSU" },
  { key: "pau",  label: "PAU"  },
] as const;

type Campus = (typeof CAMPUSES)[number]["key"];

export default function AdminVendorOfMonthPage() {
  const [campus, setCampus] = useState<Campus>("futo");
  const [current, setCurrent] = useState<VotmRecord | null>(null);
  const [history, setHistory] = useState<VotmRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [msg, setMsg] = useState("");

  // Manual override search
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<VendorResult[]>([]);
  const [searching, setSearching] = useState(false);

  const load = async (c: Campus = campus) => {
    setLoading(true);
    setMsg("");
    try {
      const r = await api.admin.vendorOfMonth(c);
      if (r.ok) {
        const d = await r.json();
        setCurrent(d.current);
        setHistory(d.history || []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(campus); }, [campus]);

  // Search vendors for manual override
  useEffect(() => {
    if (!search.trim()) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await api.admin.searchUsers(search, "vendor");
        if (r.ok) {
          const d = await r.json();
          setSearchResults((d.results || d || []).slice(0, 6));
        }
      } finally { setSearching(false); }
    }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const pickNow = async () => {
    setPicking(true);
    setMsg("");
    try {
      const r = await api.admin.setVendorOfMonth({ action: "pick_now", campus });
      const d = await r.json();
      if (r.ok) {
        setCurrent(d.current);
        setHistory(d.history || []);
        setMsg(d.message || "Picked successfully.");
      } else {
        setMsg(d.error || "Pick failed.");
      }
    } finally { setPicking(false); }
  };

  const setManual = async (vendorId: number, vendorName: string) => {
    setSaving(true);
    setMsg("");
    try {
      const r = await api.admin.setVendorOfMonth({ vendor_id: vendorId, campus });
      const d = await r.json();
      if (r.ok) {
        setCurrent(d.current);
        setMsg(d.message || `${vendorName} set as Vendor of the Month.`);
        setSearch("");
        setSearchResults([]);
      } else {
        setMsg(d.error || "Failed to set vendor.");
      }
    } finally { setSaving(false); }
  };

  const removeCurrent = async () => {
    if (!confirm(`Remove the current ${campus.toUpperCase()} Vendor of the Month? The hero will revert to the generic banner.`)) return;
    setRemoving(true);
    setMsg("");
    try {
      const r = await api.admin.deleteVendorOfMonth(campus);
      const d = await r.json();
      if (r.ok) {
        setCurrent(null);
        setHistory(prev => prev.slice(1));
        setMsg(d.message || "Removed.");
      } else {
        setMsg(d.error || "Failed to remove.");
      }
    } finally { setRemoving(false); }
  };

  return (
    <div className="min-h-screen bg-[#F5F5F5]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <AdminTopBar title="Vendor of the Month" back="/admin" />

      <div className="px-6 pt-5 pb-28 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-teal-600 text-xs tracking-[0.2em] uppercase font-semibold">Monthly Feature</p>
            <h2 className="text-xl font-bold text-stone-900 mt-0.5 flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-500" /> Vendor of the Month
            </h2>
          </div>
          <button onClick={() => load(campus)} className="p-2 text-stone-400 hover:text-teal-600 transition">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Campus tabs */}
        <div className="flex bg-white rounded-2xl border border-stone-200 p-1 shadow-sm gap-1">
          {CAMPUSES.map(c => (
            <button
              key={c.key}
              onClick={() => { setCampus(c.key); setSearch(""); setSearchResults([]); }}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition ${
                campus === c.key
                  ? "text-white shadow-sm"
                  : "text-stone-500 hover:text-stone-700"
              }`}
              style={campus === c.key ? { background: GRAD } : {}}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Status message */}
        {msg && (
          <div className="bg-teal-50 border border-teal-200 rounded-2xl px-4 py-3 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-teal-600 flex-shrink-0" />
            <p className="text-teal-800 text-sm">{msg}</p>
          </div>
        )}

        {/* Current winner */}
        <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-stone-100">
            <p className="font-semibold text-stone-900 text-sm">
              Current Winner — <span className="text-teal-600">{campus.toUpperCase()}</span>
            </p>
          </div>

          {loading ? (
            <div className="p-8 flex justify-center">
              <div className="w-8 h-8 border-4 border-teal-200 border-t-teal-500 rounded-full animate-spin" />
            </div>
          ) : current ? (
            <div className="p-4 flex items-center gap-4">
              {/* Photo */}
              <div className="relative flex-shrink-0">
                {current.profile_picture ? (
                  <img src={current.profile_picture} alt={current.business_name}
                    className="w-16 h-16 rounded-2xl object-cover" />
                ) : (
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-white font-bold text-xl"
                    style={{ background: GRAD }}>
                    {current.business_name.slice(0, 2).toUpperCase()}
                  </div>
                )}
                {current.is_manual_override && (
                  <div className="absolute -top-1 -right-1 w-5 h-5 bg-purple-500 rounded-full flex items-center justify-center"
                    title="Manually set">
                    <span className="text-white text-[8px] font-bold">M</span>
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-bold text-stone-900">{current.business_name}</p>
                <p className="text-stone-400 text-xs">@{current.vendor_username}</p>
                <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                  <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-semibold">
                    {current.month}
                  </span>
                  <span className="flex items-center gap-0.5 text-xs text-stone-500">
                    <Star className="w-3 h-3 fill-amber-400 text-amber-400" /> {current.rating.toFixed(1)}
                  </span>
                  <span className="text-xs text-stone-500">{current.total_orders} orders</span>
                  <span className="text-xs text-stone-500">{current.completion_rate.toFixed(0)}% completion</span>
                </div>
              </div>

              <div className="text-right flex-shrink-0 space-y-2">
                <div>
                  <p className="text-2xl font-black text-stone-900">{current.score.toFixed(0)}</p>
                  <p className="text-xs text-stone-400 uppercase tracking-wide">Score</p>
                </div>
                <button
                  onClick={removeCurrent}
                  disabled={removing}
                  className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-semibold transition disabled:opacity-50"
                >
                  <Trash2 className="w-3 h-3" />
                  {removing ? "Removing…" : "Remove"}
                </button>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-stone-400 text-sm">
              No vendor of the month picked yet for {campus.toUpperCase()}.
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-stone-100">
            <p className="font-semibold text-stone-900 text-sm">Actions — {campus.toUpperCase()}</p>
          </div>
          <div className="p-4 space-y-4">

            {/* Auto pick */}
            <div>
              <p className="text-sm font-medium text-stone-700 mb-1">Auto-Pick Based on Last Month's Data</p>
              <p className="text-xs text-stone-400 mb-3">
                Scores verified {campus.toUpperCase()} vendors by completed orders (50%), rating (30%), completion rate (20%). Will not overwrite an existing pick — remove it first if you want to re-run.
              </p>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={pickNow}
                disabled={picking}
                className="w-full py-3 rounded-2xl text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
                style={{ background: GRAD }}
              >
                {picking ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trophy className="w-4 h-4" />}
                {picking ? "Picking…" : `Pick Now (${campus.toUpperCase()})`}
              </motion.button>
            </div>

            <div className="border-t border-stone-100 pt-4">
              <p className="text-sm font-medium text-stone-700 mb-1">Manual Override</p>
              <p className="text-xs text-stone-400 mb-3">
                Choose a specific vendor for {campus.toUpperCase()}. This overwrites the current month's pick and sends them a notification.
              </p>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-3 text-stone-400 pointer-events-none" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search vendor by name..."
                  className="w-full pl-9 pr-4 py-2.5 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 bg-stone-50"
                />
              </div>
              {(searching || searchResults.length > 0) && (
                <div className="mt-2 border border-stone-200 rounded-xl overflow-hidden bg-white shadow-sm">
                  {searching ? (
                    <div className="p-3 text-center text-stone-400 text-sm">Searching…</div>
                  ) : searchResults.map(v => (
                    <button
                      key={v.id}
                      onClick={() => setManual(v.id, v.business_name || v.username)}
                      disabled={saving}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-stone-50 transition border-b border-stone-50 last:border-0 text-left"
                    >
                      {v.profile_picture ? (
                        <img src={v.profile_picture} alt={v.username} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                          style={{ background: GRAD }}>
                          {(v.business_name || v.username).slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-stone-900 text-sm truncate">{v.business_name || v.username}</p>
                        <p className="text-xs text-stone-400">@{v.username}</p>
                      </div>
                      <span className="text-xs text-teal-600 font-semibold flex-shrink-0">Select</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* History */}
        {history.length > 0 && (
          <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-stone-100">
              <p className="font-semibold text-stone-900 text-sm">History — {campus.toUpperCase()} (last 6 months)</p>
            </div>
            <div className="divide-y divide-stone-50">
              {history.map((r, i) => (
                <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                  {r.profile_picture ? (
                    <img src={r.profile_picture} alt={r.business_name}
                      className="w-10 h-10 rounded-xl object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                      style={{ background: GRAD }}>
                      {r.business_name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-stone-900 text-sm truncate">{r.business_name}</p>
                    <p className="text-xs text-stone-400">{r.month} · {r.total_orders} orders · ⭐{r.rating.toFixed(1)}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {r.is_manual_override && (
                      <span className="text-xs bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full font-semibold">Manual</span>
                    )}
                    {i === 0 && (
                      <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-semibold">Current</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
