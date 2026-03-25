"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth, fetchWithAuth, getToken } from "@/lib/authStore";
import {
  MessageCircle, Calendar, DollarSign, Package, ShoppingBag,
  Send, Check, X, Plus, Edit2, Trash2,
  TrendingUp, Loader, ToggleLeft, ToggleRight, Image as ImageIcon,
  Star, ArrowLeft,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

type Tab = "messages" | "bookings" | "earnings" | "listings" | "orders" | "reviews";

// ✅ Calculate vendor cut based on order amount (matches backend tiers)
function getVendorCut(amount: number, totalOrders: number = 0): number {
  if (totalOrders >= 50) return 0.85;
  if (totalOrders >= 10) return 0.80;
  return 0.75;
}

export default function VendorDashboard() {
  const { user, isLoggedIn } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<Tab>("messages");
  const [msgBadge, setMsgBadge] = useState(0);
  const [bookingBadge, setBookingBadge] = useState(0);

  // ✅ Auto-switch to listings tab if ?tab=listings is in URL
  useEffect(() => {
    const tab = searchParams.get("tab") as Tab | null;
    if (tab && ["messages", "bookings", "earnings", "listings", "orders", "reviews"].includes(tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!user) return;
    fetchWithAuth(`${API_URL}/api/chat/conversations/`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return;
        const list = Array.isArray(d) ? d : (d.results || []);
        setMsgBadge(list.reduce((s: number, c: any) => s + (c.unread_count || 0), 0));
      }).catch(() => {});
    fetchWithAuth(`${API_URL}/api/orders/bookings/`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return;
        const list = Array.isArray(d) ? d : (d.results || []);
        const vendorBookings = list.filter((b: any) => b.vendor_username === user?.username);
        setBookingBadge(vendorBookings.filter((b: any) => b.status === "pending").length);
      }).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!isLoggedIn) { router.push("/auth"); return; }
    if (!user?.is_verified_vendor) { router.push("/home"); return; }
  }, [isLoggedIn, user]);

  const tabs: { id: Tab; label: string; icon: any; badge?: number }[] = [
    { id: "messages", label: "Messages", icon: MessageCircle, badge: msgBadge },
    { id: "bookings", label: "Bookings", icon: Calendar, badge: bookingBadge },
    { id: "earnings", label: "Earnings", icon: DollarSign },
    { id: "listings", label: "Listings", icon: Package },
    { id: "orders", label: "Orders", icon: ShoppingBag },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <div className="bg-gray-900 border-b border-gray-800 px-4 py-4 flex-shrink-0">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.back()} className="p-2 rounded-full bg-gray-800 hover:bg-gray-700 transition">
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            <div>
              <h1 className="text-xl font-black text-white tracking-tight">Vendor Hub</h1>
              <p className="text-gray-400 text-sm">{user?.username}</p>
            </div>
          </div>
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-teal-500 flex items-center justify-center font-black text-white">
            {(user?.username?.[0] || "V").toUpperCase()}
          </div>
        </div>
      </div>

      <div className="bg-gray-900 border-b border-gray-800 overflow-x-auto flex-shrink-0">
        <div className="max-w-5xl mx-auto flex">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-5 py-4 text-sm font-bold whitespace-nowrap border-b-2 transition-all ${
                  activeTab === tab.id ? "border-teal-400 text-teal-400" : "border-transparent text-gray-500 hover:text-gray-300"
                }`}>
                <div className="relative">
                  <Icon className="w-4 h-4" />
                  {(tab.badge ?? 0) > 0 && (
                    <span className="absolute -top-2 -right-2 min-w-[16px] h-4 bg-red-500 rounded-full flex items-center justify-center px-1 text-white text-[9px] font-black leading-none">
                      {(tab.badge ?? 0) > 9 ? "9+" : tab.badge}
                    </span>
                  )}
                </div>
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 max-w-5xl w-full mx-auto px-4 py-4 overflow-hidden">
        {activeTab === "messages" && <MessagesTab />}
        {activeTab === "bookings" && <BookingsTab />}
        {activeTab === "earnings" && <EarningsTab />}
        {activeTab === "listings" && <ListingsTab />}
        {activeTab === "orders" && <OrdersTab />}
        {activeTab === "reviews" && <ReviewsTab />}
      </div>
      <div className="h-20 flex-shrink-0" />
    </div>
  );
}

/* ─── MESSAGES TAB ───────────────────────────────────────────── */
function MessagesTab() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<any[]>([]);
  const [activeConv, setActiveConv] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadConversations(); const i = setInterval(loadConversations, 10000); return () => clearInterval(i); }, []);
  useEffect(() => { if (!activeConv) return; loadMessages(activeConv.id); const i = setInterval(() => loadMessages(activeConv.id), 5000); return () => clearInterval(i); }, [activeConv?.id]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const loadConversations = async () => {
    try { const res = await fetchWithAuth(`${API_URL}/api/chat/conversations/`); const data = await res.json(); setConversations(Array.isArray(data) ? data : (data.results || [])); } catch {} finally { setLoading(false); }
  };

  const loadMessages = async (id: number) => {
    try {
      const res = await fetchWithAuth(`${API_URL}/api/chat/conversations/${id}/messages/`);
      const data = await res.json();
      const raw = Array.isArray(data) ? data : (data.results || []);
      setMessages(raw.map((m: any) => ({ ...m, is_mine: user?.username ? m.sender_username === user.username : !!m.is_mine })));
    } catch {}
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert("Image must be under 5MB"); return; }
    setImageFile(file); setImagePreview(URL.createObjectURL(file));
  };
  const cancelImage = () => { setImageFile(null); setImagePreview(null); if (fileInputRef.current) fileInputRef.current.value = ""; };

  const sendMessage = async () => {
    if ((!text.trim() && !imageFile) || !activeConv || sending) return;
    setSending(true);
    try {
      const token = getToken();
      if (imageFile) {
        const fd = new FormData();
        fd.append("image", imageFile); fd.append("message_type", "image");
        if (text.trim()) fd.append("content", text.trim());
        await fetch(`${API_URL}/api/chat/conversations/${activeConv.id}/send/`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
        cancelImage(); setText("");
      } else {
        await fetchWithAuth(`${API_URL}/api/chat/conversations/${activeConv.id}/send/`, { method: "POST", body: JSON.stringify({ content: text, message_type: "text" }) });
        setText("");
      }
      loadMessages(activeConv.id);
    } catch {} finally { setSending(false); }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="flex gap-4" style={{ height: "calc(100vh - 200px)" }}>
      <div className="w-64 flex-shrink-0 bg-gray-900 rounded-2xl overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-800 flex-shrink-0">
          <h2 className="font-bold text-white">Conversations</h2>
          <p className="text-xs text-gray-500">{conversations.length} chats</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? <div className="p-6 text-center text-gray-500 text-sm">No messages yet</div>
          : conversations.map(conv => (
            <button key={conv.id} onClick={() => setActiveConv(conv)}
              className={`w-full p-4 text-left border-b border-gray-800 hover:bg-gray-800 transition-colors ${activeConv?.id === conv.id ? "bg-gray-800 border-l-2 border-l-teal-400" : ""}`}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-600 to-teal-600 flex items-center justify-center text-xs font-black flex-shrink-0">
                  {conv.buyer_username?.[0]?.toUpperCase() || "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-white text-sm truncate">{conv.buyer_username || "Buyer"}</p>
                  <p className="text-xs text-gray-500 truncate">{conv.listing_title || "Service inquiry"}</p>
                </div>
                {conv.unread_count > 0 && <span className="bg-teal-500 text-black text-xs font-black rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0">{conv.unread_count}</span>}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 bg-gray-900 rounded-2xl flex flex-col overflow-hidden">
        {!activeConv ? (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center"><MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="font-semibold">Select a conversation</p><p className="text-xs text-gray-600 mt-1">Choose a buyer from the left to reply</p></div>
          </div>
        ) : (
          <>
            <div className="p-4 border-b border-gray-800 flex items-center gap-3 flex-shrink-0">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-600 to-teal-600 flex items-center justify-center text-xs font-black">{activeConv.buyer_username?.[0]?.toUpperCase() || "?"}</div>
              <div><p className="font-bold text-white">{activeConv.buyer_username || "Buyer"}</p><p className="text-xs text-gray-500">{activeConv.listing_title}</p></div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 && <p className="text-center text-gray-600 text-sm mt-8">No messages yet</p>}
              {messages.map(msg => (
                <div key={msg.id} className={`flex ${msg.is_mine ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${msg.is_mine ? "bg-teal-600 text-white rounded-br-sm" : "bg-gray-800 text-white rounded-bl-sm"}`}>
                    <p className={`text-xs font-semibold mb-1 ${msg.is_mine ? "text-teal-200 text-right" : "text-gray-400"}`}>{msg.sender_username}</p>
                    {msg.image_url ? (
                      <div><a href={msg.image_url} target="_blank" rel="noopener noreferrer"><img src={msg.image_url} alt="shared" className="rounded-xl max-w-[200px] max-h-[200px] object-cover mb-1 cursor-pointer hover:opacity-90 transition" /></a>{msg.content && msg.content !== "📷 Image" && <p className="text-sm mt-1">{msg.content}</p>}</div>
                    ) : <p className="text-sm">{msg.content}</p>}
                    <p className="text-xs opacity-50 mt-1 text-right">{new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
            {imagePreview && (
              <div className="px-4 py-2 border-t border-gray-800 flex items-center gap-3 flex-shrink-0 bg-gray-900">
                <div className="relative flex-shrink-0">
                  <img src={imagePreview} alt="preview" className="h-14 w-14 object-cover rounded-xl border-2 border-teal-500" />
                  <button onClick={cancelImage} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-black">×</button>
                </div>
                <p className="text-gray-400 text-xs">Add a caption below (optional)</p>
              </div>
            )}
            <div className="p-4 border-t border-gray-800 flex gap-2 flex-shrink-0 bg-gray-900">
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
              <button onClick={() => fileInputRef.current?.click()} className="p-3 bg-gray-800 hover:bg-gray-700 rounded-xl transition flex-shrink-0"><ImageIcon className="w-5 h-5 text-gray-400" /></button>
              <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), sendMessage())} placeholder={imageFile ? "Add a caption..." : "Type a reply..."} className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-teal-500 transition" />
              <button onClick={sendMessage} disabled={sending || (!text.trim() && !imageFile)} className="p-3 bg-teal-600 hover:bg-teal-500 disabled:opacity-40 rounded-xl transition flex-shrink-0">
                {sending ? <Loader className="w-5 h-5 text-white animate-spin" /> : <Send className="w-5 h-5 text-white" />}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── BOOKINGS TAB ───────────────────────────────────────────── */
function BookingsTab() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "confirmed" | "all">("pending");
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [totalOrders, setTotalOrders] = useState(0);

  useEffect(() => {
    loadBookings();
    // Get total orders for cut calculation
    fetchWithAuth(`${API_URL}/api/payments/seller/earnings/`).then(r => r.ok ? r.json() : null).then(d => { if (d) setTotalOrders(d.total_orders || 0); }).catch(() => {});
  }, []);

  const loadBookings = async () => {
    try {
      const res = await fetchWithAuth(`${API_URL}/api/orders/bookings/`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.results || []);
      setBookings(list.filter((b: any) => b.vendor_username === user?.username));
    } catch {} finally { setLoading(false); }
  };

  const handleAction = async (id: number, action: "confirm" | "cancel") => {
    setActionLoading(id);
    try { await fetchWithAuth(`${API_URL}/api/orders/bookings/${id}/${action}/`, { method: "POST" }); loadBookings(); }
    catch {} finally { setActionLoading(null); }
  };

  const filtered = bookings.filter(b => filter === "all" || b.status === filter);
  const vendorRate = getVendorCut(0, totalOrders);
  const vendorPct = Math.round(vendorRate * 100);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="overflow-y-auto pb-4" style={{ maxHeight: "calc(100vh - 200px)" }}>
      <div className="flex gap-2 mb-6">
        {(["pending", "confirmed", "all"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`px-4 py-2 rounded-xl text-sm font-bold capitalize transition ${filter === f ? "bg-teal-500 text-black" : "bg-gray-800 text-gray-400 hover:text-white"}`}>
            {f} {f !== "all" && `(${bookings.filter(b => b.status === f).length})`}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? <EmptyState icon={Calendar} message={`No ${filter} bookings`} /> : (
        <div className="space-y-4">
          {filtered.map(booking => (
            <div key={booking.id} className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-xs font-black flex-shrink-0">{booking.buyer_username?.[0]?.toUpperCase() || "?"}</div>
                <div className="flex-1"><p className="font-bold text-white">{booking.buyer_username}</p><p className="text-xs text-gray-500">{booking.listing_title}</p></div>
                <StatusBadge status={booking.status} />
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-gray-800 rounded-xl p-3"><p className="text-gray-500 text-xs mb-1">Date</p><p className="font-semibold text-white">{booking.scheduled_date}</p></div>
                <div className="bg-gray-800 rounded-xl p-3"><p className="text-gray-500 text-xs mb-1">Time</p><p className="font-semibold text-white">{booking.scheduled_time}</p></div>
                <div className="bg-gray-800 rounded-xl p-3"><p className="text-gray-500 text-xs mb-1">Price</p><p className="font-bold text-teal-400">₦{Number(booking.listing_price || 0).toLocaleString()}</p></div>
                {/* ✅ Dynamic cut based on tier */}
                <div className="bg-gray-800 rounded-xl p-3"><p className="text-gray-500 text-xs mb-1">Your cut ({vendorPct}%)</p><p className="font-bold text-green-400">₦{(Number(booking.listing_price || 0) * vendorRate).toLocaleString()}</p></div>
              </div>
              {booking.note && <div className="mt-3 bg-gray-800 rounded-xl p-3"><p className="text-gray-500 text-xs mb-1">Customer note</p><p className="text-sm text-gray-300">{booking.note}</p></div>}
              {booking.status === "pending" && (
                <div className="flex gap-3 mt-4">
                  <button onClick={() => handleAction(booking.id, "confirm")} disabled={actionLoading === booking.id} className="flex-1 py-3 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 rounded-xl font-bold text-white text-sm transition flex items-center justify-center gap-2">
                    {actionLoading === booking.id ? <Loader className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Accept
                  </button>
                  <button onClick={() => handleAction(booking.id, "cancel")} disabled={actionLoading === booking.id} className="px-6 py-3 bg-gray-800 hover:bg-red-900/40 border border-red-500/30 disabled:opacity-50 rounded-xl font-bold text-red-400 text-sm transition flex items-center gap-2">
                    <X className="w-4 h-4" /> Decline
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── EARNINGS TAB ───────────────────────────────────────────── */
function EarningsTab() {
  const [data, setData] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [earningsRes, txRes] = await Promise.all([
          fetchWithAuth(`${API_URL}/api/payments/seller/earnings/`),
          fetchWithAuth(`${API_URL}/api/payments/seller/transactions/`),
        ]);
        if (earningsRes.ok) setData(await earningsRes.json());
        if (txRes.ok) { const tx = await txRes.json(); setTransactions(Array.isArray(tx) ? tx : (tx.results || [])); }
      } catch {} finally { setLoading(false); }
    };
    load();
  }, []);

  if (loading) return <LoadingSpinner />;

  const vendorRate = data?.vendor_rate || 75;
  const platformRate = data?.commission_rate || 25;

  const stats = [
    { label: "Total Earned", value: `₦${Number(data?.total_earned || 0).toLocaleString()}`, color: "text-teal-400", bg: "from-teal-900/30 to-teal-800/10" },
    { label: "Pending", value: `₦${Number(data?.pending || 0).toLocaleString()}`, color: "text-amber-400", bg: "from-amber-900/30 to-amber-800/10" },
    { label: "Available", value: `₦${Number(data?.available || 0).toLocaleString()}`, color: "text-green-400", bg: "from-green-900/30 to-green-800/10" },
    { label: "Your Cut", value: `${vendorRate}%`, color: "text-purple-400", bg: "from-purple-900/30 to-purple-800/10" },
  ];

  return (
    <div className="overflow-y-auto space-y-6 pb-4" style={{ maxHeight: "calc(100vh - 200px)" }}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map(stat => (
          <div key={stat.label} className={`bg-gradient-to-br ${stat.bg} border border-gray-800 rounded-2xl p-4`}>
            <p className="text-gray-500 text-xs mb-2">{stat.label}</p>
            <p className={`text-xl font-black ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* ✅ FIXED: Commission tiers — vendor-first display, no escrow language */}
      <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
        <h3 className="font-bold text-white mb-1 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-teal-400" />
          Your Earnings Tiers
        </h3>
        <p className="text-xs text-gray-500 mb-4">The more you sell, the more you keep. Paystack splits payments automatically.</p>
        <div className="grid grid-cols-3 gap-3 text-sm">
          {[
            { orders: "1–9 orders", vendorRate: "75%", platformRate: "25%", active: (data?.total_orders || 0) < 10 },
            { orders: "10–49 orders", vendorRate: "80%", platformRate: "20%", active: (data?.total_orders || 0) >= 10 && (data?.total_orders || 0) < 50 },
            { orders: "50+ orders", vendorRate: "85%", platformRate: "15%", active: (data?.total_orders || 0) >= 50 },
          ].map(tier => (
            <div key={tier.orders} className={`rounded-xl p-3 text-center border transition-all ${tier.active ? "border-teal-500 bg-teal-900/20" : "border-gray-800 bg-gray-800/50"}`}>
              <p className={`font-black text-2xl ${tier.active ? "text-teal-400" : "text-gray-500"}`}>{tier.vendorRate}</p>
              <p className="text-xs text-gray-400 font-medium">you keep</p>
              <p className="text-xs text-gray-600 mt-0.5">{tier.platformRate} platform</p>
              <p className="text-xs text-gray-500 mt-1">{tier.orders}</p>
              {tier.active && <p className="text-xs text-teal-400 font-bold mt-1.5">← You're here</p>}
            </div>
          ))}
        </div>
        <div className="mt-4 bg-gray-800 rounded-xl p-3">
          <p className="text-xs text-gray-400">
            💡 <strong className="text-white">How it works:</strong> When a buyer pays, Paystack automatically sends your cut directly to your bank account. StudEx keeps the platform fee. No manual transfers needed.
          </p>
        </div>
      </div>

      <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
        <div className="p-4 border-b border-gray-800"><h3 className="font-bold text-white">Transaction History</h3></div>
        {transactions.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">No transactions yet</div>
        ) : (
          <div className="divide-y divide-gray-800">
            {transactions.map((tx: any) => (
              <div key={tx.id} className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-white text-sm">{tx.service_name || "Service"}</p>
                  <p className="text-xs text-gray-500">{tx.buyer_name} • {new Date(tx.created_at).toLocaleDateString()}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-green-400">₦{Number(tx.seller_amount || tx.amount).toLocaleString()}</p>
                  <p className="text-xs text-gray-500">your cut</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── LISTINGS TAB ───────────────────────────────────────────── */
function ListingsTab() {
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [form, setForm] = useState({ title: "", description: "", price: "", category: "", listing_type: "service", track_inventory: false, stock_quantity: 0, image: null as File | null });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => { loadListings(); loadCategories(); }, []);

  const loadListings = async () => {
    try { const res = await fetchWithAuth(`${API_URL}/api/services/listings/`); const data = await res.json(); setListings(Array.isArray(data) ? data : (data.results || [])); }
    catch {} finally { setLoading(false); }
  };
  const loadCategories = async () => {
    try { const res = await fetch(`${API_URL}/api/services/categories/`); const data = await res.json(); setCategories(Array.isArray(data) ? data : (data.results || [])); } catch {}
  };
  const openEdit = (listing: any) => { setEditing(listing); setForm({ title: listing.title, description: listing.description, price: listing.price.toString(), category: listing.category, listing_type: listing.listing_type || "service", track_inventory: listing.track_inventory || false, stock_quantity: listing.stock_quantity || 0, image: null }); setShowForm(true); };
  const resetForm = () => { setForm({ title: "", description: "", price: "", category: "", listing_type: "service", track_inventory: false, stock_quantity: 0, image: null }); setEditing(null); setShowForm(false); };
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 2500); };

  const handleSave = async () => {
    if (!form.title || !form.price || !form.category) return;
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("title", form.title); fd.append("description", form.description); fd.append("price", form.price); fd.append("category", form.category); fd.append("listing_type", form.listing_type);
      const isInventory = form.listing_type === "food" || form.listing_type === "product";
      fd.append("track_inventory", isInventory ? "true" : "false"); fd.append("stock_quantity", isInventory ? form.stock_quantity.toString() : "0");
      if (form.image) fd.append("image", form.image);
      const url = editing ? `${API_URL}/api/services/listings/${editing.id}/` : `${API_URL}/api/services/listings/`;
      const res = await fetchWithAuth(url, { method: editing ? "PATCH" : "POST", body: fd });
      if (res.ok) { showToast(editing ? "Updated!" : "Created!"); resetForm(); loadListings(); } else showToast("Failed to save.");
    } catch { showToast("Error."); } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this listing?")) return;
    await fetchWithAuth(`${API_URL}/api/services/listings/${id}/`, { method: "DELETE" });
    showToast("Deleted."); loadListings();
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="overflow-y-auto pb-4" style={{ maxHeight: "calc(100vh - 200px)" }}>
      {toast && <div className="fixed top-6 left-1/2 -translate-x-1/2 bg-teal-500 text-black px-6 py-3 rounded-full font-bold text-sm z-50 shadow-xl">{toast}</div>}
      <div className="flex items-center justify-between mb-4">
        <div><h2 className="font-black text-white text-lg">My Listings</h2><p className="text-gray-500 text-sm">{listings.length} services</p></div>
        <button onClick={() => { resetForm(); setShowForm(true); }} className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-500 rounded-xl font-bold text-white text-sm transition"><Plus className="w-4 h-4" /> Add</button>
      </div>
      {showForm && (
        <div className="bg-gray-900 rounded-2xl p-6 mb-6 border border-gray-700">
          <h3 className="font-bold text-white mb-4">{editing ? "Edit Listing" : "New Listing"}</h3>
          <div className="space-y-4">
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Title" className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-teal-500 transition" />
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} placeholder="Describe your service..." className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-teal-500 transition resize-none" />
            <div className="grid grid-cols-2 gap-4">
              <input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="Price (₦)" className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-teal-500 transition" />
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-teal-500 transition">
                <option value="">Select category</option>
                {categories.map((cat: any) => <option key={cat.slug} value={cat.slug}>{cat.title}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-3 bg-gray-800 border border-gray-700 border-dashed rounded-xl px-4 py-3 cursor-pointer hover:border-teal-500 transition">
              <ImageIcon className="w-5 h-5 text-gray-500" />
              <span className="text-sm text-gray-400">{form.image ? form.image.name : "Upload image (optional)"}</span>
              <input type="file" accept="image/*" className="hidden" onChange={e => setForm(f => ({ ...f, image: e.target.files?.[0] || null }))} />
            </label>
            <select value={form.listing_type} onChange={e => setForm(f => ({ ...f, listing_type: e.target.value }))} className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-teal-500 transition">
              <option value="service">Service (e.g. nails, lashes)</option>
              <option value="food">Food (stock tracked)</option>
              <option value="product">Physical Product (stock tracked)</option>
            </select>
            {(form.listing_type === 'food' || form.listing_type === 'product') && (
              <div className="flex items-center gap-4 bg-gray-800 rounded-xl px-4 py-3">
                <div className="flex-1"><p className="text-white text-sm font-bold">Stock Quantity</p><p className="text-gray-500 text-xs">Auto-marks unavailable at 0</p></div>
                <input type="number" min="0" value={form.stock_quantity} onChange={e => setForm(f => ({ ...f, stock_quantity: parseInt(e.target.value) || 0, track_inventory: true }))} className="w-20 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm text-center focus:outline-none focus:border-teal-500" />
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={handleSave} disabled={saving || !form.title || !form.price || !form.category} className="flex-1 py-3 bg-teal-600 hover:bg-teal-500 disabled:opacity-40 rounded-xl font-bold text-white text-sm transition">{saving ? "Saving..." : editing ? "Update" : "Create Listing"}</button>
              <button onClick={resetForm} className="px-6 py-3 bg-gray-800 hover:bg-gray-700 rounded-xl font-bold text-gray-400 text-sm transition">Cancel</button>
            </div>
          </div>
        </div>
      )}
      {listings.length === 0 ? <EmptyState icon={Package} message="No listings yet. Add your first service!" /> : (
        <div className="grid md:grid-cols-2 gap-4">
          {listings.map(listing => (
            <div key={listing.id} className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
              {listing.image && <img src={listing.image} alt={listing.title} className="w-full h-36 object-cover" />}
              <div className="p-4">
                <div className="flex items-start justify-between gap-2 mb-1"><h3 className="font-bold text-white">{listing.title}</h3><span className="font-black text-teal-400 text-sm whitespace-nowrap">₦{Number(listing.price).toLocaleString()}</span></div>
                <p className="text-gray-500 text-xs mb-2 line-clamp-2">{listing.description}</p>
                {listing.track_inventory && <p className={`text-xs font-bold mb-2 ${listing.stock_quantity <= 3 ? "text-orange-400" : "text-teal-400"}`}>📦 Stock: {listing.stock_quantity} remaining</p>}
                <div className="flex items-center justify-between">
                  <span className={`flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg ${listing.is_available ? "bg-green-900/30 text-green-400" : "bg-yellow-900/30 text-yellow-400"}`}>
                    {listing.is_available ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                    {listing.is_available ? "Active" : "Pending Approval"}
                  </span>
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(listing)} className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition"><Edit2 className="w-4 h-4 text-gray-400" /></button>
                    <button onClick={() => handleDelete(listing.id)} className="p-2 bg-gray-800 hover:bg-red-900/40 rounded-lg transition"><Trash2 className="w-4 h-4 text-red-400" /></button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── ORDERS TAB ─────────────────────────────────────────────── */
function OrdersTab() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalOrders, setTotalOrders] = useState(0);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetchWithAuth(`${API_URL}/api/orders/orders/`);
        const data = await res.json();
        setOrders(Array.isArray(data) ? data : (data.results || []));
      } catch {} finally { setLoading(false); }
    };
    load();
    fetchWithAuth(`${API_URL}/api/payments/seller/earnings/`).then(r => r.ok ? r.json() : null).then(d => { if (d) setTotalOrders(d.total_orders || 0); }).catch(() => {});
  }, []);

  if (loading) return <LoadingSpinner />;

  const vendorRate = getVendorCut(0, totalOrders);
  const vendorPct = Math.round(vendorRate * 100);

  return (
    <div className="overflow-y-auto pb-4" style={{ maxHeight: "calc(100vh - 200px)" }}>
      <div className="mb-4"><h2 className="font-black text-white text-lg">Orders</h2><p className="text-gray-500 text-sm">{orders.length} total</p></div>
      {orders.length === 0 ? <EmptyState icon={ShoppingBag} message="No orders yet" /> : (
        <div className="space-y-4">
          {orders.map(order => (
            <div key={order.id} className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
              <div className="flex items-center justify-between mb-3">
                <div><p className="font-bold text-white">{order.listing?.title}</p><p className="text-xs text-gray-500">#{order.reference}</p></div>
                <StatusBadge status={order.status} />
              </div>
              <div className="flex items-center justify-between text-sm">
                <div><p className="text-xs text-gray-500">Buyer</p><p className="font-semibold text-white">{order.buyer}</p></div>
                <div className="text-right"><p className="text-xs text-gray-500">Total</p><p className="font-bold text-teal-400">₦{Number(order.amount).toLocaleString()}</p></div>
                {/* ✅ Dynamic cut */}
                <div className="text-right"><p className="text-xs text-gray-500">Your cut ({vendorPct}%)</p><p className="font-bold text-green-400">₦{(Number(order.amount) * vendorRate).toLocaleString()}</p></div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── REVIEWS TAB ────────────────────────────────────────────── */
function ReviewsTab() {
  const { user } = useAuth();
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    fetchWithAuth(`${API_URL}/api/reviews/reviews/?vendor=${user.id}`).then(r => r.ok ? r.json() : null).then(d => { if (d) setReviews(Array.isArray(d) ? d : (d.results || [])); }).finally(() => setLoading(false));
  }, [user]);

  const avg = reviews.length ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : null;

  if (loading) return <LoadingSpinner />;

  return (
    <div className="p-4 space-y-4 pb-24">
      {reviews.length > 0 && (
        <div className="bg-gradient-to-r from-amber-900/20 to-orange-900/20 border border-amber-800 rounded-2xl p-4 flex items-center gap-4">
          <div className="text-center">
            <p className="text-4xl font-black text-amber-500">{avg}</p>
            <div className="flex gap-0.5 mt-1 justify-center">{[1,2,3,4,5].map(s => <Star key={s} className={`w-4 h-4 ${s <= Math.round(Number(avg)) ? "text-amber-400 fill-amber-400" : "text-gray-600 fill-gray-600"}`} />)}</div>
          </div>
          <div><p className="font-black text-white">{reviews.length} Reviews</p><p className="text-sm text-gray-400">From verified buyers</p></div>
        </div>
      )}
      {reviews.length === 0 ? <EmptyState icon={Star} message="No reviews yet. Complete orders to get rated!" /> : (
        <div className="space-y-3">
          {reviews.map(review => (
            <div key={review.id} className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-white text-sm">{review.reviewer_username}</span>
                <div className="flex gap-0.5">{[1,2,3,4,5].map(s => <Star key={s} className={`w-3.5 h-3.5 ${s <= review.rating ? "text-amber-400 fill-amber-400" : "text-gray-600 fill-gray-600"}`} />)}</div>
              </div>
              {review.listing_title && <p className="text-xs text-teal-400 font-semibold mb-1">{review.listing_title}</p>}
              {review.comment && <p className="text-sm text-gray-300">{review.comment}</p>}
              <p className="text-xs text-gray-500 mt-2">{new Date(review.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── SHARED ─────────────────────────────────────────────────── */
function StatusBadge({ status, small }: { status: string; small?: boolean }) {
  const map: Record<string, string> = { pending: "bg-amber-900/40 text-amber-400", confirmed: "bg-teal-900/40 text-teal-400", completed: "bg-green-900/40 text-green-400", cancelled: "bg-red-900/40 text-red-400", held: "bg-amber-900/40 text-amber-400", released: "bg-green-900/40 text-green-400", paid: "bg-blue-900/40 text-blue-400" };
  return <span className={`${map[status] || "bg-gray-800 text-gray-400"} ${small ? "text-xs px-2 py-0.5" : "text-xs px-3 py-1"} rounded-full font-bold capitalize`}>{status}</span>;
}
function EmptyState({ icon: Icon, message }: { icon: any; message: string }) {
  return <div className="flex flex-col items-center justify-center py-16 text-gray-600"><Icon className="w-12 h-12 mb-3 opacity-30" /><p className="font-semibold">{message}</p></div>;
}
function LoadingSpinner() {
  return <div className="flex items-center justify-center py-16"><Loader className="w-8 h-8 text-teal-400 animate-spin" /></div>;
}
