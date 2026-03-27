"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Sparkles, Utensils, Shirt, Scissors, TrendingUp, Shield, MessageCircle, Zap, Heart, Users, Star, CheckCircle, Award, Quote } from "lucide-react";
import { useEffect, useState } from "react";
import Script from "next/script";
import { generateStructuredData } from "@/lib/metadata";

const reviews = [
  { name: "Valerie", text: "It was really neat and the registration was easy", stars: 5 },
  { name: "Emeh & Evelyn", text: "I love the interface and how easy it is to navigate", stars: 5 },
  { name: "Kachi", text: "It was super easy to navigate and everything worked perfectly for me", stars: 5 },
  { name: "Kachi", text: "I love the variety of vendors on there. I hope all the services will actually be available when you launch fully!", stars: 4 },
  { name: "Khalid, Semilore & Samuel", text: "I like the website layout and navigation", stars: 5 },
  { name: "Rehwa & Chierika", text: "I love everything about the idea and website", stars: 5 },
  { name: "Lolope & Nonye", text: "I like the aesthetics", stars: 5 },
];

function ReviewCarousel() {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrent(prev => (prev + 1) % reviews.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="py-32 bg-gradient-to-br from-purple-900 via-purple-800 to-teal-900 relative overflow-hidden">
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-0 left-0 w-96 h-96 bg-teal-400 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-pink-400 rounded-full blur-3xl" />
      </div>

      <div className="max-w-4xl mx-auto px-6 relative z-10">
        <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-16">
          <h2 className="text-5xl md:text-6xl font-black text-white mb-4">What Students Say</h2>
          <p className="text-xl text-white/70">Feedback from students</p>
        </motion.div>

        {/* Main carousel */}
        <div className="relative h-64 flex items-center justify-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={current}
              initial={{ opacity: 0, x: 100, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -100, scale: 0.9 }}
              transition={{ duration: 0.5, type: "spring", stiffness: 100 }}
              className="absolute w-full bg-white/10 backdrop-blur-xl rounded-3xl p-10 border border-white/20 shadow-2xl"
            >
              <Quote className="w-10 h-10 text-teal-400 mb-4 opacity-60" />
              <p className="text-xl md:text-2xl text-white font-medium leading-relaxed mb-6">
                "{reviews[current].text}"
              </p>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-teal-300 font-black text-lg">— {reviews[current].name}</p>
                  <p className="text-white/50 text-sm">PAU Student</p>
                </div>
                <div className="flex gap-1">
                  {Array.from({ length: reviews[current].stars }).map((_, i) => (
                    <Star key={i} className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                  ))}
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Dots */}
        <div className="flex justify-center gap-2 mt-8">
          {reviews.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`rounded-full transition-all duration-300 ${i === current ? "w-8 h-3 bg-teal-400" : "w-3 h-3 bg-white/30 hover:bg-white/50"}`}
            />
          ))}
        </div>

        {/* Mini cards row */}
        <div className="mt-12 grid grid-cols-3 gap-4">
          {reviews.slice(0, 3).map((review, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              viewport={{ once: true }}
              onClick={() => setCurrent(i)}
              className={`cursor-pointer p-4 rounded-2xl border transition-all ${i === current ? "bg-white/20 border-teal-400" : "bg-white/5 border-white/10 hover:bg-white/10"}`}
            >
              <div className="flex gap-0.5 mb-2">
                {Array.from({ length: review.stars }).map((_, s) => (
                  <Star key={s} className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                ))}
              </div>
              <p className="text-white/80 text-xs line-clamp-2">{review.text}</p>
              <p className="text-teal-300 text-xs font-bold mt-1">{review.name}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function LandingPage() {
  const [mounted, setMounted] = useState(false);
  const [isLoggedIn] = useState(false);

  useEffect(() => {
    setMounted(true);
    document.title = "StudEx - Campus Marketplace for Student Services | PAU";
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute("content", "Nigeria's #1 campus marketplace for students. Book lashes, nails, laundry, and food from verified vendors at Pan-Atlantic University. Fast, safe, and affordable.");
    }
  }, []);

  const navigate = (path: string) => { window.location.href = path; };

  if (!mounted || isLoggedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-800 to-teal-900 flex items-center justify-center">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
          <Sparkles className="w-16 h-16 text-white" />
        </motion.div>
      </div>
    );
  }

  const particlePositions = Array.from({ length: 8 }, () => ({
    x: Math.random() * 100,
    delay: Math.random() * 5,
  }));

  return (
    <>
      <Script id="structured-data-organization" type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(generateStructuredData.organization()) }} />
      <Script id="structured-data-local-business" type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(generateStructuredData.localBusiness()) }} />
      <Script id="structured-data-website" type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(generateStructuredData.website()) }} />

      {/* HERO */}
      <section className="min-h-screen bg-gradient-to-br from-teal-600 via-purple-700 to-pink-600 flex items-center justify-center relative overflow-hidden">
        <motion.div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 via-pink-500/20 to-teal-500/20"
          animate={{ background: ["linear-gradient(135deg, rgba(168,85,247,0.2) 0%, rgba(236,72,153,0.2) 50%, rgba(20,184,166,0.2) 100%)", "linear-gradient(135deg, rgba(20,184,166,0.2) 0%, rgba(168,85,247,0.2) 50%, rgba(236,72,153,0.2) 100%)"] }}
          transition={{ duration: 10, repeat: Infinity, ease: "linear" }} />

        <div className="absolute inset-0 pointer-events-none">
          {particlePositions.map((pos, i) => (
            <motion.div key={i} className="absolute text-2xl"
              initial={{ y: -100, x: `${pos.x}%`, opacity: 0.4 }}
              animate={{ y: "120vh", opacity: [0.4, 0.7, 0.4], rotate: [0, 360] }}
              transition={{ duration: 20 + i * 3, delay: pos.delay, repeat: Infinity, ease: "linear" }}>
              {i % 4 === 0 ? "📚" : i % 4 === 1 ? "✨" : i % 4 === 2 ? "🎓" : "⭐"}
            </motion.div>
          ))}
        </div>

        <div className="relative z-10 text-center px-6 max-w-5xl mx-auto">
          <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
            className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-xl border-2 border-white/30 rounded-full px-8 py-4 mb-8 shadow-2xl">
            <TrendingUp className="w-6 h-6 text-yellow-300" />
            <span className="text-white font-black text-base">🇳🇬 Nigeria's #1 Campus Marketplace 🎓</span>
          </motion.div>

          <motion.h1 initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.8 }}
            className="text-5xl md:text-7xl font-black text-white leading-tight mb-6 drop-shadow-2xl">
            The Campus Marketplace
            <span className="block bg-gradient-to-r from-yellow-300 via-pink-300 to-teal-300 bg-clip-text text-transparent">
              for Student Services
            </span>
          </motion.h1>

          <motion.p initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }}
            className="text-xl md:text-3xl text-white/95 mt-6 font-medium max-w-3xl mx-auto">
            Book lashes, nails, laundry & food from verified vendors — fast, safe, and affordable.
          </motion.p>

          <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.6 }}
            className="mt-12 flex flex-col sm:flex-row gap-5 justify-center items-center">
            <motion.button onClick={() => navigate("/auth")}
              whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.95 }}
              className="px-14 py-7 bg-gradient-to-r from-teal-500 to-purple-600 text-white font-black text-2xl rounded-full shadow-2xl flex items-center gap-4">
              Get Started Free 🚀 <ArrowRight className="w-8 h-8" />
            </motion.button>
            <motion.button onClick={() => navigate("/auth")}
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              className="px-14 py-7 bg-white/15 backdrop-blur-2xl border-2 border-white/40 text-white font-black text-2xl rounded-full hover:bg-white/25 transition-all shadow-xl">
              Sign In
            </motion.button>
          </motion.div>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }}
            className="mt-20 grid grid-cols-3 gap-8 max-w-2xl mx-auto">
            {[{ value: "1K+", label: "Happy Students" }, { value: "20+", label: "Verified Vendors" }, { value: "4.0★", label: "Average Rating" }].map((stat, i) => (
              <motion.div key={i} whileHover={{ scale: 1.1 }}
                className="text-center bg-white/10 backdrop-blur-xl rounded-2xl p-6 border border-white/20">
                <p className="text-4xl md:text-5xl font-black text-white">{stat.value}</p>
                <p className="text-sm md:text-base text-white/80 mt-2 font-medium">{stat.label}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>

        <motion.div initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 1.5 }}
          className="absolute bottom-10 left-1/2 -translate-x-1/2">
          <motion.p animate={{ y: [0, 10, 0] }} transition={{ duration: 2, repeat: Infinity }} className="text-white/70 font-medium">
            Scroll to explore ↓
          </motion.p>
        </motion.div>
      </section>

      {/* SERVICES */}
      <section className="py-32 bg-[#FFF8F0] relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div initial={{ opacity: 0, y: 50 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-20">
            <h2 className="text-6xl md:text-7xl font-black bg-gradient-to-r from-purple-600 to-teal-600 bg-clip-text text-transparent mb-4">Our Services</h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">Everything you need, one tap away</p>
          </motion.div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { icon: Sparkles, title: "Lashes", desc: "Expert lash extensions & maintenance", color: "from-pink-500 to-pink-600" },
              { icon: Scissors, title: "Nails", desc: "Manicures, pedicures, nail art & gel", color: "from-purple-500 to-purple-600" },
              { icon: Shirt, title: "Laundry", desc: "Fast, professional laundry & ironing", color: "from-blue-500 to-blue-600" },
              { icon: Utensils, title: "Food", desc: "Fresh meals delivered to your hostel", color: "from-orange-500 to-orange-600" },
            ].map((service, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 50 }} whileInView={{ opacity: 1, y: 0 }}
                whileHover={{ y: -15, scale: 1.05 }} transition={{ delay: i * 0.1 }} viewport={{ once: true }}
                className="bg-white/80 backdrop-blur-xl p-8 rounded-3xl shadow-xl hover:shadow-2xl transition border border-white">
                <div className={`w-16 h-16 bg-gradient-to-r ${service.color} rounded-2xl flex items-center justify-center mb-6`}>
                  <service.icon className="w-10 h-10 text-white" />
                </div>
                <h3 className="text-2xl font-black text-gray-900 mb-3">{service.title}</h3>
                <p className="text-gray-600 text-lg">{service.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* WHY STUDEX */}
      <section className="py-32 bg-[#FFFBF7]">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div initial={{ opacity: 0, y: 50 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-20">
            <h2 className="text-6xl md:text-7xl font-black bg-gradient-to-r from-purple-600 to-teal-600 bg-clip-text text-transparent mb-4">Why Choose StudEx?</h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">The smartest way to find trusted services on campus</p>
          </motion.div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { icon: Shield, title: "Safe & Secure", desc: "Payments split automatically — vendor gets paid instantly" },
              { icon: MessageCircle, title: "Chat & Book", desc: "Message vendors directly before booking" },
              { icon: Zap, title: "Instant Booking", desc: "Book in 10 seconds, no back and forth" },
              { icon: Heart, title: "Save Your Faves", desc: "Wishlist vendors you love" },
              { icon: Users, title: "Real Reviews", desc: "See what others are saying before booking" },
              { icon: TrendingUp, title: "Best Prices", desc: "Compare prices and get the best deals" },
            ].map((feature, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 50 }} whileInView={{ opacity: 1, y: 0 }}
                whileHover={{ y: -10, scale: 1.02 }} transition={{ delay: i * 0.1 }} viewport={{ once: true }}
                className="bg-white p-8 rounded-3xl shadow-lg hover:shadow-xl transition border-2 border-purple-100 hover:border-teal-300">
                <div className="w-16 h-16 bg-gradient-to-r from-teal-500 to-purple-600 rounded-2xl flex items-center justify-center mb-6 shadow-lg">
                  <feature.icon className="w-10 h-10 text-white" />
                </div>
                <h3 className="text-2xl font-black text-gray-900 mb-3">{feature.title}</h3>
                <p className="text-gray-600 text-lg">{feature.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* REVIEWS CAROUSEL */}
      <ReviewCarousel />

      {/* FINAL CTA */}
      <section className="py-40 bg-gradient-to-br from-teal-600 via-purple-700 to-pink-600 relative overflow-hidden">
        <div className="absolute inset-0">
          <motion.div animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }} transition={{ duration: 8, repeat: Infinity }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-600 rounded-full blur-3xl" />
        </div>
        <div className="text-center px-6 relative z-10">
          <motion.h2 initial={{ scale: 0.8, opacity: 0 }} whileInView={{ scale: 1, opacity: 1 }}
            className="text-6xl md:text-8xl font-black text-white mb-6">
            Everything You Need
          </motion.h2>
          <p className="text-2xl text-white/80 mb-12 max-w-2xl mx-auto">One app. All your campus services.</p>
          <motion.button onClick={() => navigate("/auth")}
            whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}
            className="px-20 py-10 bg-gradient-to-r from-teal-500 to-purple-600 text-white font-black text-4xl rounded-full shadow-2xl flex items-center gap-6 mx-auto">
            Start Booking Now
            <motion.div animate={{ rotate: [0, 360] }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}>
              <Sparkles className="w-12 h-12" />
            </motion.div>
          </motion.button>
          <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} transition={{ delay: 0.5 }}
            className="mt-16 flex items-center justify-center gap-6 flex-wrap">
            {["No Credit Card Required", "100% Free", "Instant Access"].map((text, i) => (
              <div key={i} className="flex items-center gap-2 text-white/70">
                <CheckCircle className="w-5 h-5 text-teal-400" />
                <span className="font-medium">{text}</span>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-gradient-to-br from-gray-900 to-gray-800 text-white py-16">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-8">
            <p className="text-3xl font-black bg-gradient-to-r from-purple-400 via-pink-400 to-teal-400 bg-clip-text text-transparent inline-block">
              StudEx • Made in Nigeria 🇳🇬
            </p>
          </div>
          <div className="flex justify-center gap-8 mb-8 text-sm">
            <button onClick={() => navigate("/terms")} className="text-white/60 hover:text-white transition">Terms</button>
            <button onClick={() => navigate("/privacy-policy")} className="text-white/60 hover:text-white transition">Privacy</button>
          </div>
          <p className="text-white/40 text-center text-sm">© 2025 StudEx. All rights reserved.</p>
        </div>
      </footer>
    </>
  );
}
