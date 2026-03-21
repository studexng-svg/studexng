"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useRouter, useParams } from "next/navigation";
import { ChevronLeft, Send, Loader, ImageIcon, X } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useAuth, fetchWithAuth, getToken } from "@/lib/authStore";
import Image from "next/image";

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
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isHydrated && !isLoggedIn) { router.push("/auth"); return; }
    if (!isHydrated || !isLoggedIn || !conversationId) return;
    loadMessages();
    const interval = setInterval(loadMessages, 4000);
    return () => clearInterval(interval);
  }, [isHydrated, isLoggedIn, conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadMessages = async () => {
    try {
      const [convRes, msgRes] = await Promise.all([
        fetchWithAuth(`${API_URL}/api/chat/conversations/${conversationId}/`),
        fetchWithAuth(`${API_URL}/api/chat/conversations/${conversationId}/messages/`),
      ]);
      const convData = await convRes.json();
      const msgData = await msgRes.json();
      setOtherUser(convData.other_user?.username || "");
      setMessages(Array.isArray(msgData) ? msgData : msgData.results || []);
    } catch (e) {
      console.error("Failed to load messages", e);
    } finally {
      setLoading(false);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert("Image must be under 5MB"); return; }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const cancelImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSend = async () => {
    if (sending) return;
    if (!input.trim() && !imageFile) return;
    setSending(true);

    try {
      const token = getToken();
      const fd = new FormData();

      if (imageFile) {
        fd.append("image", imageFile);
        fd.append("message_type", "image");
        if (input.trim()) fd.append("content", input.trim());
      } else {
        fd.append("content", input.trim());
        fd.append("message_type", "text");
      }

      const res = await fetch(`${API_URL}/api/chat/conversations/${conversationId}/send/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });

      if (res.ok) {
        setInput("");
        cancelImage();
        loadMessages();
      }
    } catch (e) {
      console.error("Send failed", e);
    } finally {
      setSending(false);
    }
  };

  if (loading) return (
    <div className="flex justify-center items-center min-h-screen">
      <Loader className="w-8 h-8 text-purple-600 animate-spin" />
    </div>
  );

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 z-40 px-4 py-3 flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 hover:bg-purple-50 rounded-full">
          <ChevronLeft className="w-6 h-6 text-purple-600" />
        </button>
        <div className="w-9 h-9 bg-gradient-to-br from-purple-500 to-teal-500 rounded-full flex items-center justify-center text-white font-black">
          {otherUser?.[0]?.toUpperCase() || "?"}
        </div>
        <p className="font-black text-gray-900 dark:text-white">@{otherUser}</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 pb-4">
        {messages.length === 0 && (
          <p className="text-center text-gray-400 text-sm py-10">No messages yet. Say hello! 👋</p>
        )}
        {messages.map((msg) => (
          <motion.div key={msg.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className={`flex ${msg.is_mine ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
              msg.is_mine
                ? "bg-gradient-to-br from-purple-600 to-teal-500 text-white rounded-br-sm"
                : "bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm rounded-bl-sm"
            }`}>
              {msg.image_url ? (
                <div>
                  <a href={msg.image_url} target="_blank" rel="noopener noreferrer">
                    <img src={msg.image_url} alt="shared" className="rounded-xl max-w-[220px] max-h-[220px] object-cover mb-1" />
                  </a>
                  {msg.content && msg.content !== "📷 Image" && (
                    <p className="text-sm mt-1">{msg.content}</p>
                  )}
                </div>
              ) : (
                <p className="text-sm">{msg.content}</p>
              )}
              <p className={`text-xs mt-1 ${msg.is_mine ? "text-white/70" : "text-gray-400"}`}>
                {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </motion.div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Image preview */}
      {imagePreview && (
        <div className="px-4 py-2 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 flex items-center gap-3">
          <div className="relative">
            <img src={imagePreview} alt="preview" className="h-16 w-16 object-cover rounded-xl border-2 border-purple-400" />
            <button onClick={cancelImage}
              className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center">
              <X className="w-3 h-3" />
            </button>
          </div>
          <p className="text-sm text-gray-500">Add a caption below (optional)</p>
        </div>
      )}

      {/* Input bar */}
      <div className="bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 px-4 py-3 flex items-center gap-2">
        {/* Hidden file input */}
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />

        {/* Image button */}
        <button onClick={() => fileInputRef.current?.click()}
          className="p-2.5 bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-xl hover:bg-purple-100 transition flex-shrink-0"
          title="Attach image">
          <ImageIcon className="w-5 h-5" />
        </button>

        {/* Text input */}
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder={imageFile ? "Add a caption (optional)..." : "Type a message..."}
          className="flex-1 px-4 py-2.5 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 border border-gray-200 dark:border-gray-700"
        />

        {/* Send button */}
        <button onClick={handleSend} disabled={sending || (!input.trim() && !imageFile)}
          className="p-2.5 bg-gradient-to-r from-purple-600 to-teal-500 text-white rounded-xl disabled:opacity-40 flex-shrink-0">
          {sending ? <Loader className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
        </button>
      </div>
    </div>
  );
}
