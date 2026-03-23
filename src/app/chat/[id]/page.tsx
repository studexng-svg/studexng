"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useRouter, useParams } from "next/navigation";
import {
  ArrowLeft, Send, Loader, ImageIcon, X, Pin, Pencil,
  Trash2, Check, PinOff, ChevronDown, UserX, Users
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useAuth, fetchWithAuth, getToken } from "@/lib/authStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
const DELETE_EVERYONE_LIMIT_HOURS = 60;

interface Message {
  id: number;
  sender: number;
  sender_username: string;
  content: string;
  message_type: string;
  image_url: string | null;
  is_mine: boolean;
  created_at: string;
  is_edited: boolean;
  edited_at: string | null;
  is_pinned: boolean;
}

interface ActionMenu {
  messageId: number;
  x: number;
  y: number;
  is_mine: boolean;
  message_type: string;
  is_pinned: boolean;
  created_at: string;
  // sub-menu state
  showDeleteOptions: boolean;
}

export default function ChatRoomPage() {
  const router = useRouter();
  const params = useParams();
  const conversationId = params?.id;
  const { user, isHydrated, isLoggedIn } = useAuth();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [otherUser, setOtherUser] = useState("");
  const [listingTitle, setListingTitle] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [actionMenu, setActionMenu] = useState<ActionMenu | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");
  const [pinnedMessages, setPinnedMessages] = useState<Message[]>([]);
  const [showPinnedBanner, setShowPinnedBanner] = useState(true);
  const [pinnedIndex, setPinnedIndex] = useState(0);

  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isHydrated && !isLoggedIn) { router.push("/auth"); return; }
    if (!isHydrated || !isLoggedIn || !conversationId) return;
    loadAll();
    const interval = setInterval(loadMessages, 4000);
    return () => clearInterval(interval);
  }, [isHydrated, isLoggedIn, conversationId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setActionMenu(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => { if (editingId !== null) editInputRef.current?.focus(); }, [editingId]);

  const loadAll = async () => {
    try {
      let convData: any = null;
      try {
        const convRes = await fetchWithAuth(`${API_URL}/api/chat/conversations/${conversationId}/`);
        if (convRes.ok) convData = await convRes.json();
      } catch {}

      if (!convData) {
        const listRes = await fetchWithAuth(`${API_URL}/api/chat/conversations/`);
        if (listRes.ok) {
          const listData = await listRes.json();
          const list = Array.isArray(listData) ? listData : (listData.results || []);
          convData = list.find((c: any) => c.id === Number(conversationId));
        }
      }

      if (convData) {
        setOtherUser(convData.other_user?.username || convData.buyer_username || convData.seller_username || "");
        setListingTitle(convData.listing_title || "");
      }

      await loadMessages();
      await loadPinned();
    } catch (e) {
      console.error("Failed to load conversation", e);
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async () => {
    try {
      const res = await fetchWithAuth(`${API_URL}/api/chat/conversations/${conversationId}/messages/`);
      if (!res.ok) return;
      const data = await res.json();
      const raw = Array.isArray(data) ? data : (data.results || []);
      setMessages(raw.map((m: any) => ({ ...m, is_mine: m.sender_username === user?.username })));
    } catch {}
  };

  const loadPinned = async () => {
    try {
      const res = await fetchWithAuth(`${API_URL}/api/chat/conversations/${conversationId}/pinned/`);
      if (!res.ok) return;
      const data = await res.json();
      setPinnedMessages(Array.isArray(data) ? data : []);
    } catch {}
  };

  // ── Long press ─────────────────────────────────────────────────────────────

  const handlePressStart = (e: React.TouchEvent | React.MouseEvent, msg: Message) => {
    longPressTimer.current = setTimeout(() => {
      const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
      const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
      const menuY = clientY > window.innerHeight * 0.65 ? clientY - 220 : clientY - 10;

      setActionMenu({
        messageId: msg.id,
        x: clientX,
        y: menuY,
        is_mine: msg.is_mine,
        message_type: msg.message_type,
        is_pinned: msg.is_pinned,
        created_at: msg.created_at,
        showDeleteOptions: false,
      });
    }, 500);
  };

  const handlePressEnd = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  // ── Check if delete for everyone is still allowed ──────────────────────────

  const canDeleteForEveryone = (createdAt: string) => {
    const msgTime = new Date(createdAt).getTime();
    const limitMs = DELETE_EVERYONE_LIMIT_HOURS * 60 * 60 * 1000;
    return Date.now() - msgTime < limitMs;
  };

  // ── Delete for me ──────────────────────────────────────────────────────────

  const deleteForMe = async (id: number) => {
    setActionMenu(null);
    try {
      const res = await fetchWithAuth(`${API_URL}/api/chat/messages/${id}/delete_for_me/`, { method: 'POST' });
      if (res.ok) {
        // Remove from local state immediately
        setMessages(prev => prev.filter(m => m.id !== id));
        setPinnedMessages(prev => prev.filter(m => m.id !== id));
      }
    } catch {
      setError("Failed to delete message");
      setTimeout(() => setError(""), 3000);
    }
  };

  // ── Delete for everyone ────────────────────────────────────────────────────

  const deleteForEveryone = async (id: number) => {
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
      setError("Failed to delete message");
      setTimeout(() => setError(""), 3000);
    }
  };

  // ── Edit ───────────────────────────────────────────────────────────────────

  const startEdit = (msg: Message) => {
    setActionMenu(null);
    setEditingId(msg.id);
    setEditContent(msg.content);
  };

  const submitEdit = async (id: number) => {
    if (!editContent.trim()) return;
    try {
      const res = await fetchWithAuth(`${API_URL}/api/chat/messages/${id}/edit_message/`, {
        method: 'PATCH',
        body: JSON.stringify({ content: editContent.trim() }),
      });
      if (res.ok) {
        const updated = await res.json();
        setMessages(prev => prev.map(m => m.id === id ? { ...m, ...updated, is_mine: m.is_mine } : m));
      }
    } catch {
      setError("Failed to edit message");
      setTimeout(() => setError(""), 3000);
    } finally {
      setEditingId(null);
      setEditContent("");
    }
  };

  // ── Pin ────────────────────────────────────────────────────────────────────

  const togglePin = async (id: number) => {
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
      setError("Failed to pin message");
      setTimeout(() => setError(""), 3000);
    }
  };

  // ── Send ───────────────────────────────────────────────────────────────────

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError("Image must be under 5MB"); setTimeout(() => setError(""), 3000); return; }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const cancelImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSend = async () => {
    if (sending || (!input.trim() && !imageFile)) return;
    setSending(true);
    try {
      const token = getToken();
      if (imageFile) {
        const fd = new FormData();
        fd.append("image", imageFile);
        fd.append("message_type", "image");
        if (input.trim()) fd.append("content", input.trim());
        const res = await fetch(`${API_URL}/api/chat/conversations/${conversationId}/send/`, {
          method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd,
        });
        if (!res.ok) throw new Error("Send failed");
        cancelImage();
      } else {
        const res = await fetchWithAuth(`${API_URL}/api/chat/conversations/${conversationId}/send/`, {
          method: "POST", body: JSON.stringify({ content: input.trim(), message_type: "text" }),
        });
        if (!res.ok) throw new Error("Send failed");
      }
      setInput("");
      await loadMessages();
    } catch {
      setError("Failed to send. Try again.");
      setTimeout(() => setError(""), 3000);
    } finally {
      setSending(false);
    }
  };

  const scrollToPinned = (index: number) => {
    const msg = pinnedMessages[index];
    if (!msg) return;
    document.getElementById(`msg-${msg.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setPinnedIndex(index);
  };

  if (loading) return (
    <div className="flex justify-center items-center min-h-screen bg-gray-50 dark:bg-gray-950">
      <Loader className="w-8 h-8 text-purple-600 animate-spin" />
    </div>
  );

  return (
    <div className="flex flex-col bg-gray-50 dark:bg-gray-950" style={{ height: "100dvh" }}>

      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 px-4 py-3 flex items-center gap-3 flex-shrink-0 shadow-sm">
        <button onClick={() => router.back()} className="p-2 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-full transition">
          <ArrowLeft className="w-5 h-5 text-purple-600" />
        </button>
        <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-teal-500 rounded-full flex items-center justify-center text-white font-black text-base flex-shrink-0">
          {otherUser?.[0]?.toUpperCase() || "?"}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-black text-gray-900 dark:text-white">@{otherUser}</p>
          {listingTitle && <p className="text-xs text-purple-600 dark:text-purple-400 truncate">{listingTitle}</p>}
        </div>
      </div>

      {/* Pinned banner */}
      <AnimatePresence>
        {pinnedMessages.length > 0 && showPinnedBanner && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-purple-50 dark:bg-purple-900/20 border-b border-purple-100 dark:border-purple-800 flex-shrink-0 overflow-hidden"
          >
            <div className="flex items-center gap-2 px-4 py-2">
              <Pin className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />
              <button onClick={() => scrollToPinned(pinnedIndex)} className="flex-1 min-w-0 text-left">
                <p className="text-xs font-bold text-purple-600 dark:text-purple-400">
                  Pinned Message {pinnedMessages.length > 1 ? `(${pinnedIndex + 1}/${pinnedMessages.length})` : ''}
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-300 truncate">
                  {pinnedMessages[pinnedIndex]?.content || '📷 Image'}
                </p>
              </button>
              {pinnedMessages.length > 1 && (
                <button onClick={() => scrollToPinned((pinnedIndex + 1) % pinnedMessages.length)} className="p-1 text-purple-400 hover:text-purple-600">
                  <ChevronDown className="w-4 h-4" />
                </button>
              )}
              <button onClick={() => setShowPinnedBanner(false)} className="p-1 text-gray-400 hover:text-gray-600">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error */}
      {error && <div className="bg-red-500 text-white text-xs px-4 py-2 text-center font-bold flex-shrink-0">{error}</div>}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1 pb-36">
        {messages.length === 0 && (
          <p className="text-center text-gray-400 dark:text-gray-500 text-sm py-10">No messages yet. Say hello! 👋</p>
        )}

        {messages.map((msg) => (
          <div key={msg.id} id={`msg-${msg.id}`} data-message className={`flex ${msg.is_mine ? "justify-end" : "justify-start"}`}>
            <div
              onMouseDown={(e) => handlePressStart(e, msg)}
              onMouseUp={handlePressEnd}
              onMouseLeave={handlePressEnd}
              onTouchStart={(e) => handlePressStart(e, msg)}
              onTouchEnd={handlePressEnd}
              onContextMenu={(e) => { e.preventDefault(); handlePressStart(e, msg); }}
              className="relative max-w-[75%] select-none"
            >
              {msg.is_pinned && (
                <div className={`flex items-center gap-1 mb-0.5 ${msg.is_mine ? 'justify-end' : 'justify-start'}`}>
                  <Pin className="w-3 h-3 text-purple-400" />
                  <span className="text-xs text-purple-400">Pinned</span>
                </div>
              )}

              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`rounded-2xl px-4 py-2.5 ${
                  msg.is_mine
                    ? "bg-gradient-to-br from-purple-600 to-teal-500 text-white rounded-br-sm"
                    : "bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm rounded-bl-sm border border-gray-100 dark:border-gray-700"
                } ${msg.is_pinned ? 'ring-2 ring-purple-400/40' : ''}`}
              >
                {!msg.is_mine && <p className="text-xs font-bold text-purple-500 mb-1">{msg.sender_username}</p>}

                {editingId === msg.id ? (
                  <div className="flex items-center gap-2 min-w-[180px]">
                    <input
                      ref={editInputRef}
                      value={editContent}
                      onChange={e => setEditContent(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') submitEdit(msg.id);
                        if (e.key === 'Escape') { setEditingId(null); setEditContent(""); }
                      }}
                      className="flex-1 bg-white/20 text-white placeholder-white/60 rounded-lg px-2 py-1 text-sm outline-none border border-white/40"
                    />
                    <button onClick={() => submitEdit(msg.id)} className="p-1 bg-white/20 rounded-lg hover:bg-white/30">
                      <Check className="w-4 h-4 text-white" />
                    </button>
                    <button onClick={() => { setEditingId(null); setEditContent(""); }} className="p-1 bg-white/10 rounded-lg">
                      <X className="w-4 h-4 text-white/70" />
                    </button>
                  </div>
                ) : msg.image_url ? (
                  <div>
                    <a href={msg.image_url} target="_blank" rel="noopener noreferrer">
                      <img src={msg.image_url} alt="shared" className="rounded-xl max-w-[220px] max-h-[220px] object-cover mb-1 cursor-pointer hover:opacity-90 transition" />
                    </a>
                    {msg.content && msg.content !== "📷 Image" && <p className="text-sm mt-1">{msg.content}</p>}
                  </div>
                ) : (
                  <p className="text-sm leading-relaxed">{msg.content}</p>
                )}

                <div className="flex items-center gap-1.5 mt-1 justify-end">
                  {msg.is_edited && <span className={`text-xs italic ${msg.is_mine ? 'text-white/50' : 'text-gray-400'}`}>edited</span>}
                  <p className={`text-xs ${msg.is_mine ? "text-white/60" : "text-gray-400"}`}>
                    {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </motion.div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* ✅ WhatsApp-style action menu */}
      <AnimatePresence>
        {actionMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setActionMenu(null)} />
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
                zIndex: 50,
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

              {/* Edit — only sender, text only */}
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

              {/* ✅ Delete sub-menu — show options inline */}
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
                  {/* Delete label */}
                  <div className="px-4 py-2 border-t border-gray-50 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                    <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Delete message</p>
                  </div>

                  {/* Delete for me */}
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

                  {/* Delete for everyone — only sender, within time limit */}
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

                  {/* Back */}
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

      {/* Image preview */}
      {imagePreview && (
        <div className="fixed left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 px-4 py-2 flex items-center gap-3 z-20" style={{ bottom: "calc(70px + 68px)" }}>
          <div className="relative flex-shrink-0">
            <img src={imagePreview} alt="preview" className="h-14 w-14 object-cover rounded-xl border-2 border-purple-400" />
            <button onClick={cancelImage} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center">
              <X className="w-3 h-3" />
            </button>
          </div>
          <p className="text-xs text-gray-400">Add a caption below (optional)</p>
        </div>
      )}

      {/* Input bar */}
      <div className="fixed bottom-[70px] left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 px-4 py-3 flex items-center gap-2 z-20">
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
        <button onClick={() => fileInputRef.current?.click()} className="p-2.5 bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-xl hover:bg-purple-100 transition flex-shrink-0">
          <ImageIcon className="w-5 h-5" />
        </button>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder={imageFile ? "Add a caption (optional)..." : "Type a message..."}
          className="flex-1 px-4 py-2.5 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 border border-gray-200 dark:border-gray-700 placeholder-gray-400"
        />
        <button
          onClick={handleSend}
          disabled={sending || (!input.trim() && !imageFile)}
          className="p-2.5 bg-gradient-to-r from-purple-600 to-teal-500 text-white rounded-xl disabled:opacity-40 flex-shrink-0 transition active:scale-95">
          {sending ? <Loader className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
        </button>
      </div>
    </div>
  );
}
