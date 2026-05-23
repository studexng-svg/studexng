"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send, Bot, User, Loader2, Sparkles,
  BarChart3, CheckCircle, X, BellRing, UserCheck,
  History, Trash2, PackageCheck, ChevronDown,
} from "lucide-react";
import AdminTopBar from "@/components/layout/AdminTopBar";
import { fetchWithAuth } from "@/lib/authStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

type ActionType = "send_notification" | "verify_vendor" | "generate_report" | "set_listing_status" | "lookup_user" | "lookup_order" | "lookup_conversation";

interface Action {
  type: ActionType;
  label: string;
  params: Record<string, unknown>;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  action?: Action;
  actionStatus?: "pending" | "done" | "dismissed";
  actionResult?: string;
  hidden?: boolean;  // injected context messages — not rendered in UI
}

interface ChatSession {
  id: number;
  title: string;
  created_at: string;
}

const QUICK_PROMPTS = [
  { icon: "📊", label: "Weekly report",      prompt: "Generate a weekly performance report for the platform." },
  { icon: "✅", label: "Pending vendors",     prompt: "Who are the pending seller applications? Show details and give a recommendation for each." },
  { icon: "💰", label: "Revenue summary",     prompt: "Give me a revenue and earnings summary. How is the platform performing financially?" },
  { icon: "📢", label: "Message students",    prompt: "I want to send a motivational message to all students. Help me compose and send it." },
  { icon: "📦", label: "Approve listings",    prompt: "Show me inactive listings that need approval and let me approve them." },
  { icon: "🔍", label: "Platform health",     prompt: "Give me a platform health check — highlight any issues or areas that need attention." },
];

const REPORT_PROMPTS: Record<string, string> = {
  weekly:  "Generate a detailed weekly report: new users, orders placed, revenue, completion rate, disputes, and top trends.",
  monthly: "Generate a comprehensive monthly report: user growth, revenue, order volume, and overall platform health.",
  revenue: "Generate a detailed revenue report: platform fees, vendor payouts, transaction volume, and financial health.",
  users:   "Generate a detailed user report: student vs vendor breakdown, growth trends, activity, and retention insights.",
  orders:  "Generate a detailed orders report: volume, completion rate, dispute rate, and fulfilment trends.",
  full:    "Generate a full platform report covering users, orders, revenue, listings, disputes, and AI broadcast performance.",
};

function renderMd(text: string): string {
  const html = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = html.split("\n");
  const out: string[] = [];
  let inList = false;

  for (const raw of lines) {
    const bullet = raw.match(/^[-•*]\s+(.+)/);
    if (bullet) {
      if (!inList) { out.push('<ul class="list-disc list-inside space-y-0.5 my-1.5 text-sm">'); inList = true; }
      const li = bullet[1]
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>");
      out.push(`<li>${li}</li>`);
    } else {
      if (inList) { out.push("</ul>"); inList = false; }
      let l = raw;
      if (/^###\s/.test(l))      l = `<p class="font-bold text-stone-700 text-sm mt-2 mb-0.5">${l.slice(4)}</p>`;
      else if (/^##\s/.test(l))  l = `<p class="font-bold text-stone-900 text-sm mt-3 mb-1">${l.slice(3)}</p>`;
      else if (/^#\s/.test(l))   l = `<p class="font-bold text-stone-900 text-base mt-3 mb-1">${l.slice(2)}</p>`;
      else {
        l = l
          .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
          .replace(/\*(.+?)\*/g, "<em>$1</em>");
        if (l === "") l = "<br>";
      }
      out.push(l);
    }
  }
  if (inList) out.push("</ul>");
  return out.join("\n");
}

// ── ActionCard ────────────────────────────────────────────────────────────────

const AUDIENCE_OPTS = [
  { val: "all",      label: "Everyone" },
  { val: "students", label: "Students" },
  { val: "vendors",  label: "Vendors" },
];
const SCHOOL_OPTS = [
  { val: "",     label: "All campuses" },
  { val: "pau",  label: "PAU only" },
  { val: "futo", label: "FUTO only" },
];

function ActionCard({ action, status, result, onConfirm, onDismiss }: {
  action: Action;
  status: "pending" | "done" | "dismissed";
  result?: string;
  onConfirm: (finalParams: Record<string, unknown>) => void;
  onDismiss: () => void;
}) {
  const [localParams, setLocalParams] = useState<Record<string, unknown>>(action.params);

  if (status === "dismissed") return null;

  const iconMap: Record<ActionType, React.ElementType> = {
    send_notification:    BellRing,
    verify_vendor:        UserCheck,
    generate_report:      BarChart3,
    set_listing_status:   PackageCheck,
    lookup_user:          User,
    lookup_order:         BarChart3,
    lookup_conversation:  BellRing,
  };
  const Icon = iconMap[action.type] || Sparkles;

  if (status === "done") {
    return (
      <div className="mt-2 flex items-start gap-2 bg-teal-50 border border-teal-200 rounded-xl px-3 py-2.5">
        <CheckCircle className="w-4 h-4 text-teal-600 mt-0.5 flex-shrink-0" />
        <p className="text-teal-700 text-xs leading-relaxed">{result || "Done"}</p>
      </div>
    );
  }

  const gradients: Record<ActionType, string> = {
    send_notification:  "linear-gradient(135deg,#0D9488,#7C3AED)",
    verify_vendor:      "linear-gradient(135deg,#0D9488,#059669)",
    generate_report:    "linear-gradient(135deg,#7C3AED,#6D28D9)",
    set_listing_status: "linear-gradient(135deg,#0D9488,#0891b2)",
  };

  return (
    <div className="mt-2 bg-stone-50 border border-stone-200 rounded-xl p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
             style={{ background: gradients[action.type] }}>
          <Icon className="w-3.5 h-3.5 text-white" />
        </div>
        <p className="text-xs font-semibold text-stone-700 leading-snug">{action.label}</p>
      </div>

      {/* Audience editor for send_notification */}
      {action.type === "send_notification" && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold text-stone-500 uppercase tracking-wide">Send to</p>
          <div className="flex gap-1 flex-wrap">
            {AUDIENCE_OPTS.map(o => (
              <button key={o.val}
                onClick={() => setLocalParams(p => ({ ...p, audience: o.val }))}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                  localParams.audience === o.val
                    ? "bg-teal-600 text-white"
                    : "bg-white border border-stone-200 text-stone-600 hover:border-teal-300"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1 flex-wrap">
            {SCHOOL_OPTS.map(o => (
              <button key={o.val}
                onClick={() => setLocalParams(p => ({ ...p, school: o.val }))}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                  localParams.school === o.val
                    ? "bg-purple-600 text-white"
                    : "bg-white border border-stone-200 text-stone-600 hover:border-purple-300"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => onConfirm(localParams)}
          className="flex-1 py-2 rounded-xl text-xs font-bold text-white transition active:scale-[0.98]"
          style={{ background: gradients[action.type] }}
        >
          Confirm & Execute
        </button>
        <button
          onClick={onDismiss}
          className="w-8 h-8 rounded-xl bg-stone-100 hover:bg-stone-200 flex items-center justify-center transition flex-shrink-0"
        >
          <X className="w-3.5 h-3.5 text-stone-500" />
        </button>
      </div>
    </div>
  );
}

// ── History panel ─────────────────────────────────────────────────────────────

function HistoryPanel({
  sessions,
  loading,
  onLoad,
  onDelete,
  onClose,
}: {
  sessions: ChatSession[];
  loading: boolean;
  onLoad: (id: number) => void;
  onDelete: (id: number) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl max-h-[70vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-stone-100">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-stone-600" />
            <h3 className="font-bold text-stone-900 text-sm">Chat History</h3>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg bg-stone-100 flex items-center justify-center">
            <ChevronDown className="w-4 h-4 text-stone-500" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-4 py-3 space-y-1.5">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 text-stone-400 animate-spin" />
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-center text-stone-400 text-sm py-8">No saved chats yet</p>
          ) : (
            sessions.map(s => (
              <div key={s.id}
                className="flex items-center gap-3 bg-stone-50 hover:bg-stone-100 rounded-xl px-3 py-2.5 transition group"
              >
                <button className="flex-1 text-left" onClick={() => onLoad(s.id)}>
                  <p className="text-xs font-semibold text-stone-800 leading-snug line-clamp-1">{s.title}</p>
                  <p className="text-[10px] text-stone-400 mt-0.5">
                    {new Date(s.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                </button>
                <button
                  onClick={() => onDelete(s.id)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-100 transition"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-400" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminAIPage() {
  const [messages, setMessages]         = useState<Message[]>([]);
  const [input, setInput]               = useState("");
  const [loading, setLoading]           = useState(false);
  const [showHistory, setShowHistory]   = useState(false);
  const [sessions, setSessions]         = useState<ChatSession[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [saving, setSaving]             = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res  = await fetchWithAuth(`${API_URL}/api/admin/ai-history/`);
      const data = await res.json();
      if (res.ok) setSessions(data);
    } catch {}
    finally { setLoadingHistory(false); }
  }, []);

  const openHistory = async () => {
    setShowHistory(true);
    await loadHistory();
  };

  const saveCurrentSession = async () => {
    if (messages.length === 0) return;
    const firstUser = messages.find(m => m.role === "user");
    const raw       = firstUser?.content || "Chat";
    const title     = raw.length > 80 ? raw.slice(0, 77) + "…" : raw;
    const payload   = messages.map(m => ({ id: m.id, role: m.role, content: m.content }));
    try {
      setSaving(true);
      await fetchWithAuth(`${API_URL}/api/admin/ai-history/`, {
        method: "POST",
        body: JSON.stringify({ title, messages: payload }),
      });
    } catch {}
    finally { setSaving(false); }
  };

  const handleNewChat = async () => {
    await saveCurrentSession();
    setMessages([]);
    inputRef.current?.focus();
  };

  const loadSession = async (id: number) => {
    try {
      const res  = await fetchWithAuth(`${API_URL}/api/admin/ai-history/${id}/`);
      const data = await res.json();
      if (res.ok && data.messages) {
        setMessages(data.messages as Message[]);
        setShowHistory(false);
      }
    } catch {}
  };

  const deleteSession = async (id: number) => {
    try {
      await fetchWithAuth(`${API_URL}/api/admin/ai-history/${id}/`, { method: "DELETE" });
      setSessions(prev => prev.filter(s => s.id !== id));
    } catch {}
  };

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: Message = { id: `${Date.now()}-u`, role: "user", content: trimmed };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setLoading(true);
    inputRef.current?.focus();

    try {
      const res = await fetchWithAuth(`${API_URL}/api/admin/ai-chat/`, {
        method: "POST",
        body: JSON.stringify({
          messages: next.map(m => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "AI error");

      const aiMsg: Message = {
        id: `${Date.now()}-a`,
        role: "assistant",
        content: data.message,
        action: data.action ?? undefined,
        actionStatus: data.action ? "pending" : undefined,
      };

      // Auto-execute all lookup actions — no confirm card needed
      const AUTO_EXECUTE = ["lookup_user", "lookup_order", "lookup_conversation"];
      if (data.action?.type && AUTO_EXECUTE.includes(data.action.type)) {
        setMessages(prev => [...prev, { ...aiMsg, actionStatus: "dismissed" }]);
        try {
          const lookupRes  = await fetchWithAuth(`${API_URL}/api/admin/ai-action/`, {
            method: "POST",
            body: JSON.stringify({ type: "lookup_user", params: data.action.params }),
          });
          const lookupData = await lookupRes.json();
          const resultText = lookupData.detail || "No result";

          // Hidden context message — included in API calls but not rendered
          const hiddenMsg: Message = {
            id: `${Date.now()}-lk`,
            role: "user",
            content: `[LOOKUP RESULT]: ${resultText}`,
            hidden: true,
          };
          const withLookup = [...next, { ...aiMsg, actionStatus: "dismissed" as const }, hiddenMsg];
          setMessages(withLookup);

          // Call AI again with the lookup data so it can give a proper answer
          const res2 = await fetchWithAuth(`${API_URL}/api/admin/ai-chat/`, {
            method: "POST",
            body: JSON.stringify({
              messages: withLookup.map(m => ({ role: m.role, content: m.content })),
            }),
          });
          const data2 = await res2.json();
          if (!res2.ok) throw new Error(data2.error || "AI error");
          setMessages(prev => [...prev, {
            id: `${Date.now()}-a2`,
            role: "assistant",
            content: data2.message,
            action: data2.action ?? undefined,
            actionStatus: data2.action ? "pending" : undefined,
          }]);
        } catch (e2: any) {
          setMessages(prev => [...prev, {
            id: `${Date.now()}-e2`,
            role: "assistant",
            content: `Lookup failed: ${(e2 as any).message || "Please try again."}`,
          }]);
        }
        return;
      }

      setMessages(prev => [...prev, aiMsg]);
    } catch (e: any) {
      setMessages(prev => [...prev, {
        id: `${Date.now()}-e`,
        role: "assistant",
        content: `Something went wrong: ${e.message || "Please try again."}`,
      }]);
    } finally {
      setLoading(false);
    }
  };

  const executeAction = async (msgId: string, action: Action, finalParams: Record<string, unknown>) => {
    if (action.type === "generate_report") {
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, actionStatus: "dismissed" } : m));
      const type = (finalParams.report_type as string) || "full";
      await sendMessage(REPORT_PROMPTS[type] ?? REPORT_PROMPTS.full);
      return;
    }

    setMessages(prev => prev.map(m =>
      m.id === msgId ? { ...m, actionStatus: "done", actionResult: "Executing…" } : m
    ));

    try {
      const res = await fetchWithAuth(`${API_URL}/api/admin/ai-action/`, {
        method: "POST",
        body: JSON.stringify({ type: action.type, params: finalParams }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Action failed");
      setMessages(prev => prev.map(m =>
        m.id === msgId ? { ...m, actionResult: data.detail || "Done" } : m
      ));
    } catch (e: any) {
      setMessages(prev => prev.map(m =>
        m.id === msgId ? { ...m, actionResult: `Failed: ${e.message}` } : m
      ));
    }
  };

  const dismissAction = (msgId: string) =>
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, actionStatus: "dismissed" } : m));

  return (
    <div className="min-h-screen bg-[#F5F5F5] flex flex-col" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <AdminTopBar title="AI Assistant" back="/admin" />

      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-28 max-w-2xl mx-auto w-full space-y-3">

        {messages.length === 0 ? (
          <div className="space-y-6 pt-6">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center"
                   style={{ background: "linear-gradient(135deg,#7C3AED,#0D9488)" }}>
                <Bot className="w-7 h-7 text-white" />
              </div>
              <h2 className="font-bold text-stone-900 text-lg">StudEx Admin AI</h2>
              <p className="text-stone-500 text-sm max-w-xs mx-auto">
                Ask about your platform, generate reports, send notifications, approve listings, or verify vendors.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {QUICK_PROMPTS.map(qp => (
                <button
                  key={qp.label}
                  onClick={() => sendMessage(qp.prompt)}
                  disabled={loading}
                  className="text-left bg-white border border-stone-200 rounded-xl px-3 py-3 hover:border-teal-300 hover:shadow-sm transition active:scale-[0.98] disabled:opacity-50"
                >
                  <p className="text-base mb-0.5">{qp.icon}</p>
                  <p className="font-semibold text-stone-800 text-xs leading-tight">{qp.label}</p>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.filter(m => !m.hidden).map(msg => (
            <div key={msg.id} className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
              <div
                className="w-7 h-7 rounded-xl flex-shrink-0 flex items-center justify-center mt-0.5 self-start"
                style={msg.role === "assistant"
                  ? { background: "linear-gradient(135deg,#7C3AED,#0D9488)" }
                  : { background: "#f5f5f4" }}
              >
                {msg.role === "user"
                  ? <User className="w-3.5 h-3.5 text-stone-500" />
                  : <Bot className="w-3.5 h-3.5 text-white" />
                }
              </div>

              <div className={`flex flex-col max-w-[85%] ${msg.role === "user" ? "items-end" : "items-start"}`}>
                <div className={`px-4 py-3 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-stone-800 text-white rounded-2xl rounded-tr-sm"
                    : "bg-white border border-stone-200 text-stone-800 rounded-2xl rounded-tl-sm shadow-sm"
                }`}>
                  {msg.role === "user"
                    ? msg.content
                    : <div dangerouslySetInnerHTML={{ __html: renderMd(msg.content) }} />
                  }
                </div>

                {msg.action && msg.actionStatus !== undefined && (
                  <div className="w-full">
                    <ActionCard
                      action={msg.action}
                      status={msg.actionStatus}
                      result={msg.actionResult}
                      onConfirm={(finalParams) => executeAction(msg.id, msg.action!, finalParams)}
                      onDismiss={() => dismissAction(msg.id)}
                    />
                  </div>
                )}
              </div>
            </div>
          ))
        )}

        {loading && (
          <div className="flex gap-2.5">
            <div className="w-7 h-7 rounded-xl flex-shrink-0 flex items-center justify-center"
                 style={{ background: "linear-gradient(135deg,#7C3AED,#0D9488)" }}>
              <Bot className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="bg-white border border-stone-200 rounded-2xl rounded-tl-sm shadow-sm px-4 py-3">
              <div className="flex gap-1.5 items-center h-4">
                {[0, 150, 300].map(d => (
                  <span key={d}
                    className="w-1.5 h-1.5 rounded-full bg-stone-300 animate-bounce"
                    style={{ animationDelay: `${d}ms` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Sticky input */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#F5F5F5]/95 backdrop-blur-sm border-t border-stone-200 px-4 py-3">
        <div className="max-w-2xl mx-auto flex gap-2 items-center">
          {/* History button */}
          <button
            onClick={openHistory}
            className="w-9 h-9 rounded-xl bg-white border border-stone-200 flex items-center justify-center flex-shrink-0 hover:border-teal-300 transition"
            title="Chat history"
          >
            <History className="w-4 h-4 text-stone-500" />
          </button>

          {messages.length > 0 && (
            <button
              onClick={handleNewChat}
              disabled={saving}
              className="text-xs text-stone-400 hover:text-stone-600 transition flex-shrink-0 whitespace-nowrap"
            >
              {saving ? "Saving…" : "New chat"}
            </button>
          )}

          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
            placeholder="Ask anything or give a command…"
            disabled={loading}
            className="flex-1 px-4 py-3 bg-white border border-stone-200 rounded-2xl text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-teal-400 disabled:opacity-60"
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
            className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 transition disabled:opacity-40 active:scale-95"
            style={{ background: "linear-gradient(135deg,#0D9488,#7C3AED)" }}
          >
            {loading
              ? <Loader2 className="w-4 h-4 text-white animate-spin" />
              : <Send className="w-4 h-4 text-white" />
            }
          </button>
        </div>
      </div>

      {/* History panel */}
      {showHistory && (
        <HistoryPanel
          sessions={sessions}
          loading={loadingHistory}
          onLoad={loadSession}
          onDelete={deleteSession}
          onClose={() => setShowHistory(false)}
        />
      )}
    </div>
  );
}
