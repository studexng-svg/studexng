"use client";

import { useState, useRef, useEffect } from "react";
import {
  Send, Bot, User, Loader2, Sparkles,
  BarChart3, CheckCircle, X, BellRing, UserCheck,
} from "lucide-react";
import AdminTopBar from "@/components/layout/AdminTopBar";
import { fetchWithAuth } from "@/lib/authStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

type ActionType = "send_notification" | "verify_vendor" | "generate_report";

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
}

const QUICK_PROMPTS = [
  { icon: "📊", label: "Weekly report",      prompt: "Generate a weekly performance report for the platform." },
  { icon: "✅", label: "Pending vendors",     prompt: "Who are the pending seller applications? Show details and give a recommendation for each." },
  { icon: "💰", label: "Revenue summary",     prompt: "Give me a revenue and earnings summary. How is the platform performing financially?" },
  { icon: "📢", label: "Message students",    prompt: "I want to send a motivational message to all students. Help me compose and send it." },
  { icon: "💡", label: "Vendor tips",         prompt: "Send a practical business tip to all vendors." },
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

function ActionCard({ action, status, result, onConfirm, onDismiss }: {
  action: Action;
  status: "pending" | "done" | "dismissed";
  result?: string;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  if (status === "dismissed") return null;

  const iconMap: Record<ActionType, React.ElementType> = {
    send_notification: BellRing,
    verify_vendor:     UserCheck,
    generate_report:   BarChart3,
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
    send_notification: "linear-gradient(135deg,#0D9488,#7C3AED)",
    verify_vendor:     "linear-gradient(135deg,#0D9488,#059669)",
    generate_report:   "linear-gradient(135deg,#7C3AED,#6D28D9)",
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
      <div className="flex gap-2">
        <button
          onClick={onConfirm}
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

const STORAGE_KEY = "admin_ai_chat_history";

export default function AdminAIPage() {
  const [messages, setMessages] = useState<Message[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [input, setInput]     = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  // Persist messages to localStorage whenever they change
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages)); } catch {}
  }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

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

  const executeAction = async (msgId: string, action: Action) => {
    if (action.type === "generate_report") {
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, actionStatus: "dismissed" } : m));
      const type = (action.params.report_type as string) || "full";
      await sendMessage(REPORT_PROMPTS[type] ?? REPORT_PROMPTS.full);
      return;
    }

    setMessages(prev => prev.map(m =>
      m.id === msgId ? { ...m, actionStatus: "done", actionResult: "Executing…" } : m
    ));

    try {
      const res = await fetchWithAuth(`${API_URL}/api/admin/ai-action/`, {
        method: "POST",
        body: JSON.stringify({ type: action.type, params: action.params }),
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
    <div className="min-h-screen bg-[#FFF8F0] flex flex-col" style={{ fontFamily: "'DM Sans', sans-serif" }}>
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
                Ask about your platform, generate reports, send notifications, or verify vendors.
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
          messages.map(msg => (
            <div key={msg.id} className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
              {/* Avatar */}
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

              {/* Bubble + action */}
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
                      onConfirm={() => executeAction(msg.id, msg.action!)}
                      onDismiss={() => dismissAction(msg.id)}
                    />
                  </div>
                )}
              </div>
            </div>
          ))
        )}

        {/* Typing indicator */}
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
      <div className="fixed bottom-0 left-0 right-0 bg-[#FFF8F0]/95 backdrop-blur-sm border-t border-stone-200 px-4 py-3">
        <div className="max-w-2xl mx-auto flex gap-2 items-center">
          {messages.length > 0 && (
            <button
              onClick={() => {
                setMessages([]);
                try { localStorage.removeItem(STORAGE_KEY); } catch {}
              }}
              className="text-xs text-stone-400 hover:text-stone-600 transition flex-shrink-0"
            >
              Clear
            </button>
          )}
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
            placeholder="Ask anything about your platform…"
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
    </div>
  );
}
