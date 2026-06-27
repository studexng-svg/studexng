"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle, CalendarCheck, Calendar, Clock, MapPin, ArrowRight } from "lucide-react";
import TopNav from "@/components/layout/TopNav";
import { useBookingStore } from "@/lib/bookingStore";
import { TEAL, PURPLE } from "@/lib/tokens";

export default function SuccessPage() {
  const router = useRouter();
  const booking = useBookingStore((state) => state.booking);

  return (
    <div className="min-h-screen bg-[#F5F5F5]" style={{ fontFamily: "'DM Sans', sans-serif" }}>

      <TopNav showBack backHref="/home" />

      <div className="px-4 pt-8 pb-32 max-w-2xl mx-auto space-y-5">

        {/* SUCCESS ICON */}
        <div className="flex justify-center pt-2 animate-fadeUp">
          <div className="w-20 h-20 rounded-full flex items-center justify-center shadow-lg" style={{ background: TEAL }}>
            <CheckCircle className="w-10 h-10 text-white" />
          </div>
        </div>

        {/* HEADING */}
        <div className="text-center animate-fadeUp">
          <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-semibold">Payment Successful</p>
          <h2 className="text-2xl font-bold text-stone-900 mt-0.5" style={SERIF}>You're All Set!</h2>
          <p className="text-sm text-stone-400 mt-1">
            {booking ? `${booking.providerName} has been notified of your booking.` : "Your booking has been confirmed."}
          </p>
        </div>

        {/* BOOKING DETAILS */}
        {booking && (
          <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm space-y-4 animate-fadeUp">
            <div className="flex items-center gap-3 pb-3 border-b border-stone-100">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: PURPLE }}>
                <CalendarCheck className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-semibold text-stone-900 text-sm">{booking.providerName}</p>
                <p className="text-xs text-teal-600 font-medium">Booking Confirmed</p>
              </div>
            </div>

            <div className="space-y-3">
              {booking.date && (
                <div className="flex items-center gap-2.5 text-sm text-stone-600">
                  <Calendar className="w-4 h-4 text-teal-500 flex-shrink-0" />
                  <span>{booking.date}</span>
                </div>
              )}
              {booking.time && (
                <div className="flex items-center gap-2.5 text-sm text-stone-600">
                  <Clock className="w-4 h-4 text-teal-500 flex-shrink-0" />
                  <span>{booking.time}</span>
                </div>
              )}
              {booking.location && (
                <div className="flex items-center gap-2.5 text-sm text-stone-600">
                  <MapPin className="w-4 h-4 text-teal-500 flex-shrink-0" />
                  <span>{booking.location}</span>
                </div>
              )}
            </div>

            <div className="border-t border-stone-100 pt-3 flex justify-between items-center">
              <span className="text-sm text-stone-500">Amount paid</span>
              <span className="text-xl font-bold text-stone-900">₦{booking.total.toLocaleString()}</span>
            </div>
          </div>
        )}

        {/* ACTION BUTTONS */}
        <div className="space-y-3 animate-fadeUp">
          <Link href="/account/bookings" className="block">
            <button
              className="w-full py-4 rounded-full font-semibold text-white text-base shadow-lg flex items-center justify-center gap-2 transition active:scale-[0.98]"
              style={{ background: TEAL }}
            >
              <CalendarCheck className="w-5 h-5" />
              View My Bookings <ArrowRight className="w-4 h-4" />
            </button>
          </Link>

          <Link href="/home" className="block">
            <button className="w-full py-3 rounded-full font-semibold text-stone-600 bg-white border border-stone-200 text-sm flex items-center justify-center gap-2 shadow-sm transition active:scale-[0.98]">
              Continue Browsing
            </button>
          </Link>
        </div>

        <p className="text-center text-xs text-stone-400 animate-fadeUp">
          Check your messages for booking details and updates.
        </p>
      </div>
    </div>
  );
}
