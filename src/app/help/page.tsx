// src/app/help/page.tsx
"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Mail, MessageCircle, Phone, ArrowLeft, Headphones, Clock, Shield, Zap, ChevronRight, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

export default function HelpPage() {
  const router = useRouter();

  const fadeInUp = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6 },
  };

  const cardHover = {
    whileHover: { y: -4, scale: 1.02 },
    whileTap: { scale: 0.98 },
  };

  return (
    <>
      {/* TOP BAR — BIG LOGO */}
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="sticky top-0 bg-white/80 backdrop-blur-xl z-40 border-b border-white/20 shadow-sm"
      >
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
      </motion.div>

      <div className="p-6 pb-32 space-y-8">
        {/* HERO */}
        <motion.div {...fadeInUp} className="text-center">
          <motion.div
            animate={{ rotate: [0, 5, -5, 0] }}
            transition={{ duration: 3, repeat: Infinity, repeatDelay: 4 }}
            className="w-28 h-28 mx-auto bg-gradient-to-br from-purple-100 to-teal-100 rounded-full flex items-center justify-center shadow-xl mb-5"
          >
            <Headphones className="w-16 h-16 text-purple-600" />
          </motion.div>
          <h1 className="text-3xl font-black bg-gradient-to-r from-purple-600 to-teal-500 bg-clip-text text-transparent">
            How Can We Help?
          </h1>
          <p className="text-sm text-gray-600 mt-2 max-w-md mx-auto">
            Fast, friendly support from real humans. Available <strong>24/7</strong> — no bots.
          </p>
        </motion.div>

        {/* SUPPORT OPTIONS — GLASS CARDS */}
        <motion.div {...fadeInUp} className="space-y-5">
          {/* WHATSAPP */}
          <motion.a
            href="https://wa.me/2348027291641"
            target="_blank"
            rel="noopener noreferrer"
            {...cardHover}
            className="block"
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
          </motion.a>

          {/* EMAIL */}
          <motion.a
            href="mailto:studex.biz@pau.edu.ng"
            {...cardHover}
            className="block"
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
          </motion.a>

          {/* CALL */}
          <motion.a
            href="tel:+2348001234567"
            {...cardHover}
            className="block"
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
          </motion.a>
        </motion.div>

        {/* FEATURES */}
        <motion.div {...fadeInUp} className="bg-gradient-to-r from-purple-50 to-teal-50 rounded-2xl p-6 space-y-4">
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
        </motion.div>

        {/* FAQ CTA */}
        <motion.div {...fadeInUp} className="text-center">
          <p className="text-sm text-gray-600 mb-3">Common questions?</p>
          <Link href="/faq">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="bg-gradient-to-r from-purple-600 to-teal-500 text-white px-8 py-4 rounded-full font-black shadow-xl"
            >
              View FAQ
            </motion.button>
          </Link>
        </motion.div>
      </div>

      {/* BOTTOM NAV */}
      <motion.div
        initial={{ y: 100 }}
        animate={{ y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-white/20 z-50 shadow-2xl"
      >
        <div className="flex justify-around py-3">
          <Link href="/" className="text-gray-500"><span className="text-xs">Home</span></Link>
          <Link href="/categories" className="text-gray-500"><span className="text-xs">Shop</span></Link>
          <Link href="/cart" className="text-gray-500"><span className="text-xs">Cart</span></Link>
          <Link href="/wishlist" className="text-gray-500"><span className="text-xs">Wishlist</span></Link>
          <div className="text-teal-600 font-black"><span className="text-xs">Help</span></div>
        </div>
      </motion.div>
    </>
  );
}