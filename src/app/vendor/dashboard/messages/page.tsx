"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/authStore";
import { GRAD, TEAL, toArray } from "@/lib/tokens";
import { ArrowLeft, MessageCircle, Check, CheckCheck, Send, Loader } from "lucide-react";

function Avatar({ conv, size = "md" }: { conv: any; size?: "sm" | "md" }) {
  const pic = conv.other_user?.profile_picture;
  const initial = (conv.buyer_username?.[0] || conv.other_user?.username?.[0] || "?").toUpperCase();
  const cls = size === "sm"
    ? "w-8 h-8 rounded-full text-xs font-bold flex-shrink-0"
    : "w-10 h-10 rounded-full text-sm font-bold flex-shrink-0";
  if (pic) return <img src={pic} alt={initial} className={`${cls} object-cover`} />;
  return (
    <div className={`${cls} flex items-center justify-center text-white`} style={{ background: TEAL }}>
      {initial}
    </div>
  );
}
import { LoadingSpinner, EmptyState } from "../_shared";
import { api } from "@/lib/api";

function getDayLabel(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (msgDay.getTime() === today.getTime()) return "Today";
  if (msgDay.getTime() === yesterday.getTime()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" });
}

export default function MessagesPage() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<any[]>([]);
  const [activeConv, setActiveConv] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showMobileChat, setShowMobileChat] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadConversations();
    const interval = setInterval(loadConversations, 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!activeConv) return;
    loadMessages(activeConv.id);
    const interval = setInterval(() => loadMessages(activeConv.id), 15000);
    return () => clearInterval(interval);
  }, [activeConv?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadConversations = async () => {
    try {
      const res = await api.chat.conversations();
      const data = await res.json();
      setConversations(toArray(data));
    } catch {} finally { setLoading(false); }
  };

  const loadMessages = async (id: number) => {
    try {
      const res = await api.chat.messages(id);
      const data = await res.json();
      const raw = toArray(data);
      const currentUsername = user?.username;
      setMessages(raw.map((m: any) => ({
        ...m,
        is_mine: currentUsername ? m.sender_username === currentUsername : !!m.is_mine,
      })));
    } catch {}
  };

  const sendMessage = async () => {
    if (!text.trim() || !activeConv || sending) return;
    setSending(true);
    try {
      await api.chat.send(activeConv.id, { content: text, message_type: "text" });
      setText("");
      loadMessages(activeConv.id);
    } catch {} finally { setSending(false); }
  };

  const renderMessages = (msgs: any[]) => {
    const nodes: React.ReactNode[] = [];
    let lastDay = "";
    msgs.forEach(msg => {
      const day = getDayLabel(msg.created_at);
      if (day !== lastDay) {
        lastDay = day;
        nodes.push(
          <div key={`day-${msg.created_at}`} className="flex items-center gap-3 my-3">
            <div className="flex-1 h-px bg-stone-200" />
            <span className="text-xs text-stone-400 font-medium whitespace-nowrap">{day}</span>
            <div className="flex-1 h-px bg-stone-200" />
          </div>
        );
      }
      nodes.push(
        <div key={msg.id} className={`flex ${msg.is_mine ? "justify-end" : "justify-start"}`}>
          <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
            msg.is_mine ? "text-white rounded-br-sm" : "bg-stone-100 text-stone-800 rounded-bl-sm"
          }`} style={msg.is_mine ? { background: TEAL } : {}}>
            <p className={`text-xs font-medium mb-1 ${msg.is_mine ? "text-teal-100 text-right" : "text-stone-500"}`}>
              {msg.sender_username || (msg.is_mine ? user?.username : activeConv?.buyer_username)}
            </p>
            <p className="text-sm break-words">{msg.content}</p>
            <div className="flex items-center justify-end gap-1 mt-1">
              <p className="text-xs opacity-50">
                {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </p>
              {msg.is_mine && (
                msg.is_read
                  ? <CheckCheck className="w-3.5 h-3.5 text-white/80 flex-shrink-0" />
                  : <Check className="w-3.5 h-3.5 text-white/40 flex-shrink-0" />
              )}
            </div>
          </div>
        </div>
      );
    });
    return nodes;
  };

  if (loading) return <LoadingSpinner />;

  // Mobile: individual chat view
  if (showMobileChat && activeConv) {
    return (
      <div>
        <div className="flex items-center gap-3 bg-white border border-stone-200 rounded-2xl px-4 py-3 mb-3 shadow-sm">
          <button onClick={() => setShowMobileChat(false)}
            className="p-1.5 -ml-1 hover:bg-stone-100 rounded-full transition flex-shrink-0">
            <ArrowLeft className="w-4 h-4 text-stone-600" />
          </button>
          <Avatar conv={activeConv} size="sm" />
          <div className="min-w-0">
            <p className="font-semibold text-stone-800 text-sm truncate">{activeConv.buyer_username || "Buyer"}</p>
            <p className="text-xs text-stone-400 truncate">{activeConv.listing_title}</p>
          </div>
        </div>

        <div className="pb-4">
          {messages.length === 0 && (
            <p className="text-center text-stone-400 text-sm mt-8">No messages yet</p>
          )}
          {renderMessages(messages)}
          <div ref={bottomRef} />
        </div>

        <div className="sticky bottom-28 bg-white border border-stone-200 rounded-2xl px-4 py-3 flex gap-3 shadow-md">
          <input value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), sendMessage())}
            placeholder="Type a reply..."
            className="flex-1 bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-stone-900 text-base placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition" />
          <button onClick={sendMessage} disabled={sending || !text.trim()}
            className="p-2.5 text-white disabled:opacity-40 rounded-xl transition active:scale-95"
            style={{ background: TEAL }}>
            {sending ? <Loader className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="lg:flex lg:bg-white lg:rounded-2xl lg:shadow-sm lg:overflow-hidden" style={{ minHeight: "calc(100vh - 220px)" }}>
      {/* Conversations list */}
      <div className="w-full lg:w-60 lg:flex-shrink-0 lg:border-r lg:border-stone-100">
        <div className="px-4 py-3 border-b border-stone-100">
          <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-bold mb-0.5">Messages</p>
          <h2 className="font-black text-stone-900 text-base tracking-tight">Conversations</h2>
          <p className="text-xs text-stone-400 mt-0.5">{conversations.length} chats</p>
        </div>
        {conversations.length === 0 ? (
          <div className="p-6 text-center text-stone-400 text-sm">No messages yet</div>
        ) : conversations.map(conv => (
          <button key={conv.id} onClick={() => { setActiveConv(conv); setShowMobileChat(true); }}
            className={`w-full p-3 text-left border-b border-stone-100 hover:bg-stone-50 transition-colors ${
              activeConv?.id === conv.id ? "bg-teal-50 border-l-2 border-l-teal-500" : ""
            }`}>
            <div className="flex items-center gap-2.5">
              <Avatar conv={conv} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-stone-800 text-sm truncate">{conv.buyer_username || "Buyer"}</p>
                <p className="text-xs text-stone-400 truncate">{conv.listing_title || "Service inquiry"}</p>
              </div>
              {conv.unread_count > 0 && (
                <span className="bg-teal-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0">
                  {conv.unread_count}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* Desktop chat panel */}
      <div className="hidden lg:flex flex-1 flex-col" style={{ minHeight: "calc(100vh - 220px)" }}>
        {!activeConv ? (
          <div className="flex-1 flex items-center justify-center text-stone-400">
            <div className="text-center">
              <MessageCircle className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-semibold text-sm">Select a conversation</p>
              <p className="text-xs text-stone-400 mt-1">Choose a buyer from the left to reply</p>
            </div>
          </div>
        ) : (
          <>
            <div className="px-4 py-3 border-b border-stone-100 flex items-center gap-3 flex-shrink-0">
              <Avatar conv={activeConv} size="sm" />
              <div className="min-w-0">
                <p className="font-semibold text-stone-800 text-sm truncate">{activeConv.buyer_username || "Buyer"}</p>
                <p className="text-xs text-stone-400 truncate">{activeConv.listing_title}</p>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {messages.length === 0 && <p className="text-center text-stone-400 text-sm mt-8">No messages yet</p>}
              {renderMessages(messages)}
              <div ref={bottomRef} />
            </div>
            <div className="px-4 py-3 border-t border-stone-100 flex gap-3 flex-shrink-0 bg-white">
              <input value={text} onChange={e => setText(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), sendMessage())}
                placeholder="Type a reply..."
                className="flex-1 bg-white border border-stone-200 rounded-xl px-4 py-2.5 text-stone-900 text-base placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition" />
              <button onClick={sendMessage} disabled={sending || !text.trim()}
                className="p-2.5 text-white disabled:opacity-40 rounded-xl transition active:scale-95"
                style={{ background: TEAL }}>
                {sending ? <Loader className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
