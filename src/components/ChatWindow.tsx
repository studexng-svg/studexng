"use client";

import { useState, useEffect, useRef } from "react";
import {
  X, Send, User, Loader, ImageIcon,
  Pin, PinOff, Pencil, Trash2, Check,
  UserX, Users, ChevronDown
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { fetchWithAuth, getToken, useAuth } from "@/lib/authStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
const DELETE_EVERYONE_LIMIT_HOURS = 60;

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
  image_url?: string | null;
  message_type?: string;
  is_edited?: boolean;
  is_pinned?: boolean;
}

interface ActionMenu {
  messageId: string;
  is_mine: boolean;
  message_type: string;
  is_pinned: boolean;
  created_at: string;
  showDeleteOptions: boolean;
  y: number;
  x: number;
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

const canDeleteForEveryone = (createdAt: string) => {
  const msgTime = new Date(createdAt).getTime();
  return Date.now() - msgTime < DELETE_EVERYONE_LIMIT_HOURS * 60 * 60 * 1000;
};

export default function ChatWindow({
  sellerId, sellerName, listingId, productName, originalPrice, onClose,
}: ChatWindowProps) {
  const { user } = useAuth();
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // WhatsApp features
  const [actionMenu, setActionMenu] = useState<ActionMenu | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [pinnedMessages, setPinnedMessages] = useState<Message[]>([]);
  const [showPinnedBanner, setShowPinnedBanner] = useState(true);
  const [pinnedIndex, setPinnedIndex] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => { if (editingId) editInputRef.current?.focus(); }, [editingId]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setActionMenu(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const mapMessages = (data: any[]): Message[] => {
    const currentUsername = user?.username;
    return data.map((m: any) => ({
      id: m.id.toString(),
      text: m.content,
      sender: m.sender_username,
      is_mine: currentUsername ? m.sender_username === currentUsername : !!m.is_mine,
      created_at: m.created_at,
      image_url: m.image_url || null,
      message_type: m.message_type || 'text',
      is_edited: m.is_edited || false,
      is_pinned: m.is_pinned || false,
    }));
  };

  useEffect(() => {
    if (!sellerId || (user?.id && user.id === sellerId)) { onClose(); return; }

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
        setMessages(mapMessages(Array.isArray(data) ? data : data.results || []));
        await loadPinned(conv.id);
      } catch {
        setError("Could not load chat. Please try again.");
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [listingId, sellerId, user?.id, onClose]);

  useEffect(() => {
    if (!conversationId) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetchWithAuth(`${API_URL}/api/chat/conversations/${conversationId}/messages/`);
        const data = await res.json();
        setMessages(mapMessages(Array.isArray(data) ? data : data.results || []));
      } catch {}
    }, 5000);
    return () => clearInterval(interval);
  }, [conversationId, user?.username]);

  const loadPinned = async (convId?: number) => {
    const id = convId || conversationId;
    if (!id) return;
    try {
      const res = await fetchWithAuth(`${API_URL}/api/chat/conversations/${id}/pinned/`);
      if (res.ok) {
        const data = await res.json();
        setPinnedMessages(mapMessages(Array.isArray(data) ? data : []));
      }
    } catch {}
  };

  // ── Long press ─────────────────────────────────────────────────────────────

  const handlePressStart = (e: React.TouchEvent | React.MouseEvent, msg: Message) => {
    if (msg.isSystem) return;
    longPressTimer.current = setTimeout(() => {
      const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
      const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;

      // Position menu — flip up if near bottom
      const containerRect = chatContainerRef.current?.getBoundingClientRect();
      const relY = containerRect ? clientY - containerRect.top : clientY;
      const menuY = relY > (containerRect?.height || window.innerHeight) * 0.6
        ? clientY - 220
        : clientY;

      setActionMenu({
        messageId: msg.id,
        is_mine: !!msg.is_mine,
        message_type: msg.message_type || 'text',
        is_pinned: !!msg.is_pinned,
        created_at: msg.created_at || '',
        showDeleteOptions: false,
        y: menuY,
        x: clientX,
      });
    }, 500);
  };

  const handlePressEnd = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  // ── Delete for me ──────────────────────────────────────────────────────────

  const deleteForMe = async (id: string) => {
    setActionMenu(null);
    try {
      const res = await fetchWithAuth(`${API_URL}/api/chat/messages/${id}/delete_for_me/`, { method: 'POST' });
      if (res.ok) {
        setMessages(prev => prev.filter(m => m.id !== id));
        setPinnedMessages(prev => prev.filter(m => m.id !== id));
      }
    } catch {
      setError("Failed to delete"); setTimeout(() => setError(""), 3000);
    }
  };

  // ── Delete for everyone ────────────────────────────────────────────────────

  const deleteForEveryone = async (id: string) => {
    setActionMenu(null);
    try {
      const res = await fetchWithAuth(`${API_URL}/api/chat/messages/${id}/delete_for_everyone/`, { method: 'POST' });
      if (res.ok) {
        setMessages(prev => prev.filter(m => m.id !== id));
        setPinnedMessages(prev => prev.filter(m => m.id !== id));
      } else {
        const data = await res.json();
        setError(data.error || "Failed to delete for everyone");
        setTimeout(() => setError(""), 4000);
      }
    } catch {
      setError("Failed to delete"); setTimeout(() => setError(""), 3000);
    }
  };

  // ── Edit ───────────────────────────────────────────────────────────────────

  const startEdit = (msg: Message) => {
    setActionMenu(null);
    setEditingId(msg.id);
    setEditContent(msg.text);
  };

  const submitEdit = async (id: string) => {
    if (!editContent.trim()) return;
    try {
      const res = await fetchWithAuth(`${API_URL}/api/chat/messages/${id}/edit_message/`, {
        method: 'PATCH',
        body: JSON.stringify({ content: editContent.trim() }),
      });
      if (res.ok) {
        const updated = await res.json();
        setMessages(prev => prev.map(m => m.id === id
          ? { ...m, text: updated.content, is_edited: true }
          : m
        ));
      }
    } catch {
      setError("Failed to edit"); setTimeout(() => setError(""), 3000);
    } finally {
      setEditingId(null); setEditContent("");
    }
  };

  // ── Pin ────────────────────────────────────────────────────────────────────

  const togglePin = async (id: string) => {
    setActionMenu(null);
    try {
      const res = await fetchWithAuth(`${API_URL}/api/chat/messages/${id}/pin_message/`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setMessages(prev => prev.map(m => m.id === id ? { ...m, is_pinned: data.is_pinned } : m));
        await loadPinned();
        if (data.is_pinned) setShowPinnedBanner(true);
      }
    } catch {
      setError("Failed to pin"); setTimeout(() => setError(""), 3000);
    }
  };

  // ── Image ──────────────────────────────────────────────────────────────────

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError("Image must be under 5MB"); setTimeout(() => setError(""), 3000); return; }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const cancelImage = () => {
    setImageFile(null); setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Send ───────────────────────────────────────────────────────────────────

  const handleSend = async () => {
    if ((!message.trim() && !imageFile) || !conversationId || sending) return;
    if (message.trim() && !imageFile) {
      const result = isMessageAllowed(message);
      if (result === "block") {
        setError("Outside payment details are not allowed. Violators get banned.");
        setTimeout(() => setError(""), 3000);
        return;
      }
    }
    setSending(true);
    try {
      const token = getToken();
      let sentMessage: any;

      if (imageFile) {
        const fd = new FormData();
        fd.append("image", imageFile);
        fd.append("message_type", "image");
        if (message.trim()) fd.append("content", message.trim());
        const res = await fetch(`${API_URL}/api/chat/conversations/${conversationId}/send/`, {
          method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd,
        });
        if (!res.ok) throw new Error("Send failed");
        sentMessage = await res.json();
        setMessages(prev => [...prev, {
          id: sentMessage.id.toString(), text: sentMessage.content || "",
          sender: user?.username || "me", is_mine: true,
          created_at: sentMessage.created_at, image_url: sentMessage.image_url || null, message_type: "image",
        }]);
        cancelImage();
        setMessage("");
      } else {
        const res = await fetchWithAuth(`${API_URL}/api/chat/conversations/${conversationId}/send/`, {
          method: "POST", body: JSON.stringify({ content: message, message_type: "text" }),
        });
        if (!res.ok) throw new Error("Send failed");
        sentMessage = await res.json();
        setMessages(prev => [...prev, {
          id: sentMessage.id.toString(), text: message,
          sender: user?.username || "me", is_mine: true,
          created_at: sentMessage.created_at, message_type: "text",
        }]);
        const result = isMessageAllowed(message);
        if (result === "offer") {
          const amount = extractPrice(message);
          if (amount > 0 && amount < originalPrice * 2) {
            setMessages(prev => [...prev, {
              id: (Date.now() + 1).toString(),
              text: `Offer: ₦${amount.toLocaleString()} for ${productName}`,
              isSystem: true, amount,
            }]);
          }
        }
        setMessage("");
      }
    } catch {
      setError("Failed to send. Try again."); setTimeout(() => setError(""), 3000);
    } finally {
      setSending(false);
    }
  };

  const scrollToPinned = (index: number) => {
    const msg = pinnedMessages[index];
    if (!msg) return;
    document.getElementById(`cw-msg-${msg.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setPinnedIndex(index);
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/70 z-50" onClick={onClose} />

      <div
        ref={chatContainerRef}
        className="
          fixed left-0 right-0 bottom-[70px] h-[calc(100vh-70px)]
          bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900
          rounded-t-3xl z-50
          md:left-auto md:right-4 md:bottom-4 md:top-20
          md:w-96 md:h-[calc(100vh-6rem)]
          md:rounded-3xl
          overflow-hidden flex flex-col
        "
      >
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

        {/* ✅ Pinned message banner */}
        <AnimatePresence>
          {pinnedMessages.length > 0 && showPinnedBanner && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-purple-800/60 border-b border-purple-600/40 flex-shrink-0 overflow-hidden"
            >
              <div className="flex items-center gap-2 px-3 py-2">
                <Pin className="w-3 h-3 text-purple-300 flex-shrink-0" />
                <button onClick={() => scrollToPinned(pinnedIndex)} className="flex-1 min-w-0 text-left">
                  <p className="text-xs font-bold text-purple-300">
                    Pinned {pinnedMessages.length > 1 ? `(${pinnedIndex + 1}/${pinnedMessages.length})` : ''}
                  </p>
                  <p className="text-xs text-white/70 truncate">
                    {pinnedMessages[pinnedIndex]?.text || '📷 Image'}
                  </p>
                </button>
                {pinnedMessages.length > 1 && (
                  <button onClick={() => scrollToPinned((pinnedIndex + 1) % pinnedMessages.length)} className="p-1 text-purple-400">
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                )}
                <button onClick={() => setShowPinnedBanner(false)} className="p-1 text-white/40 hover:text-white/70">
                  <X className="w-3 h-3" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error */}
        {error && (
          <div className="bg-red-500/90 text-white text-xs p-2 text-center font-bold flex-shrink-0">{error}</div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 relative">
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
              <div
                key={msg.id}
                id={`cw-msg-${msg.id}`}
                className={msg.isSystem ? "mx-auto max-w-xs" : msg.is_mine ? "ml-auto max-w-[80%]" : "mr-auto max-w-[80%]"}
              >
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
                  <div
                    onMouseDown={(e) => handlePressStart(e, msg)}
                    onMouseUp={handlePressEnd}
                    onMouseLeave={handlePressEnd}
                    onTouchStart={(e) => handlePressStart(e, msg)}
                    onTouchEnd={handlePressEnd}
                    onContextMenu={(e) => { e.preventDefault(); handlePressStart(e, msg); }}
                    className="select-none"
                  >
                    {/* Pin indicator */}
                    {msg.is_pinned && (
                      <div className={`flex items-center gap-1 mb-0.5 ${msg.is_mine ? 'justify-end' : 'justify-start'}`}>
                        <Pin className="w-2.5 h-2.5 text-purple-300" />
                        <span className="text-xs text-purple-300">Pinned</span>
                      </div>
                    )}

                    <div className={`rounded-2xl px-4 py-2.5 ${
                      msg.is_mine
                        ? 'bg-purple-600 text-white rounded-br-sm'
                        : 'bg-white/10 text-white rounded-bl-sm'
                    } ${msg.is_pinned ? 'ring-2 ring-purple-400/40' : ''}`}>
                      {!msg.is_mine && (
                        <p className="text-xs text-white/60 mb-1">{msg.sender || sellerName}</p>
                      )}

                      {/* ✅ Inline edit mode */}
                      {editingId === msg.id ? (
                        <div className="flex items-center gap-2 min-w-[160px]">
                          <input
                            ref={editInputRef}
                            value={editContent}
                            onChange={e => setEditContent(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') submitEdit(msg.id);
                              if (e.key === 'Escape') { setEditingId(null); setEditContent(""); }
                            }}
                            className="flex-1 bg-white/20 text-white rounded-lg px-2 py-1 text-sm outline-none border border-white/30"
                          />
                          <button onClick={() => submitEdit(msg.id)} className="p-1 bg-white/20 rounded-lg">
                            <Check className="w-3.5 h-3.5 text-white" />
                          </button>
                          <button onClick={() => { setEditingId(null); setEditContent(""); }} className="p-1 bg-white/10 rounded-lg">
                            <X className="w-3.5 h-3.5 text-white/60" />
                          </button>
                        </div>
                      ) : msg.image_url ? (
                        <div>
                          <a href={msg.image_url} target="_blank" rel="noopener noreferrer">
                            <img src={msg.image_url} alt="shared image"
                              className="rounded-xl max-w-[200px] max-h-[200px] object-cover mb-1 cursor-pointer hover:opacity-90 transition" />
                          </a>
                          {msg.text && msg.text !== "📷 Image" && (
                            <p className="text-sm mt-1 leading-relaxed">{msg.text}</p>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm leading-relaxed">{msg.text}</p>
                      )}

                      {/* Timestamp + edited */}
                      {msg.created_at && editingId !== msg.id && (
                        <div className="flex items-center justify-end gap-1.5 mt-1">
                          {msg.is_edited && <span className="text-xs italic text-white/40">edited</span>}
                          <p className="text-xs opacity-50">
                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        {/* Image preview */}
        {imagePreview && (
          <div className="bg-slate-800/90 border-t border-white/10 px-4 py-2 flex items-center gap-3 flex-shrink-0">
            <div className="relative flex-shrink-0">
              <img src={imagePreview} alt="preview" className="h-14 w-14 object-cover rounded-xl border-2 border-purple-400" />
              <button onClick={cancelImage} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-black">×</button>
            </div>
            <p className="text-white/60 text-xs">Add a caption below (optional)</p>
          </div>
        )}

        {/* Input */}
        <div className="bg-slate-900/90 border-t border-white/10 p-4 flex gap-2 flex-shrink-0">
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
          <button onClick={() => fileInputRef.current?.click()} className="p-3 bg-white/10 hover:bg-white/20 rounded-xl transition flex-shrink-0">
            <ImageIcon className="w-5 h-5 text-white" />
          </button>
          <input
            type="text"
            value={message}
            onChange={e => setMessage(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleSend())}
            placeholder={imageFile ? 'Add a caption (optional)...' : 'Type your offer... e.g. "4k last"'}
            className="flex-1 bg-white/10 border border-white/20 rounded-2xl px-4 py-3 text-white placeholder-white/40 text-sm focus:outline-none focus:border-purple-500 transition"
          />
          <button onClick={handleSend}
            disabled={sending || !conversationId || (!message.trim() && !imageFile)}
            className={`p-3 rounded-xl transition flex-shrink-0 ${
              sending || !conversationId || (!message.trim() && !imageFile)
                ? 'bg-gray-600 cursor-not-allowed'
                : 'bg-gradient-to-r from-teal-600 to-cyan-600'
            }`}>
            {sending ? <Loader className="w-5 h-5 text-white animate-spin" /> : <Send className="w-5 h-5 text-white" />}
          </button>
        </div>
      </div>

      {/* ✅ WhatsApp-style action menu — rendered outside chat panel so it's never clipped */}
      <AnimatePresence>
        {actionMenu && (
          <>
            <div className="fixed inset-0 z-[60]" onClick={() => setActionMenu(null)} />
            <motion.div
              ref={menuRef}
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              style={{
                position: 'fixed',
                top: actionMenu.y,
                left: Math.min(Math.max(actionMenu.x - 90, 8), window.innerWidth - 210),
                zIndex: 70,
              }}
              className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-700 overflow-hidden min-w-[200px]"
            >
              {/* Pin / Unpin */}
              <button
                onClick={() => togglePin(actionMenu.messageId)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition text-left"
              >
                {actionMenu.is_pinned
                  ? <><PinOff className="w-4 h-4 text-purple-500" /><span className="text-sm font-medium text-gray-800 dark:text-gray-200">Unpin</span></>
                  : <><Pin className="w-4 h-4 text-purple-500" /><span className="text-sm font-medium text-gray-800 dark:text-gray-200">Pin</span></>
                }
              </button>

              {/* Edit — sender only, text only */}
              {actionMenu.is_mine && actionMenu.message_type !== 'image' && (
                <button
                  onClick={() => {
                    const msg = messages.find(m => m.id === actionMenu.messageId);
                    if (msg) startEdit(msg);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition text-left border-t border-gray-50 dark:border-gray-700"
                >
                  <Pencil className="w-4 h-4 text-blue-500" />
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Edit</span>
                </button>
              )}

              {/* Delete */}
              {!actionMenu.showDeleteOptions ? (
                <button
                  onClick={() => setActionMenu(prev => prev ? { ...prev, showDeleteOptions: true } : null)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-50 dark:hover:bg-red-900/20 transition text-left border-t border-gray-50 dark:border-gray-700"
                >
                  <Trash2 className="w-4 h-4 text-red-500" />
                  <span className="text-sm font-medium text-red-600">Delete</span>
                </button>
              ) : (
                <>
                  <div className="px-4 py-2 border-t border-gray-50 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Delete message</p>
                  </div>
                  <button
                    onClick={() => deleteForMe(actionMenu.messageId)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-50 dark:hover:bg-red-900/20 transition text-left"
                  >
                    <UserX className="w-4 h-4 text-orange-500" />
                    <div>
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Delete for me</p>
                      <p className="text-xs text-gray-400">Only you won't see this</p>
                    </div>
                  </button>
                  {actionMenu.is_mine && canDeleteForEveryone(actionMenu.created_at) && (
                    <button
                      onClick={() => deleteForEveryone(actionMenu.messageId)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-50 dark:hover:bg-red-900/20 transition text-left border-t border-gray-50 dark:border-gray-700"
                    >
                      <Users className="w-4 h-4 text-red-500" />
                      <div>
                        <p className="text-sm font-medium text-red-600">Delete for everyone</p>
                        <p className="text-xs text-gray-400">Removes for all participants</p>
                      </div>
                    </button>
                  )}
                  <button
                    onClick={() => setActionMenu(prev => prev ? { ...prev, showDeleteOptions: false } : null)}
                    className="w-full flex items-center justify-center px-4 py-2.5 text-xs text-gray-400 hover:text-gray-600 border-t border-gray-50 dark:border-gray-700 transition"
                  >
                    ← Back
                  </button>
                </>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
