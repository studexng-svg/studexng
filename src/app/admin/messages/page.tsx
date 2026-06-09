// src/app/admin/messages/page.tsx
"use client";

import { Send, User, Users, Search, CheckCircle, Loader2, Sparkles, Bot, Clock } from "lucide-react";
import AdminTopBar from "@/components/layout/AdminTopBar";
import { useState, useCallback, useEffect } from "react";
import { fetchWithAuth } from "@/lib/authStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

type Mode = "single" | "broadcast" | "ai";

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
  const [showPreview, setShowPreview] = useState(false);
  const [previews, setPreviews] = useState<any[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [showVariables, setShowVariables] = useState(false);

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

  const preview = async () => {
    if (!title.trim() || !message.trim()) return;
    setPreviewLoading(true);
    try {
      const res = await fetchWithAuth(`${API_URL}/api/admin/broadcast-preview/`, {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          message: message.trim(),
          school: school || undefined,
          user_type: userType || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load preview");
      setPreviews(data.samples || []);
      setShowPreview(true);
    } catch (e: any) {
      setError(e.message || "Failed to load preview");
    } finally {
      setPreviewLoading(false);
    }
  };

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

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Field label="Title">
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              maxLength={200}
              placeholder="e.g., Hey {{username}}, check this out!"
              className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-teal-400"
            />
          </Field>
          <button
            onClick={() => setShowVariables(!showVariables)}
            className="text-xs text-teal-600 font-semibold hover:text-teal-700 mt-6"
          >
            {showVariables ? "Hide" : "Show"} variables
          </button>
        </div>
        {showVariables && (
          <div className="bg-teal-50 border border-teal-200 rounded-xl px-3 py-2.5 text-xs text-teal-800">
            <p className="font-semibold mb-1.5">Available variables:</p>
            <div className="grid grid-cols-2 gap-1.5">
              <code className="bg-white px-2 py-1 rounded border border-teal-100">{"{{username}}"}</code>
              <code className="bg-white px-2 py-1 rounded border border-teal-100">{"{{email}}"}</code>
              <code className="bg-white px-2 py-1 rounded border border-teal-100">{"{{business_name}}"}</code>
              <code className="bg-white px-2 py-1 rounded border border-teal-100">{"{{first_name}}"}</code>
              <code className="bg-white px-2 py-1 rounded border border-teal-100">{"{{school}}"}</code>
              <code className="bg-white px-2 py-1 rounded border border-teal-100">{"{{user_type}}"}</code>
            </div>
          </div>
        )}
      </div>

      <Field label="Message">
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          rows={4}
          placeholder="e.g., Hi {{username}}, thanks for using StudEx! Check out these new {{business_name}} listings..."
          className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-teal-400 resize-none"
        />
      </Field>

      {showPreview && previews.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-blue-900">Preview for sample users:</p>
          {previews.map((p, i) => (
            <div key={i} className="bg-white rounded-lg border border-blue-100 p-3 space-y-1.5">
              <p className="text-xs text-blue-600 font-semibold">{p.business_name} (@{p.username})</p>
              <p className="text-xs font-bold text-stone-900">{p.title}</p>
              <p className="text-xs text-stone-600">{p.message}</p>
            </div>
          ))}
        </div>
      )}

      {confirmed && !sending && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 font-medium">
          ⚠️ This will notify {school ? `all ${school.toUpperCase()} ` : "all "}{selectedLabel.toLowerCase()}.
          Tap Send again to confirm.
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={preview}
          disabled={!title.trim() || !message.trim() || previewLoading}
          className="flex-1 py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition disabled:opacity-40 bg-stone-100 hover:bg-stone-200 text-stone-700"
        >
          {previewLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {previewLoading ? "Loading…" : "Preview"}
        </button>
        <button
          onClick={send}
          disabled={!title.trim() || !message.trim() || sending}
          className={`flex-1 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition disabled:opacity-40 ${
            confirmed ? "bg-amber-500 hover:bg-amber-600 text-white" : "bg-purple-600 hover:bg-purple-700 text-white"
          }`}
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {sending ? "Sending…" : confirmed ? "Confirm Broadcast" : "Broadcast"}
        </button>
      </div>
    </div>
  );
}

// ─── AI Broadcast section ────────────────────────────────────────────────────

const AI_AUDIENCE_OPTIONS = [
  { value: "students", label: "Students" },
  { value: "vendors",  label: "Vendors"  },
  { value: "all",      label: "All Users"},
];

type GroqLog = {
  id: number; audience: string; school: string;
  title: string; message: string; sent_count: number;
  triggered_by: string; created_at: string;
};

type Preview = { title: string; message: string; recipient_count: number };

function GroqBroadcast() {
  const [audience, setAudience] = useState("students");
  const [school, setSchool]     = useState("");
  const [preview, setPreview]   = useState<Preview | null>(null);
  const [loading, setLoading]   = useState(false);
  const [sending, setSending]   = useState(false);
  const [sent, setSent]         = useState<{ sent: number; title: string } | null>(null);
  const [error, setError]       = useState("");
  const [logs, setLogs]         = useState<GroqLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [aiEnabled, setAiEnabled]   = useState<boolean | null>(null);
  const [toggling, setToggling]     = useState(false);

  const fetchLogs = async () => {
    try {
      const r = await fetchWithAuth(`${API_URL}/api/admin/groq-notify/`);
      const d = await r.json();
      if (Array.isArray(d)) setLogs(d);
    } catch {} finally { setLogsLoading(false); }
  };

  const fetchSettings = async () => {
    try {
      const r = await fetchWithAuth(`${API_URL}/api/admin/platform-settings/`);
      const d = await r.json();
      if (typeof d.grok_notifications_enabled === "boolean") setAiEnabled(d.grok_notifications_enabled);
    } catch {}
  };

  const toggleAi = async () => {
    if (aiEnabled === null || toggling) return;
    setToggling(true);
    try {
      const r = await fetchWithAuth(`${API_URL}/api/admin/platform-settings/`, {
        method: "PATCH",
        body: JSON.stringify({ grok_notifications_enabled: !aiEnabled }),
      });
      const d = await r.json();
      if (typeof d.grok_notifications_enabled === "boolean") setAiEnabled(d.grok_notifications_enabled);
    } catch {} finally { setToggling(false); }
  };

  useEffect(() => { fetchLogs(); fetchSettings(); }, []);

  const generate = async () => {
    setLoading(true); setPreview(null); setError(""); setSent(null);
    try {
      const r = await fetchWithAuth(`${API_URL}/api/admin/groq-notify/`, {
        method: "POST",
        body: JSON.stringify({ audience, school: school || undefined, preview: true }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Failed");
      setPreview(d);
    } catch (e: any) {
      setError(e.message || "Groq API error");
    } finally { setLoading(false); }
  };

  const send = async () => {
    if (!preview) return;
    setSending(true); setError("");
    try {
      const r = await fetchWithAuth(`${API_URL}/api/admin/groq-notify/`, {
        method: "POST",
        body: JSON.stringify({ audience, school: school || undefined }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Failed");
      setSent(d); setPreview(null);
      fetchLogs();
    } catch (e: any) {
      setError(e.message || "Send failed");
    } finally { setSending(false); }
  };

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  return (
    <div className="space-y-4">
      {/* Generator card */}
      <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl flex items-center justify-center"
                 style={{ background: "linear-gradient(135deg,#7C3AED,#0D9488)" }}>
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="font-bold text-stone-900 text-sm">Groq AI Broadcast</p>
              <p className="text-stone-400 text-xs">Auto-generates contextual tips for your users</p>
            </div>
          </div>
          {/* AI on/off toggle */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`text-xs font-semibold ${aiEnabled ? "text-teal-600" : "text-stone-400"}`}>
              {aiEnabled === null ? "…" : aiEnabled ? "ON" : "OFF"}
            </span>
            <button
              onClick={toggleAi}
              disabled={aiEnabled === null || toggling}
              aria-label={aiEnabled ? "Disable AI broadcasts" : "Enable AI broadcasts"}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-50 ${
                aiEnabled ? "bg-teal-500" : "bg-stone-300"
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
                aiEnabled ? "translate-x-6" : "translate-x-1"
              }`} />
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded-xl text-sm">{error}</div>
        )}
        {sent && (
          <div className="bg-teal-50 border border-teal-200 text-teal-700 px-3 py-2 rounded-xl text-sm flex items-center gap-2">
            <CheckCircle className="w-4 h-4" /> Sent "{sent.title}" to {sent.sent} user{sent.sent !== 1 ? "s" : ""}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Audience">
            <select value={audience} onChange={e => { setAudience(e.target.value); setPreview(null); }}
              className="w-full px-3 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-900 focus:outline-none focus:border-purple-400">
              {AI_AUDIENCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="Campus">
            <select value={school} onChange={e => { setSchool(e.target.value); setPreview(null); }}
              className="w-full px-3 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-900 focus:outline-none focus:border-purple-400">
              {SCHOOL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
        </div>

        {/* Preview area */}
        {preview && (
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-1.5 mb-1">
              <Sparkles className="w-3.5 h-3.5 text-purple-500" />
              <span className="text-xs font-semibold text-purple-600 uppercase tracking-wide">Groq generated</span>
            </div>
            <p className="font-bold text-stone-900 text-sm">{preview.title}</p>
            <p className="text-stone-600 text-sm">{preview.message}</p>
            <p className="text-stone-400 text-xs pt-1">
              Will be sent to <span className="font-semibold text-stone-600">{preview.recipient_count} {audience}</span>
              {school ? ` at ${school.toUpperCase()}` : ""}
            </p>
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={generate} disabled={loading || sending}
            className="flex-1 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition disabled:opacity-40 bg-stone-100 hover:bg-stone-200 text-stone-700">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {loading ? "Generating…" : preview ? "Regenerate" : "Generate Preview"}
          </button>
          {preview && (
            <button onClick={send} disabled={sending}
              className="flex-1 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition disabled:opacity-40 text-white"
              style={{ background: "linear-gradient(135deg,#7C3AED,#0D9488)" }}>
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {sending ? "Sending…" : `Send to ${preview.recipient_count}`}
            </button>
          )}
        </div>

        <p className="text-xs text-stone-400 text-center">
          Powered by Groq · Auto-sends Mon/Wed/Fri (students) &amp; Tue/Thu/Sat (vendors) at 10am
        </p>
      </div>

      {/* Recent logs */}
      <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-5 py-3 border-b border-stone-100">
          <p className="font-bold text-stone-800 text-sm flex items-center gap-2">
            <Clock className="w-4 h-4 text-stone-400" /> Recent AI Broadcasts
          </p>
        </div>
        {logsLoading ? (
          <div className="p-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-stone-300" /></div>
        ) : logs.length === 0 ? (
          <p className="text-stone-400 text-sm text-center py-6">No AI broadcasts yet</p>
        ) : (
          <div className="divide-y divide-stone-100">
            {logs.map(log => (
              <div key={log.id} className="px-5 py-3 flex items-start gap-3">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                     style={{ background: log.audience === "vendors" ? "#f3e8ff" : "#f0fdf4" }}>
                  <Bot className="w-3.5 h-3.5" style={{ color: log.audience === "vendors" ? "#7C3AED" : "#0D9488" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-stone-900 text-sm truncate">{log.title}</p>
                    <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold flex-shrink-0 ${
                      log.audience === "vendors" ? "bg-purple-100 text-purple-700"
                      : log.audience === "all" ? "bg-stone-100 text-stone-600"
                      : "bg-teal-100 text-teal-700"
                    }`}>{log.audience}</span>
                    {log.school && (
                      <span className="px-1.5 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-700 flex-shrink-0">
                        {log.school.toUpperCase()}
                      </span>
                    )}
                  </div>
                  <p className="text-stone-500 text-xs mt-0.5 line-clamp-1">{log.message}</p>
                  <p className="text-stone-400 text-xs mt-1">
                    {log.sent_count} sent · {log.triggered_by} · {timeAgo(log.created_at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminMessagesPage() {
  const [mode, setMode] = useState<Mode>("single");

  return (
    <div className="min-h-screen bg-[#F5F5F5]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <AdminTopBar title="Messages" back="/admin" />

      <div className="px-4 pt-4 pb-28 max-w-2xl mx-auto space-y-4">

        {/* Mode tabs */}
        <div className="flex gap-2 bg-white border border-stone-200 rounded-2xl p-1.5">
          {([
            { key: "single",    label: "Single User",  icon: User },
            { key: "broadcast", label: "Broadcast",    icon: Users },
            { key: "ai",        label: "AI Broadcast", icon: Bot  },
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

        {mode === "single" && <SingleUserCompose />}
        {mode === "broadcast" && <BroadcastCompose />}
        {mode === "ai" && <GroqBroadcast />}

      </div>
    </div>
  );
}
