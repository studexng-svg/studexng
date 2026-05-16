// src/app/laundry/[id]/page.tsx  ← FINAL FIXED VERSION

"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { 
  Star, MapPin, Clock, Truck, Shield, MessageCircle, 
  ChevronLeft, CheckCircle, Package, Zap, Shirt,
  Send   // ← THIS WAS MISSING
} from "lucide-react";
import { useState } from "react";

const vendors: Record<string, any> = {
  freshfold: {
    id: "freshfold",
    name: "FreshFold OAU",
    rating: 4.9,
    reviews: 892,
    responseTime: "12 mins",
    turnaround: "24–48 hrs",
    price: "From ₦3,000",
    location: "Moremi Hall Basement",
    verified: true,
    express: true,
    img: "laundry-vendor-1.jpg",
    bio: "Campus #1 laundry since 2022. We handle 500+ kg weekly. Free pickup & delivery in 30 mins. Same-day express available.",
    services: [
      { name: "Wash + Fold (10kg)", price: 3000 },
      { name: "Wash + Iron (5kg)", price: 4000 },
      { name: "Express 24hr (5kg)", price: 6000 },
      { name: "Dry Cleaning (per piece)", price: 2500 },
      { name: "Bedding Set (Duvet + Sheets)", price: 5000 },
    ],
    portfolio: ["freshfold-1.jpg", "freshfold-2.jpg", "freshfold-3.jpg", "freshfold-4.jpg", "freshfold-5.jpg", "freshfold-6.jpg"],
    bookings: "1,200+",
  },
  pressking: {
    id: "pressking",
    name: "PressKing Laundry",
    rating: 4.9,
    reviews: 756,
    responseTime: "15 mins",
    turnaround: "24–36 hrs",
    price: "From ₦4,000",
    location: "SUB Gate",
    verified: true,
    express: true,
    img: "laundry-vendor-4.jpg",
    bio: "Crisp ironing specialists. Your native wears, shirts & suits come back runway ready.",
    services: [
      { name: "Wash + Iron (5kg)", price: 4000 },
      { name: "Native Wear Press", price: 3000 },
      { name: "Suit Dry Clean", price: 8000 },
      { name: "Express Ironing", price: 5000 },
    ],
    portfolio: ["pressking-1.jpg", "pressking-2.jpg", "pressking-3.jpg", "pressking-4.jpg"],
  },
  cleanqueen: {
    id: "cleanqueen",
    name: "CleanQueen",
    rating: 4.8,
    reviews: 643,
    responseTime: "18 mins",
    turnaround: "36–48 hrs",
    price: "From ₦2,500",
    location: "Angola Hall",
    verified: true,
    express: false,
    img: "laundry-vendor-2.jpg",
    bio: "Gentle care for your delicate fabrics. Ankara, lace, silk — we treat them like royalty.",
    services: [
      { name: "Dry Cleaning (Native)", price: 2500 },
      { name: "Lace & Ankara Care", price: 3500 },
      { name: "Curtains & Beddings", price: 6000 },
    ],
  },
};

export default function LaundryVendorProfile() {
  const router = useRouter();
  const { id } = useParams();
  const vendorId = (Array.isArray(id) ? id[0] : id) ?? "freshfold";
  const vendor = vendors[vendorId] || vendors.freshfold;

  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<string[]>([]);

  const sendMessage = () => {
    if (!message.trim()) return;
    setMessages(prev => [...prev, message]);
    setMessage("");
  };

  return (
    <>
      <div className="min-h-screen bg-gray-50 pb-32">

        {/* TOP BAR */}
        <div className="sticky top-0 bg-white/95 backdrop-blur-2xl z-50 border-b">
          <div className="flex items-center justify-between p-4">
            <button onClick={() => router.back()} className="p-3 hover:bg-purple-100 rounded-full transition active:scale-95">
              <ChevronLeft className="w-8 h-8 text-purple-700" />
            </button>
            <h1 className="text-xl font-black text-gray-900">{vendor.name}</h1>
            <div className="w-12" />
          </div>
        </div>

        {/* HERO */}
        <div className="relative h-80">
          <Image src={`/images/${vendor.img}`} alt={vendor.name} fill className="object-cover" priority />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

          {vendor.express && (
            <div className="absolute top-8 right-6 bg-orange-500 text-white font-black px-5 py-2 rounded-full shadow-2xl animate-pulse text-sm">
              24hr Express Available
            </div>
          )}

          <div className="absolute bottom-6 left-6 text-white">
            <h1 className="text-4xl font-black drop-shadow-2xl">{vendor.name}</h1>
            {vendor.verified && (
              <div className="flex items-center gap-2 mt-2">
                <CheckCircle className="w-7 h-7 text-blue-400 drop-shadow-lg" />
                <span className="font-black text-lg">Verified Service</span>
              </div>
            )}
          </div>
        </div>

        {/* STATS */}
        <div className="px-6 -mt-10 relative z-10">
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="bg-white rounded-3xl shadow-2xl p-6 border-2 border-purple-100"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Star className="w-9 h-9 text-yellow-500 fill-current" />
                <div>
                  <span className="text-3xl font-black">{vendor.rating}</span>
                  <span className="text-gray-600 ml-2">({vendor.reviews} reviews)</span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-3xl font-black text-purple-600">{vendor.price}</p>
                <p className="text-sm text-gray-600">Starting price</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-3">
                <MapPin className="w-6 h-6 text-purple-600" />
                <span className="font-bold">{vendor.location}</span>
              </div>
              <div className="flex items-center gap-3">
                <Clock className="w-6 h-6 text-teal-600" />
                <span className="font-bold">Replies in {vendor.responseTime}</span>
              </div>
            </div>
          </motion.div>
        </div>

        <div className="px-6 mt-8 space-y-8">

          {/* ABOUT */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
            <h2 className="text-2xl font-black mb-4">About</h2>
            <p className="text-gray-700 text-lg leading-relaxed">{vendor.bio}</p>
          </motion.div>

          {/* SERVICES */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
            <h2 className="text-2xl font-black mb-4">Services & Pricing</h2>
            <div className="space-y-3">
              {vendor.services.map((s: any, i: number) => (
                <div key={i} className="bg-white rounded-2xl p-5 flex justify-between items-center shadow-md border border-purple-50">
                  <div>
                    <p className="font-black text-lg">{s.name}</p>
                  </div>
                  <p className="text-2xl font-black text-purple-600">₦{s.price.toLocaleString()}</p>
                </div>
              ))}
            </div>
          </motion.div>

          {/* PORTFOLIO */}
          {vendor.portfolio && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
              <h2 className="text-2xl font-black mb-4">Before & After</h2>
              <div className="grid grid-cols-3 gap-3">
                {vendor.portfolio.map((img: string, i: number) => (
                  <div key={i} className="relative aspect-square rounded-2xl overflow-hidden shadow-xl ring-2 ring-purple-100">
                    <Image src={`/images/${img}`} alt="Result" fill className="object-cover hover:scale-110 transition-transform duration-500" />
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* CTA */}
          <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.6 }} className="space-y-4">
            <Link href={`/laundry/${vendorId}/book`}>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.96 }}
                className="w-full py-6 bg-gradient-to-r from-purple-600 to-teal-600 text-white font-black text-2xl rounded-3xl shadow-2xl flex items-center justify-center gap-4"
              >
                <Truck className="w-9 h-9" /> Book Pickup Now
              </motion.button>
            </Link>

            <button className="w-full py-5 border-4 border-purple-300 text-purple-700 font-black text-xl rounded-3xl hover:bg-purple-50 transition">
              <MessageCircle className="w-7 h-7 inline mr-2" /> Chat with {vendor.name.split(" ")[0]}
            </button>
          </motion.div>

          {/* ESCROW */}
          <div className="bg-gradient-to-r from-purple-50 to-teal-50 rounded-3xl p-6 text-center border-2 border-purple-200">
            <Shield className="w-14 h-14 text-purple-600 mx-auto mb-3" />
            <p className="font-black text-xl">100% Escrow Protected</p>
            <p className="text-gray-700 mt-1">Pay only when your clothes come back FRESH</p>
          </div>

          {/* QUICK CHAT */}
          <div className="bg-white rounded-3xl shadow-2xl border-2 border-purple-100 overflow-hidden">
            <div className="bg-gradient-to-r from-purple-600 to-teal-600 text-white p-6">
              <h3 className="text-xl font-black">Quick Chat</h3>
              <p className="text-sm opacity-90">Ask about pickup time, detergent, or special care</p>
            </div>

            <div className="h-64 overflow-y-auto p-5 space-y-4">
              {messages.length === 0 ? (
                <p className="text-center text-gray-400 mt-20 text-lg">Say hi and book your laundry</p>
              ) : (
                messages.map((msg, i) => (
                  <div key={i} className="flex justify-end">
                    <div className="bg-gradient-to-r from-purple-600 to-teal-600 text-white rounded-3xl rounded-br-none px-6 py-4 max-w-xs shadow-lg">
                      {msg}
                      <p className="text-xs opacity-70 text-right mt-1">Seen</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-4 border-t bg-gray-50">
              <div className="flex gap-3">
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                  placeholder="e.g. Can you pick up tomorrow 10AM?"
                  className="flex-1 bg-white border-2 border-purple-200 rounded-full px-6 py-4 focus:outline-none focus:border-purple-500 transition"
                />
                <button onClick={sendMessage} className="w-14 h-14 bg-gradient-to-r from-purple-600 to-teal-600 rounded-full flex items-center justify-center shadow-2xl active:scale-95">
                  <Send className="w-6 h-6 text-white" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* BOTTOM NAV */}
        <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xl border-t z-50 shadow-2xl">
          <div className="flex justify-around py-3">
            <Link href="/" className="text-gray-500 text-xs">Home</Link>
            <Link href="/categories" className="text-gray-500 text-xs">Categories</Link>
            <Link href="/laundry" className="text-purple-600 font-black text-sm">Laundry</Link>
            <Link href="/bookings" className="text-gray-500 text-xs">Bookings</Link>
            <Link href="/account" className="text-gray-500 text-xs">Account</Link>
          </div>
        </div>
      </div>
    </>
  );
}