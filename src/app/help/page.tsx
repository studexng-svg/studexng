// src/app/help/page.tsx
"use client";

import { useRouter } from "next/navigation";
import { Mail, MessageCircle, Phone, ArrowLeft, Headphones, Clock, Shield, Zap, ChevronRight, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import BottomNav from "@/components/layout/BottomNav";

export default function HelpPage() {
  const router = useRouter();


  return (
    <>
      {/* TOP BAR — BIG LOGO */}
      <div className="sticky top-0 bg-white/80 backdrop-blur-xl z-40 border-b border-white/20 shadow-sm animate-fadeUp">
        <div className="flex items-center justify-between p-4">
          <button
            onClick={() => router.back()}
            className="text-purple-600 hover:bg-purple-50 p-2 rounded-full transition-all"
          >
            <ArrowLeft className="w-7 h-7" />
          </button>
          <Link href="/" className="flex items-center">
            <Image
              src="/images/logo-1.jpg"
              alt="StudEx Logo"
              width={160}
              height={50}
              className="h-11 w-auto object-contain"
              priority
            />
          </Link>
          <h1 className="text-xl font-black bg-gradient-to-r from-purple-600 to-teal-500 bg-clip-text text-transparent">
            Help Center
          </h1>
        </div>
      </div>

      <div className="p-6 pb-32 space-y-8">
        {/* HERO */}
        <div className="text-center animate-fadeUp">
          <div
            className="w-28 h-28 mx-auto bg-gradient-to-br from-purple-100 to-teal-100 rounded-full flex items-center justify-center shadow-xl mb-5"
          >
            <Headphones className="w-16 h-16 text-purple-600" />
          </div>
          <h1 className="text-3xl font-black bg-gradient-to-r from-purple-600 to-teal-500 bg-clip-text text-transparent">
            How Can We Help?
          </h1>
          <p className="text-sm text-gray-600 mt-2 max-w-md mx-auto">
            Fast, friendly support from real humans. Available <strong>24/7</strong> — no bots.
          </p>
        </div>

        {/* SUPPORT OPTIONS — GLASS CARDS */}
        <div className="space-y-5 animate-fadeUp">
          {/* WHATSAPP */}
          <a
            href="https://wa.me/2348027291641"
            target="_blank"
            rel="noopener noreferrer"
            className="block hover:-translate-y-1 active:scale-[0.98] transition-transform"
          >
            <div className="bg-white/70 backdrop-blur-md rounded-2xl p-5 flex items-center justify-between shadow-lg border border-white/30 hover:shadow-xl transition-all">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-gradient-to-br from-green-100 to-emerald-100 rounded-full flex items-center justify-center">
                  <MessageCircle className="w-8 h-8 text-green-600" />
                </div>
                <div>
                  <p className="font-black text-gray-800">WhatsApp Support</p>
                  <p className="text-xs text-gray-600">Instant reply • +234 9081439022</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </div>
          </a>

          {/* EMAIL */}
          <a
            href="mailto:studex.biz@pau.edu.ng"
            className="block hover:-translate-y-1 active:scale-[0.98] transition-transform"
          >
            <div className="bg-white/70 backdrop-blur-md rounded-2xl p-5 flex items-center justify-between shadow-lg border border-white/30 hover:shadow-xl transition-all">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-gradient-to-br from-purple-100 to-indigo-100 rounded-full flex items-center justify-center">
                  <Mail className="w-8 h-8 text-purple-600" />
                </div>
                <div>
                  <p className="font-black text-gray-800">Email Us</p>
                  <p className="text-xs text-gray-600">Reply in &lt; 2 hrs • studex.biz@pau.edu.ng</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </div>
          </a>

          {/* CALL */}
          <a
            href="tel:+2348001234567"
            className="block hover:-translate-y-1 active:scale-[0.98] transition-transform"
          >
            <div className="bg-white/70 backdrop-blur-md rounded-2xl p-5 flex items-center justify-between shadow-lg border border-white/30 hover:shadow-xl transition-all">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-gradient-to-br from-teal-100 to-cyan-100 rounded-full flex items-center justify-center">
                  <Phone className="w-8 h-8 text-teal-600" />
                </div>
                <div>
                  <p className="font-black text-gray-800">Call Support</p>
                  <p className="text-xs text-gray-600">Toll-free • +2348027291641</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </div>
          </a>
        </div>

        {/* FEATURES */}
        <div className="bg-gradient-to-r from-purple-50 to-teal-50 rounded-2xl p-6 space-y-4 animate-fadeUp">
          <div className="flex items-center gap-3">
            <Zap className="w-6 h-6 text-purple-600" />
            <p className="font-bold text-gray-800">Average Response: 3 mins</p>
          </div>
          <div className="flex items-center gap-3">
            <Clock className="w-6 h-6 text-teal-600" />
            <p className="font-bold text-gray-800">Support: 24 hours a day, 7 days a week</p>
          </div>
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-emerald-600" />
            <p className="font-bold text-gray-800">100% Verified Nigerian Team</p>
          </div>
        </div>

        {/* FAQ CTA */}
        <div className="text-center animate-fadeUp">
          <p className="text-sm text-gray-600 mb-3">Common questions?</p>
          <Link href="/faq">
            <button
              className="bg-gradient-to-r from-purple-600 to-teal-500 text-white px-8 py-4 rounded-full font-black shadow-xl hover-scale tap-scale"
            >
              View FAQ
            </button>
          </Link>
        </div>
      </div>

      <BottomNav />
    </>
  );
}