// src/app/help/page.tsx
"use client";

import { useRouter } from "next/navigation";
import { Mail, MessageCircle, Phone, Headphones, Clock, Shield, Zap, ChevronRight } from "lucide-react";
import TopNav from "@/components/layout/TopNav";
import Link from "next/link";
import { TEAL } from "@/lib/tokens";

export default function HelpPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#F5F5F5]" style={{ fontFamily: "'DM Sans', sans-serif" }}>

      <TopNav showBack />

      <div className="px-4 pt-6 pb-32 max-w-2xl mx-auto space-y-5">

        {/* HERO */}
        <div className="rounded-2xl p-6 text-white text-center shadow-md animate-fadeUp" style={{ background: TEAL }}>
          <Headphones className="w-12 h-12 mx-auto mb-3 opacity-90" />
          <h2 className="text-xl font-bold mb-1" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>How Can We Help?</h2>
          <p className="text-sm opacity-80">Fast, friendly support — available every day</p>
        </div>

        {/* CONTACT OPTIONS */}
        <div className="space-y-3 animate-fadeUp">

          <a href="https://wa.me/2348027291641" target="_blank" rel="noopener noreferrer"
            className="block active:scale-[0.98] transition-transform">
            <div className="bg-white rounded-2xl p-4 flex items-center justify-between shadow-sm border border-stone-200 hover:border-teal-300 hover:shadow-md transition-all">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center">
                  <MessageCircle className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                  <p className="font-semibold text-stone-900 text-sm">WhatsApp Support</p>
                  <p className="text-xs text-stone-500">Instant reply · +234 9081439022</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-stone-400" />
            </div>
          </a>

          <a href="mailto:studex.ng@gmail.com"
            className="block active:scale-[0.98] transition-transform">
            <div className="bg-white rounded-2xl p-4 flex items-center justify-between shadow-sm border border-stone-200 hover:border-teal-300 hover:shadow-md transition-all">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-teal-50 rounded-xl flex items-center justify-center">
                  <Mail className="w-6 h-6 text-teal-600" />
                </div>
                <div>
                  <p className="font-semibold text-stone-900 text-sm">Email Us</p>
                  <p className="text-xs text-stone-500">Reply within 2 hrs · studex.ng@gmail.com</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-stone-400" />
            </div>
          </a>

          <a href="tel:+2348027291641"
            className="block active:scale-[0.98] transition-transform">
            <div className="bg-white rounded-2xl p-4 flex items-center justify-between shadow-sm border border-stone-200 hover:border-teal-300 hover:shadow-md transition-all">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-stone-50 rounded-xl flex items-center justify-center">
                  <Phone className="w-6 h-6 text-stone-600" />
                </div>
                <div>
                  <p className="font-semibold text-stone-900 text-sm">Call Support</p>
                  <p className="text-xs text-stone-500">+234 8027291641</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-stone-400" />
            </div>
          </a>
        </div>

        {/* FEATURES */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-stone-200 space-y-4 animate-fadeUp">
          <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-semibold">Our commitment</p>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-teal-50 rounded-xl flex items-center justify-center flex-shrink-0">
              <Zap className="w-4 h-4 text-teal-600" />
            </div>
            <p className="font-semibold text-stone-900 text-sm">Average response under 3 minutes</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-teal-50 rounded-xl flex items-center justify-center flex-shrink-0">
              <Clock className="w-4 h-4 text-teal-600" />
            </div>
            <p className="font-semibold text-stone-900 text-sm">Support available 24 hours, 7 days a week</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-teal-50 rounded-xl flex items-center justify-center flex-shrink-0">
              <Shield className="w-4 h-4 text-teal-600" />
            </div>
            <p className="font-semibold text-stone-900 text-sm">Real humans — 100% Nigerian team</p>
          </div>
        </div>

        {/* FAQ CTA */}
        <div className="text-center animate-fadeUp">
          <p className="text-sm text-stone-500 mb-3">Looking for quick answers?</p>
          <Link href="/faq">
            <button
              className="px-8 py-3 text-white font-semibold rounded-full shadow-lg shadow-teal-200/60 text-sm transition active:scale-[0.98]"
              style={{ background: TEAL }}
            >
              Browse FAQs
            </button>
          </Link>
        </div>

      </div>
    </div>
  );
}
