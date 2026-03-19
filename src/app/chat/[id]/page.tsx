// src/app/chat/[id]/page.tsx
"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, Send, Loader } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth, fetchWithAuth } from "@/lib/authStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

interface Message {
  id: number;
  sender: number;
  sender_username: string;
  content: string;
  created_at: string;
  is_mine: boolean;
  is_read: boolean;
}

interface ConversationInfo {
  id: number;
  other_user: { id: number; username: string };
  listing_title: string;
}

export default function ChatDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { isLoggedIn, isHydrated, user } = useAuth();
  const bottomRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [convInfo, setConvInfo] = useState<ConversationInfo | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (isHydrated && !isLoggedIn) { router.push("/auth"); return; }
    if (!isHydrated || !isLoggedIn) return;

    const load = async () => {
      try {
        const [convRes, msgRes] = await Promise.all([
          fetchWithAuth(`${API_URL}/api/chat/conversations/${id}/`),
          fetchWithAuth(`${API_URL}/api/chat/conversations/${id}/messages/`),
        ]);
        const conv = await convRes.json();
        const msgs = await msgRes.json();
        setConvInfo(conv);
        setMessages(Array.isArray(msgs) ? msgs : msgs.results || []);
      } catch {}
      setLoading(false);
    };
    load();
  }, [isHydrated, isLoggedIn, id, router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Poll for new messages every 5s
  useEffect(() => {
    if (!isLoggedIn) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetchWithAuth(`${API_URL}/api/chat/conversations/${id}/messages/`);
        const data = await res.json();
        const msgs = Array.isArray(data) ? data : data.results || [];
        setMessages(msgs);
      } catch {}
    }, 5000);
    return () => clearInterval(interval);
  }, [id, isLoggedIn]);

  const sendMessage = async () => {
    const content = input.trim();
    if (!content || sending) return;
    setSending(true);
    setInput("");

    try {
      const res = await fetchWithAuth(`${API_URL}/api/chat/conversations/${id}/send/`, {
        method: "POST",
        body: JSON.stringify({ content }),
      });
      const msg = await res.json();
      setMessages(prev => [...prev, msg]);
    } catch {}
    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        className="bg-white border-b border-gray-100 shadow-sm px-4 py-3 flex items-center gap-3 flex-shrink-0">
        <button onClick={() => router.back()} className="p-1.5 hover:bg-gray-100 rounded-full">
          <ChevronLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-teal-500 rounded-full flex items-center justify-center text-white font-black">
          {convInfo?.other_user?.username?.[0]?.toUpperCase() || "?"}
        </div>
        <div>
          <p className="font-black text-gray-900">{convInfo?.other_user?.username || "..."}</p>
          <p className="text-xs text-purple-600 font-medium truncate max-w-[200px]">{convInfo?.listing_title}</p>
        </div>
      </motion.div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader className="w-6 h-6 text-purple-600 animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">
            No messages yet. Say hello! 👋
          </div>
        ) : (
          messages.map((msg, i) => (
            <motion.div key={msg.id}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i < 10 ? i * 0.03 : 0 }}
              className={`flex ${msg.is_mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                msg.is_mine
                  ? "bg-gradient-to-br from-purple-600 to-teal-500 text-white rounded-br-sm"
                  : "bg-white text-gray-800 shadow-sm border border-gray-100 rounded-bl-sm"
              }`}>
                <p className="text-sm leading-relaxed">{msg.content}</p>
                <p className={`text-xs mt-1 ${msg.is_mine ? "opacity-70 text-right" : "text-gray-400"}`}>
                  {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </motion.div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="bg-white border-t border-gray-100 p-3 flex items-end gap-2 flex-shrink-0">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          rows={1}
          className="flex-1 px-4 py-3 bg-gray-50 rounded-2xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-300 border border-gray-100 max-h-28"
        />
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={sendMessage}
          disabled={!input.trim() || sending}
          className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
            input.trim()
              ? "bg-gradient-to-br from-purple-600 to-teal-500 text-white shadow-lg"
              : "bg-gray-100 text-gray-300"
          }`}>
          {sending
            ? <Loader className="w-4 h-4 animate-spin" />
            : <Send className="w-4 h-4" />}
        </motion.button>
      </div>
    </div>
  );
}
