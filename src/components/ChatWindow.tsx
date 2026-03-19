// src/components/ChatWindow.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { X, Send, User, Loader } from "lucide-react";
import { fetchWithAuth, useAuth } from "@/lib/authStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

interface ChatWindowProps {
  sellerId: number;
  sellerName: string;
  listingId: number;
  productName: string;
  originalPrice: number;
  onClose: () => void;
}

interface Message {
  id: string;
  text: string;
  isSystem?: boolean;
  amount?: number;
  sender?: string;
  created_at?: string;
  is_mine?: boolean;
}

const isMessageAllowed = (msg: string): "allow" | "offer" | "block" => {
  const lower = msg.toLowerCase();
  const blocked = [
    /\b(\+?234|0)[789]\d{9}\b/,
    /whatsapp/i,
    /pay.*outside/i,
    /transfer.*direct/i,
    /cashapp/i,
    /opay.*number/i,
    /palmpay.*number/i,
  ];
  for (const pattern of blocked) {
    if (pattern.test(msg)) return "block";
  }
  if (/\b\d[\d,]*k?\b/.test(lower) && /(last|offer|take|give|do|accept|how about)/i.test(lower)) {
    return "offer";
  }
  return "allow";
};

const extractPrice = (msg: string): number => {
  const match = msg.match(/\b(\d[\d,]*)k?\b/i);
  if (!match) return 0;
  const raw = match[1].replace(/,/g, '');
  const num = parseInt(raw);
  return msg.toLowerCase().includes('k') ? num * 1000 : num;
};

export default function ChatWindow({
  sellerId,
  sellerName,
  listingId,
  productName,
  originalPrice,
  onClose,
}: ChatWindowProps) {
  const { user } = useAuth(); // ← get logged-in user
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Create or load conversation on mount
  useEffect(() => {
    // ← FIX: if the logged-in user IS the seller, don't init — close immediately
    if (!sellerId || (user?.id && user.id === sellerId)) {
      onClose();
      return;
    }

    const init = async () => {
      try {
        const res = await fetchWithAuth(`${API_URL}/api/chat/conversations/`, {
          method: 'POST',
          body: JSON.stringify({ listing_id: listingId, seller_id: sellerId }),
        });

        if (!res.ok) throw new Error('Could not start conversation');
        const conv = await res.json();
        setConversationId(conv.id);

        const msgRes = await fetchWithAuth(`${API_URL}/api/chat/conversations/${conv.id}/messages/`);
        const data = await msgRes.json();
        const currentUsername = user?.username;
        const msgs = (Array.isArray(data) ? data : data.results || []).map((m: any) => ({
          id: m.id.toString(),
          text: m.content,
          sender: m.sender_username,
          is_mine: currentUsername ? m.sender_username === currentUsername : !!m.is_mine,
          created_at: m.created_at,
        }));
        setMessages(msgs);
      } catch (err) {
        setError("Could not load chat. Please try again.");
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [listingId, sellerId, user?.id, onClose]);

  // Poll for new messages every 5s
  useEffect(() => {
    if (!conversationId) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetchWithAuth(`${API_URL}/api/chat/conversations/${conversationId}/messages/`);
        const data = await res.json();
        const currentUsername = user?.username;
        const msgs = (Array.isArray(data) ? data : data.results || []).map((m: any) => ({
          id: m.id.toString(),
          text: m.content,
          sender: m.sender_username,
          is_mine: currentUsername ? m.sender_username === currentUsername : !!m.is_mine,
          created_at: m.created_at,
        }));
        setMessages(msgs);
      } catch {}
    }, 5000);
    return () => clearInterval(interval);
  }, [conversationId]);

  const handleSend = async () => {
    if (!message.trim() || !conversationId || sending) return;

    const result = isMessageAllowed(message);

    if (result === "block") {
      setError("Outside payment details are not allowed. Violators get banned.");
      setTimeout(() => setError(""), 3000);
      return;
    }

    setSending(true);

    try {
      const res = await fetchWithAuth(`${API_URL}/api/chat/conversations/${conversationId}/send/`, {
        method: 'POST',
        body: JSON.stringify({ content: message, message_type: 'text' }),
      });

      if (!res.ok) throw new Error('Send failed');
      const sentMessage = await res.json();

      const newMsg: Message = {
        id: sentMessage.id.toString(),
        text: message,
        sender: 'me',
        is_mine: true,
      };

      setMessages(prev => [...prev, newMsg]);

      if (result === "offer") {
        const amount = extractPrice(message);
        if (amount > 0 && amount < originalPrice * 2) {
          setMessages(prev => [...prev, {
            id: (Date.now() + 1).toString(),
            text: `Offer: ₦${amount.toLocaleString()} for ${productName}`,
            isSystem: true,
            amount,
          }]);
        }
      }

      setMessage("");
    } catch {
      setError("Failed to send. Try again.");
      setTimeout(() => setError(""), 3000);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/70 z-50" onClick={onClose} />

      {/* Chat Panel */}
      <div className="fixed bottom-0 left-0 right-0 h-[90vh] bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 rounded-t-3xl z-50
                      md:right-4 md:bottom-4 md:top-20 md:w-96 md:h-[calc(100vh-6rem)] md:rounded-3xl overflow-hidden flex flex-col">

        {/* Header */}
        <div className="bg-gradient-to-r from-purple-800 to-teal-800 p-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <User className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="font-bold text-white">{sellerName}</p>
              <p className="text-white/70 text-xs">{productName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-full transition">
            <X className="w-6 h-6 text-white" />
          </button>
        </div>

        {/* Warning Banner */}
        <div className="bg-red-600 text-white text-xs p-2 text-center font-bold flex-shrink-0">
          Bargain only • No outside payments • Violators banned instantly
        </div>

        {/* Error banner */}
        {error && (
          <div className="bg-red-500/90 text-white text-xs p-2 text-center font-bold flex-shrink-0">
            {error}
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader className="w-8 h-8 text-white animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <p className="text-center text-white/50 text-sm mt-10">
              Start bargaining with {sellerName} • e.g. "4k last"
            </p>
          ) : (
            messages.map(msg => (
              <div key={msg.id}
                className={msg.isSystem ? "mx-auto max-w-xs" : msg.is_mine ? "ml-auto max-w-[80%]" : "mr-auto max-w-[80%]"}>
                {msg.isSystem ? (
                  <div className="bg-gradient-to-r from-teal-600/20 to-purple-600/20 border border-teal-500/50 rounded-2xl p-4 text-center shadow-lg">
                    <p className="text-white font-black text-lg">₦{msg.amount?.toLocaleString()}</p>
                    <p className="text-white/80 text-sm">Offer for {productName}</p>
                    <div className="flex gap-2 mt-3 justify-center">
                      <button className="px-4 py-1.5 bg-teal-600 rounded-xl text-white font-bold text-sm">Accept</button>
                      <button className="px-4 py-1.5 bg-amber-600 rounded-xl text-white font-bold text-sm">Counter</button>
                      <button className="px-4 py-1.5 bg-red-600 rounded-xl text-white font-bold text-sm">Decline</button>
                    </div>
                  </div>
                ) : (
                  <div className={`rounded-2xl px-4 py-2.5 ${
                    msg.is_mine
                      ? 'bg-purple-600 text-white rounded-br-sm'
                      : 'bg-white/10 text-white rounded-bl-sm'
                  }`}>
                    {!msg.is_mine && (
                      <p className="text-xs text-white/60 mb-1">{msg.sender || sellerName}</p>
                    )}
                    <p className="text-sm leading-relaxed">{msg.text}</p>
                    {msg.created_at && (
                      <p className="text-xs opacity-50 mt-1 text-right">
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="bg-slate-900/90 border-t border-white/10 p-4 flex gap-3 flex-shrink-0">
          <input
            type="text"
            value={message}
            onChange={e => setMessage(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleSend())}
            placeholder='Type your offer... e.g. "4k last"'
            className="flex-1 bg-white/10 border border-white/20 rounded-2xl px-4 py-3 text-white placeholder-white/40 text-sm focus:outline-none focus:border-purple-500 transition"
          />
          <button onClick={handleSend} disabled={sending || !conversationId || !message.trim()}
            className={`p-3 rounded-xl transition ${
              sending || !conversationId || !message.trim()
                ? 'bg-gray-600 cursor-not-allowed'
                : 'bg-gradient-to-r from-teal-600 to-cyan-600'
            }`}>
            {sending
              ? <Loader className="w-5 h-5 text-white animate-spin" />
              : <Send className="w-5 h-5 text-white" />}
          </button>
        </div>
      </div>
    </>
  );
}
