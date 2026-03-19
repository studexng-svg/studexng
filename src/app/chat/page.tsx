// src/app/chat/page.tsx
"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageCircle, ChevronLeft, Loader, Search } from "lucide-react";
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

  return (
    <>
      <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        className="sticky top-0 bg-white/95 backdrop-blur-xl z-40 border-b border-purple-100 shadow-sm">
        <div className="flex items-center justify-between p-4 max-w-2xl mx-auto">
          <button onClick={() => router.back()} className="p-2 hover:bg-purple-50 rounded-full">
            <ChevronLeft className="w-6 h-6 text-purple-600" />
          </button>
          <h1 className="text-xl font-black bg-gradient-to-r from-purple-600 to-teal-500 bg-clip-text text-transparent">
            Messages
          </h1>
          <div className="w-10" />
        </div>
        <div className="px-4 pb-3 max-w-2xl mx-auto">
          <div className="relative">
            <Search className="absolute left-4 top-3 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search conversations..."
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 rounded-xl text-sm border border-gray-100 focus:outline-none focus:border-purple-300" />
          </div>
        </div>
      </motion.div>

      <div className="max-w-2xl mx-auto p-4 pb-32 min-h-screen bg-gray-50">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader className="w-8 h-8 text-purple-600 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="text-center py-20">
            <MessageCircle className="w-16 h-16 text-gray-200 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">No conversations yet</p>
            <p className="text-gray-400 text-sm mt-1">Message a vendor from their listing page</p>
          </motion.div>
        ) : (
          <div className="space-y-2">
            {filtered.map((conv, i) => (
              <motion.div key={conv.id}
                initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}>
                <Link href={`/chat/${conv.id}`}>
                  <div className="bg-white rounded-2xl p-4 flex items-center gap-3 shadow-sm border border-gray-100 hover:border-purple-200 transition">
                    <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-teal-500 rounded-full flex items-center justify-center text-white font-black text-lg flex-shrink-0">
                      {conv.other_user?.username?.[0]?.toUpperCase() || "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="font-bold text-gray-900">{conv.other_user?.username}</p>
                        {conv.last_message_at && (
                          <p className="text-xs text-gray-400">
                            {new Date(conv.last_message_at).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                      <p className="text-xs text-purple-600 font-medium truncate">{conv.listing_title}</p>
                      <p className="text-sm text-gray-500 truncate mt-0.5">
                        {conv.last_message || "No messages yet"}
                      </p>
                    </div>
                    {conv.unread_count > 0 && (
                      <div className="w-6 h-6 bg-purple-600 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-white text-xs font-black">{conv.unread_count}</span>
                      </div>
                    )}
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
