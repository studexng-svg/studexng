// src/app/success/page.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { CheckCircle, CalendarCheck, ArrowRight, Shield, Crown, ChevronLeft } from "lucide-react";
import { format } from "date-fns";
import { useBookingStore } from "@/lib/bookingStore";
import Image from "next/image";

export default function SuccessPage() {
  const router = useRouter();

  const storedBooking = useBookingStore((state) => state.booking);

  const booking = storedBooking  || {
    providerName: "Your Stylist",
    providerImg: "lashes-vendor-1.jpg",
    date: format(new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), "EEE, MMM d"),
    time: "2:00 PM",
    total: 8500,
  };

  return (
    <>
      {/* HEADER WITH BACK BUTTON */}
      <div className="sticky top-0 bg-white/95 backdrop-blur-2xl z-50 border-b border-purple-100">
        <div className="flex items-center justify-between px-5 py-6">
          <button
            onClick={() => router.back()}
            className="p-3 rounded-full bg-gradient-to-r from-purple-100 to-teal-100 hover:from-purple-200 hover:to-teal-200 active:scale-95 transition-all"
          >
            <ChevronLeft className="w-7 h-7 text-purple-700" />
          </button>

          <h1 className="text-2xl font-black bg-gradient-to-r from-purple-600 to-teal-600 bg-clip-text text-transparent">
            Booking Confirmed
          </h1>

          <div className="w-12" />
        </div>
      </div>

      <div className="px-6 pt-10 pb-40">

        {/* SIMPLE BUT GORGEOUS HERO */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          className="flex flex-col items-center mb-12"
        >
          {/* Crown drops in */}
          <motion.div
            initial={{ y: -40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="mb-4"
          >
            <Crown className="w-16 h-16 text-yellow-500" />
          </motion.div>

          {/* Big checkmark */}
          <div className="w-36 h-36 rounded-full bg-gradient-to-br from-purple-600 to-teal-600 p-2 shadow-2xl">
            <div className="w-full h-full rounded-full bg-white flex items-center justify-center">
              <CheckCircle className="w-24 h-24 text-purple-600" strokeWidth={3} />
            </div>
          </div>
        </motion.div>

        {/* MESSAGE */}
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-center mb-12"
        >
          <h2 className="text-4xl font-black bg-gradient-to-r from-purple-600 to-teal-600 bg-clip-text text-transparent mb-3">
            You’re All Set!
          </h2>
          <p className="text-xl text-gray-700">
            {booking.providerName} can’t wait to see you
          </p>
        </motion.div>

        {/* PROVIDER CARD */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="bg-gradient-to-r from-purple-50 to-teal-50 rounded-3xl p-6 shadow-xl border-2 border-purple-200 mb-8"
        >
          <div className="flex items-center gap-5">
            <div className="relative w-24 h-24 rounded-3xl overflow-hidden ring-4 ring-purple-200">
              <Image src={`/images/${booking.providerImg}`} alt={booking.providerName} fill className="object-cover" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Your Expert</p>
              <p className="text-2xl font-black text-purple-900">{booking.providerName}</p>
              <p className="text-lg font-bold text-green-600">Confirmed</p>
            </div>
          </div>
        </motion.div>

        {/* DETAILS */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="bg-white rounded-3xl p-6 shadow-2xl border border-purple-200 mb-8 space-y-6"
        >
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-r from-purple-600 to-teal-600 flex items-center justify-center">
              <CalendarCheck className="w-8 h-8 text-white" />
            </div>
            <div>
              <p className="text-gray-600">Date & Time</p>
              <p className="text-2xl font-black">{booking.date} · {booking.time}</p>
            </div>
          </div>

          <div className="flex items-center gap-5">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-r from-teal-600 to-purple-600 flex items-center justify-center">
              <Shield className="w-8 h-8 text-white" />
            </div>
            <div>
              <p className="text-gray-600">Payment</p>
              <p className="text-2xl font-black text-green-600">₦{booking.total.toLocaleString()} in Escrow</p>
            </div>
          </div>
        </motion.div>

        {/* ESCROW BADGE */}
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 1, type: "spring" }}
          className="bg-gradient-to-r from-purple-600 to-teal-600 rounded-3xl p-8 text-white text-center shadow-2xl mb-10"
        >
          <Shield className="w-16 h-16 mx-auto mb-3" />
          <p className="text-2xl font-black">100% Escrow Protected</p>
          <p className="text-lg opacity-90 mt-2">You release payment only when you’re happy</p>
        </motion.div>

        {/* BUTTONS */}
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 1.2 }}
          className="space-y-4"
        >
          <Link href="/book">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full py-6 bg-gradient-to-r from-purple-600 to-teal-600 text-white font-black text-xl rounded-3xl shadow-2xl flex items-center justify-center gap-3"
            >
              View My Bookings <ArrowRight className="w-6 h-6" />
            </motion.button>
          </Link>

          <Link href="/home">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full py-5 bg-white text-purple-600 font-bold text-lg rounded-3xl border-4 border-purple-200 shadow-xl"
            >
              Continue Browsing
            </motion.button>
          </Link>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
          className="text-center mt-10 text-purple-700 font-bold text-xl"
        >
          Get ready to turn heads
        </motion.p>
      </div>

      {/* BOTTOM NAV */}
      <nav className="bottom-nav-safe">
        <div className="flex justify-around items-center h-full px-6">
          <Link href="/home" className="text-gray-600"><span className="text-xs font-medium">Home</span></Link>
          <Link href="/explore" className="text-gray-600"><span className="text-xs font-medium">Explore</span></Link>
          <div className="relative -top-6">
            <div className="w-16 h-16 bg-gradient-to-r from-purple-600 to-teal-600 rounded-full flex items-center justify-center shadow-3xl">
              <CalendarCheck className="w-10 h-10 text-white" />
            </div>
          </div>
          <Link href="/inbox" className="text-gray-600"><span className="text-xs font-medium">Inbox</span></Link>
          <Link href="/profile" className="text-gray-600"><span className="text-xs font-medium">Profile</span></Link>
        </div>
      </nav>
    </>
  );
}