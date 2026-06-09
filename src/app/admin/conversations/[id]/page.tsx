// src/app/admin/conversations/[id]/page.tsx
"use client";

import { MessageCircle, AlertTriangle, Image as ImageIcon, DollarSign, Pin } from "lucide-react";
import AdminTopBar from "@/components/layout/AdminTopBar";
import { useParams, useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { fetchWithAuth } from "@/lib/authStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

function fmt(iso: string) {
  return new Date(iso).toLocaleString("en-NG", {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function parseQuoted(content: string) {
  if (!content || !content.startsWith('[quoted:@')) return { quoted: null, main: content || '' };
  const pipeIdx = content.indexOf('|', 9);
  if (pipeIdx === -1) return { quoted: null, main: content };
  const closeIdx = content.indexOf(']\n', pipeIdx);
  if (closeIdx === -1) return { quoted: null, main: content };
  const sender = content.substring(9, pipeIdx);
  const rawText = content.substring(pipeIdx + 1, closeIdx).replace(/\[quoted:@[^\n]*/g, '').replace(/\s+/g, ' ').trim();
  return { quoted: { sender, text: rawText }, main: content.substring(closeIdx + 2) };
}

export default function AdminConversationDetail() {
  const { id } = useParams();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    fetchWithAuth(`${API_URL}/api/admin/conversations/${id}/`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F5F5] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-stone-200 border-t-teal-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-[#F5F5F5] flex flex-col items-center justify-center gap-4 px-6">
        <AlertTriangle className="w-12 h-12 text-stone-300" />
        <p className="text-stone-500 font-medium">Conversation not found</p>
        <button onClick={() => router.push("/admin/conversations")}
          className="px-5 py-2.5 bg-white border border-stone-200 rounded-full text-stone-700 text-sm font-semibold">
          Back
        </button>
      </div>
    );
  }

  const messages: any[] = data.messages || [];
  const participants = new Set([data.buyer, data.seller]);

  return (
    <div className="min-h-screen bg-[#F5F5F5] flex flex-col" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <AdminTopBar title="Conversation" back="/admin/conversations" />

      {/* Header */}
      <div className="px-4 pt-3 pb-3 bg-white border-b border-stone-100 shadow-sm">
        <div className="max-w-2xl mx-auto">
          <p className="font-bold text-stone-900 text-sm">
            {data.buyer} <span className="text-stone-400 font-normal">↔</span> {data.seller}
          </p>
          {data.listing_title && (
            <p className="text-teal-600 text-xs font-medium mt-0.5">
              re: {data.listing_title}
              {data.listing_campus && (
                <span className={`ml-2 px-1.5 py-0.5 rounded-full text-xs font-bold ${
                  data.listing_campus === "futo" ? "bg-orange-100 text-orange-700" : "bg-teal-50 text-teal-700"
                }`}>
                  {data.listing_campus.toUpperCase()}
                </span>
              )}
            </p>
          )}
          <p className="text-stone-400 text-xs mt-0.5">{messages.length} messages · read-only view</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 max-w-2xl mx-auto w-full space-y-3 pb-20">
        {messages.length === 0 ? (
          <div className="text-center py-16">
            <MessageCircle className="w-10 h-10 text-stone-200 mx-auto mb-3" />
            <p className="text-stone-400 text-sm">No messages yet</p>
          </div>
        ) : (
          messages.map(msg => {
            const isBuyer = msg.sender === data.buyer;
            return (
              <div key={msg.id} className={`flex ${isBuyer ? "justify-start" : "justify-end"}`}>
                <div className={`max-w-[78%] space-y-1`}>
                  <div className={`flex items-center gap-1.5 ${isBuyer ? "flex-row" : "flex-row-reverse"}`}>
                    <p className="text-xs font-semibold text-stone-500">{msg.sender}</p>
                    {msg.is_pinned && <Pin className="w-3 h-3 text-amber-500" />}
                    {msg.is_edited && <span className="text-xs text-stone-400">(edited)</span>}
                  </div>

                  {msg.message_type === "image" ? (
                    <div className={`rounded-2xl overflow-hidden border border-stone-200 ${isBuyer ? "rounded-tl-sm" : "rounded-tr-sm"}`}>
                      {msg.image_url ? (
                        <img src={msg.image_url} alt="image" className="max-w-full max-h-48 object-cover" />
                      ) : (
                        <div className="w-32 h-24 bg-stone-100 flex items-center justify-center">
                          <ImageIcon className="w-6 h-6 text-stone-300" />
                        </div>
                      )}
                    </div>
                  ) : msg.message_type === "offer" ? (
                    <div className={`px-4 py-3 rounded-2xl border-2 ${
                      isBuyer ? "rounded-tl-sm bg-amber-50 border-amber-200" : "rounded-tr-sm bg-teal-50 border-teal-200"
                    }`}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <DollarSign className="w-3.5 h-3.5 text-amber-600" />
                        <p className="text-xs font-bold text-amber-700">Offer</p>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                          msg.offer_status === "accepted" ? "bg-teal-100 text-teal-700" :
                          msg.offer_status === "declined" ? "bg-red-100 text-red-600" :
                          "bg-stone-100 text-stone-600"
                        }`}>{msg.offer_status}</span>
                      </div>
                      <p className="font-bold text-stone-900">₦{parseFloat(msg.offer_amount).toLocaleString()}</p>
                      {msg.content && <p className="text-stone-600 text-sm mt-1">{msg.content}</p>}
                    </div>
                  ) : (
                    <div className={`px-3.5 py-2.5 rounded-2xl text-sm break-words ${
                      isBuyer
                        ? "bg-white border border-stone-200 text-stone-800 rounded-tl-sm"
                        : "text-white rounded-tr-sm"
                    }`}
                      style={!isBuyer ? { background: "linear-gradient(135deg,#0D9488,#7C3AED)" } : {}}>
                      {(() => {
                        const { quoted, main } = parseQuoted(msg.content);
                        return (
                          <>
                            {quoted && (
                              <div className={`mb-2 pl-2 border-l-2 rounded-sm py-0.5 ${isBuyer ? 'border-teal-400 bg-teal-50/60' : 'border-white/50 bg-white/10'}`}>
                                <p className={`text-xs font-semibold ${isBuyer ? 'text-teal-600' : 'text-white/70'}`}>↩ @{quoted.sender}</p>
                                <p className={`text-xs truncate ${isBuyer ? 'text-stone-500' : 'text-white/60'}`}>{quoted.text}</p>
                              </div>
                            )}
                            <p>{main}</p>
                          </>
                        );
                      })()}
                    </div>
                  )}

                  <p className={`text-xs text-stone-400 ${isBuyer ? "text-left" : "text-right"}`}>
                    {fmt(msg.created_at)}
                    {msg.is_read && isBuyer && <span className="ml-1 text-teal-500">✓</span>}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
