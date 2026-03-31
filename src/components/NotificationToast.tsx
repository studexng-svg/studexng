// src/components/NotificationToast.tsx
/**
 * NotificationToast — the sliding real-time notification popups.
 *
 * Renders a stack of up to 5 toasts in the top-right corner (desktop)
 * or top-center (mobile). Each toast:
 *   - Slides in from the right with a spring animation
 *   - Shows an icon based on notification type
 *   - Has a progress bar that drains over 6 seconds
 *   - Can be dismissed with the X button
 *   - Navigates to action_url on click
 *   - Slides out smoothly on dismiss
 *
 * Uses it in your root layout:
 *   <NotificationToastContainer />
 */

"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { X, Bell, Calendar, ShoppingCart, CheckCircle, AlertTriangle, Star, Package } from "lucide-react";
import { ToastItem } from "@/hooks/useNotifications";

// ── Icon + color map by notification type ────────────────────────────────────
const TYPE_CONFIG: Record<string, { icon: React.ElementType; bg: string; iconColor: string; bar: string }> = {
  booking_reminder:  { icon: Calendar,     bg: "bg-purple-50",  iconColor: "text-purple-600", bar: "bg-purple-500" },
  booking_confirmed: { icon: CheckCircle,  bg: "bg-green-50",   iconColor: "text-green-600",  bar: "bg-green-500"  },
  order_update:      { icon: Package,      bg: "bg-blue-50",    iconColor: "text-blue-600",   bar: "bg-blue-500"   },
  new_order:         { icon: ShoppingCart, bg: "bg-teal-50",    iconColor: "text-teal-600",   bar: "bg-teal-500"   },
  seller_approved:   { icon: CheckCircle,  bg: "bg-green-50",   iconColor: "text-green-600",  bar: "bg-green-500"  },
  seller_rejected:   { icon: AlertTriangle,bg: "bg-red-50",     iconColor: "text-red-600",    bar: "bg-red-500"    },
  review:            { icon: Star,         bg: "bg-amber-50",   iconColor: "text-amber-500",  bar: "bg-amber-400"  },
  welcome:           { icon: Bell,         bg: "bg-purple-50",  iconColor: "text-purple-600", bar: "bg-purple-500" },
  default:           { icon: Bell,         bg: "bg-gray-50",    iconColor: "text-gray-600",   bar: "bg-gray-400"   },
};

function getConfig(type: string) {
  return TYPE_CONFIG[type] ?? TYPE_CONFIG.default;
}

// ── Single toast card ────────────────────────────────────────────────────────
function ToastCard({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}) {
  const router = useRouter();
  const config = getConfig(toast.type);
  const Icon = config.icon;
  const progressRef = useRef<HTMLDivElement>(null);

  // Animate the progress bar draining from 100% → 0% over 6 seconds
  useEffect(() => {
    if (!progressRef.current) return;
    const el = progressRef.current;
    el.style.transition = "none";
    el.style.width = "100%";
    // Trigger reflow
    void el.offsetWidth;
    el.style.transition = "width 6s linear";
    el.style.width = "0%";
  }, []);

  const handleClick = () => {
    onDismiss(toast.toastId);
    if (toast.action_url) router.push(toast.action_url);
  };

  return (
    <motion.div
      layout
      initial={{ x: 120, opacity: 0, scale: 0.95 }}
      animate={{ x: 0, opacity: 1, scale: 1 }}
      exit={{ x: 120, opacity: 0, scale: 0.95, transition: { duration: 0.3 } }}
      transition={{ type: "spring", stiffness: 380, damping: 30 }}
      className={`
        relative w-[340px] max-w-[calc(100vw-2rem)] rounded-2xl shadow-2xl border border-gray-100
        overflow-hidden cursor-pointer select-none
        ${config.bg}
      `}
      onClick={handleClick}
    >
      {/* Content */}
      <div className="flex items-start gap-3 p-4 pr-10">
        {/* Icon bubble */}
        <div className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center bg-white shadow-sm`}>
          <Icon className={`w-4 h-4 ${config.iconColor}`} />
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <p className="font-black text-gray-900 text-sm leading-tight truncate">{toast.title}</p>
          <p className="text-gray-600 text-xs mt-0.5 leading-relaxed line-clamp-2">{toast.message}</p>
        </div>
      </div>

      {/* Dismiss button */}
      <button
        onClick={e => { e.stopPropagation(); onDismiss(toast.toastId); }}
        className="absolute top-3 right-3 p-1 rounded-full hover:bg-black/10 transition"
      >
        <X className="w-3.5 h-3.5 text-gray-400" />
      </button>

      {/* Draining progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-200">
        <div
          ref={progressRef}
          className={`h-full ${config.bar} w-full`}
        />
      </div>
    </motion.div>
  );
}

// ── Toast container — place once in your layout ──────────────────────────────
export function NotificationToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  return (
    /*
      Fixed in top-right corner on desktop, top-center on mobile.
      z-[9999] puts it above everything including modals and bottom nav.
      pointer-events-none on the wrapper means it doesn't block clicks
      on the page — only the individual cards are interactive.
    */
    <div
      className="
        fixed top-4 right-4 z-[9999]
        flex flex-col gap-2
        pointer-events-none
        sm:items-end items-center
        max-h-screen overflow-hidden
      "
    >
      <AnimatePresence mode="popLayout">
        {toasts.map(toast => (
          <div key={toast.toastId} className="pointer-events-auto">
            <ToastCard toast={toast} onDismiss={onDismiss} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}
