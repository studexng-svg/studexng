// src/app/vendor/dashboard/page.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth, fetchWithAuth } from "@/lib/authStore";
import { GRAD, SERIF, toArray } from "@/lib/tokens";
import {
  MessageCircle, Calendar, DollarSign, Package, ShoppingBag,
  Send, Check, X, Plus, Edit2, Trash2,
  TrendingUp, Loader, ToggleLeft, ToggleRight, Image as ImageIcon,
  Star, ArrowLeft,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

type Tab = "messages" | "bookings" | "earnings" | "listings" | "orders" | "reviews";

export default function VendorDashboard() {
  const { user, isLoggedIn } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("messages");
  const [msgBadge, setMsgBadge] = useState(0);
  const [bookingBadge, setBookingBadge] = useState(0);

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
    <div className="min-h-screen bg-[#FAFAF9] flex flex-col" style={{ fontFamily: "'DM Sans', sans-serif" }}>

      {/* Header */}
      <div className="sticky top-0 bg-white/80 backdrop-blur-md z-40 border-b border-stone-100 shadow-sm flex-shrink-0">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.back()}
              className="p-2.5 bg-white border border-stone-200 rounded-full shadow-sm active:scale-95 transition-all">
              <ArrowLeft className="w-4 h-4 text-stone-600" />
            </button>
            <div>
              <h1 className="text-base font-bold text-stone-900" style={SERIF}>
                Vendor Hub
              </h1>
              <p className="text-stone-400 text-xs">{user?.username}</p>
            </div>
          </div>
          {user?.profile_image ? (
            <img
              src={user.profile_image}
              alt={user.username}
              className="w-9 h-9 rounded-full object-cover border border-stone-200 shadow-sm"
            />
          ) : (
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-white text-sm"
              style={{ background: GRAD }}
            >
              {(user?.username?.[0] || "V").toUpperCase()}
            </div>
          )}
        </div>
      </div>

      {/* Tab Bar */}
      <div className="bg-white border-b border-stone-100 overflow-x-auto flex-shrink-0">
        <div className="max-w-5xl mx-auto flex">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-5 py-3.5 text-sm font-semibold whitespace-nowrap border-b-2 transition-all ${
                  activeTab === tab.id
                    ? "border-teal-600 text-teal-600"
                    : "border-transparent text-stone-400 hover:text-stone-600"
                }`}>
                <div className="relative">
                  <Icon className="w-4 h-4" />
                  {(tab.badge ?? 0) > 0 && (
                    <span className="absolute -top-2 -right-2 min-w-[16px] h-4 bg-red-500 rounded-full flex items-center justify-center px-1 text-white text-[9px] font-bold leading-none">
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

      {/* Tab Content */}
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
  const [showMobileChat, setShowMobileChat] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadConversations();
    const interval = setInterval(loadConversations, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!activeConv) return;
    loadMessages(activeConv.id);
    const interval = setInterval(() => loadMessages(activeConv.id), 5000);
    return () => clearInterval(interval);
  }, [activeConv?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadConversations = async () => {
    try {
      const res = await fetchWithAuth(`${API_URL}/api/chat/conversations/`);
      const data = await res.json();
      setConversations(toArray(data));
    } catch {} finally { setLoading(false); }
  };

  const loadMessages = async (id: number) => {
    try {
      const res = await fetchWithAuth(`${API_URL}/api/chat/conversations/${id}/messages/`);
      const data = await res.json();
      const raw = toArray(data);
      const currentUsername = user?.username;
      setMessages(raw.map((m: any) => ({
        ...m,
        is_mine: currentUsername ? m.sender_username === currentUsername : !!m.is_mine,
      })));
    } catch {}
  };

  const sendMessage = async () => {
    if (!text.trim() || !activeConv || sending) return;
    setSending(true);
    try {
      await fetchWithAuth(`${API_URL}/api/chat/conversations/${activeConv.id}/send/`, {
        method: "POST",
        body: JSON.stringify({ content: text, message_type: "text" }),
      });
      setText("");
      loadMessages(activeConv.id);
    } catch {} finally { setSending(false); }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="flex gap-3" style={{ height: "calc(100vh - 200px)" }}>
      {/* Conversations list — full width on mobile, fixed sidebar on desktop */}
      <div className={`${showMobileChat ? "hidden lg:flex" : "flex"} flex-col w-full lg:w-60 lg:flex-shrink-0 bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm`}>
        <div className="px-4 py-3 border-b border-stone-100 flex-shrink-0">
          <h2 className="font-semibold text-stone-800 text-sm">Conversations</h2>
          <p className="text-xs text-stone-400">{conversations.length} chats</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="p-6 text-center text-stone-400 text-sm">No messages yet</div>
          ) : conversations.map(conv => (
            <button key={conv.id} onClick={() => { setActiveConv(conv); setShowMobileChat(true); }}
              className={`w-full p-3 text-left border-b border-stone-100 hover:bg-stone-50 transition-colors ${
                activeConv?.id === conv.id ? "bg-teal-50 border-l-2 border-l-teal-500" : ""
              }`}>
              <div className="flex items-center gap-2.5">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                  style={{ background: GRAD }}
                >
                  {conv.buyer_username?.[0]?.toUpperCase() || "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-stone-800 text-sm truncate">
                    {conv.buyer_username || "Buyer"}
                  </p>
                  <p className="text-xs text-stone-400 truncate">
                    {conv.listing_title || "Service inquiry"}
                  </p>
                </div>
                {conv.unread_count > 0 && (
                  <span className="bg-teal-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0">
                    {conv.unread_count}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Chat area — hidden on mobile until a conv is selected */}
      <div className={`${showMobileChat ? "flex" : "hidden lg:flex"} flex-1 flex-col bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm`}>
        {!activeConv ? (
          <div className="flex-1 flex items-center justify-center text-stone-400">
            <div className="text-center">
              <MessageCircle className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-semibold text-sm">Select a conversation</p>
              <p className="text-xs text-stone-400 mt-1">Choose a buyer from the left to reply</p>
            </div>
          </div>
        ) : (
          <>
            <div className="px-4 py-3 border-b border-stone-100 flex items-center gap-3 flex-shrink-0">
              <button onClick={() => setShowMobileChat(false)}
                className="lg:hidden p-1.5 -ml-1 hover:bg-stone-100 rounded-full transition flex-shrink-0">
                <ArrowLeft className="w-4 h-4 text-stone-600" />
              </button>
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                style={{ background: GRAD }}
              >
                {activeConv.buyer_username?.[0]?.toUpperCase() || "?"}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-stone-800 text-sm truncate">{activeConv.buyer_username || "Buyer"}</p>
                <p className="text-xs text-stone-400 truncate">{activeConv.listing_title}</p>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 && (
                <p className="text-center text-stone-400 text-sm mt-8">No messages yet</p>
              )}
              {messages.map(msg => (
                <div key={msg.id} className={`flex ${msg.is_mine ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                    msg.is_mine
                      ? "text-white rounded-br-sm"
                      : "bg-stone-100 text-stone-800 rounded-bl-sm"
                  }`}
                  style={msg.is_mine ? { background: GRAD } : {}}>
                    <p className={`text-xs font-medium mb-1 ${msg.is_mine ? "text-teal-100 text-right" : "text-stone-500"}`}>
                      {msg.sender_username || (msg.is_mine ? user?.username : activeConv.buyer_username)}
                    </p>
                    <p className="text-sm">{msg.content}</p>
                    <p className="text-xs opacity-50 mt-1 text-right">
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
            <div className="px-4 py-3 border-t border-stone-100 flex gap-3 flex-shrink-0 bg-white">
              <input value={text} onChange={e => setText(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), sendMessage())}
                placeholder="Type a reply..."
                className="flex-1 bg-white border border-stone-200 rounded-xl px-4 py-2.5 text-stone-900 text-sm placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition" />
              <button onClick={sendMessage} disabled={sending || !text.trim()}
                className="p-2.5 text-white disabled:opacity-40 rounded-xl transition active:scale-95"
                style={{ background: GRAD }}>
                {sending ? <Loader className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
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

  useEffect(() => { loadBookings(); }, []);

  const loadBookings = async () => {
    try {
      const res = await fetchWithAuth(`${API_URL}/api/orders/bookings/`);
      const data = await res.json();
      const list = toArray(data);
      const vendorOnly = list.filter((b: any) => b.vendor_username === user?.username);
      setBookings(vendorOnly);
    } catch {} finally { setLoading(false); }
  };

  const handleAction = async (id: number, action: "confirm" | "cancel") => {
    setActionLoading(id);
    try {
      await fetchWithAuth(`${API_URL}/api/orders/bookings/${id}/${action}/`, { method: "POST" });
      loadBookings();
    } catch {} finally { setActionLoading(null); }
  };

  const filtered = bookings.filter(b => filter === "all" || b.status === filter);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="overflow-y-auto pb-4" style={{ maxHeight: "calc(100vh - 200px)" }}>
      <div className="flex gap-2 mb-5">
        {(["pending", "confirmed", "all"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-full text-sm font-medium capitalize transition-all ${
              filter === f
                ? "text-white shadow-sm"
                : "bg-white border border-stone-200 text-stone-600 hover:border-stone-300"
            }`}
            style={filter === f ? { background: GRAD } : {}}>
            {f} {f !== "all" && `(${bookings.filter(b => b.status === f).length})`}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Calendar} message={`No ${filter} bookings`} />
      ) : (
        <div className="space-y-3">
          {filtered.map(booking => (
            <div key={booking.id} className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                  style={{ background: GRAD }}
                >
                  {booking.buyer_username?.[0]?.toUpperCase() || "?"}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-stone-900 text-sm">{booking.buyer_username}</p>
                  <p className="text-xs text-stone-400">{booking.listing_title}</p>
                </div>
                <StatusBadge status={booking.status} />
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="bg-stone-50 border border-stone-100 rounded-xl p-3">
                  <p className="text-stone-400 text-xs mb-0.5">Date</p>
                  <p className="font-semibold text-stone-800">{booking.scheduled_date}</p>
                </div>
                <div className="bg-stone-50 border border-stone-100 rounded-xl p-3">
                  <p className="text-stone-400 text-xs mb-0.5">Time</p>
                  <p className="font-semibold text-stone-800">{booking.scheduled_time}</p>
                </div>
                {booking.location && (
                  <div className="bg-stone-50 border border-stone-100 rounded-xl p-3 col-span-2">
                    <p className="text-stone-400 text-xs mb-0.5">Location</p>
                    <p className="font-semibold text-stone-800">{booking.location}</p>
                  </div>
                )}
                <div className="bg-teal-50 border border-teal-100 rounded-xl p-3 col-span-2">
                  <p className="text-teal-500 text-xs mb-0.5">Your payout</p>
                  <p className="font-bold text-teal-600 text-lg">
                    ₦{Math.max(0, Number(booking.listing_price || 0) - 205.56).toLocaleString()}
                  </p>
                  <p className="text-stone-400 text-xs mt-0.5">
                    (₦{Number(booking.listing_price || 0).toLocaleString()} minus ₦205.56 service fee)
                  </p>
                </div>
              </div>

              {booking.note && (
                <div className="mt-3 bg-stone-50 border border-stone-100 rounded-xl p-3">
                  <p className="text-stone-400 text-xs mb-0.5">Customer note</p>
                  <p className="text-sm text-stone-600">{booking.note}</p>
                </div>
              )}

              {booking.status === "pending" && (
                <div className="flex gap-3 mt-4">
                  <button onClick={() => handleAction(booking.id, "confirm")}
                    disabled={actionLoading === booking.id}
                    className="flex-1 py-2.5 text-white disabled:opacity-50 rounded-full font-semibold text-sm transition flex items-center justify-center gap-2 active:scale-[0.98]"
                    style={{ background: GRAD }}>
                    {actionLoading === booking.id ? <Loader className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Accept
                  </button>
                  <button onClick={() => handleAction(booking.id, "cancel")}
                    disabled={actionLoading === booking.id}
                    className="px-6 py-2.5 bg-white border border-red-200 disabled:opacity-50 rounded-full font-semibold text-red-500 text-sm transition flex items-center gap-2 hover:bg-red-50">
                    <X className="w-4 h-4" />
                    Decline
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
        if (txRes.ok) {
          const tx = await txRes.json();
          setTransactions(Array.isArray(tx) ? tx : (tx.results || []));
        }
      } catch {} finally { setLoading(false); }
    };
    load();
  }, []);

  if (loading) return <LoadingSpinner />;

  const stats = [
    {
      label: "Total Earned",
      value: `₦${Number(data?.total_earned || 0).toLocaleString()}`,
      color: "text-teal-600",
      bg: "bg-teal-50 border-teal-100",
      note: "Your cumulative payouts",
    },
    {
      label: "Completed Orders",
      value: data?.total_orders ?? 0,
      color: "text-purple-600",
      bg: "bg-purple-50 border-purple-100",
      note: "All time",
    },
    {
      label: "Service Fee",
      value: "₦205.56",
      color: "text-stone-600",
      bg: "bg-stone-50 border-stone-100",
      note: "Flat fee per transaction",
    },
  ];

  return (
    <div className="overflow-y-auto space-y-5 pb-4" style={{ maxHeight: "calc(100vh - 200px)" }}>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {stats.map(stat => (
          <div key={stat.label} className={`bg-white border rounded-2xl p-5 shadow-sm ${stat.bg}`}>
            <p className="text-stone-400 text-xs mb-1.5">{stat.label}</p>
            <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-stone-400 text-xs mt-1">{stat.note}</p>
          </div>
        ))}
      </div>

      <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm">
        <h3 className="font-semibold text-stone-800 mb-3 flex items-center gap-2 text-sm">
          <TrendingUp className="w-4 h-4 text-teal-600" />
          How Payouts Work
        </h3>
        <div className="space-y-2 text-sm text-stone-500 leading-relaxed">
          <div className="flex items-start gap-3 bg-stone-50 border border-stone-100 rounded-xl p-3">
            <span className="text-teal-600 font-bold text-base leading-none">1</span>
            <p>A customer pays the full listing price through Paystack checkout.</p>
          </div>
          <div className="flex items-start gap-3 bg-stone-50 border border-stone-100 rounded-xl p-3">
            <span className="text-teal-600 font-bold text-base leading-none">2</span>
            <p>Paystack instantly splits the payment — <span className="text-stone-800 font-semibold">₦205.56 goes to StudEx</span> as a flat service fee.</p>
          </div>
          <div className="flex items-start gap-3 bg-stone-50 border border-stone-100 rounded-xl p-3">
            <span className="text-teal-600 font-bold text-base leading-none">3</span>
            <p><span className="text-teal-600 font-semibold">Everything else goes directly to your bank account</span> — no holding period on our end. Paystack's own settlement cycle applies (typically T+1 or T+2 business days).</p>
          </div>
        </div>
      </div>

      <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-5 py-3 border-b border-stone-100">
          <h3 className="font-semibold text-stone-800 text-sm">Transaction History</h3>
        </div>
        {transactions.length === 0 ? (
          <div className="p-8 text-center text-stone-400 text-sm">No transactions yet</div>
        ) : (
          <div className="divide-y divide-stone-100">
            {transactions.map((tx: any) => (
              <div key={tx.id} className="px-5 py-4 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-stone-800 text-sm">{tx.service_name || `Order #${tx.order_id}`}</p>
                  <p className="text-xs text-stone-400">
                    {tx.buyer_name} · {new Date(tx.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-teal-600 text-sm">₦{Number(tx.seller_amount).toLocaleString()}</p>
                  <p className="text-xs text-stone-400">your payout</p>
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
  const [form, setForm] = useState({
    title: "", description: "", price: "", category: "",
    listing_type: "service", track_inventory: false,
    stock_quantity: 0, image: null as File | null,
  });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => { loadListings(); loadCategories(); }, []);

  const loadListings = async () => {
    try {
      const res = await fetchWithAuth(`${API_URL}/api/services/listings/`);
      const data = await res.json();
      setListings(toArray(data));
    } catch {} finally { setLoading(false); }
  };

  const loadCategories = async () => {
    try {
      const res = await fetchWithAuth(`${API_URL}/api/services/categories/`);
      const data = await res.json();
      setCategories(toArray(data));
    } catch {}
  };

  const openEdit = (listing: any) => {
    setEditing(listing);
    setForm({
      title: listing.title,
      description: listing.description,
      price: listing.price.toString(),
      category: listing.category,
      listing_type: listing.listing_type || "service",
      track_inventory: listing.track_inventory || false,
      stock_quantity: listing.stock_quantity || 0,
      image: null,
    });
    setShowForm(true);
  };

  const resetForm = () => {
    setForm({ title: "", description: "", price: "", category: "", listing_type: "service", track_inventory: false, stock_quantity: 0, image: null });
    setEditing(null);
    setShowForm(false);
  };

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 2500); };

  const handleSave = async () => {
    if (!form.title || !form.price || !form.category) return;
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("title", form.title);
      fd.append("description", form.description);
      fd.append("price", form.price);
      fd.append("category", form.category);
      fd.append("listing_type", form.listing_type);
      const isInventoryType = form.listing_type === "food" || form.listing_type === "product";
      fd.append("track_inventory", isInventoryType ? "true" : "false");
      fd.append("stock_quantity", isInventoryType ? form.stock_quantity.toString() : "0");
      if (form.image) fd.append("image", form.image);

      const url = editing
        ? `${API_URL}/api/services/listings/${editing.id}/`
        : `${API_URL}/api/services/listings/`;
      const res = await fetchWithAuth(url, { method: editing ? "PATCH" : "POST", body: fd });
      if (res.ok) { showToast(editing ? "Updated!" : "Created!"); resetForm(); loadListings(); }
      else showToast("Failed to save.");
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
      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full font-semibold text-white text-sm z-50 shadow-xl"
          style={{ background: GRAD }}>
          {toast}
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-bold text-stone-900 text-base">My Listings</h2>
          <p className="text-stone-400 text-xs">{listings.length} services</p>
        </div>
        <button onClick={() => { resetForm(); setShowForm(true); }}
          className="flex items-center gap-1.5 px-4 py-2 text-white rounded-full font-semibold text-sm transition active:scale-95"
          style={{ background: GRAD }}>
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>

      {showForm && (
        <div className="bg-white border border-stone-200 rounded-2xl p-5 mb-5 shadow-sm">
          <h3 className="font-semibold text-stone-800 mb-4 text-sm">{editing ? "Edit Listing" : "New Listing"}</h3>
          <div className="space-y-3">
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Title (e.g. Gel Manicure)"
              className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition placeholder:text-stone-400" />
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={3} placeholder="Describe your service..."
              className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition resize-none placeholder:text-stone-400" />
            <div className="grid grid-cols-2 gap-3">
              <input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                placeholder="Price (₦)"
                className="bg-white border border-stone-200 rounded-xl px-4 py-3 text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition" />
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="bg-white border border-stone-200 rounded-xl px-4 py-3 text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition">
                <option value="">Select category</option>
                {categories.map((cat: any) => (
                  <option key={cat.slug} value={cat.slug}>{cat.title}</option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-3 bg-white border border-dashed border-stone-300 rounded-xl px-4 py-3 cursor-pointer hover:border-teal-400 hover:bg-teal-50/30 transition">
              <ImageIcon className="w-4 h-4 text-stone-400" />
              <span className="text-sm text-stone-400">{form.image ? form.image.name : "Upload image"}</span>
              <input type="file" accept="image/*" className="hidden" onChange={e => setForm(f => ({ ...f, image: e.target.files?.[0] || null }))} />
            </label>
            <select value={form.listing_type} onChange={e => setForm(f => ({ ...f, listing_type: e.target.value }))}
              className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition">
              <option value="service">Service (e.g. nails, lashes)</option>
              <option value="food">Food (stock tracked)</option>
              <option value="product">Physical Product (stock tracked)</option>
            </select>
            {(form.listing_type === "food" || form.listing_type === "product") && (
              <div className="flex items-center gap-4 bg-stone-50 border border-stone-100 rounded-xl px-4 py-3">
                <div className="flex-1">
                  <p className="text-stone-800 text-sm font-semibold">Stock Quantity</p>
                  <p className="text-stone-400 text-xs">Auto-marks unavailable when stock hits 0</p>
                </div>
                <input type="number" min="0" value={form.stock_quantity}
                  onChange={e => setForm(f => ({ ...f, stock_quantity: parseInt(e.target.value) || 0, track_inventory: true }))}
                  className="w-20 bg-white border border-stone-200 rounded-lg px-3 py-2 text-stone-900 text-sm text-center focus:outline-none focus:border-teal-500" />
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={handleSave} disabled={saving || !form.title || !form.price || !form.category}
                className="flex-1 py-3 text-white disabled:opacity-40 rounded-full font-semibold text-sm transition active:scale-[0.98]"
                style={{ background: GRAD }}>
                {saving ? "Saving..." : editing ? "Update" : "Create Listing"}
              </button>
              <button onClick={resetForm}
                className="px-6 py-3 bg-stone-100 hover:bg-stone-200 rounded-full font-semibold text-stone-600 text-sm transition">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {listings.length === 0 ? (
        <EmptyState icon={Package} message="No listings yet. Add your first service!" />
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {listings.map(listing => (
            <div key={listing.id} className="bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm hover:border-teal-300 hover:shadow-md transition-all">
              {listing.image && (
                <img src={listing.image} alt={listing.title} loading="lazy" decoding="async" className="w-full h-36 object-cover" />
              )}
              <div className="p-4">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h3 className="font-semibold text-stone-900 text-sm">{listing.title}</h3>
                  <span className="font-bold text-teal-600 text-sm whitespace-nowrap">₦{Number(listing.price).toLocaleString()}</span>
                </div>
                <p className="text-stone-400 text-xs mb-2 line-clamp-2">{listing.description}</p>
                {listing.track_inventory && (
                  <p className={`text-xs font-semibold mb-2 ${listing.stock_quantity <= 3 ? "text-amber-600" : "text-teal-600"}`}>
                    📦 Stock: {listing.stock_quantity} remaining
                  </p>
                )}
                <div className="flex items-center justify-between">
                  <span className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg ${
                    listing.is_available ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-600"
                  }`}>
                    {listing.is_available ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                    {listing.is_available ? "Active" : "Pending Approval"}
                  </span>
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(listing)} className="p-2 bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded-lg transition">
                      <Edit2 className="w-3.5 h-3.5 text-stone-500" />
                    </button>
                    <button onClick={() => handleDelete(listing.id)} className="p-2 bg-red-50 hover:bg-red-100 border border-red-100 rounded-lg transition">
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    </button>
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

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetchWithAuth(`${API_URL}/api/orders/orders/`);
        const data = await res.json();
        setOrders(toArray(data));
      } catch {} finally { setLoading(false); }
    };
    load();
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="overflow-y-auto pb-4" style={{ maxHeight: "calc(100vh - 200px)" }}>
      <div className="mb-4">
        <h2 className="font-bold text-stone-900 text-base">Orders</h2>
        <p className="text-stone-400 text-xs">{orders.length} total</p>
      </div>
      {orders.length === 0 ? (
        <EmptyState icon={ShoppingBag} message="No orders yet" />
      ) : (
        <div className="space-y-3">
          {orders.map(order => (
            <div key={order.id} className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm hover:border-teal-300 hover:shadow-md transition-all">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-semibold text-stone-900 text-sm">{order.listing?.title}</p>
                  <p className="text-xs text-stone-400">#{order.reference}</p>
                </div>
                <StatusBadge status={order.status} />
              </div>
              <div className="flex items-center justify-between text-sm">
                <div>
                  <p className="text-xs text-stone-400">Buyer</p>
                  <p className="font-semibold text-stone-800">{order.buyer}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-stone-400">Order total</p>
                  <p className="font-semibold text-stone-800">₦{Number(order.amount).toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-stone-400">Your payout</p>
                  <p className="font-bold text-teal-600">
                    ₦{Math.max(0, Number(order.amount) - 205.56).toLocaleString()}
                  </p>
                </div>
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
    fetchWithAuth(`${API_URL}/api/reviews/reviews/?vendor=${user.id}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setReviews(Array.isArray(d) ? d : (d.results || [])); })
      .finally(() => setLoading(false));
  }, [user]);

  const avg = reviews.length
    ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
    : null;

  if (loading) return <LoadingSpinner />;

  return (
    <div className="overflow-y-auto pb-4 space-y-3" style={{ maxHeight: "calc(100vh - 200px)" }}>
      {reviews.length > 0 && (
        <div className="bg-white border border-amber-100 rounded-2xl p-4 shadow-sm flex items-center gap-4">
          <div className="text-center">
            <p className="text-3xl font-bold text-amber-500">{avg}</p>
            <div className="flex gap-0.5 mt-1 justify-center">
              {[1,2,3,4,5].map(s => (
                <Star key={s} className={`w-3.5 h-3.5 ${s <= Math.round(Number(avg)) ? "text-amber-400 fill-amber-400" : "text-stone-200 fill-stone-200"}`} />
              ))}
            </div>
          </div>
          <div>
            <p className="font-bold text-stone-800 text-sm">{reviews.length} Reviews</p>
            <p className="text-xs text-stone-400">From verified buyers</p>
          </div>
        </div>
      )}
      {reviews.length === 0 ? (
        <EmptyState icon={Star} message="No reviews yet. Complete orders to get rated!" />
      ) : (
        reviews.map(review => (
          <div key={review.id} className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-stone-800 text-sm">{review.reviewer_username}</span>
              <div className="flex gap-0.5">
                {[1,2,3,4,5].map(s => (
                  <Star key={s} className={`w-3.5 h-3.5 ${s <= review.rating ? "text-amber-400 fill-amber-400" : "text-stone-200 fill-stone-200"}`} />
                ))}
              </div>
            </div>
            {review.listing_title && (
              <p className="text-xs text-teal-600 font-medium mb-1">{review.listing_title}</p>
            )}
            {review.comment && (
              <p className="text-sm text-stone-600">{review.comment}</p>
            )}
            <p className="text-xs text-stone-400 mt-2">
              {new Date(review.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
            </p>
          </div>
        ))
      )}
    </div>
  );
}

/* ─── SHARED ─────────────────────────────────────────────────── */
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-amber-100 text-amber-700",
    confirmed: "bg-teal-50 text-teal-700",
    completed: "bg-emerald-50 text-emerald-700",
    cancelled: "bg-red-50 text-red-600",
    paid: "bg-blue-50 text-blue-700",
  };
  return (
    <span className={`${map[status] || "bg-stone-100 text-stone-500"} text-xs px-3 py-1 rounded-full font-medium capitalize`}>
      {status}
    </span>
  );
}

function EmptyState({ icon: Icon, message }: { icon: any; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-stone-300">
      <Icon className="w-10 h-10 mb-3 opacity-50" />
      <p className="font-medium text-stone-400 text-sm">{message}</p>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader className="w-7 h-7 text-teal-600 animate-spin" />
    </div>
  );
}
