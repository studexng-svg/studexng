// src/app/chat/page.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageCircle, Search, X } from "lucide-react";
import TopNav from "@/components/layout/TopNav";
import { useState, useEffect } from "react";
import { useAuth, fetchWithAuth } from "@/lib/authStore";
import { GRAD, SERIF } from "@/lib/tokens";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

interface Conversation {
  id: number;
  buyer_username: string;
  seller_username: string;
  listing_title: string;
  last_message: string;
  last_message_at: string;
  unread_count: number;
  other_user: { id: number; username: string; profile_picture?: string | null; is_online?: boolean };
}

export default function ChatListPage() {
  useScrollRestoration("chat-list", ["/chat/"]);
  const { isLoggedIn, isHydrated } = useAuth();
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (isHydrated && !isLoggedIn) { router.push("/auth"); return; }
    if (!isHydrated || !isLoggedIn) return;

    const load = () =>
      fetchWithAuth(`${API_URL}/api/chat/conversations/`)
        .then(r => r.json())
        .then(data => setConversations(data.results || data))
        .catch(() => {});

    load().finally(() => setLoading(false));

    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [isHydrated, isLoggedIn, router]);

  const filtered = conversations.filter(c =>
    c.other_user?.username?.toLowerCase().includes(search.toLowerCase()) ||
    c.listing_title?.toLowerCase().includes(search.toLowerCase())
  );

  const totalUnread = conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);

  return (
    <div className="min-h-screen bg-[#F5F5F5]" style={{ fontFamily: "'DM Sans', sans-serif" }}>

      <TopNav showBack />

      <div className="px-4 pt-4 pb-28 max-w-2xl mx-auto space-y-4">

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-3 w-4 h-4 text-stone-400 pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search conversations..."
            className="w-full pl-9 pr-8 py-2.5 bg-white text-stone-900 rounded-full text-sm border border-stone-200 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 placeholder:text-stone-400 transition-all shadow-sm"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-3 text-stone-400 hover:text-stone-600">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* ── SECTION HEADER ── */}
        <div className="animate-fadeUp">
          <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-semibold">Inbox</p>
          <h2 className="text-xl font-bold text-stone-900 mt-0.5" style={SERIF}>
            Your Conversations
          </h2>
        </div>

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
          <div className="bg-white rounded-2xl p-12 text-center border border-stone-100 shadow-sm animate-fadeUp">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center"
              style={{ background: GRAD }}>
              <MessageCircle className="w-8 h-8 text-white" strokeWidth={1.5} />
            </div>
            <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-semibold mb-2">No Messages</p>
            <h3 className="text-lg font-bold text-stone-900 mb-1" style={SERIF}>
              {search ? "No results found" : "No conversations yet"}
            </h3>
            <p className="text-stone-400 text-sm">
              {search ? `Nothing matched "${search}"` : "Message a vendor from their listing page to get started."}
            </p>
          </div>
        ) : (
          /* ── CONVERSATION LIST ── */
          <div className="space-y-3">
            {filtered.map((conv, i) => (
              <div key={conv.id} className="animate-fadeUp">
                <Link href={`/chat/${conv.id}`}>
                  <div
                    className={`bg-white rounded-2xl p-4 flex items-center gap-3 shadow-sm border transition-all cursor-pointer hover:-translate-y-0.5 active:scale-[0.98] ${
                      conv.unread_count > 0
                        ? "border-teal-200 bg-teal-50/30"
                        : "border-stone-200 hover:border-teal-300 hover:shadow-md"
                    }`}>

                    {/* Avatar */}
                    <div className="relative flex-shrink-0">
                      {conv.other_user?.profile_picture ? (
                        <img
                          src={conv.other_user.profile_picture}
                          alt={conv.other_user.username}
                          className="w-12 h-12 rounded-full object-cover shadow-sm"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-sm"
                          style={{ background: GRAD }}>
                          {conv.other_user?.username?.[0]?.toUpperCase() || "?"}
                        </div>
                      )}
                      {conv.other_user?.is_online && (
                        <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-400 border-2 border-white rounded-full" />
                      )}
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
                        {conv.listing_title ? `Re: ${conv.listing_title}` : ""}
                      </p>
                      <p className={`text-xs truncate mt-0.5 ${conv.unread_count > 0 ? "text-stone-700 font-medium" : "text-stone-400"}`}>
                        {(() => {
                          const msg = conv.last_message;
                          if (!msg) return "No messages yet";
                          if (!msg.startsWith('[quoted:@')) return msg;
                          const closeIdx = msg.indexOf(']\n');
                          return closeIdx !== -1 ? msg.substring(closeIdx + 2) || msg : msg;
                        })()}
                      </p>
                    </div>

                    {/* Unread badge */}
                    {conv.unread_count > 0 && (
                      <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ background: GRAD }}>
                        <span className="text-white text-[10px] font-bold">
                          {conv.unread_count > 9 ? "9+" : conv.unread_count}
                        </span>
                      </div>
                    )}
                  </div>
                </Link>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}