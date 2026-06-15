"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { GRAD } from "@/lib/tokens";
import { useAuth } from "@/lib/authStore";

const STORAGE_KEY = "wa_imsu_dismissed";
const WA_LINK = "https://chat.whatsapp.com/H2rwr1Zhmra0GVryF8ZEWp?s=cl&p=i&ilr=2";

export default function WhatsAppGroupModal() {
  const { user, isLoggedIn, isHydrated } = useAuth();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isHydrated || !isLoggedIn) return;
    const school = (user?.school || "").toLowerCase();
    if (school !== "imsu") return;
    if (localStorage.getItem(STORAGE_KEY)) return;
    const t = setTimeout(() => setVisible(true), 1200);
    return () => clearTimeout(t);
  }, [isHydrated, isLoggedIn, user]);

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  };

  const join = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
    window.open(WA_LINK, "_blank", "noopener,noreferrer");
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
          onClick={dismiss}
        >
          <motion.div
            initial={{ y: 80, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 60, opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", damping: 26, stiffness: 300 }}
            onClick={e => e.stopPropagation()}
            className="relative w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl bg-white"
            style={{ fontFamily: "'DM Sans', sans-serif" }}
          >
            {/* Header band */}
            <div className="relative h-40 w-full flex flex-col items-center justify-center gap-3" style={{ background: GRAD }}>
              <button
                onClick={dismiss}
                className="absolute top-4 right-4 w-9 h-9 bg-black/20 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-black/40 transition"
              >
                <X className="w-4 h-4" />
              </button>

              {/* WhatsApp icon */}
              <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-lg">
                <svg viewBox="0 0 24 24" className="w-10 h-10" fill="#25D366">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                  <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.126 1.533 5.86L.057 23.885a.5.5 0 0 0 .611.612l6.101-1.474A11.934 11.934 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.808 9.808 0 0 1-5.001-1.368l-.358-.214-3.718.898.934-3.62-.234-.372A9.808 9.808 0 0 1 2.182 12C2.182 6.57 6.57 2.182 12 2.182c5.43 0 9.818 4.388 9.818 9.818 0 5.43-4.388 9.818-9.818 9.818z"/>
                </svg>
              </div>

              <p className="text-white font-bold text-base px-4 text-center leading-snug">
                Join the IMSU StudEx WhatsApp Group
              </p>
            </div>

            {/* Body */}
            <div className="px-5 pt-5 pb-6 space-y-4">
              <p className="text-stone-500 text-sm text-center leading-relaxed">
                Get exclusive deals, campus updates, and be the first to know about new vendors and offers on StudEx, all in one group.
              </p>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={join}
                className="w-full py-3.5 rounded-2xl text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg"
                style={{ background: "#25D366" }}
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                  <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.126 1.533 5.86L.057 23.885a.5.5 0 0 0 .611.612l6.101-1.474A11.934 11.934 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.808 9.808 0 0 1-5.001-1.368l-.358-.214-3.718.898.934-3.62-.234-.372A9.808 9.808 0 0 1 2.182 12C2.182 6.57 6.57 2.182 12 2.182c5.43 0 9.818 4.388 9.818 9.818 0 5.43-4.388 9.818-9.818 9.818z"/>
                </svg>
                Join WhatsApp Group
              </motion.button>

              <button
                onClick={dismiss}
                className="w-full text-stone-400 text-xs py-1 text-center hover:text-stone-600 transition"
              >
                I've already joined ✓
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
