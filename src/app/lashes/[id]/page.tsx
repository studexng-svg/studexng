// src/app/lashes/[id]/page.tsx  ← STUDEx 2.0 PROVIDER PROFILE (e.g. /lashes/bella)
"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Star, MapPin, Clock, MessageCircle, Calendar, CheckCircle, Shield, ChevronLeft, Send, X } from "lucide-react";
import { useState } from "react";

const providers: Record<string, any> = {
  bella: {
    name: "Lash Queen Bella",
    rating: 4.9,
    reviews: 312,
    responseTime: "10 mins",
    price: "From ₦6,000",
    location: "Moremi Hall",
    verified: true,
    img: "lashes-vendor-1.jpg",
    bio: "5+ years doing lashes on campus. Specialize in classic & hybrid. Same-day booking available!",
    skills: ["Classic", "Volume", "Hybrid", "Lash Lift", "Russian Volume", "Mega Volume"],
    portfolio: ["bella-1.jpg", "bella-2.jpg", "bella-3.jpg", "bella-4.jpg"],
    duration: "45–90 mins",
    availability: "Mon–Sat, 9AM–8PM",
  },
  flutter: {
    name: "Flutter Studio",
    rating: 4.8,
    reviews: 289,
    responseTime: "15 mins",
    price: "From ₦8,000",
    location: "Angola Hall",
    verified: true,
    img: "lashes-vendor-2.jpg",
    bio: "Your go-to for dramatic volume & event lashes. Book early for weekends!",
    skills: ["Volume", "Mega Volume", "Wispy", "Cat Eye", "Doll Eye"],
    portfolio: ["flutter-1.jpg", "flutter-2.jpg", "flutter-3.jpg"],
    duration: "60–150 mins",
    availability: "Tue–Sun, 10AM–9PM",
  },
  lashbae: {
    name: "Lash Bae OAU",
    rating: 4.7,
    reviews: 198,
    responseTime: "20 mins",
    price: "From ₦5,500",
    location: "Fajuyi Hall",
    verified: false,
    img: "lashes-vendor-3.jpg",
    bio: "Affordable luxury lashes. First-timers get 10% off!",
    skills: ["Classic", "Hybrid", "Lash Lift + Tint", "Bottom Lashes"],
    portfolio: ["lashbae-1.jpg", "lashbae-2.jpg", "lashbae-3.jpg"],
    duration: "40–80 mins",
    availability: "Mon–Fri, 11AM–7PM",
  },
};

export default function ProviderProfile() {
  const router = useRouter();
  const { id } = useParams();
  const providerId = (Array.isArray(id) ? id[0] : id) ?? "bella";
  const provider = providers[providerId] || providers.bella;

  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<string[]>([]);

  const sendMessage = () => {
    if (!message.trim()) return;
    setMessages(prev => [...prev, message]);
    setMessage("");
    // In real app: send to backend + notify provider
  };

  return (
    <>
      <div className="min-h-screen bg-gray-50 pb-32">

        {/* TOP BAR */}
        <div className="sticky top-0 bg-white/95 backdrop-blur-xl z-50 border-b shadow-sm">
          <div className="flex items-center justify-between p-4">
            <button onClick={() => router.back()} className="p-3 hover:bg-purple-100 rounded-full transition">
              <ChevronLeft className="w-8 h-8 text-purple-600" />
            </button>
            <h1 className="text-xl font-black text-gray-900">{provider.name}</h1>
            <div className="w-12" />
          </div>
        </div>

        {/* HERO IMAGE + NAME */}
        <div className="relative h-80">
          <Image
            src={`/images/${provider.img}`}
            alt={provider.name}
            fill
            className="object-cover"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
          <div className="absolute bottom-6 left-6 text-white">
            <h1 className="text-4xl font-black">{provider.name}</h1>
            {provider.verified && (
              <div className="flex items-center gap-2 mt-2">
                <CheckCircle className="w-6 h-6 text-blue-400" />
                <span className="font-bold">Verified Provider</span>
              </div>
            )}
          </div>
        </div>

        <div className="px-6 -mt-10 relative z-10">
          <div className="bg-white rounded-3xl shadow-2xl p-6 border border-purple-100">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <Star className="w-8 h-8 text-yellow-500 fill-current" />
                  <span className="text-3xl font-black">{provider.rating}</span>
                  <span className="text-gray-600">({provider.reviews} reviews)</span>
                </div>
                <p className="text-lg text-gray-600 mt-2 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-teal-600" /> Responds in {provider.responseTime}
                </p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-black text-purple-600">{provider.price}</p>
                <p className="text-sm text-gray-600">Starting price</p>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-3">
                <MapPin className="w-5 h-5 text-purple-600" />
                <span className="font-medium">{provider.location}</span>
              </div>
              <div className="flex items-center gap-3">
                <Calendar className="w-5 h-5 text-teal-600" />
                <span className="font-medium">{provider.availability}</span>
              </div>
            </div>
          </div>
        </div>

        {/* BIO & SKILLS */}
        <div className="px-6 mt-8 space-y-8">
          <div>
            <h2 className="text-2xl font-black mb-4">About</h2>
            <p className="text-gray-700 text-lg leading-relaxed">{provider.bio}</p>
          </div>

          <div>
            <h2 className="text-2xl font-black mb-4">Skills & Styles</h2>
            <div className="flex flex-wrap gap-3">
              {provider.skills.map((skill: string) => (
                <span key={skill} className="px-5 py-3 bg-purple-100 text-purple-700 font-bold rounded-full text-sm">
                  {skill}
                </span>
              ))}
            </div>
          </div>

          {/* PORTFOLIO */}
          <div>
            <h2 className="text-2xl font-black mb-4">Portfolio</h2>
            <div className="grid grid-cols-3 gap-3">
              {provider.portfolio.map((img: string, i: number) => (
                <div key={i} className="relative aspect-square rounded-2xl overflow-hidden shadow-lg">
                  <Image src={`/images/${img}`} alt="Work" fill className="object-cover" />
                </div>
              ))}
            </div>
          </div>

          {/* BOOKING CTA */}
          <div className="space-y-4">
            <Link href={`/lashes/${providerId}/book`}>
              <motion.button
                whileTap={{ scale: 0.95 }}
                className="w-full py-6 bg-gradient-to-r from-purple-600 to-teal-600 text-white font-black text-2xl rounded-3xl shadow-2xl flex items-center justify-center gap-4"
              >
                <Calendar className="w-8 h-8" /> Book Appointment
              </motion.button>
            </Link>

            <button className="w-full py-5 border-2 border-purple-600 text-purple-600 font-black text-xl rounded-3xl flex items-center justify-center gap-3 hover:bg-purple-50 transition">
              <MessageCircle className="w-7 h-7" /> Chat with {provider.name.split(" ")[0]}
            </button>
          </div>

          {/* TRUST BADGES */}
          <div className="bg-gradient-to-r from-purple-50 to-teal-50 rounded-3xl p-6 text-center">
            <div className="flex items-center justify-center gap-3">
              <Shield className="w-10 h-10 text-purple-600" />
              <div>
                <p className="font-black text-lg">Escrow Protected</p>
                <p className="text-sm text-gray-600">Money held until job is done</p>
              </div>
            </div>
          </div>

          {/* IN-PAGE CHAT (Optional — can be modal later) */}
          <div className="bg-white rounded-3xl shadow-xl overflow-hidden border">
            <div className="bg-gradient-to-r from-purple-600 to-teal-600 text-white p-5">
              <h3 className="text-xl font-black">Chat with {provider.name.split(" ")[0]}</h3>
              <p className="text-sm opacity-90">Ask about price, availability, or custom styles</p>
            </div>
            <div className="h-64 overflow-y-auto p-5">
              {messages.length === 0 ? (
                <p className="text-center text-gray-400 mt-16">Start the conversation...</p>
              ) : (
                messages.map((msg, i) => (
                  <div key={i} className="flex justify-end mb-4">
                    <div className="bg-gradient-to-r from-purple-600 to-teal-600 text-white rounded-3xl rounded-br-none px-5 py-3 max-w-xs shadow-lg">
                      {msg}
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
                  placeholder="e.g. Can you do volume for ₦7k tomorrow?"
                  className="flex-1 bg-white border border-gray-300 rounded-full px-6 py-4 focus:outline-none focus:border-purple-500"
                />
                <button onClick={sendMessage} className="w-14 h-14 bg-gradient-to-r from-purple-600 to-teal-600 rounded-full flex items-center justify-center shadow-xl">
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
            <Link href="/lashes" className="text-purple-600 font-black text-sm">Lashes</Link>
            <Link href="/bookings" className="text-gray-500 text-xs">Bookings</Link>
            <Link href="/chat" className="text-gray-500 text-xs">Chat</Link>
            <Link href="/account" className="text-gray-500 text-xs">Account</Link>
          </div>
        </div>
      </div>
    </>
  );
}