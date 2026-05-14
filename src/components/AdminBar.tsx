"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield, X, LayoutDashboard, ShoppingCart, Users,
  UserCheck, AlertTriangle, DollarSign, BarChart2,
} from "lucide-react";
import { useAdminMode } from "@/hooks/useAdminMode";
import { GRAD } from "@/lib/tokens";

const LINKS = [
  { label: "Dashboard",    icon: LayoutDashboard, href: "/admin" },
  { label: "Analytics",    icon: BarChart2,        href: "/admin/analytics" },
  { label: "Orders",       icon: ShoppingCart,     href: "/admin/orders" },
  { label: "Users",        icon: Users,            href: "/admin/users" },
  { label: "Sellers",      icon: UserCheck,        href: "/admin/sellers" },
  { label: "Approvals",    icon: UserCheck,        href: "/admin/seller-approvals" },
  { label: "Disputes",     icon: AlertTriangle,    href: "/admin/disputes" },
  { label: "Payouts",      icon: DollarSign,       href: "/admin/payouts" },
];

export default function AdminBar() {
  const { isAdmin } = useAdminMode();
  const [open, setOpen] = useState(false);

  if (!isAdmin) return null;

  return (
    <div className="fixed bottom-24 right-4 z-[60] flex flex-col items-end gap-2">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 8 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
            className="bg-white rounded-2xl shadow-2xl border border-stone-100 overflow-hidden w-48 mb-1"
          >
            <div className="px-4 py-2.5 border-b border-stone-100" style={{ background: "linear-gradient(135deg,rgba(13,148,136,.08),rgba(124,58,237,.08))" }}>
              <p className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Admin Mode</p>
            </div>
            {LINKS.map(({ label, icon: Icon, href }) => (
              <Link key={href} href={href} onClick={() => setOpen(false)}>
                <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-stone-50 transition border-b border-stone-50 last:border-0 cursor-pointer">
                  <Icon className="w-3.5 h-3.5 text-teal-600 flex-shrink-0" />
                  <span className="text-sm font-medium text-stone-700">{label}</span>
                </div>
              </Link>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
        onClick={() => setOpen(v => !v)}
        title="Admin Panel"
        className="w-12 h-12 rounded-full shadow-lg flex items-center justify-center relative"
        style={{ background: GRAD }}
      >
        {open
          ? <X className="w-5 h-5 text-white" />
          : <Shield className="w-5 h-5 text-white" />
        }
        {/* Pulse ring to signal admin mode */}
        {!open && (
          <span className="absolute inset-0 rounded-full animate-ping opacity-30"
            style={{ background: GRAD }} />
        )}
      </motion.button>
    </div>
  );
}
