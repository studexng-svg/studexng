// src/app/chat/[id]/page.tsx
"use client";

import { motion } from "framer-motion";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, Send, Loader, ImageIcon, X } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useAuth, fetchWithAuth, getToken } from "@/lib/authStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

interface Message {
  id: number;
  sender: number;
  sender_username: string;
  content: string;
  message_type: string;
  image_url: string | null;
  is_mine: boolean;
  created_at: string;
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

  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isHydrated && !isLoggedIn) { router.push("/auth"); return; }
    if (!isHydrated || !isLoggedIn || !conversationId) return;
    loadAll();
    const interval = setInterval(loadMessages, 4000);
    return () => clearInterval(interval);
  }, [isHydrated, isLoggedIn, conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadAll = async () => {
    try {
      // Try specific conversation endpoint first
      let convData: any = null;
      try {
        const convRes = await fetchWithAuth(`${API_URL}/api/chat/conversations/${conversationId}/`);
        if (convRes.ok) convData = await convRes.json();
      } catch {}

      // Fall back to list if direct fetch fails
      if (!convData) {
        const listRes = await fetchWithAuth(`${API_URL}/api/chat/conversations/`);
        if (listRes.ok) {
          const listData = await listRes.json();
          const list = Array.isArray(listData) ? listData : (listData.results || []);
          convData = list.find((c: any) => c.id === Number(conversationId));
        }
      }

      if (convData) {
        setOtherUser(
          convData.other_user?.username ||
          convData.buyer_username ||
          convData.seller_username || ""
        );
        setListingTitle(convData.listing_title || "");
      }

      await loadMessages();
    } catch (e) {
      console.error("Failed to load conversation", e);
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async () => {
    try {
      const res = await fetchWithAuth(
        `${API_URL}/api/chat/conversations/${conversationId}/messages/`
      );
      if (!res.ok) return;
      const data = await res.json();
      const raw = Array.isArray(data) ? data : (data.results || []);
      setMessages(
        raw.map((m: any) => ({
          ...m,
          is_mine: m.sender_username === user?.username,
        }))
      );
    } catch {}
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be under 5MB");
      setTimeout(() => setError(""), 3000);
      return;
    }
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
        // Images must use FormData
        const fd = new FormData();
        fd.append("image", imageFile);
        fd.append("message_type", "image");
        if (input.trim()) fd.append("content", input.trim());

        const res = await fetch(
          `${API_URL}/api/chat/conversations/${conversationId}/send/`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: fd,
          }
        );
        if (!res.ok) throw new Error("Send failed");
        cancelImage();
      } else {
        // Text messages use JSON — fetchWithAuth sets Content-Type automatically
        const res = await fetchWithAuth(
          `${API_URL}/api/chat/conversations/${conversationId}/send/`,
          {
            method: "POST",
            body: JSON.stringify({ content: input.trim(), message_type: "text" }),
          }
        );
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

  if (loading) return (
    <div className="flex justify-center items-center min-h-screen bg-gray-50 dark:bg-gray-950">
      <Loader className="w-8 h-8 text-purple-600 animate-spin" />
    </div>
  );

  return (
    <div className="flex flex-col bg-gray-50 dark:bg-gray-950" style={{ height: "100dvh" }}>

      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 px-4 py-3 flex items-center gap-3 flex-shrink-0 shadow-sm">
        <button
          onClick={() => router.back()}
          className="p-2 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-full transition">
          <ArrowLeft className="w-5 h-5 text-purple-600" />
        </button>
        <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-teal-500 rounded-full flex items-center justify-center text-white font-black text-base flex-shrink-0">
          {otherUser?.[0]?.toUpperCase() || "?"}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-black text-gray-900 dark:text-white">@{otherUser}</p>
          {listingTitle && (
            <p className="text-xs text-purple-600 dark:text-purple-400 truncate">{listingTitle}</p>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-500 text-white text-xs px-4 py-2 text-center font-bold flex-shrink-0">
          {error}
        </div>
      )}

      {/* Messages scroll area — pb-36 clears the fixed input bar + bottom nav */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 pb-36">
        {messages.length === 0 && (
          <p className="text-center text-gray-400 dark:text-gray-500 text-sm py-10">
            No messages yet. Say hello! 👋
          </p>
        )}

        {messages.map((msg) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex ${msg.is_mine ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
              msg.is_mine
                ? "bg-gradient-to-br from-purple-600 to-teal-500 text-white rounded-br-sm"
                : "bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm rounded-bl-sm border border-gray-100 dark:border-gray-700"
            }`}>
              {!msg.is_mine && (
                <p className="text-xs font-bold text-purple-500 mb-1">{msg.sender_username}</p>
              )}

              {msg.image_url ? (
                <div>
                  <a href={msg.image_url} target="_blank" rel="noopener noreferrer">
                    <img
                      src={msg.image_url}
                      alt="shared"
                      className="rounded-xl max-w-[220px] max-h-[220px] object-cover mb-1 cursor-pointer hover:opacity-90 transition"
                    />
                  </a>
                  {msg.content && msg.content !== "📷 Image" && (
                    <p className="text-sm mt-1">{msg.content}</p>
                  )}
                </div>
              ) : (
                <p className="text-sm leading-relaxed">{msg.content}</p>
              )}

              <p className={`text-xs mt-1 text-right ${
                msg.is_mine ? "text-white/60" : "text-gray-400"
              }`}>
                {new Date(msg.created_at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          </motion.div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Image preview strip — sits just above the input bar */}
      {imagePreview && (
        <div className="fixed left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 px-4 py-2 flex items-center gap-3 z-20"
          style={{ bottom: "calc(70px + 68px)" }}>
          <div className="relative flex-shrink-0">
            <img
              src={imagePreview}
              alt="preview"
              className="h-14 w-14 object-cover rounded-xl border-2 border-purple-400"
            />
            <button
              onClick={cancelImage}
              className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center">
              <X className="w-3 h-3" />
            </button>
          </div>
          <p className="text-xs text-gray-400">Add a caption below (optional)</p>
        </div>
      )}

      {/*
        Input bar — fixed bottom-[70px] so it always sits above the
        bottom nav (which is ~70px tall). Works for both students and vendors.
      */}
      <div className="fixed bottom-[70px] left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 px-4 py-3 flex items-center gap-2 z-20">

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageSelect}
        />

        <button
          onClick={() => fileInputRef.current?.click()}
          className="p-2.5 bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-xl hover:bg-purple-100 dark:hover:bg-purple-900/50 transition flex-shrink-0">
          <ImageIcon className="w-5 h-5" />
        </button>

        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={imageFile ? "Add a caption (optional)..." : "Type a message..."}
          className="flex-1 px-4 py-2.5 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 border border-gray-200 dark:border-gray-700 placeholder-gray-400"
        />

        <button
          onClick={handleSend}
          disabled={sending || (!input.trim() && !imageFile)}
          className="p-2.5 bg-gradient-to-r from-purple-600 to-teal-500 text-white rounded-xl disabled:opacity-40 flex-shrink-0 transition active:scale-95">
          {sending
            ? <Loader className="w-5 h-5 animate-spin" />
            : <Send className="w-5 h-5" />}
        </button>
      </div>
    </div>
  );
}
