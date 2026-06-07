"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useRouter, useParams } from "next/navigation";
import {
  ChevronLeft, Send, Loader, ImageIcon, X, Pin, Pencil,
  Trash2, Check, CheckCheck, PinOff, ChevronDown, UserX, Users, CornerDownLeft, Copy
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useAuth, fetchWithAuth, getToken } from "@/lib/authStore";
import { GRAD } from "@/lib/tokens";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
const DELETE_EVERYONE_LIMIT_HOURS = 60;

function stripQuotedMarkup(text: string): string {
  // Remove nested [quoted:@sender|...] markup (with or without closing bracket)
  return text.replace(/\[quoted:@[^\n]*/g, '').replace(/\s+/g, ' ').trim();
}

function parseQuoted(content: string): { quoted: { sender: string; text: string } | null; main: string } {
  if (!content || !content.startsWith('[quoted:@')) return { quoted: null, main: content || '' };
  const pipeIdx = content.indexOf('|', 9);
  if (pipeIdx === -1) return { quoted: null, main: content };
  const closeIdx = content.indexOf(']\n', pipeIdx);
  if (closeIdx === -1) return { quoted: null, main: content };
  const sender = content.substring(9, pipeIdx);
  const rawText = content.substring(pipeIdx + 1, closeIdx);
  const main = content.substring(closeIdx + 2);
  return { quoted: { sender, text: stripQuotedMarkup(rawText) }, main };
}

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
  is_read: boolean;
}

interface ActionMenu {
  messageId: number;
  x: number;
  y: number;
  is_mine: boolean;
  message_type: string;
  is_pinned: boolean;
  created_at: string;
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
  const [otherUserPicture, setOtherUserPicture] = useState<string | null>(null);
  const [listingTitle, setListingTitle] = useState("");
  const [otherUserLastSeen, setOtherUserLastSeen] = useState<string | null>(null);
  const [otherUserOnline, setOtherUserOnline] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [actionMenu, setActionMenu] = useState<ActionMenu | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");
  const [pinnedMessages, setPinnedMessages] = useState<Message[]>([]);
  const [showPinnedBanner, setShowPinnedBanner] = useState(true);
  const [pinnedIndex, setPinnedIndex] = useState(0);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const swipeTouchStart = useRef<{ x: number; y: number; id: number } | null>(null);
  const isSwipe = useRef(false);
  const hasScrolled = useRef(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  useEffect(() => {
    if (isHydrated && !isLoggedIn) { router.push("/auth"); return; }
    if (!isHydrated || !isLoggedIn || !conversationId) return;
    loadAll();
    const interval = setInterval(loadMessages, 15000);
    return () => clearInterval(interval);
  }, [isHydrated, isLoggedIn, conversationId]);

  // Scroll to bottom — instant on first load, smooth for new messages
  useEffect(() => {
    if (!bottomRef.current || messages.length === 0) return;
    bottomRef.current.scrollIntoView({ behavior: hasScrolled.current ? "smooth" : "instant" });
    hasScrolled.current = true;
  }, [messages]);

  // Show scroll-to-bottom button when user scrolls up
  // Depends on `loading` so it sets up AFTER the spinner goes away and bottomRef is in the DOM
  useEffect(() => {
    if (loading) return;
    const el = bottomRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setShowScrollBtn(!entry.isIntersecting),
      { threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loading]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setActionMenu(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => { if (editingId !== null) editInputRef.current?.focus(); }, [editingId]);

  useEffect(() => {
    if (!conversationId) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetchWithAuth(`${API_URL}/api/chat/conversations/${conversationId}/`);
        if (res.ok) {
          const conv = await res.json();
          setOtherUserPicture(conv.other_user?.profile_picture || null);
          setOtherUserLastSeen(conv.other_user?.last_seen || null);
          setOtherUserOnline(conv.other_user?.is_online || false);
        }
      } catch {}
    }, 15000);
    return () => clearInterval(interval);
  }, [conversationId]);

  const formatLastSeen = (lastSeen: string | null): string => {
    if (!lastSeen) return '';
    const date = new Date(lastSeen);
    const now = new Date();
    const diffMins = Math.floor((now.getTime() - date.getTime()) / 60000);
    if (diffMins < 1) return 'Active just now';
    const h = date.getHours();
    const m = date.getMinutes().toString().padStart(2, '0');
    const ampm = h >= 12 ? 'pm' : 'am';
    const hour12 = h % 12 || 12;
    const time = `${hour12}:${m}${ampm}`;
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart.getTime() - 86400000);
    if (date >= todayStart) return `Last seen today at ${time}`;
    if (date >= yesterdayStart) return `Last seen yesterday at ${time}`;
    const diffDays = Math.floor((todayStart.getTime() - date.getTime()) / 86400000) + 1;
    if (diffDays < 7) {
      const day = date.toLocaleDateString('en-US', { weekday: 'long' });
      return `Last seen ${day} at ${time}`;
    }
    const dateStr = date.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
    return `Last seen ${dateStr} at ${time}`;
  };

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
        setOtherUserPicture(convData.other_user?.profile_picture || null);
        setListingTitle(convData.listing_title || "");
        setOtherUserLastSeen(convData.other_user?.last_seen || null);
        setOtherUserOnline(convData.other_user?.is_online || false);
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

  const handleMsgTouchStart = (e: React.TouchEvent, msg: Message) => {
    const t = e.touches[0];
    swipeTouchStart.current = { x: t.clientX, y: t.clientY, id: msg.id };
    isSwipe.current = false;
    handlePressStart(e, msg);
  };

  const handleMsgTouchMove = (e: React.TouchEvent) => {
    if (!swipeTouchStart.current) return;
    const t = e.touches[0];
    const dx = Math.abs(t.clientX - swipeTouchStart.current.x);
    const dy = Math.abs(t.clientY - swipeTouchStart.current.y);
    if (dx > 15 && dx > dy) {
      isSwipe.current = true;
      handlePressEnd();
    }
  };

  const handleMsgTouchEnd = (e: React.TouchEvent, msg: Message) => {
    handlePressEnd();
    if (isSwipe.current && swipeTouchStart.current?.id === msg.id) {
      const dx = e.changedTouches[0].clientX - swipeTouchStart.current.x;
      if (dx > 60) setReplyingTo(msg);
    }
    swipeTouchStart.current = null;
    isSwipe.current = false;
  };

  const canDeleteForEveryone = (createdAt: string) => {
    const msgTime = new Date(createdAt).getTime();
    const limitMs = DELETE_EVERYONE_LIMIT_HOURS * 60 * 60 * 1000;
    return Date.now() - msgTime < limitMs;
  };

  const deleteForMe = async (id: number) => {
    setActionMenu(null);
    try {
      const res = await fetchWithAuth(`${API_URL}/api/chat/messages/${id}/delete_for_me/`, { method: 'POST' });
      if (res.ok) {
        setMessages(prev => prev.filter(m => m.id !== id));
        setPinnedMessages(prev => prev.filter(m => m.id !== id));
      }
    } catch {
      setError("Failed to delete message");
      setTimeout(() => setError(""), 3000);
    }
  };

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
        let content = input.trim();
        if (replyingTo) {
          const mainText = parseQuoted(replyingTo.content || '').main || '📷 Image';
          const quotedText = mainText.substring(0, 100);
          content = `[quoted:@${replyingTo.sender_username}|${quotedText}]\n${content}`;
        }
        const res = await fetchWithAuth(`${API_URL}/api/chat/conversations/${conversationId}/send/`, {
          method: "POST", body: JSON.stringify({ content, message_type: "text" }),
        });
        if (!res.ok) throw new Error("Send failed");
      }
      setInput("");
      setReplyingTo(null);
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
    <div className="flex justify-center items-center min-h-screen bg-[#F5F5F5]">
      <Loader className="w-8 h-8 text-teal-600 animate-spin" />
    </div>
  );

  function getDateLabel(iso: string): string {
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  return (
    <div className="flex flex-col bg-[#F5F5F5]" style={{ height: "100dvh", paddingBottom: "5rem", fontFamily: "'DM Sans', sans-serif" }}>

      {/* HEADER */}
      <div className="bg-white border-b border-stone-100 px-4 py-3 flex items-center gap-3 flex-shrink-0 shadow-sm">
        <button
          onClick={() => router.back()}
          className="p-2 bg-stone-100 hover:bg-stone-200 rounded-full transition-all active:scale-95 flex-shrink-0"
        >
          <ChevronLeft className="w-5 h-5 text-stone-600" />
        </button>
        {otherUserPicture ? (
          <img src={otherUserPicture} alt={otherUser} className="w-10 h-10 rounded-full object-cover flex-shrink-0 shadow-sm" />
        ) : (
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-base flex-shrink-0 shadow-sm"
            style={{ background: GRAD }}>
            {otherUser?.[0]?.toUpperCase() || "?"}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-stone-900">@{otherUser}</p>
          {otherUserOnline ? (
            <div className="flex items-center gap-1 mt-0.5">
              <div className="w-1.5 h-1.5 rounded-full bg-teal-500" />
              <p className="text-xs text-teal-600 font-medium">Online</p>
            </div>
          ) : otherUserLastSeen ? (
            <p className="text-xs text-stone-400 mt-0.5">{formatLastSeen(otherUserLastSeen)}</p>
          ) : null}
        </div>
      </div>

      {/* PINNED BANNER */}
      <AnimatePresence>
        {pinnedMessages.length > 0 && showPinnedBanner && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-teal-50 border-b border-teal-100 flex-shrink-0 overflow-hidden"
          >
            <div className="flex items-center gap-2 px-4 py-2">
              <Pin className="w-3.5 h-3.5 text-teal-500 flex-shrink-0" />
              <button onClick={() => scrollToPinned(pinnedIndex)} className="flex-1 min-w-0 text-left">
                <p className="text-xs font-semibold text-teal-600">
                  Pinned Message {pinnedMessages.length > 1 ? `(${pinnedIndex + 1}/${pinnedMessages.length})` : ''}
                </p>
                <p className="text-xs text-stone-500 truncate">
                  {pinnedMessages[pinnedIndex]?.content || '📷 Image'}
                </p>
              </button>
              {pinnedMessages.length > 1 && (
                <button onClick={() => scrollToPinned((pinnedIndex + 1) % pinnedMessages.length)} className="p-1 text-teal-400 hover:text-teal-600">
                  <ChevronDown className="w-4 h-4" />
                </button>
              )}
              <button onClick={() => setShowPinnedBanner(false)} className="p-1 text-stone-400 hover:text-stone-600">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ERROR */}
      {error && (
        <div className="bg-red-500 text-white text-xs px-4 py-2 text-center font-semibold flex-shrink-0">
          {error}
        </div>
      )}

      {/* MESSAGES */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {messages.length === 0 && (
          <p className="text-center text-stone-400 text-sm py-10">No messages yet. Say hello! 👋</p>
        )}

        {messages.map((msg, idx) => {
          const msgDate = new Date(msg.created_at).toDateString();
          const prevDate = idx > 0 ? new Date(messages[idx - 1].created_at).toDateString() : null;
          const showDate = msgDate !== prevDate;
          return (
            <div key={msg.id}>
              {showDate && (
                <div className="flex items-center justify-center my-3">
                  <span className="bg-stone-200/80 text-stone-500 text-xs px-3 py-1 rounded-full font-medium">
                    {getDateLabel(msg.created_at)}
                  </span>
                </div>
              )}
              <div id={`msg-${msg.id}`} data-message className={`flex ${msg.is_mine ? "justify-end" : "justify-start"}`}>
            <div
              onMouseDown={(e) => handlePressStart(e, msg)}
              onMouseUp={handlePressEnd}
              onMouseLeave={handlePressEnd}
              onTouchStart={(e) => handleMsgTouchStart(e, msg)}
              onTouchMove={handleMsgTouchMove}
              onTouchEnd={(e) => handleMsgTouchEnd(e, msg)}
              onContextMenu={(e) => { e.preventDefault(); handlePressStart(e, msg); }}
              className="relative max-w-[75%] select-none"
            >
              {msg.is_pinned && (
                <div className={`flex items-center gap-1 mb-0.5 ${msg.is_mine ? 'justify-end' : 'justify-start'}`}>
                  <Pin className="w-3 h-3 text-teal-400" />
                  <span className="text-xs text-teal-400">Pinned</span>
                </div>
              )}

              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`rounded-2xl px-4 py-2.5 ${
                  msg.is_mine
                    ? "text-white rounded-br-sm"
                    : "bg-white text-stone-900 shadow-sm rounded-bl-sm border border-stone-100"
                } ${msg.is_pinned ? 'ring-2 ring-teal-400/40' : ''}`}
                style={msg.is_mine ? { background: GRAD } : {}}
              >
                {!msg.is_mine && <p className="text-xs font-semibold text-teal-600 mb-1">{msg.sender_username}</p>}

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
                    {msg.content && msg.content !== "📷 Image" && <p className="text-sm mt-1 break-words">{msg.content}</p>}
                  </div>
                ) : (() => {
                  const { quoted, main } = parseQuoted(msg.content);
                  return (
                    <>
                      {quoted && (
                        <div className={`mb-2 pl-2 border-l-2 rounded-sm py-0.5 ${msg.is_mine ? 'border-white/50 bg-white/10' : 'border-teal-400 bg-teal-50/60'}`}>
                          <p className={`text-[10px] font-semibold ${msg.is_mine ? 'text-white/70' : 'text-teal-600'}`}>↩ @{quoted.sender}</p>
                          <p className={`text-xs truncate ${msg.is_mine ? 'text-white/60' : 'text-stone-500'}`}>{quoted.text}</p>
                        </div>
                      )}
                      <p className="text-sm leading-relaxed break-words">{main}</p>
                    </>
                  );
                })()}

                <div className="flex items-center gap-1.5 mt-1 justify-end">
                  {msg.is_edited && <span className={`text-xs italic ${msg.is_mine ? 'text-white/50' : 'text-stone-400'}`}>edited</span>}
                  <p className={`text-xs ${msg.is_mine ? "text-white/60" : "text-stone-400"}`}>
                    {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                  {msg.is_mine && (
                    msg.is_read
                      ? <CheckCheck className="w-3.5 h-3.5 text-white/80 flex-shrink-0" />
                      : <Check className="w-3.5 h-3.5 text-white/40 flex-shrink-0" />
                  )}
                </div>
              </motion.div>
            </div>
          </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* ACTION MENU */}
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
              className="bg-white rounded-2xl shadow-2xl border border-stone-100 overflow-hidden min-w-[200px]"
            >
              {/* Reply */}
              <button
                onClick={() => {
                  const msg = messages.find(m => m.id === actionMenu.messageId);
                  if (msg) setReplyingTo(msg);
                  setActionMenu(null);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-stone-50 transition text-left"
              >
                <CornerDownLeft className="w-4 h-4 text-teal-500" />
                <span className="text-sm font-medium text-stone-800">Reply</span>
              </button>

              {/* Copy */}
              <button
                onClick={() => {
                  const msg = messages.find(m => m.id === actionMenu.messageId);
                  if (msg) {
                    const { main } = parseQuoted(msg.content || '');
                    navigator.clipboard.writeText(main);
                  }
                  setActionMenu(null);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-stone-50 transition text-left border-t border-stone-50"
              >
                <Copy className="w-4 h-4 text-stone-500" />
                <span className="text-sm font-medium text-stone-800">Copy</span>
              </button>

              {/* Pin / Unpin */}
              <button
                onClick={() => togglePin(actionMenu.messageId)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-stone-50 transition text-left border-t border-stone-50"
              >
                {actionMenu.is_pinned
                  ? <><PinOff className="w-4 h-4 text-teal-500" /><span className="text-sm font-medium text-stone-800">Unpin</span></>
                  : <><Pin className="w-4 h-4 text-teal-500" /><span className="text-sm font-medium text-stone-800">Pin</span></>
                }
              </button>

              {/* Edit — only sender, text only */}
              {actionMenu.is_mine && actionMenu.message_type !== 'image' && (
                <button
                  onClick={() => {
                    const msg = messages.find(m => m.id === actionMenu.messageId);
                    if (msg) startEdit(msg);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-stone-50 transition text-left border-t border-stone-50"
                >
                  <Pencil className="w-4 h-4 text-blue-500" />
                  <span className="text-sm font-medium text-stone-800">Edit</span>
                </button>
              )}

              {/* Delete sub-menu */}
              {!actionMenu.showDeleteOptions ? (
                <button
                  onClick={() => setActionMenu(prev => prev ? { ...prev, showDeleteOptions: true } : null)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-50 transition text-left border-t border-stone-50"
                >
                  <Trash2 className="w-4 h-4 text-red-500" />
                  <span className="text-sm font-medium text-red-600">Delete</span>
                </button>
              ) : (
                <>
                  <div className="px-4 py-2 border-t border-stone-50 bg-stone-50">
                    <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide">Delete message</p>
                  </div>

                  <button
                    onClick={() => deleteForMe(actionMenu.messageId)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-50 transition text-left"
                  >
                    <UserX className="w-4 h-4 text-orange-500" />
                    <div>
                      <p className="text-sm font-medium text-stone-800">Delete for me</p>
                      <p className="text-xs text-stone-400">Only you won't see this</p>
                    </div>
                  </button>

                  {actionMenu.is_mine && canDeleteForEveryone(actionMenu.created_at) && (
                    <button
                      onClick={() => deleteForEveryone(actionMenu.messageId)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-50 transition text-left border-t border-stone-50"
                    >
                      <Users className="w-4 h-4 text-red-500" />
                      <div>
                        <p className="text-sm font-medium text-red-600">Delete for everyone</p>
                        <p className="text-xs text-stone-400">Removes for all participants</p>
                      </div>
                    </button>
                  )}

                  <button
                    onClick={() => setActionMenu(prev => prev ? { ...prev, showDeleteOptions: false } : null)}
                    className="w-full flex items-center justify-center px-4 py-2.5 text-xs text-stone-400 hover:text-stone-600 border-t border-stone-50 transition"
                  >
                    ← Back
                  </button>
                </>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* SCROLL TO BOTTOM BUTTON */}
      {showScrollBtn && (
        <button
          onClick={() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' })}
          className="fixed bottom-24 right-4 z-30 w-10 h-10 bg-white shadow-lg border border-stone-200 rounded-full flex items-center justify-center active:scale-95 transition"
        >
          <ChevronDown className="w-5 h-5 text-stone-600" />
        </button>
      )}

      {/* IMAGE PREVIEW */}
      {imagePreview && (
        <div className="flex-shrink-0 bg-white border-t border-stone-100 px-4 py-2 flex items-center gap-3">
          <div className="relative flex-shrink-0">
            <img src={imagePreview} alt="preview" className="h-14 w-14 object-cover rounded-xl border-2 border-teal-400" />
            <button onClick={cancelImage} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center">
              <X className="w-3 h-3" />
            </button>
          </div>
          <p className="text-xs text-stone-400">Add a caption below (optional)</p>
        </div>
      )}

      {/* INPUT BAR */}
      <div className="flex-shrink-0 bg-white border-t border-stone-100">
        {/* Reply preview */}
        {replyingTo && (
          <div className="px-4 pt-2.5 pb-2 flex items-center gap-2 border-b border-stone-100 bg-teal-50/60">
            <div className="w-0.5 self-stretch bg-teal-500 rounded-full flex-shrink-0" />
            <div className="flex-1 min-w-0 pl-1">
              <p className="text-[11px] font-semibold text-teal-600">↩ @{replyingTo.sender_username}</p>
              <p className="text-xs text-stone-400 truncate">{parseQuoted(replyingTo.content || '').main || '📷 Image'}</p>
            </div>
            <button onClick={() => setReplyingTo(null)} className="p-1 text-stone-400 hover:text-stone-600 flex-shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="px-4 py-3 flex items-center gap-2">
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-2.5 bg-teal-50 text-teal-600 rounded-xl hover:bg-teal-100 transition flex-shrink-0"
          >
            <ImageIcon className="w-5 h-5" />
          </button>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder={imageFile ? "Add a caption (optional)..." : replyingTo ? "Write your reply..." : "Type a message..."}
            className="flex-1 px-4 py-2.5 bg-stone-50 text-stone-900 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 border border-stone-200 placeholder-stone-400"
          />
          <button
            onClick={handleSend}
            disabled={sending || (!input.trim() && !imageFile)}
            className="p-2.5 text-white rounded-xl disabled:opacity-40 flex-shrink-0 transition active:scale-95"
            style={{ background: GRAD }}
          >
            {sending ? <Loader className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
