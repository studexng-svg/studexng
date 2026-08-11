// src/components/CookieConsent.tsx
"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion"; // kept for exit animation
import { X, Cookie } from "lucide-react";
import Link from "next/link";
import { getCookieConsent, setCookieConsent } from "@/lib/cookieConsent";

export default function CookieConsent() {
  const [isVisible, setIsVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (!getCookieConsent()) {
      // Show after 1.5 seconds
      const timer = setTimeout(() => setIsVisible(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  // Analytics.tsx listens for this via the studex:cookie-consent-changed
  // event — Accept loads GA on this same tab immediately, no reload needed.
  const handleAccept = () => {
    setCookieConsent("accepted");
    setIsVisible(false);
  };

  const handleReject = () => {
    setCookieConsent("rejected");
    setIsVisible(false);
  };

  if (!mounted) return null;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 200 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 200 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="fixed bottom-6 right-6 z-50 w-80"
        >
          {/* Card */}
          <div className="bg-white rounded-xl shadow-xl border border-gray-200 p-3 overflow-hidden">
            {/* Top accent bar */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-purple-600 to-teal-600" />

            {/* Content */}
            <div className="space-y-2">
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center flex-shrink-0">
                    <Cookie className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 text-sm">
                      We use Cookies
                    </h3>
                    <p className="text-gray-500 text-xs">Essential & Analytics</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsVisible(false)}
                  className="text-gray-400 hover:text-gray-600 hover:scale-110 hover:rotate-90 active:scale-90 transition-all flex-shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Description */}
              <p className="text-gray-600 text-xs leading-relaxed">
                We use cookies to enhance your browsing experience and analyze site usage.
              </p>

              {/* Links */}
              <p className="text-xs text-gray-500 space-x-1">
                <Link
                  href="/privacy-policy"
                  className="text-blue-600 hover:text-blue-700 transition-colors"
                >
                  Privacy Policy
                </Link>
                <span>•</span>
                <Link
                  href="/terms"
                  className="text-blue-600 hover:text-blue-700 transition-colors"
                >
                  Terms
                </Link>
              </p>

              {/* Buttons */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleReject}
                  className="flex-1 px-2 py-1.5 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-all duration-200 hover-scale tap-scale"
                >
                  Reject
                </button>

                <button
                  onClick={handleAccept}
                  className="flex-1 px-2 py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-purple-600 to-teal-600 hover:from-purple-700 hover:to-teal-700 rounded-lg transition-all duration-200 shadow-md hover:shadow-lg hover-scale tap-scale"
                >
                  Accept
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}