// src/app/admin/messages/page.tsx
"use client";

import { Send, User, Users, Search, CheckCircle, Loader2 } from "lucide-react";
import AdminTopBar from "@/components/layout/AdminTopBar";
import { useState, useCallback, useEffect } from "react";
import { fetchWithAuth } from "@/lib/authStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

type Mode = "single" | "broadcast";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-stone-500 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

// ─── Single user section ──────────────────────────────────────────────────────

function SingleUserCompose() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [searching, setSearching] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const search = useCallback(async (q: string) => {
    setQuery(q);
    setSelected(null);
    if (!q.trim()) { setResults([]); return; }
    setSearching(true);
    try {
      const res = await fetchWithAuth(`${API_URL}/api/admin/users/?search=${encodeURIComponent(q)}`);
      const data = await res.json();
      setResults(Array.isArray(data) ? data.slice(0, 8) : (data.results || []).slice(0, 8));
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const send = async () => {
    if (!selected || !title.trim() || !message.trim()) return;
    setSending(true);
    setError("");
    try {
      const res = await fetchWithAuth(`${API_URL}/api/admin/users/${selected.id}/notify/`, {
        method: "POST",
        body: JSON.stringify({ title: title.trim(), message: message.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send");
      setSent(true);
      setTitle("");
      setMessage("");
      setSelected(null);
      setQuery("");
      setTimeout(() => setSent(false), 3000);
    } catch (e: any) {
      setError(e.message || "Failed to send");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm space-y-4">
      <p className="text-teal-600 text-xs tracking-[0.18em] uppercase font-semibold flex items-center gap-1.5">
        <User className="w-3.5 h-3.5" /> Send to a User
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded-xl text-sm">
          {error}
        </div>
      )}

      {sent && (
        <div className="bg-teal-50 border border-teal-200 text-teal-700 px-3 py-2 rounded-xl text-sm flex items-center gap-2">
          <CheckCircle className="w-4 h-4" /> Message sent!
        </div>
      )}

      <Field label="Recipient">
        {selected ? (
          <div className="flex items-center justify-between bg-teal-50 border border-teal-200 rounded-xl px-3 py-2.5">
            <div>
              <p className="font-semibold text-stone-900 text-sm">{selected.username}</p>
              <p className="text-stone-500 text-xs">{selected.email}</p>
            </div>
            <button onClick={() => { setSelected(null); setQuery(""); }}
              className="text-xs text-red-500 hover:text-red-700 font-semibold">Change</button>
          </div>
        ) : (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <input
              value={query}
              onChange={e => search(e.target.value)}
              placeholder="Search by username or email…"
              className="w-full pl-9 pr-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-teal-400"
            />
            {(searching || results.length > 0) && (
              <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-stone-200 rounded-xl shadow-lg z-10 overflow-hidden">
                {searching ? (
                  <div className="px-4 py-3 text-stone-400 text-sm flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Searching…
                  </div>
                ) : results.length === 0 ? (
                  <div className="px-4 py-3 text-stone-400 text-sm">No users found</div>
                ) : results.map(u => (
                  <button
                    key={u.id}
                    onClick={() => { setSelected(u); setResults([]); setQuery(u.username); }}
                    className="w-full text-left px-4 py-2.5 hover:bg-stone-50 transition flex items-center justify-between"
                  >
                    <div>
                      <p className="font-semibold text-stone-900 text-sm">{u.username}</p>
                      <p className="text-stone-400 text-xs">{u.email}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                      u.school?.toLowerCase() === "futo" ? "bg-orange-100 text-orange-700" : "bg-teal-50 text-teal-700"
                    }`}>
                      {u.school?.toUpperCase() || "PAU"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </Field>

      <Field label="Title">
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          maxLength={200}
          placeholder="Notification title…"
          className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-teal-400"
        />
      </Field>

      <Field label="Message">
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          rows={4}
          placeholder="Write your message…"
          className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-teal-400 resize-none"
        />
      </Field>

      <button
        onClick={send}
        disabled={!selected || !title.trim() || !message.trim() || sending}
        className="w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition disabled:opacity-40"
        style={{ background: "linear-gradient(135deg,#0D9488,#7C3AED)", color: "#fff" }}
      >
        {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        {sending ? "Sending…" : "Send Message"}
      </button>
    </div>
  );
}

// ─── Broadcast section ────────────────────────────────────────────────────────

const SCHOOL_OPTIONS = [
  { value: "",     label: "All Campuses" },
  { value: "pau",  label: "PAU only" },
  { value: "futo", label: "FUTO only" },
];

const TYPE_OPTIONS = [
  { value: "",                      label: "All Users" },
  { value: "student",               label: "Students only" },
  { value: "vendor",                label: "Vendors only" },
  { value: "vendors_no_listings",   label: "Vendors with no listings" },
  { value: "vendors_with_listings", label: "Vendors with listings" },
  { value: "vendors_inactive",      label: "Vendors with inactive listings" },
  { value: "vendors_active",        label: "Vendors with active listings" },
  { value: "students_no_orders",    label: "Students who have never ordered" },
  { value: "students_with_orders",  label: "Students with at least one order" },
];

type BroadcastCounts = Record<string, number>;

function typeOptionLabel(value: string, label: string, counts: BroadcastCounts): string {
  const key = value === "" ? "all" : value;
  const n = counts[key];
  return n !== undefined ? `${label} (${n})` : label;
}

function BroadcastCompose() {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [school, setSchool] = useState("");
  const [userType, setUserType] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent: number } | null>(null);
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [counts, setCounts] = useState<BroadcastCounts>({});
  const [countsLoading, setCountsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setCountsLoading(true);
    const qs = school ? `?school=${encodeURIComponent(school)}` : "";
    fetchWithAuth(`${API_URL}/api/admin/broadcast-counts/${qs}`)
      .then(r => r.json())
      .then(data => { if (!cancelled) setCounts(data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setCountsLoading(false); });
    return () => { cancelled = true; };
  }, [school]);

  const send = async () => {
    if (!confirmed) { setConfirmed(true); return; }
    setSending(true);
    setConfirmed(false);
    setError("");
    setResult(null);
    try {
      const res = await fetchWithAuth(`${API_URL}/api/admin/notify-all/`, {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          message: message.trim(),
          school: school || undefined,
          user_type: userType || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setResult(data);
      setTitle("");
      setMessage("");
    } catch (e: any) {
      setError(e.message || "Failed to broadcast");
    } finally {
      setSending(false);
    }
  };

  const selectedLabel = TYPE_OPTIONS.find(o => o.value === userType)?.label ?? "users";

  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm space-y-4">
      <p className="text-purple-600 text-xs tracking-[0.18em] uppercase font-semibold flex items-center gap-1.5">
        <Users className="w-3.5 h-3.5" /> Broadcast to All Users
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded-xl text-sm">{error}</div>
      )}

      {result && (
        <div className="bg-teal-50 border border-teal-200 text-teal-700 px-3 py-2 rounded-xl text-sm flex items-center gap-2">
          <CheckCircle className="w-4 h-4" /> Sent to {result.sent} user{result.sent !== 1 ? "s" : ""}
        </div>
      )}

      {/* Audience filters */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Campus">
          <select
            value={school}
            onChange={e => { setSchool(e.target.value); setConfirmed(false); }}
            className="w-full px-3 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-900 focus:outline-none focus:border-teal-400"
          >
            {SCHOOL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        <Field label="User Type">
          <div className="relative">
            <select
              value={userType}
              onChange={e => { setUserType(e.target.value); setConfirmed(false); }}
              className="w-full px-3 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-900 focus:outline-none focus:border-teal-400"
            >
              {TYPE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>
                  {typeOptionLabel(o.value, o.label, counts)}
                </option>
              ))}
            </select>
            {countsLoading && (
              <Loader2 className="absolute right-8 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-stone-400 pointer-events-none" />
            )}
          </div>
        </Field>
      </div>

      <Field label="Title">
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          maxLength={200}
          placeholder="Broadcast title…"
          className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-teal-400"
        />
      </Field>

      <Field label="Message">
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          rows={4}
          placeholder="Write your broadcast message…"
          className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-teal-400 resize-none"
        />
      </Field>

      {confirmed && !sending && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 font-medium">
          ⚠️ This will notify {school ? `all ${school.toUpperCase()} ` : "all "}{selectedLabel.toLowerCase()}.
          Tap Send again to confirm.
        </div>
      )}

      <button
        onClick={send}
        disabled={!title.trim() || !message.trim() || sending}
        className={`w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition disabled:opacity-40 ${
          confirmed ? "bg-amber-500 hover:bg-amber-600 text-white" : "bg-purple-600 hover:bg-purple-700 text-white"
        }`}
      >
        {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        {sending ? "Sending…" : confirmed ? "Confirm Broadcast" : "Broadcast"}
      </button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminMessagesPage() {
  const [mode, setMode] = useState<Mode>("single");

  return (
    <div className="min-h-screen bg-[#FFF8F0]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <AdminTopBar title="Messages" back="/admin" />

      <div className="px-4 pt-4 pb-28 max-w-2xl mx-auto space-y-4">

        {/* Mode tabs */}
        <div className="flex gap-2 bg-white border border-stone-200 rounded-2xl p-1.5">
          {([
            { key: "single",    label: "Single User",  icon: User },
            { key: "broadcast", label: "Broadcast",    icon: Users },
          ] as { key: Mode; label: string; icon: React.ElementType }[]).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setMode(key)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition ${
                mode === key ? "text-white shadow-sm" : "text-stone-500 hover:text-stone-700"
              }`}
              style={mode === key ? { background: "linear-gradient(135deg,#0D9488,#7C3AED)" } : {}}
            >
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>

        {mode === "single" ? <SingleUserCompose /> : <BroadcastCompose />}

      </div>
    </div>
  );
}
