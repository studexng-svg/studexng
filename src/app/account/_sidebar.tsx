"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/authStore";
import { GRAD } from "@/lib/tokens";
import { api } from "@/lib/api";
import {
  Package, Heart, Settings, HelpCircle, LogOut, ChevronRight,
  Banknote, LayoutDashboard, Calendar, Gift, Bell, Camera,
  MessageCircle, KeyRound,
} from "lucide-react";

const isApprovedVendor = (u: any) => !!u?.is_verified_vendor;

function VerifiedTick({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full flex-shrink-0" style={{ background: color }} title={label}>
      <svg viewBox="0 0 12 12" className="w-2.5 h-2.5" fill="none">
        <path d="M2.5 6L4.5 8.5L9.5 3.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function NavItem({ href, icon: Icon, iconColor = "#0d9488", label, badge, isActive }: {
  href: string; icon: React.ElementType; iconColor?: string;
  label: string; badge?: number; isActive?: boolean;
}) {
  return (
    <Link href={href}>
      <div className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors group ${isActive ? "bg-stone-100" : "hover:bg-stone-50"}`}>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: iconColor + "18" }}>
          <Icon className="w-4 h-4 flex-shrink-0" style={{ color: iconColor }} />
        </div>
        <span className={`flex-1 text-sm font-medium truncate ${isActive ? "text-stone-900 font-semibold" : "text-stone-700 group-hover:text-stone-900"}`}>{label}</span>
        {badge !== undefined && badge > 0 && (
          <span className="bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 flex-shrink-0">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
        <ChevronRight className="w-3.5 h-3.5 text-stone-300 flex-shrink-0 group-hover:text-stone-500" />
      </div>
    </Link>
  );
}

export default function AccountSidebarWrapper({ children }: { children: React.ReactNode }) {
  const { user, isLoggedIn, isHydrated, logout } = useAuth();
  const router   = useRouter();
  const pathname = usePathname();

  const [profilePic, setProfilePic]            = useState<string | null>(null);
  const [pendingOrders, setPendingOrders]      = useState(0);
  const [pendingBookings, setPendingBookings]  = useState(0);
  const [unreadMessages, setUnreadMessages]    = useState(0);
  const [unreadNotifs, setUnreadNotifs]        = useState(0);
  const [hasBankAccount, setHasBankAccount]    = useState(false);
  const [emailNotifs, setEmailNotifs]          = useState(true);
  const [emailNotifsLoading, setNotifsLoading] = useState(false);

  useEffect(() => { if (user?.profile_image) setProfilePic(user.profile_image); }, [user?.profile_image]);
  useEffect(() => {
    if (user?.profile?.email_notifications !== undefined)
      setEmailNotifs(!!user.profile.email_notifications);
  }, [user?.profile?.email_notifications]);

  useEffect(() => {
    if (!isHydrated || !isLoggedIn || !user) return;
    api.notifications.status()
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return;
        setUnreadNotifs(d.unread_notifications || 0);
        setUnreadMessages(d.unread_messages || 0);
        setPendingBookings(d.pending_bookings || 0);
        setPendingOrders(d.pending_orders || 0);
      }).catch(() => {});
    if (isApprovedVendor(user)) {
      api.payments.bankAccount()
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) setHasBankAccount(!!d?.account_number); })
        .catch(() => {});
    }
  }, [isHydrated, isLoggedIn, user]);

  const handleLogout = async () => {
    try { await api.auth.logout(); } catch {}
    logout();
    router.push("/auth");
  };

  const handleEmailToggle = async () => {
    const next = !emailNotifs;
    setEmailNotifs(next);
    setNotifsLoading(true);
    try {
      const res = await api.auth.updateProfile({ email_notifications: next });
      if (!res.ok) setEmailNotifs(!next);
    } catch { setEmailNotifs(!next); }
    finally { setNotifsLoading(false); }
  };

  const currentUser    = useAuth.getState().user ?? user;
  const vendorApproved = isApprovedVendor(currentUser);
  const isAdmin        = currentUser?.email === "studex.ng@gmail.com";
  const initials       = (currentUser?.username?.[0] || currentUser?.email?.[0] || "U").toUpperCase();
  const pic            = profilePic ?? user?.profile_image;

  return (
    <div className="min-h-screen bg-[#F4F5F7]" style={{ fontFamily: "'DM Sans', sans-serif" }}>

      {/* DESKTOP SIDEBAR */}
      <aside className="hidden lg:flex flex-col fixed left-0 top-0 bottom-0 w-72 bg-white border-r border-stone-100 z-30 overflow-hidden">

        <Link href="/account"
          className={`p-5 border-b border-stone-100 flex-shrink-0 block transition-colors ${pathname === "/account" ? "bg-stone-50" : "hover:bg-stone-50"}`}>
          <div className="flex items-center gap-3">
            <div className="relative flex-shrink-0">
              <div className="w-12 h-12 rounded-2xl overflow-hidden ring-2 ring-stone-100 shadow-sm">
                {pic
                  ? <img src={pic} alt="Profile" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-white text-base font-bold" style={{ background: GRAD }}>{initials}</div>
                }
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full border-2 border-white shadow flex items-center justify-center" style={{ background: "#0d9488" }}>
                <Camera className="w-2.5 h-2.5 text-white" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="font-bold text-stone-900 text-sm leading-tight truncate">{currentUser?.username || "Campus User"}</p>
                {isAdmin && <VerifiedTick color="#F59E0B" label="Admin" />}
                {!isAdmin && vendorApproved && <VerifiedTick color="#10b981" label="Verified Vendor" />}
              </div>
              <p className="text-xs text-stone-400 truncate mt-0.5">{currentUser?.email}</p>
            </div>
          </div>
        </Link>

        <nav className="flex-1 overflow-y-auto hide-scrollbar p-3 space-y-0.5">
          <p className="text-[10px] font-bold tracking-widest uppercase text-stone-400 px-3 pt-2 pb-1">My Account</p>
          <NavItem href="/account/orders"        icon={Package}       iconColor="#6366f1" label="My Orders"       badge={pendingOrders}  isActive={pathname.startsWith("/account/orders")} />
          <NavItem href="/account/bookings"      icon={Calendar}      iconColor="#0d9488" label="My Bookings"     badge={vendorApproved ? 0 : pendingBookings} isActive={pathname === "/account/bookings"} />
          <NavItem href="/chat"                  icon={MessageCircle} iconColor="#0d9488" label="Messages"        badge={unreadMessages} />
          <NavItem href="/account/notifications" icon={Bell}          iconColor="#f59e0b" label="Notifications"   badge={unreadNotifs}   isActive={pathname === "/account/notifications"} />
          <NavItem href="/account/loyalty"       icon={Gift}          iconColor="#10b981" label="Loyalty Rewards"                        isActive={pathname === "/account/loyalty"} />
          <NavItem href="/wishlist"              icon={Heart}         iconColor="#ec4899" label="Wishlist" />

          {vendorApproved && (
            <>
              <p className="text-[10px] font-bold tracking-widest uppercase text-stone-400 px-3 pt-4 pb-1">Vendor Tools</p>
              <NavItem href="/vendor/dashboard"     icon={LayoutDashboard} iconColor="#0d9488"                                label="Vendor Dashboard" />
              <NavItem href="/account/bank-account" icon={Banknote}        iconColor={hasBankAccount ? "#10b981" : "#f59e0b"} label={hasBankAccount ? "Payout Account" : "Add Payout Account"} isActive={pathname === "/account/bank-account"} />
            </>
          )}

          <p className="text-[10px] font-bold tracking-widest uppercase text-stone-400 px-3 pt-4 pb-1">Settings</p>
          <NavItem href="/account/address"         icon={Settings}  iconColor="#3b82f6" label="Address Book"    isActive={pathname === "/account/address"} />
          <NavItem href="/account/change-password" icon={KeyRound}  iconColor="#8b5cf6" label="Change Password" isActive={pathname === "/account/change-password"} />
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-stone-50 transition-colors">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "#0d9488" + "18" }}>
              <Bell className="w-4 h-4 flex-shrink-0" style={{ color: "#0d9488" }} />
            </div>
            <span className="flex-1 text-sm font-medium text-stone-700 truncate">Email Notifications</span>
            <button onClick={handleEmailToggle} disabled={emailNotifsLoading}
              className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors duration-200 disabled:opacity-50 ${emailNotifs ? "bg-teal-500" : "bg-stone-300"}`}>
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform duration-200 ${emailNotifs ? "translate-x-4" : "translate-x-0.5"}`} />
            </button>
          </div>

          <p className="text-[10px] font-bold tracking-widest uppercase text-stone-400 px-3 pt-4 pb-1">Help & Support</p>
          <NavItem href="/faq" icon={HelpCircle} iconColor="#14b8a6" label="FAQs & Help Center" />
        </nav>

        <div className="p-3 border-t border-stone-100 flex-shrink-0">
          <motion.button whileTap={{ scale: 0.98 }} onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-semibold text-red-500 hover:bg-red-50 transition-all">
            <div className="w-8 h-8 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
              <LogOut className="w-4 h-4 text-red-500" />
            </div>
            Log Out
          </motion.button>
        </div>
      </aside>

      {/* MAIN CONTENT (offset on desktop) */}
      <div className="lg:ml-72">
        {children}
      </div>
    </div>
  );
}
