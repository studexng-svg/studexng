// src/app/nails/[id]/page.tsx  ← NAILS PROVIDER PROFILE (EXACT TWIN OF LASHES)

"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Star, MapPin, Clock, MessageCircle, Calendar, CheckCircle, Shield, ChevronLeft, Send } from "lucide-react";
import { useState } from "react";

const providers: Record<string, any> = {
  temi: {
    id: "temi",
    name: "Queen Nails by Temi",
    rating: 4.9,
    reviews: 489,
    responseTime: "8 mins",
    price: "From ₦7,500",
    location: "Angola Hall Basement",
    verified: true,
    img: "nails-vendor-1.jpg",
    bio: "Campus nail queen since 2022. Chrome, 3D, French, Aura — I do it all. Same-day slots available!",
    skills: ["Gel Polish", "Acrylic Full Set", "Chrome", "French Tips", "3D Nails", "Ombré", "Cat Eye", "Velvet Nails"],
    portfolio: ["temi-1.jpg", "temi-2.jpg", "temi-3.jpg", "temi-4.jpg", "temi-5.jpg", "temi-6.jpg"],
    duration: "45–120 mins",
    availability: "Mon–Sun, 10AM–9PM",
  },
  glow: {
    id: "glow",
    name: "Glow Studio",
    rating: 4.8,
    reviews: 367,
    responseTime: "12 mins",
    price: "From ₦8,500",
    location: "Moremi Block C",
    verified: true,
    img: "nails-vendor-2.jpg",
    bio: "Your go-to for clean, long-lasting sets. Specialize in minimal + chrome finishes.",
    skills: ["Gel", "Chrome", "Minimal", "Aura", "Cat Eye", "Builder Gel"],
    portfolio: ["glow-1.jpg", "glow-2.jpg", "glow-3.jpg", "glow-4.jpg"],
    duration: "50–100 mins",
    availability: "Mon–Sat, 11AM–8PM",
  },
  // Add others later
};

export default function ProviderProfile() {
  const router = useRouter();
  const { id } = useParams();
  const providerId = (Array.isArray(id) ? id[0] : id) ?? "temi";
  const provider = providers[providerId] || providers.temi;

  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<string[]>([]);

  const sendMessage = () => {
    if (!message.trim()) return;
    setMessages(prev => [...prev, message]);
    setMessage("");
    setTimeout(() => {
      const lastMsg = document.getElementById(`msg-${messages.length}`);
      lastMsg?.classList.add("seen");
    }, 1500);
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
            <h1 className="text-xl font-black text-gray-900">{provider.name}</h1>
            <div className="w-12" />
          </div>
        </div>

        {/* HERO IMAGE WITH BADGES */}
        <div className="relative h-80">
          <Image src={`/images/${provider.img}`} alt={provider.name} fill className="object-cover" priority />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

          {/* SAME DAY BADGE */}
          {provider.responseTime.includes("8") && (
            <div className="absolute top-8 right-6 bg-green-500 text-white font-black px-5 py-2 rounded-full shadow-2xl animate-pulse text-sm">
              Same Day Available
            </div>
          )}

          {/* #1 ON CAMPUS BADGE */}
          {provider.id === "temi" && (
            <div className="absolute top-20 left-6 bg-gradient-to-r from-purple-600 to-teal-600 text-white font-black px-5 py-2 rounded-full shadow-2xl rotate-12 text-sm">
              #1 on Campus
            </div>
          )}

          <div className="absolute bottom-6 left-6 text-white">
            <h1 className="text-4xl font-black drop-shadow-2xl">{provider.name}</h1>
            {provider.verified && (
              <div className="flex items-center gap-2 mt-2">
                <CheckCircle className="w-7 h-7 text-blue-400 drop-shadow-lg" />
                <span className="font-black text-lg">Verified Provider</span>
              </div>
            )}
          </div>
        </div>

        {/* STATS CARD */}
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
                  <span className="text-3xl font-black">{provider.rating}</span>
                  <span className="text-gray-600 ml-2">({provider.reviews} reviews)</span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-3xl font-black text-purple-600">{provider.price}</p>
                <p className="text-sm text-gray-600">Starting price</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-3">
                <MapPin className="w-6 h-6 text-purple-600" />
                <span className="font-bold">{provider.location}</span>
              </div>
              <div className="flex items-center gap-3">
                <Clock className="w-6 h-6 text-teal-600" />
                <span className="font-bold">Replies in {provider.responseTime}</span>
              </div>
            </div>
          </motion.div>
        </div>

        <div className="px-6 mt-8 space-y-8">

          {/* ABOUT */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
            <h2 className="text-2xl font-black mb-4">About</h2>
            <p className="text-gray-700 text-lg leading-relaxed">{provider.bio}</p>
          </motion.div>

          {/* SKILLS */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
            <h2 className="text-2xl font-black mb-4">Skills & Styles</h2>
            <div className="flex flex-wrap gap-3">
              {provider.skills.map((skill: string) => (
                <span key={skill} className="px-6 py-3 bg-gradient-to-r from-purple-100 to-teal-100 text-purple-700 font-black rounded-full text-sm shadow-md">
                  {skill}
                </span>
              ))}
            </div>
          </motion.div>

          {/* PORTFOLIO */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
            <h2 className="text-2xl font-black mb-4">Portfolio</h2>
            <div className="grid grid-cols-3 gap-3">
              {provider.portfolio.map((img: string, i: number) => (
                <div key={i} className="relative aspect-square rounded-2xl overflow-hidden shadow-xl ring-2 ring-purple-100">
                  <Image src={`/images/${img}`} alt="Work" fill className="object-cover hover:scale-110 transition-transform duration-500" />
                </div>
              ))}
            </div>
          </motion.div>

          {/* CTA BUTTONS */}
          <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.6 }} className="space-y-4">
            <Link href={`/nails/${providerId}/book`}>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.96 }}
                className="w-full py-6 bg-gradient-to-r from-purple-600 to-teal-600 text-white font-black text-2xl rounded-3xl shadow-2xl flex items-center justify-center gap-4"
              >
                <Calendar className="w-9 h-9" /> Book Appointment Now
              </motion.button>
            </Link>

            <button className="w-full py-5 border-4 border-purple-300 text-purple-700 font-black text-xl rounded-3xl hover:bg-purple-50 transition">
              <MessageCircle className="w-7 h-7 inline mr-2" /> Chat with {provider.name.split(" ")[provider.name.split(" ").length - 1]}
            </button>
          </motion.div>

          {/* ESCROW TRUST */}
          <div className="bg-gradient-to-r from-purple-50 to-teal-50 rounded-3xl p-6 text-center border-2 border-purple-200">
            <Shield className="w-14 h-14 text-purple-600 mx-auto mb-3" />
            <p className="font-black text-xl">100% Escrow Protected</p>
            <p className="text-gray-700 mt-1">You only pay when you say “PERFECT”</p>
          </div>

          {/* IN-PAGE CHAT */}
          <div className="bg-white rounded-3xl shadow-2xl border-2 border-purple-100 overflow-hidden">
            <div className="bg-gradient-to-r from-purple-600 to-teal-600 text-white p-6">
              <h3 className="text-xl font-black">Quick Chat</h3>
              <p className="text-sm opacity-90">Ask about chrome, length, price — replies in minutes</p>
            </div>

            <div className="h-64 overflow-y-auto p-5 space-y-4">
              {messages.length === 0 ? (
                <p className="text-center text-gray-400 mt-20 text-lg">Say hi and book faster</p>
              ) : (
                messages.map((msg, i) => (
                  <div key={i} id={`msg-${i}`} className="flex justify-end">
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
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
                  placeholder="e.g. Hi Temi! Can you do chrome French tips tomorrow?"
                  className="flex-1 bg-white border-2 border-purple-200 rounded-full px-6 py-4 focus:outline-none focus:border-purple-500 transition"
                />
                <button onClick={sendMessage} className="w-14 h-14 bg-gradient-to-r from-purple-600 to-teal-600 rounded-full flex items-center justify-center shadow-2xl active:scale-95 transition">
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
            <Link href="/nails" className="text-purple-600 font-black text-sm">Nails</Link>
            <Link href="/bookings" className="text-gray-500 text-xs">Bookings</Link>
            <Link href="/account" className="text-gray-500 text-xs">Account</Link>
          </div>
        </div>
      </div>
    </>
  );
}