// src/app/laundry/[id]/book/page.tsx  ← LAUNDRY BOOKING PAGE (GOD TIER)

"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { 
  Calendar, Clock, MapPin, Truck, Plus, Minus, 
  ChevronLeft, Shield, Check, CreditCard, Package, Zap 
} from "lucide-react";
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

const vendors: Record<string, any> = {
  freshfold: { name: "FreshFold OAU", img: "laundry-vendor-1.jpg", location: "Moremi Hall Basement", verified: true },
  pressking: { name: "PressKing Laundry", img: "laundry-vendor-4.jpg", location: "SUB Gate", verified: true },
  cleanqueen: { name: "CleanQueen", img: "laundry-vendor-2.jpg", location: "Angola Hall", verified: true },
};

export default function LaundryBookingPage() {
  const router = useRouter();
  const { id } = useParams();
  const vendorId = (Array.isArray(id) ? id[0] : id) ?? "freshfold";
  const v = vendors[vendorId] || vendors.freshfold;

  const setBooking = useBookingStore((state) => state.setBooking);

  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [kg, setKg] = useState(5);
  const [serviceType, setServiceType] = useState("Wash + Fold");
  const [detergent, setDetergent] = useState("Regular");
  const [note, setNote] = useState("");

  // Price Logic
  const basePricePerKg = serviceType === "Wash + Fold" ? 600 : 
                        serviceType === "Wash + Iron" ? 800 : 
                        serviceType === "Express 24hr" ? 1200 : 500;

  const total = kg * basePricePerKg + (detergent === "Premium (Hypoallergenic)" ? 2000 : 0);

  const timeSlots = [
    "8-10AM", "10-12PM", "12-2PM", "2-4PM", "4-6PM", "6-8PM"
  ];

  const upcomingDates = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i + 1);
    return d;
  });

  const handlePay = () => {
    if (!selectedDate || !selectedTime) {
      alert("Please select pickup date and time");
      return;
    }

    setBooking({
      providerId: vendorId,
      providerName: v.name,
      providerImg: v.img,
      service: `${serviceType} (${kg}kg)`,
      date: formatDate(selectedDate),
      time: selectedTime,
      location: "Free Pickup from Your Hostel",
      addons: { kg, detergent },
      note,
      total,
      category: "Laundry"
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
          <h1 className="text-xl font-black text-gray-900">Book Laundry</h1>
          <div className="w-12" />
        </div>
      </div>

      {/* VENDOR CARD */}
      <div className="px-6 pt-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl shadow-xl p-6 flex items-center gap-5 border border-purple-100"
        >
          <div className="relative w-24 h-24 rounded-3xl overflow-hidden ring-4 ring-purple-100">
            <Image src={`/images/${v.img}`} alt={v.name} fill className="object-cover" />
          </div>
          <div>
            <h2 className="text-2xl font-black">{v.name}</h2>
            <p className="text-gray-600 flex items-center gap-2 mt-1">
              <MapPin className="w-5 h-5" /> {v.location}
            </p>
            {v.verified && (
              <p className="text-sm text-blue-600 font-bold mt-2 flex items-center gap-1">
                <Check className="w-4 h-4" /> Verified Vendor
              </p>
            )}
          </div>
        </motion.div>
      </div>

      <div className="px-6 pt-8 pb-40 space-y-10">

        {/* SERVICE TYPE */}
        <section>
          <h3 className="text-2xl font-black mb-6">Service Type</h3>
          <div className="grid grid-cols-2 gap-4">
            {["Wash + Fold", "Wash + Iron", "Express 24hr", "Dry Clean"].map((type) => (
              <button
                key={type}
                onClick={() => setServiceType(type)}
                className={`py-5 rounded-2xl font-bold transition-all border-2 ${
                  serviceType === type
                    ? "bg-gradient-to-r from-purple-600 to-teal-600 text-white border-transparent shadow-xl"
                    : "bg-white border-gray-200 hover:border-purple-400"
                }`}
              >
                {type === "Express 24hr" && <Zap className="w-5 h-5 inline mr-2" />}
                {type}
              </button>
            ))}
          </div>
        </section>

        {/* KG SELECTOR */}
        <section>
          <h3 className="text-2xl font-black mb-6">How Many Kg?</h3>
          <div className="bg-white rounded-3xl p-8 shadow-xl border-2 border-purple-100">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setKg(Math.max(1, kg - 1))}
                className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center hover:bg-gray-200 transition"
              >
                <Minus className="w-6 h-6" />
              </button>
              <div className="text-center">
                <p className="text-6xl font-black text-purple-600">{kg}</p>
                <p className="text-xl font-bold text-gray-700">kg</p>
              </div>
              <button
                onClick={() => setKg(kg + 1)}
                className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center hover:bg-purple-200 transition"
              >
                <Plus className="w-6 h-6 text-purple-600" />
              </button>
            </div>
            <p className="text-center text-sm text-gray-600 mt-4">Average bag = 5–7kg</p>
          </div>
        </section>

        {/* DETERGENT */}
        <section>
          <h3 className="text-2xl font-black mb-6">Detergent Preference</h3>
          <div className="space-y-3">
            {["Regular", "Premium (Hypoallergenic)"].map((det) => (
              <label key={det} className="flex items-center justify-between p-5 bg-white rounded-2xl border-2 border-gray-200 cursor-pointer hover:border-purple-400 transition">
                <div className="flex items-center gap-4">
                  <input
                    type="radio"
                    name="detergent"
                    checked={detergent === det}
                    onChange={() => setDetergent(det)}
                    className="w-6 h-6 text-purple-600"
                  />
                  <span className="font-bold text-lg">{det}</span>
                </div>
                {det.includes("Premium") && <span className="text-purple-600 font-black">+₦2,000</span>}
              </label>
            ))}
          </div>
        </section>

        {/* DATE */}
        <section>
          <h3 className="text-2xl font-black mb-6 flex items-center gap-3">
            <Calendar className="w-8 h-8 text-purple-600" /> Pickup Date
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
                <p className="text-2xl font-Black mt-1">{date.getDate()}</p>
                <p className="text-xs mt-1">{date.toLocaleDateString("en-US", { month: "short" })}</p>
              </button>
            ))}
          </div>
        </section>

        {/* TIME */}
        {selectedDate && (
          <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <h3 className="text-2xl font-black mb-6 flex items-center gap-3">
              <Clock className="w-8 h-8 text-teal-600" /> Pickup Time
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

        {/* NOTE */}
        <section>
          <h3 className="text-2xl font-black mb-4">Special Instructions (Optional)</h3>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Separate whites, no bleach on my native, fold shirts on hangers..."
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
            <div className="flex justify-between"><span>{kg}kg × {serviceType}</span><span>₦{(kg * basePricePerKg).toLocaleString()}</span></div>
            {detergent.includes("Premium") && <div className="flex justify-between"><span>Premium Detergent</span><span>+₦2,000</span></div>}
            <div className="flex justify-between"><span>Free Pickup + Delivery</span><span className="text-green-300">FREE</span></div>
          </div>
        </div>

        {/* ESCROW */}
        <div className="bg-purple-50 rounded-3xl p-6 text-center border-2 border-purple-200">
          <Shield className="w-16 h-16 text-purple-600 mx-auto mb-3" />
          <p className="text-2xl font-black">100% Escrow Protected</p>
          <p className="text-gray-700 mt-2">You pay now. {v.name.split(" ")[0]} gets paid only when you say "FRESH"</p>
        </div>

        {/* PAY BUTTON */}
        <motion.button
          onClick={handlePay}
          whileTap={{ scale: 0.95 }}
          className="w-full py-8 bg-gradient-to-r from-purple-600 to-teal-600 text-white font-black text-3xl rounded-3xl shadow-2xl flex items-center justify-center gap-5"
        >
          <CreditCard className="w-10 h-10" />
          Pay ₦{total.toLocaleString()} & Book
        </motion.button>

        <p className="text-center text-sm text-gray-500">
          By booking, you agree to StudEx <Link href="/terms" className="text-purple-600 underline">Terms</Link>
        </p>
      </div>
    </>
  );
}