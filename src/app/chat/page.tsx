// src/app/chat/page.tsx
"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageCircle, ChevronLeft, Search, X } from "lucide-react";
import { useState, useEffect } from "react";
import { useAuth, fetchWithAuth } from "@/lib/authStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

interface Conversation {
  id: number;
  buyer_username: string;
  seller_username: string;
  listing_title: string;
  last_message: string;
  last_message_at: string;
  unread_count: number;
  other_user: { id: number; username: string };
}

export default function ChatListPage() {
  const { isLoggedIn, isHydrated } = useAuth();
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (isHydrated && !isLoggedIn) { router.push("/auth"); return; }
    if (!isHydrated || !isLoggedIn) return;
    fetchWithAuth(`${API_URL}/api/chat/conversations/`)
      .then(r => r.json())
      .then(data => setConversations(data.results || data))
      .catch(() => setConversations([]))
      .finally(() => setLoading(false));
  }, [isHydrated, isLoggedIn, router]);

  const filtered = conversations.filter(c =>
    c.other_user?.username?.toLowerCase().includes(search.toLowerCase()) ||
    c.listing_title?.toLowerCase().includes(search.toLowerCase())
  );

  const totalUnread = conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);

  return (
    <div className="min-h-screen bg-[#FAFAF9]" style={{ fontFamily: "'DM Sans', sans-serif" }}>

      {/* ── STICKY HEADER ── */}
      <div className="sticky top-0 bg-white/80 backdrop-blur-md z-40 border-b border-stone-100 shadow-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={() => router.back()}
            className="p-2.5 bg-white border border-stone-200 hover:border-stone-300 rounded-full shadow-sm transition-all active:scale-95">
            <ChevronLeft className="w-5 h-5 text-stone-600" />
          </button>

          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold text-stone-900" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
              Messages
            </h1>
            {totalUnread > 0 && (
              <span className="bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-4 flex items-center justify-center px-1">
                {totalUnread > 99 ? "99+" : totalUnread}
              </span>
            )}
          </div>

          <div className="w-10" />
        </div>

        {/* Search */}
        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-3 w-4 h-4 text-stone-400 pointer-events-none" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search conversations..."
              className="w-full pl-9 pr-8 py-2.5 bg-stone-50 text-stone-900 rounded-full text-sm border border-stone-200 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 placeholder:text-stone-400 transition-all"
            />
            {search && (
              <button onClick={() => setSearch("")}
                className="absolute right-3 top-3 text-stone-400 hover:text-stone-600">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 pt-6 pb-28 max-w-2xl mx-auto space-y-4">

        {/* ── SECTION HEADER ── */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-semibold">Inbox</p>
          <h2 className="text-xl font-bold text-stone-900 mt-0.5" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
            Your Conversations
          </h2>
        </motion.div>

        {/* ── LOADING ── */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-white border border-stone-100 rounded-2xl p-4 flex items-center gap-3 animate-pulse">
                <div className="w-12 h-12 rounded-full bg-stone-200 flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-stone-200 rounded-full w-1/3" />
                  <div className="h-2.5 bg-stone-100 rounded-full w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          /* ── EMPTY STATE ── */
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl p-12 text-center border border-stone-100 shadow-sm">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #0D9488 0%, #7C3AED 100%)" }}>
              <MessageCircle className="w-8 h-8 text-white" strokeWidth={1.5} />
            </div>
            <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-semibold mb-2">No Messages</p>
            <h3 className="text-lg font-bold text-stone-900 mb-1" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
              {search ? "No results found" : "No conversations yet"}
            </h3>
            <p className="text-stone-400 text-sm">
              {search ? `Nothing matched "${search}"` : "Message a vendor from their listing page to get started."}
            </p>
          </motion.div>
        ) : (
          /* ── CONVERSATION LIST ── */
          <div className="space-y-3">
            {filtered.map((conv, i) => (
              <motion.div
                key={conv.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}>
                <Link href={`/chat/${conv.id}`}>
                  <motion.div
                    whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }}
                    className={`bg-white rounded-2xl p-4 flex items-center gap-3 shadow-sm border transition-all cursor-pointer ${
                      conv.unread_count > 0
                        ? "border-teal-200 bg-teal-50/30"
                        : "border-stone-200 hover:border-teal-300 hover:shadow-md"
                    }`}>

                    {/* Avatar */}
                    <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0 shadow-sm"
                      style={{ background: "linear-gradient(135deg, #0D9488 0%, #7C3AED 100%)" }}>
                      {conv.other_user?.username?.[0]?.toUpperCase() || "?"}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-stone-900 text-sm truncate">
                          {conv.other_user?.username}
                        </p>
                        {conv.last_message_at && (
                          <p className="text-xs text-stone-400 flex-shrink-0">
                            {new Date(conv.last_message_at).toLocaleDateString("en-NG", {
                              day: "numeric", month: "short"
                            })}
                          </p>
                        )}
                      </div>
                      <p className="text-xs font-medium text-teal-600 truncate mt-0.5">
                        {conv.listing_title}
                      </p>
                      <p className={`text-xs truncate mt-0.5 ${conv.unread_count > 0 ? "text-stone-700 font-medium" : "text-stone-400"}`}>
                        {conv.last_message || "No messages yet"}
                      </p>
                    </div>

                    {/* Unread badge */}
                    {conv.unread_count > 0 && (
                      <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ background: "linear-gradient(135deg, #0D9488 0%, #7C3AED 100%)" }}>
                        <span className="text-white text-[10px] font-bold">
                          {conv.unread_count > 9 ? "9+" : conv.unread_count}
                        </span>
                      </div>
                    )}
                  </motion.div>
                </Link>
              </motion.div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}