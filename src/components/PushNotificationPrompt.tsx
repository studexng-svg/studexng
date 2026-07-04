"use client";

import { useEffect, useState } from "react";
import { Bell, X, ShoppingBag, MessageCircle, Wallet } from "lucide-react";
import { useAuth } from "@/lib/authStore";
import { enablePushNotifications } from "@/hooks/usePushNotifications";
import { TEAL } from "@/lib/tokens";

const DISMISSED_KEY = "push_prompt_dismissed";
const SHOWN_KEY = "push_prompt_shown_at";

export default function PushNotificationPrompt() {
  const { isLoggedIn } = useAuth();
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isLoggedIn) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "default") return; // already granted or denied
    if (localStorage.getItem(DISMISSED_KEY)) return;

    // Only show once per session, and only after 8 seconds (user is engaged)
    const lastShown = localStorage.getItem(SHOWN_KEY);
    if (lastShown && Date.now() - Number(lastShown) < 24 * 60 * 60 * 1000) return;

    const timer = setTimeout(() => {
      setVisible(true);
      localStorage.setItem(SHOWN_KEY, String(Date.now()));
    }, 8000);

    return () => clearTimeout(timer);
  }, [isLoggedIn]);

  const dismiss = () => {
    setVisible(false);
    localStorage.setItem(DISMISSED_KEY, "1");
  };

  const allow = async () => {
    setLoading(true);
    const granted = await enablePushNotifications();
    setLoading(false);
    setVisible(false);
    if (!granted) localStorage.setItem(DISMISSED_KEY, "1");
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-24 left-4 right-4 z-50 max-w-sm mx-auto animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-white rounded-2xl shadow-xl border border-stone-100 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: TEAL }}>
              <Bell className="w-4.5 h-4.5 text-white" />
            </div>
            <p className="font-bold text-stone-900 text-sm">Stay in the loop</p>
          </div>
          <button onClick={dismiss} className="p-1.5 rounded-full hover:bg-stone-100 transition text-stone-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Benefits */}
        <div className="px-4 pb-3 space-y-2">
          {[
            { icon: ShoppingBag, text: "Know instantly when your order is ready" },
            { icon: MessageCircle, text: "Never miss a message from a vendor" },
            { icon: Wallet, text: "Get alerted when your payment arrives" },
          ].map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-2.5">
              <Icon className="w-3.5 h-3.5 text-teal-500 flex-shrink-0" />
              <p className="text-stone-600 text-xs">{text}</p>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-2 px-4 pb-4">
          <button
            onClick={dismiss}
            className="flex-1 py-2.5 bg-stone-100 text-stone-600 rounded-xl text-sm font-semibold hover:bg-stone-200 transition"
          >
            Not now
          </button>
          <button
            onClick={allow}
            disabled={loading}
            className="flex-1 py-2.5 text-white rounded-xl text-sm font-semibold disabled:opacity-60 transition"
            style={{ background: TEAL }}
          >
            {loading ? "Setting up…" : "Allow notifications"}
          </button>
        </div>
      </div>
    </div>
  );
}
