"use client";

import { Package, Heart, Settings, HelpCircle, LogOut, ChevronRight, Store, Clock, ArrowRight, Loader, Banknote, LayoutDashboard, Calendar, Gift, Bell, X, CheckCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import ThemeToggle from "@/components/ThemeToggle";
import { useAuth, fetchWithAuth } from "@/lib/authStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

// A user is a vendor if admin has verified them (is_verified_vendor=true)
// OR if they have user_type="vendor" AND is_verified_vendor=true.
// is_verified_vendor is the single source of truth set by admin.
const isApprovedVendor = (u: { user_type?: string; is_verified_vendor?: boolean } | null) =>
  !!u?.is_verified_vendor;

// Pending = user applied (user_type=vendor) but admin hasn't verified yet
const isPendingVendor = (u: { user_type?: string; is_verified_vendor?: boolean } | null) =>
  u?.user_type === "vendor" && !u?.is_verified_vendor;

export default function AccountPage() {
  const router = useRouter();
  const { user, isLoggedIn, isHydrated, logout } = useAuth();

  const [loading, setLoading] = useState(true);
  const [hasBankAccount, setHasBankAccount] = useState(false);
  const [pendingBookings, setPendingBookings] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [pendingOrders, setPendingOrders] = useState(0);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    if (isHydrated && !isLoggedIn) router.push("/auth");
  }, [isHydrated, isLoggedIn, router]);

  useEffect(() => {
    if (!isHydrated || !isLoggedIn) return;

    const fetchData = async () => {
      try {
        // Always fetch fresh user data — catches admin approve/revoke instantly
        try {
          const meRes = await fetchWithAuth(`${API_URL}/api/auth/me/`);
          if (meRes.ok) {
            const freshUser = await meRes.json();
            useAuth.getState().updateUser(freshUser);
          }
        } catch {}

        // Get the freshest user from store (just updated above)
        const freshUser = useAuth.getState().user;
        const isVendor = isApprovedVendor(freshUser);

        // Bank account (only relevant for vendors)
        if (isVendor) {
          try {
            const bankRes = await fetchWithAuth(`${API_URL}/api/payments/seller/bank-account/`);
            if (bankRes.ok) {
              const bankData = await bankRes.json();
              setHasBankAccount(!!bankData?.account_number);
            }
          } catch {}
        }

        // Badge counts
        try {
          const bkRes = await fetchWithAuth(`${API_URL}/api/orders/bookings/`);
          if (bkRes.ok) {
            const bkData = await bkRes.json();
            const bkList = Array.isArray(bkData) ? bkData : (bkData.results || []);
            if (isVendor) {
              // Only count bookings made TO this vendor (not bookings they made as a buyer)
              const vendorBookings = bkList.filter((b: any) => b.vendor_username === freshUser?.username);
              setPendingBookings(vendorBookings.filter((b: any) => b.status === "pending").length);
            } else {
              setPendingBookings(bkList.filter((b: any) => b.status === "confirmed").length);
            }
          }
        } catch {}

        try {
          const msgRes = await fetchWithAuth(`${API_URL}/api/chat/conversations/`);
          if (msgRes.ok) {
            const msgData = await msgRes.json();
            const convList = Array.isArray(msgData) ? msgData : (msgData.results || []);
            setUnreadMessages(convList.filter((c: any) => c.unread_count > 0).length);
          }
        } catch {}

        try {
          const ordRes = await fetchWithAuth(`${API_URL}/api/orders/orders/`);
          if (ordRes.ok) {
            const ordData = await ordRes.json();
            const ordList = Array.isArray(ordData) ? ordData : (ordData.results || []);
            setPendingOrders(ordList.filter((o: any) => o.status === "seller_completed").length);
          }
        } catch {}

        // Fetch notifications
        try {
          const notifRes = await fetchWithAuth(`${API_URL}/api/notifications/`);
          if (notifRes.ok) {
            const notifData = await notifRes.json();
            setNotifications(notifData.notifications || []);
            setUnreadNotifications(notifData.unread_count || 0);
          }
        } catch {}

      } catch (err) {
        console.error("Failed to load account data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [isHydrated, isLoggedIn]);

  const handleLogout = () => {
    logout();
    router.push("/auth");
  };

  const markAllRead = async () => {
    try {
      await fetchWithAuth(`${API_URL}/api/notifications/read-all/`, { method: 'POST' });
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadNotifications(0);
    } catch {}
  };

  const fadeInUp = { initial: { opacity: 0, y: 20 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true }, transition: { duration: 0.5 } };
  const cardHover = { whileHover: { y: -4, scale: 1.02 }, whileTap: { scale: 0.98 } };

  if (!isHydrated || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-teal-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 flex items-center justify-center">
        <div className="text-center">
          <Loader className="w-12 h-12 text-purple-600 dark:text-purple-400 mx-auto mb-4 animate-spin" />
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  // Derive vendor status from freshest store value
  const currentUser = useAuth.getState().user ?? user;
  const vendorApproved = isApprovedVendor(currentUser);
  const vendorPending = isPendingVendor(currentUser);

  return (
    <>
      <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        className="sticky top-0 bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl z-40 border-b border-purple-100 dark:border-gray-800 shadow-sm">
        <div className="flex items-center justify-between p-4 max-w-4xl mx-auto">
          <Link href="/home" className="flex items-center">
            <Image src="/images/logo-1.jpg" alt="StudEx Logo" width={140} height={40} className="h-10 w-auto object-contain" priority />
          </Link>
          <h1 className="text-xl font-black bg-gradient-to-r from-purple-600 to-teal-500 bg-clip-text text-transparent">My Account</h1>
          <div className="flex items-center gap-2">
            <div className="relative">
              <button onClick={() => setShowNotifications(v => !v)}
                className="relative w-10 h-10 bg-purple-100 dark:bg-purple-900/40 rounded-full flex items-center justify-center hover:bg-purple-200 dark:hover:bg-purple-800 transition-colors">
                <Bell className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                {unreadNotifications > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-black rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                    {unreadNotifications > 99 ? "99+" : unreadNotifications}
                  </span>
                )}
              </button>

              {/* Notifications Dropdown */}
              {showNotifications && (
                <div className="absolute right-0 top-12 w-80 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-700 z-50 overflow-hidden">
                  <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-700">
                    <h3 className="font-bold text-gray-900 dark:text-white">Notifications</h3>
                    <div className="flex items-center gap-2">
                      {unreadNotifications > 0 && (
                        <button onClick={markAllRead} className="text-xs text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1">
                          <CheckCheck className="w-3 h-3" /> Mark all read
                        </button>
                      )}
                      <button onClick={() => setShowNotifications(false)} className="text-gray-400 hover:text-gray-600">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center text-gray-500 dark:text-gray-400 text-sm">
                        No notifications yet
                      </div>
                    ) : (
                      notifications.map((n: any) => (
                        <div key={n.id} className={`p-4 border-b border-gray-50 dark:border-gray-700 last:border-0 ${!n.is_read ? 'bg-purple-50 dark:bg-purple-900/20' : ''}`}>
                          <div className="flex items-start gap-3">
                            <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${!n.is_read ? 'bg-purple-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-sm text-gray-900 dark:text-white">{n.title}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{n.message}</p>
                              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                                {new Date(n.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            <ThemeToggle />
          </div>
        </div>
      </motion.div>

      <div className="p-4 pb-24 space-y-5 max-w-3xl mx-auto bg-[#FFF8F0] dark:bg-gray-950 min-h-screen">

        {/* Profile Card */}
        <motion.div {...fadeInUp} className="bg-gradient-to-br from-purple-500/10 via-teal-500/10 to-white dark:from-purple-500/20 dark:via-teal-500/20 dark:to-gray-800 backdrop-blur-lg rounded-2xl p-5 shadow-lg border border-white/30 dark:border-gray-700/30">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-teal-500 rounded-full flex items-center justify-center text-white text-xl font-black shadow-lg">
                {currentUser?.username?.[0]?.toUpperCase() || currentUser?.email?.[0]?.toUpperCase() || "U"}
              </div>
              <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 rounded-full border-2 border-white dark:border-gray-900" />
            </div>
            <div className="flex-1">
              <p className="text-lg font-black bg-gradient-to-r from-purple-600 to-teal-500 bg-clip-text text-transparent">
                {currentUser?.username || "Campus Hustler"}
              </p>
              <p className="text-sm font-medium text-teal-600 dark:text-teal-400">{currentUser?.email}</p>
              {vendorApproved && (
                <span className="inline-block mt-1 text-xs font-bold bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 px-2 py-0.5 rounded-full">
                  ✓ Verified Vendor
                </span>
              )}
              {vendorPending && (
                <span className="inline-block mt-1 text-xs font-bold bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300 px-2 py-0.5 rounded-full">
                  ⏳ Pending Approval
                </span>
              )}
            </div>
          </div>
        </motion.div>

        {/* ─── VENDOR HUB BUTTON (approved vendors only) ─── */}
        {vendorApproved && (
          <motion.div {...fadeInUp}>
            <Link href="/vendor/dashboard">
              <motion.div {...cardHover}
                className="flex items-center justify-between p-4 bg-gradient-to-r from-purple-900/40 to-teal-900/40 dark:from-purple-900/60 dark:to-teal-900/60 border border-teal-500/40 rounded-2xl shadow-lg">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 bg-gradient-to-br from-teal-500 to-purple-600 rounded-xl flex items-center justify-center shadow-md">
                    <LayoutDashboard className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-black text-gray-900 dark:text-white">Vendor Hub</p>
                      {(unreadMessages > 0 || pendingBookings > 0) && (
                        <span className="bg-red-500 text-white text-xs font-black rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5">
                          {unreadMessages + pendingBookings}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Messages, bookings, earnings & listings</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </motion.div>
            </Link>
          </motion.div>
        )}

        {/* Bank Account Banner (approved vendors only) */}
        {vendorApproved && (
          <motion.div {...fadeInUp} className={`rounded-2xl p-4 ${hasBankAccount
            ? 'bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-800'
            : 'bg-gradient-to-br from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20 border border-yellow-200 dark:border-yellow-800'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${hasBankAccount ? 'bg-green-100 dark:bg-green-900/40' : 'bg-yellow-100 dark:bg-yellow-900/40'}`}>
                  <Banknote className={`w-5 h-5 ${hasBankAccount ? 'text-green-600' : 'text-yellow-600'}`} />
                </div>
                <div>
                  <p className={`font-bold text-sm ${hasBankAccount ? 'text-green-800 dark:text-green-300' : 'text-yellow-800 dark:text-yellow-300'}`}>
                    {hasBankAccount ? 'Payout Account Set' : 'Payout Account Required'}
                  </p>
                  <p className={`text-xs ${hasBankAccount ? 'text-green-700 dark:text-green-400' : 'text-yellow-700 dark:text-yellow-400'}`}>
                    {hasBankAccount ? 'Your sales commission will be sent here' : 'Add your bank account to receive payments'}
                  </p>
                </div>
              </div>
              <Link href="/account/bank-account">
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                  className={`px-4 py-2 rounded-full text-sm font-bold text-white ${hasBankAccount ? 'bg-green-600 hover:bg-green-700' : 'bg-yellow-600 hover:bg-yellow-700'}`}>
                  {hasBankAccount ? 'Update' : 'Add'}
                </motion.button>
              </Link>
            </div>
          </motion.div>
        )}

        {/* Pending Approval Banner */}
        {vendorPending && (
          <motion.div {...fadeInUp} className="bg-gradient-to-br from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20 border border-yellow-300 dark:border-yellow-800 rounded-2xl p-5 flex items-center gap-4">
            <Clock className="w-8 h-8 text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-bold text-yellow-800 dark:text-yellow-300">Vendor Application Pending</p>
              <p className="text-sm text-yellow-700 dark:text-yellow-400 mt-1">We're reviewing your application. You'll be notified once approved!</p>
            </div>
          </motion.div>
        )}

        {/* Menu Items */}
        <motion.div {...fadeInUp} className="space-y-3">
          {[
            { href: "/account/orders", icon: Package, label: "My Orders", color: "from-purple-500 to-purple-600", badge: pendingOrders },
            { href: "/account/bookings", icon: Calendar, label: "My Bookings", color: "from-teal-500 to-emerald-500", badge: vendorApproved ? 0 : pendingBookings },
            { href: "/account/loyalty", icon: Gift, label: "Loyalty Rewards", color: "from-amber-400 to-orange-500", badge: 0 },
            { href: "/wishlist", icon: Heart, label: "Wishlist", color: "from-pink-500 to-rose-500", badge: 0 },
            { href: "/account/address", icon: Settings, label: "Address Book", color: "from-indigo-500 to-blue-600", badge: 0 },
            { href: "/faq", icon: HelpCircle, label: "Help & Support", color: "from-teal-500 to-cyan-600", badge: 0 },
          ].map((item, i) => (
            <motion.div key={item.href} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}>
              <Link href={item.href}>
                <motion.div {...cardHover} className="bg-white dark:bg-gray-800 rounded-2xl p-4 flex items-center justify-between shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md transition-all">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${item.color} flex items-center justify-center shadow-md`}>
                      <item.icon className="w-5 h-5 text-white" />
                    </div>
                    <span className="font-semibold text-gray-800 dark:text-gray-200 text-sm">{item.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {item.badge > 0 && (
                      <span className="bg-red-500 text-white text-xs font-black rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5">
                        {item.badge > 99 ? "99+" : item.badge}
                      </span>
                    )}
                    <ChevronRight className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                  </div>
                </motion.div>
              </Link>
            </motion.div>
          ))}
        </motion.div>

        {/* Become a Vendor CTA — only for non-vendors (not pending, not approved) */}
        {!vendorApproved && !vendorPending && (
          <motion.div {...fadeInUp} className="bg-gradient-to-br from-purple-600 via-purple-500 to-teal-500 rounded-2xl p-5 text-white shadow-xl relative overflow-hidden">
            <div className="absolute inset-0 bg-black/10" />
            <div className="relative z-10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center">
                  <Store className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-lg font-black">Become a Vendor</p>
                  <p className="text-xs opacity-90">Earn on campus. List now.</p>
                </div>
              </div>
              <Link href="/seller/onboarding">
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                  className="bg-white text-purple-600 px-4 py-2 rounded-full text-sm font-bold shadow-lg flex items-center gap-2">
                  Start <ArrowRight className="w-4 h-4" />
                </motion.button>
              </Link>
            </div>
          </motion.div>
        )}

        {/* Logout */}
        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={handleLogout}
          className="w-full mt-6 py-4 bg-gradient-to-r from-red-500 to-rose-600 text-white rounded-2xl font-bold text-base shadow-lg flex items-center justify-center gap-3">
          <LogOut className="w-5 h-5" />
          Logout
        </motion.button>
      </div>
    </>
  );
}
