// src/app/seller/page.tsx
"use client";

import { Package, DollarSign, TrendingUp, Plus, FileText, ChevronRight, Store, ArrowUpRight, ArrowDownRight, Eye, EyeOff, Wallet, Clock, Bell, Star, Link2, Share2, Check } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { api } from "../../../lib/api";
import { useAuth, fetchWithAuth } from "@/lib/authStore";
import { GRAD, SERIF } from "@/lib/tokens";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

interface Order {
  id: string;
  buyerName: string;
  sellerName: string;
  amount: number;
  date: string;
  status: string;
  type: "service" | "food";
  serviceDetails?: any;
  foodDetails?: any[];
}

export default function SellerDashboard() {
  const router = useRouter();
  const { user: authUser } = useAuth();
  const [isSeller, setIsSeller] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  const [walletBalance, setWalletBalance] = useState(0);
  const [showBalance, setShowBalance] = useState(true);
  const [inEscrow, setInEscrow] = useState(0);
  const [totalEarned, setTotalEarned] = useState(0);
  const [totalWithdrawn, setTotalWithdrawn] = useState(0);

  const [pendingOrders, setPendingOrders] = useState<Order[]>([]);

  const [linkCopied, setLinkCopied] = useState(false);

  const [vendorFeedbackRating, setVendorFeedbackRating] = useState(0);
  const [vendorFeedbackHovered, setVendorFeedbackHovered] = useState(0);
  const [vendorFeedbackComment, setVendorFeedbackComment] = useState("");
  const [vendorFeedbackSubmitting, setVendorFeedbackSubmitting] = useState(false);
  const [vendorFeedbackSent, setVendorFeedbackSent] = useState(false);
  const [vendorFeedbackError, setVendorFeedbackError] = useState("");

  const submitVendorFeedback = async () => {
    if (!vendorFeedbackRating) { setVendorFeedbackError("Please select a rating."); return; }
    setVendorFeedbackSubmitting(true); setVendorFeedbackError("");
    try {
      const res = await fetchWithAuth(`${API_URL}/api/reviews/submit-app-feedback/`, {
        method: "POST",
        body: JSON.stringify({ feedback_type: "vendor", rating: vendorFeedbackRating, comment: vendorFeedbackComment }),
      });
      if (res.ok) { setVendorFeedbackSent(true); }
      else {
        const d = await res.json();
        setVendorFeedbackError(d?.error || d?.detail || "Failed to submit feedback.");
      }
    } catch { setVendorFeedbackError("Network error. Please try again."); }
    finally { setVendorFeedbackSubmitting(false); }
  };

  useEffect(() => {
    const accessToken = localStorage.getItem("accessToken");

    if (!accessToken) {
      router.push("/auth");
      return;
    }

    api.getProfile()
      .then(async (profile) => {
        if (profile.is_verified_vendor) {
          setIsSeller(true);
          setWalletBalance(parseFloat(profile.wallet_balance || "0"));

          const token = localStorage.getItem("access_token");

          try {
            const ordersRes = await fetch(`${API_URL}/api/orders/orders/?status=pending_confirmation`, {
              headers: { Authorization: `Bearer ${token}` }
            });

            if (ordersRes.ok) {
              const ordersData = await ordersRes.json();
              const orders = ordersData.results || ordersData || [];

              const mappedOrders = orders.map((order: any) => ({
                id: order.id.toString(),
                buyerName: order.buyer?.username || order.buyer?.email || "Unknown",
                sellerName: profile.username,
                amount: parseFloat(order.amount || 0),
                date: order.created_at,
                status: order.status,
                type: "service" as const,
                serviceDetails: { serviceName: order.listing?.title || "Service" }
              }));

              setPendingOrders(mappedOrders);
              const escrowAmount = mappedOrders.reduce((sum: number, o: Order) => sum + o.amount, 0);
              setInEscrow(escrowAmount);
            }

            const allOrdersRes = await fetch(`${API_URL}/api/orders/orders/`, {
              headers: { Authorization: `Bearer ${token}` }
            });

            if (allOrdersRes.ok) {
              const allOrdersData = await allOrdersRes.json();
              const allOrders = allOrdersData.results || allOrdersData || [];

              const completedOrders = allOrders.filter((o: any) => o.status === "completed");
              const earnedAmount = completedOrders.reduce((sum: number, o: any) => sum + parseFloat(o.amount || 0), 0);
              setTotalEarned(earnedAmount);

            }

            setTotalWithdrawn(0);
          } catch (err) {
            setPendingOrders([]);
            setInEscrow(0);
            setTotalEarned(0);
            setTotalWithdrawn(0);
          }
        } else {
          setIsSeller(false);
          router.push("/seller/onboarding");
        }
      })
      .catch(() => router.push("/auth"))
      .finally(() => setLoading(false));
  }, [authUser, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFAF9] flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isSeller === null || !isSeller) return null;

  const stats = [
    {
      label: "Pending",
      value: pendingOrders.length.toString(),
      change: "Awaiting",
      trend: "up" as const,
      icon: Clock,
      color: "text-amber-600",
      bg: "bg-amber-50",
    },
    {
      label: "Earnings",
      value: `₦${totalEarned.toLocaleString()}`,
      change: "Total",
      trend: "up" as const,
      icon: DollarSign,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
    {
      label: "Escrow",
      value: `₦${inEscrow.toLocaleString()}`,
      change: inEscrow > 0 ? "Pending" : "None",
      trend: "down" as const,
      icon: TrendingUp,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
  ];

  const menu = [
    { label: "Pending Orders", href: "/seller/orders", icon: Package, badge: pendingOrders.length },
    { label: "Add Service", href: "/seller/add", icon: Plus },
    { label: "My Listings", href: "/seller/listings", icon: FileText },
    { label: "Payouts", href: "/seller/payouts", icon: DollarSign },
  ];

  const graphData = [65, 78, 72, 90, 85, 95, 88];
  const maxHeight = Math.max(...graphData);

  return (
    <div className="min-h-screen bg-[#FAFAF9]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      {/* HEADER */}
      <div className="sticky top-0 bg-white/80 backdrop-blur-md z-40 border-b border-stone-100 shadow-sm">
        <div className="flex items-center justify-between px-4 py-3 max-w-2xl mx-auto">
          <div className="flex items-center gap-2">
            <Store className="w-5 h-5 text-teal-600" />
            <h1 className="text-base font-bold text-stone-900" style={SERIF}>
              Seller Hub
            </h1>
          </div>
          <Link href="/seller/orders">
            <button
              className="relative p-2.5 text-white rounded-full shadow-sm active:scale-95 transition-all"
              style={{ background: GRAD }}
            >
              <Bell className="w-4 h-4" />
              {pendingOrders.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-xs font-bold text-white">
                  {pendingOrders.length}
                </span>
              )}
            </button>
          </Link>
        </div>
      </div>

      <div className="px-4 pt-6 pb-32 space-y-5 max-w-2xl mx-auto">
        {/* PENDING ORDERS ALERT */}
        {pendingOrders.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
            <div className="w-9 h-9 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
              <Clock className="w-4 h-4 text-amber-600" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-amber-900 text-sm">
                {pendingOrders.length} Order{pendingOrders.length !== 1 ? "s" : ""} Waiting
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                Mark these orders as complete to notify buyers
              </p>
              <Link href="/seller/orders">
                <button className="mt-2 px-4 py-1.5 bg-amber-600 text-white font-semibold rounded-full text-xs hover:bg-amber-700 transition">
                  View Orders →
                </button>
              </Link>
            </div>
          </div>
        )}

        {/* RECENT PENDING ORDERS PREVIEW */}
        {pendingOrders.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-stone-700">Recent Orders to Complete</h3>
            {pendingOrders.slice(0, 2).map((order, i) => (
              <Link key={order.id} href={`/seller/orders/${order.id}`}>
                <motion.div
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="bg-white border border-stone-200 rounded-2xl p-4 hover:border-teal-300 hover:shadow-md transition-all"
                >
                  <div className="flex justify-between items-start mb-1.5">
                    <div>
                      <p className="font-semibold text-stone-900 text-sm">{order.buyerName}</p>
                      <p className="text-xs text-stone-500">
                        {order.type === "service" ? order.serviceDetails?.serviceName : "Food Order"}
                      </p>
                    </div>
                    <p className="font-bold text-teal-600 text-sm">₦{order.amount.toLocaleString()}</p>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-stone-400">
                    <Clock className="w-3 h-3" />
                    {new Date(order.date).toLocaleDateString()}
                  </div>
                </motion.div>
              </Link>
            ))}
            {pendingOrders.length > 2 && (
              <Link href="/seller/orders">
                <p className="text-xs font-semibold text-teal-600 text-center py-1">
                  +{pendingOrders.length - 2} more pending...
                </p>
              </Link>
            )}
          </div>
        )}

        {/* WALLET CARD */}
        <div
          className="rounded-2xl p-5 text-white shadow-md relative overflow-hidden"
          style={{ background: GRAD }}
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -translate-y-12 translate-x-12 pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-20 h-20 bg-white/10 rounded-full translate-y-10 -translate-x-10 pointer-events-none" />

          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Wallet className="w-5 h-5" />
                <span className="font-semibold text-sm opacity-90">Available Balance</span>
              </div>
              <button
                onClick={() => setShowBalance(!showBalance)}
                className="p-1.5 hover:bg-white/20 rounded-full transition"
              >
                {showBalance ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </button>
            </div>

            <div className="mb-5">
              <p className="text-3xl font-bold">
                {showBalance ? `₦${walletBalance.toLocaleString()}` : "₦••••••"}
              </p>
              <p className="text-xs opacity-75 mt-0.5">Same wallet as your account</p>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-5">
              <div className="bg-white/10 rounded-xl p-3">
                <p className="text-xs opacity-75">In Escrow</p>
                <p className="text-base font-bold">₦{inEscrow.toLocaleString()}</p>
              </div>
              <div className="bg-white/10 rounded-xl p-3">
                <p className="text-xs opacity-75">Total Earned</p>
                <p className="text-base font-bold">₦{totalEarned.toLocaleString()}</p>
              </div>
              <div className="bg-white/10 rounded-xl p-3">
                <p className="text-xs opacity-75">Withdrawn</p>
                <p className="text-base font-bold">₦{totalWithdrawn.toLocaleString()}</p>
              </div>
            </div>

            <div className="flex gap-3">
              <Link href="/account" className="flex-1">
                <button className="w-full bg-white text-teal-700 py-2.5 rounded-full font-semibold shadow flex items-center justify-center gap-1.5 text-sm active:scale-[0.98] transition-all">
                  <Wallet className="w-4 h-4" />
                  View Wallet
                </button>
              </Link>
              <Link href="/wallet/withdraw">
                <button className="bg-white/20 hover:bg-white/30 text-white px-5 py-2.5 rounded-full font-semibold shadow transition">
                  <ArrowUpRight className="w-4 h-4" />
                </button>
              </Link>
            </div>
          </div>
        </div>

        {/* STATS GRID */}
        <div className="grid grid-cols-3 gap-3">
          {stats.map((s, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.08 }}
              className="bg-white border border-stone-200 rounded-2xl p-4 text-center shadow-sm"
            >
              <div className={`w-10 h-10 mx-auto mb-2 rounded-full ${s.bg} flex items-center justify-center`}>
                <s.icon className={`w-5 h-5 ${s.color}`} />
              </div>
              <p className="text-lg font-bold text-teal-600 truncate">{s.value}</p>
              <p className="text-xs text-stone-400 mt-0.5">{s.label}</p>
              <div className={`flex items-center justify-center gap-0.5 mt-1.5 text-xs font-medium ${
                s.trend === "up" ? "text-emerald-600" : "text-blue-600"
              }`}>
                {s.trend === "up" ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {s.change}
              </div>
            </motion.div>
          ))}
        </div>

        {/* QUICK ACTIONS */}
        <div className="space-y-2">
          {menu.map((m, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.08 }}
            >
              <Link href={m.href}>
                <div className="bg-white border border-stone-200 rounded-2xl p-4 flex items-center justify-between shadow-sm hover:border-teal-300 hover:shadow-md transition-all">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-teal-50 flex items-center justify-center">
                      <m.icon className="w-5 h-5 text-teal-600" />
                    </div>
                    <span className="font-semibold text-stone-800 text-sm">{m.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {m.badge !== undefined && m.badge > 0 && (
                      <span className="w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-xs font-bold text-white">
                        {m.badge}
                      </span>
                    )}
                    <ChevronRight className="w-4 h-4 text-stone-300" />
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>

        {/* SHARE PROFILE */}
        {authUser?.username && (
          <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
            <p className="text-xs font-semibold text-stone-500 mb-3 uppercase tracking-wide">Share your store</p>
            <div className="flex items-center gap-2 bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 mb-3">
              <Link2 className="w-4 h-4 text-teal-500 flex-shrink-0" />
              <p className="text-sm text-stone-700 truncate flex-1 font-medium">
                studex.com.ng/vendor/{authUser.username}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`https://studex.com.ng/vendor/${authUser.username}`);
                  setLinkCopied(true);
                  setTimeout(() => setLinkCopied(false), 2000);
                }}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-full border border-stone-200 text-stone-700 font-semibold text-sm hover:border-teal-400 hover:text-teal-600 transition-all active:scale-95"
              >
                {linkCopied ? <Check className="w-4 h-4 text-teal-500" /> : <Link2 className="w-4 h-4" />}
                {linkCopied ? "Copied!" : "Copy Link"}
              </button>
              {typeof navigator !== "undefined" && "share" in navigator && (
                <button
                  onClick={() => {
                    navigator.share({
                      title: `${authUser.username} on StudEx`,
                      text: `Check out my store on StudEx`,
                      url: `https://studex.com.ng/vendor/${authUser.username}`,
                    }).catch(() => {});
                  }}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-full text-white font-semibold text-sm active:scale-95 transition-all"
                  style={{ background: GRAD }}
                >
                  <Share2 className="w-4 h-4" />
                  Share
                </button>
              )}
            </div>
          </div>
        )}

        {/* MINI EARNINGS CHART */}
        {walletBalance > 0 && (
          <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm">
            <p className="text-xs font-semibold text-stone-600 mb-4">Weekly Performance</p>
            <div className="flex items-end gap-1 h-14">
              {graphData.map((h, i) => (
                <motion.div
                  key={i}
                  initial={{ height: 0 }}
                  animate={{ height: (h / maxHeight) * 56 }}
                  transition={{ delay: i * 0.05, duration: 0.4 }}
                  className="flex-1 bg-teal-400 rounded-t-md"
                />
              ))}
            </div>
            <p className="text-xs text-stone-400 mt-2">Earnings trend — last 7 days</p>
          </div>
        )}

        {/* PRO TIP */}
        <div className="bg-teal-50 border border-teal-100 rounded-2xl p-4 flex items-center gap-3">
          <div className="w-9 h-9 bg-teal-600 rounded-full flex items-center justify-center text-white text-sm flex-shrink-0">
            💡
          </div>
          <p className="text-sm text-stone-700">
            Complete orders quickly to get more ⭐ ratings!
          </p>
        </div>

        {/* VENDOR FEEDBACK */}
        {vendorFeedbackSent ? (
          <div className="bg-teal-50 border border-teal-200 rounded-2xl p-5 text-center">
            <p className="font-bold text-teal-800">Thanks for your feedback!</p>
            <p className="text-sm text-teal-700 mt-1">We use it to improve StudEx for vendors.</p>
          </div>
        ) : (
          <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm space-y-4">
            <div>
              <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-semibold">Vendor Feedback</p>
              <h3 className="text-lg font-bold text-stone-900 mt-0.5" style={SERIF}>
                How&apos;s selling on StudEx?
              </h3>
              <p className="text-sm text-stone-400 mt-0.5">Your feedback helps us build a better platform</p>
            </div>

            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map(star => (
                <motion.button key={star} whileTap={{ scale: 0.8 }}
                  onClick={() => setVendorFeedbackRating(star)}
                  onMouseEnter={() => setVendorFeedbackHovered(star)}
                  onMouseLeave={() => setVendorFeedbackHovered(0)}>
                  <Star className={`w-9 h-9 transition-all ${
                    star <= (vendorFeedbackHovered || vendorFeedbackRating) ? "fill-amber-400 text-amber-400" : "text-stone-200"
                  }`} />
                </motion.button>
              ))}
            </div>

            {vendorFeedbackRating > 0 && (
              <p className="text-sm font-semibold text-teal-600 -mt-1">
                {["", "Poor", "Fair", "Good", "Great", "Excellent!"][vendorFeedbackRating]}
              </p>
            )}

            <textarea
              value={vendorFeedbackComment}
              onChange={e => setVendorFeedbackComment(e.target.value)}
              placeholder="What can we improve for sellers? (optional)"
              rows={2}
              className="w-full px-4 py-3 rounded-xl border border-stone-200 text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 bg-white placeholder:text-stone-400 resize-none transition"
            />

            {vendorFeedbackError && <p className="text-red-500 text-sm">{vendorFeedbackError}</p>}

            <motion.button
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
              onClick={submitVendorFeedback}
              disabled={vendorFeedbackSubmitting || !vendorFeedbackRating}
              className="w-full py-3 rounded-full font-semibold text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              style={{ background: GRAD }}>
              {vendorFeedbackSubmitting ? "Submitting..." : "Submit Feedback"}
            </motion.button>
          </div>
        )}
      </div>
    </div>
  );
}
