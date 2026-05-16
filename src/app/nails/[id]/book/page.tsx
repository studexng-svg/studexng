// src/app/nails/[id]/book/page.tsx  ← NAILS BOOKING PAGE (EXACT TWIN OF LASHES)

"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Calendar, Clock, MapPin, Plus, Minus, ChevronLeft, Shield, Check, CreditCard } from "lucide-react";
import { useState } from "react";
import { useBookingStore } from "@/lib/bookingStore";

const formatDate = (date: Date): string => {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
};

const isSameDay = (d1: Date, d2: Date): boolean => {
  return d1.toDateString() === d2.toDateString();
};

const providers: Record<string, any> = {
  temi: {
    name: "Queen Nails by Temi",
    img: "nails-vendor-1.jpg",
    price: 7500,
    location: "Angola Hall Basement",
    verified: true,
  },
  glow: {
    name: "Glow Studio",
    img: "nails-vendor-2.jpg",
    price: 8500,
    location: "Moremi Block C",
    verified: true,
  },
  nailbae: {
    name: "Nail Bae OAU",
    img: "nails-vendor-3.jpg",
    price: 6000,
    location: "Fajuyi Hall",
    verified: false,
  },
  chrome: {
    name: "Chrome Queen",
    img: "nails-vendor-4.jpg",
    price: 9000,
    location: "Postgraduate Hall",
    verified: true,
  },
};

export default function NailsBookingPage() {
  const router = useRouter();
  const { id } = useParams();
  const providerId = (Array.isArray(id) ? id[0] : id) ?? "temi";
  const p = providers[providerId] || providers.temi;

  const setBooking = useBookingStore((state) => state.setBooking);

  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [location, setLocation] = useState("Provider's Studio");
  const [addons, setAddons] = useState<Record<string, number>>({
    "Nail Removal": 0,
    "Nail Art (per nail)": 0,
    "Chrome Finish": 0,
    "3D Charms": 0,
    "Length Extension": 0,
  });
  const [note, setNote] = useState("");

  const basePrice = p.price;
  const addonPrice = Object.values(addons).reduce((a, b) => a + b, 0) * 1000;
  const travelFee = location.includes("Event Venue") ? 2500 : 0;
  const total = basePrice + addonPrice + travelFee;

  const timeSlots = [
    "10:00 AM", "11:00 AM", "12:00 PM", "1:00 PM",
    "2:00 PM", "3:00 PM", "4:00 PM", "5:00 PM",
    "6:00 PM", "7:00 PM", "8:00 PM",
  ];

  const upcomingDates = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i + 1);
    return d;
  });

  const handlePay = () => {
    if (!selectedDate || !selectedTime) {
      alert("Please select both date and time");
      return;
    }

    setBooking({
      providerId,
      providerName: p.name,
      providerImg: p.img,
      service: "Nail Appointment",
      date: formatDate(selectedDate),
      time: selectedTime,
      location,
      addons,
      note,
      total,
    });

    router.push("/checkout");
  };

  return (
    <>
      {/* HEADER */}
      <div className="sticky top-0 bg-white/95 backdrop-blur-xl z-50 border-b shadow-sm">
        <div className="flex items-center justify-between p-4">
          <button onClick={() => router.back()} className="p-3 hover:bg-purple-100 rounded-full transition">
            <ChevronLeft className="w-8 h-8 text-purple-600" />
          </button>
          <h1 className="text-xl font-black text-gray-900">Book Nail Appointment</h1>
          <div className="w-12" />
        </div>
      </div>

      {/* PROVIDER CARD */}
      <div className="px-6 pt-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl shadow-xl p-6 flex items-center gap-5 border border-purple-100"
        >
          <div className="relative w-24 h-24 rounded-3xl overflow-hidden ring-4 ring-purple-100">
            <Image src={`/images/${p.img}`} alt={p.name} fill className="object-cover" />
          </div>
          <div>
            <h2 className="text-2xl font-black">{p.name}</h2>
            <p className="text-gray-600 flex items-center gap-2 mt-1">
              <MapPin className="w-5 h-5" /> {p.location}
            </p>
            {p.verified && (
              <p className="text-sm text-blue-600 font-bold mt-2 flex items-center gap-1">
                <Check className="w-4 h-4" /> Verified Provider
              </p>
            )}
          </div>
        </motion.div>
      </div>

      <div className="px-6 pt-8 pb-40 space-y-10">

        {/* DATE PICKER */}
        <section>
          <h3 className="text-2xl font-black mb-6 flex items-center gap-3">
            <Calendar className="w-8 h-8 text-purple-600" /> Choose Date
          </h3>
          <div className="grid grid-cols-4 gap-3">
            {upcomingDates.map((date) => (
              <button
                key={date.toISOString()}
                onClick={() => setSelectedDate(date)}
                className={`p-4 rounded-2xl border-2 transition-all ${
                  selectedDate && isSameDay(date, selectedDate)
                    ? "bg-gradient-to-r from-purple-600 to-teal-600 text-white border-transparent shadow-xl"
                    : "bg-white border-gray-200 hover:border-purple-400"
                }`}
              >
                <p className="text-xs font-medium opacity-80">{formatDate(date).split(",")[0]}</p>
                <p className="text-2xl font-black mt-1">{date.getDate()}</p>
                <p className="text-xs mt-1">{date.toLocaleDateString("en-US", { month: "short" })}</p>
              </button>
            ))}
          </div>
        </section>

        {/* TIME SLOTS */}
        {selectedDate && (
          <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <h3 className="text-2xl font-black mb-6 flex items-center gap-3">
              <Clock className="w-8 h-8 text-teal-600" /> Select Time
            </h3>
            <div className="grid grid-cols-3 gap-4">
              {timeSlots.map((time) => (
                <button
                  key={time}
                  onClick={() => setSelectedTime(time)}
                  className={`py-4 rounded-2xl font-bold transition-all ${
                    selectedTime === time
                      ? "bg-gradient-to-r from-purple-600 to-teal-600 text-white shadow-xl"
                      : "bg-gray-100 hover:bg-purple-100"
                  }`}
                >
                  {time}
                </button>
              ))}
            </div>
          </motion.section>
        )}

        {/* LOCATION */}
        <section>
          <h3 className="text-2xl font-black mb-6">Where?</h3>
          <div className="space-y-3">
            {["Provider's Studio", "My Hostel", "Event Venue (+₦2,500)"].map((loc) => (
              <label
                key={loc}
                className="flex items-center justify-between p-5 bg-white rounded-2xl border-2 border-gray-200 cursor-pointer hover:border-purple-400 transition"
              >
                <div className="flex items-center gap-4">
                  <input
                    type="radio"
                    name="location"
                    value={loc}
                    checked={location === loc}
                    onChange={(e) => setLocation(e.target.value)}
                    className="w-6 h-6 text-purple-600"
                  />
                  <span className="font-bold text-lg">{loc.split(" (")[0]}</span>
                </div>
                {loc.includes("(+") && <span className="text-purple-600 font-black">+₦2,500</span>}
              </label>
            ))}
          </div>
        </section>

        {/* ADD-ONS — NAILS EDITION */}
        <section>
          <h3 className="text-2xl font-black mb-6">Add-ons (Optional)</h3>
          <div className="space-y-4">
            {Object.keys(addons).map((addon) => (
              <div key={addon} className="bg-white rounded-2xl p-5 flex items-center justify-between shadow-md">
                <div>
                  <p className="font-black text-lg">{addon}</p>
                  <p className="text-sm text-gray-600">+₦1,000 {addon.includes("per nail") ? "each" : ""}</p>
                </div>
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setAddons(prev => ({ ...prev, [addon]: Math.max(0, prev[addon] - 1) }))}
                    className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center hover:bg-gray-200"
                  >
                    <Minus className="w-5 h-5" />
                  </button>
                  <span className="text-2xl font-black w-12 text-center">{addons[addon]}</span>
                  <button
                    onClick={() => setAddons(prev => ({ ...prev, [addon]: prev[addon] + 1 }))}
                    className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center hover:bg-purple-200"
                  >
                    <Plus className="w-5 h-5 text-purple-600" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* NOTE */}
        <section>
          <h3 className="text-2xl font-black mb-4">Note to Tech (Optional)</h3>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. I want chrome French tips, medium coffin, matte top coat..."
            className="w-full p-5 bg-white rounded-2xl border-2 border-gray-200 focus:border-purple-500 focus:outline-none text-lg h-32 resize-none"
          />
        </section>

        {/* PRICE SUMMARY */}
        <div className="bg-gradient-to-r from-purple-600 to-teal-600 text-white rounded-3xl p-8 shadow-2xl">
          <div className="flex justify-between items-center mb-6">
            <p className="text-3xl font-black">Total</p>
            <p className="text-5xl font-black">₦{total.toLocaleString()}</p>
          </div>
          <div className="space-y-3 text-lg opacity-90">
            <div className="flex justify-between"><span>Base Set</span><span>₦{basePrice.toLocaleString()}</span></div>
            {addonPrice > 0 && <div className="flex justify-between"><span>Add-ons</span><span>₦{addonPrice.toLocaleString()}</span></div>}
            {travelFee > 0 && <div className="flex justify-between"><span>Travel Fee</span><span>+₦2,500</span></div>}
          </div>
        </div>

        {/* ESCROW TRUST */}
        <div className="bg-purple-50 rounded-3xl p-6 text-center border-2 border-purple-200">
          <Shield className="w-16 h-16 text-purple-600 mx-auto mb-3" />
          <p className="text-2xl font-black">100% Escrow Protected</p>
          <p className="text-gray-700 mt-2">You pay now. {p.name.split(" by ")[0]} gets paid only after you say "Perfect"</p>
        </div>

        {/* PAY BUTTON */}
        <motion.button
          onClick={handlePay}
          whileTap={{ scale: 0.95 }}
          className="w-full py-8 bg-gradient-to-r from-purple-600 to-teal-600 text-white font-black text-3xl rounded-3xl shadow-2xl flex items-center justify-center gap-5"
        >
          <CreditCard className="w-10 h-10" />
          Pay ₦{total.toLocaleString()} & Confirm
        </motion.button>

        <p className="text-center text-sm text-gray-500">
          By booking, you agree to StudEx{" "}
          <Link href="/terms" className="text-purple-600 underline">Terms</Link>
        </p>
      </div>
    </>
  );
}