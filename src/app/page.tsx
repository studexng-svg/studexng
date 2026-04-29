"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight, Sparkles, Utensils, Shirt, Scissors,
  Shield, MessageCircle, Zap, Heart, Users, TrendingUp,
  Star, CheckCircle, Quote
} from "lucide-react";
import { useEffect, useState } from "react";
import Script from "next/script";
import Link from "next/link";
// REMOVE BEFORE PRODUCTION
import { generateStructuredData } from "@/lib/metadata";
import { GRAD, GRAD_TEXT, SERIF } from "@/lib/tokens";

/* ─── THEME ─────────────────────────────────────────────── */
// Primary:   #0D9488  (teal-600)
// Secondary: #7C3AED  (purple-600)
// Gradient:  teal → purple
// BG:        #FAFAF9  (warm cream/stone-50)
// Surface:   #FFFFFF
// Text:      #1C1917  (stone-900)

/* ─── DATA ─────────────────────────────────────────────── */
const reviews = [
  { name: "Valerie",                   text: "It was really neat and the registration was easy",                                                                stars: 5 },
  { name: "Emeh & Evelyn",             text: "I love the interface and how easy it is to navigate",                                                             stars: 5 },
  { name: "Kachi",                     text: "It was super easy to navigate and everything worked perfectly for me",                                            stars: 5 },
  { name: "Kachi",                     text: "I love the variety of vendors on there. I hope all the services will actually be available when you launch fully!", stars: 4 },
  { name: "Khalid, Semilore & Samuel", text: "I like the website layout and navigation",                                                                        stars: 5 },
  { name: "Rehwa & Chierika",          text: "I love everything about the idea and website",                                                                    stars: 5 },
  { name: "Lolope & Nonye",            text: "I like the aesthetics",                                                                                          stars: 5 },
];

const services = [
  { icon: Sparkles, title: "Lashes",  desc: "Expert extensions & precision maintenance", tag: "Beauty",     color: "from-purple-500 to-purple-700" },
  { icon: Scissors, title: "Nails",   desc: "Manicures, gel sets, intricate nail art",    tag: "Beauty",     color: "from-teal-500 to-teal-700" },
  { icon: Shirt,    title: "Laundry", desc: "Pick-up, wash, press, and return",           tag: "Essentials", color: "from-purple-400 to-teal-500" },
  { icon: Utensils, title: "Food",    desc: "Fresh meals delivered to your door",          tag: "Dining",     color: "from-teal-400 to-purple-500" },
];

const features = [
  { icon: Shield,        title: "Secure Payments",     desc: "Funds held in escrow. Released only when you're satisfied." },
  { icon: MessageCircle, title: "Direct Messaging",    desc: "Chat with vendors before you commit to a booking." },
  { icon: Zap,           title: "Instant Booking",     desc: "Reserve a slot in under 30 seconds, no back-and-forth." },
  { icon: Heart,         title: "Save Favourites",     desc: "Wishlist the vendors you trust and return to them easily." },
  { icon: Users,         title: "Verified Reviews",    desc: "Every rating is from a real student on campus." },
  { icon: TrendingUp,    title: "Transparent Pricing", desc: "Compare rates and always know exactly what you'll pay." },
];

/* ─── STAR ROW ─────────────────────────────────────────── */
function Stars({ count }: { count: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`w-4 h-4 ${i < count ? "fill-amber-400 text-amber-400" : "text-stone-200"}`}
        />
      ))}
    </div>
  );
}

/* ─── REVIEWS ───────────────────────────────────────────── */
function ReviewCarousel() {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setCurrent(p => (p + 1) % reviews.length), 5000);
    return () => clearInterval(t);
  }, []);

  return (
    <section className="py-32 bg-white relative overflow-hidden">
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-teal-300/50 to-transparent" />

      {/* Soft gradient blobs */}
      <div className="absolute top-10 left-1/4 w-64 h-64 rounded-full bg-teal-100/60 blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-1/4 w-64 h-64 rounded-full bg-purple-100/60 blur-3xl pointer-events-none" />

      <div className="max-w-4xl mx-auto px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-20"
        >
          <p className="text-teal-600 text-xs tracking-[0.3em] uppercase font-semibold mb-4">Student Voices</p>
          <h2 className="text-5xl md:text-6xl font-bold text-stone-900" style={SERIF}>
            What Students Say
          </h2>
        </motion.div>

        {/* Main card */}
        <div className="relative h-52 flex items-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={current}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.45 }}
              className="absolute w-full border border-stone-200 bg-stone-50 shadow-sm rounded-2xl p-10"
            >
              <Quote className="w-8 h-8 text-teal-400/60 mb-4" />
              <p className="text-xl text-stone-700 leading-relaxed mb-5 italic" style={SERIF}>
                "{reviews[current].text}"
              </p>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-stone-900 font-semibold text-sm">{reviews[current].name}</p>
                  <p className="text-stone-400 text-xs mt-0.5">PAU Student</p>
                </div>
                <Stars count={reviews[current].stars} />
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
              className={`rounded-full transition-all duration-300 ${
                i === current ? "w-6 h-1.5 bg-teal-500" : "w-1.5 h-1.5 bg-stone-300 hover:bg-stone-400"
              }`}
            />
          ))}
        </div>
      </div>

      <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-purple-200/50 to-transparent" />
    </section>
  );
}

/* ─── MAIN PAGE ─────────────────────────────────────────── */
export default function LandingPage() {
  const [mounted, setMounted] = useState(false);
  const [isLoggedIn] = useState(false);

  useEffect(() => {
    setMounted(true);
    document.title = "StudEx — Campus Marketplace for Student Services | PAU";
  }, []);

  const navigate = (path: string) => { window.location.href = path; };

  if (!mounted || isLoggedIn) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
          <Sparkles className="w-10 h-10 text-teal-500" />
        </motion.div>
      </div>
    );
  }

  return (
    <>
      {/* Google Fonts */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=DM+Sans:wght@300;400;500&display=swap"
        rel="stylesheet"
      />

      <Script id="sd-org"  type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(generateStructuredData.organization()) }} />
      <Script id="sd-biz"  type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(generateStructuredData.localBusiness()) }} />
      <Script id="sd-site" type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(generateStructuredData.website()) }} />

      {/* ── HERO ─────────────────────────────────────────── */}
      <div className="relative min-h-screen flex flex-col items-center justify-center px-6 text-center overflow-hidden">

        {/* Video background */}
        <video
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
          style={{ zIndex: 0 }}
        >
          <source src="/videos/hero.mp4" type="video/mp4" />
        </video>

        {/* Dark overlay over video */}
        <div className="absolute inset-0 bg-black/60" style={{ zIndex: 1 }} />

        {/* Dot grid overlay */}
        <div className="absolute inset-0 opacity-[0.04] pointer-events-none"
          style={{ backgroundImage: `radial-gradient(circle, #5eead4 1px, transparent 1px)`, backgroundSize: "24px 24px", zIndex: 2 }} />

        <div className="relative z-10 max-w-2xl mx-auto space-y-6" style={{ fontFamily: "'DM Sans', sans-serif" }}>

          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/5 text-teal-400 text-xs font-semibold tracking-[0.2em] uppercase"
          >
            <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
            PAU &amp; FUTO Campus Marketplace
          </motion.div>

          {/* Heading */}
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.35 }}
            className="text-4xl md:text-6xl font-bold text-white leading-tight"
            style={SERIF}
          >
            Everything you need,{" "}
            <span className="italic" style={{
              background: "linear-gradient(135deg, #2dd4bf 0%, #a78bfa 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text"
            }}>
              one tap away.
            </span>
          </motion.h1>

          {/* Subheading */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55 }}
            className="text-white/60 text-lg leading-relaxed"
          >
            Book nail artists, laundry, food, tutors and more — all from verified vendors on your campus. No stress, no hassle.
          </motion.p>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
            className="flex items-center justify-center gap-8 py-4"
          >
            <div className="text-center">
              <p className="text-2xl font-bold text-white">PAU</p>
              <p className="text-xs text-white/40 mt-0.5">Pan-Atlantic University</p>
            </div>
            <div className="w-px h-10 bg-white/10" />
            <div className="text-center">
              <p className="text-2xl font-bold text-white">FUTO</p>
              <p className="text-xs text-white/40 mt-0.5">Federal University of Technology</p>
            </div>
            <div className="w-px h-10 bg-white/10" />
            <div className="text-center">
              <p className="text-2xl font-bold text-white">100%</p>
              <p className="text-xs text-white/40 mt-0.5">Verified Vendors</p>
            </div>
          </motion.div>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.85 }}
            className="flex flex-col sm:flex-row gap-3 justify-center pt-2"
          >
            <Link href="/auth">
              <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                className="px-8 py-4 text-white font-semibold rounded-full shadow-lg shadow-teal-900/60 text-sm"
                style={{ background: GRAD }}>
                Get Started — It&apos;s Free
              </motion.button>
            </Link>
            <Link href="/home">
              <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                className="px-8 py-4 text-white/70 font-medium rounded-full border border-white/10 hover:border-white/20 text-sm transition">
                Browse Services
              </motion.button>
            </Link>
          </motion.div>

          {/* Scroll hint */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2 }}
            className="text-white/30 text-xs pt-4"
          >
            Scroll to explore ↓
          </motion.p>
        </div>
      </div>

      {/* ── SERVICES ─────────────────────────────────────── */}
      <section className="py-32 bg-[#FAFAF9]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
        <div className="max-w-6xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-16"
          >
            <p className="text-teal-600 text-xs tracking-[0.3em] uppercase font-semibold mb-3">What We Offer</p>
            <h2
              className="text-4xl md:text-5xl font-bold text-stone-900"
              style={SERIF}
            >
              Our Services
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
            {services.map((s, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                whileHover={{ y: -6 }}
                transition={{ delay: i * 0.08 }}
                viewport={{ once: true }}
                className="group border border-stone-200 bg-white hover:border-teal-300 rounded-2xl p-7 transition-all duration-300 shadow-sm hover:shadow-md"
              >
                <p className="text-purple-500 text-xs tracking-widest uppercase mb-4 font-medium">{s.tag}</p>
                <div
                  className={`w-10 h-10 mb-5 rounded-xl flex items-center justify-center bg-gradient-to-br ${s.color}`}
                >
                  <s.icon className="w-5 h-5 text-white" strokeWidth={1.5} />
                </div>
                <h3 className="text-xl font-semibold text-stone-900 mb-2" style={{ fontFamily: "'Playfair Display', serif" }}>
                  {s.title}
                </h3>
                <p className="text-stone-400 text-sm leading-relaxed">{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── WHY STUDEX ───────────────────────────────────── */}
      <section className="py-32 bg-white relative" style={{ fontFamily: "'DM Sans', sans-serif" }}>
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-teal-200/60 to-transparent" />

        {/* Background blobs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 right-0 w-80 h-80 rounded-full bg-purple-50/80 blur-3xl" />
          <div className="absolute bottom-20 left-0 w-80 h-80 rounded-full bg-teal-50/80 blur-3xl" />
        </div>

        <div className="max-w-6xl mx-auto px-6 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-16"
          >
            <p className="text-teal-600 text-xs tracking-[0.3em] uppercase font-semibold mb-3">Why Choose Us</p>
            <h2
              className="text-4xl md:text-5xl font-bold text-stone-900"
              style={SERIF}
            >
              Built for campus life.
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((f, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                viewport={{ once: true }}
                className="border border-stone-100 bg-stone-50 rounded-2xl p-7 hover:border-teal-200 hover:bg-white transition-colors shadow-sm"
              >
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center mb-5"
                  style={{ background: GRAD }}
                >
                  <f.icon className="w-4 h-4 text-white" strokeWidth={1.5} />
                </div>
                <h3 className="text-base font-semibold text-stone-900 mb-2">{f.title}</h3>
                <p className="text-stone-400 text-sm leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
        <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-purple-200/50 to-transparent" />
      </section>

      {/* ── REVIEWS ──────────────────────────────────────── */}
      <ReviewCarousel />

      {/* ── FINAL CTA ────────────────────────────────────── */}
      <section className="py-40 bg-[#FAFAF9] relative overflow-hidden" style={{ fontFamily: "'DM Sans', sans-serif" }}>
        {/* Gradient mesh background */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[500px] rounded-full bg-gradient-to-br from-teal-100/70 via-purple-100/50 to-transparent blur-3xl" />
        </div>

        <div className="relative z-10 text-center px-6 max-w-3xl mx-auto">
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-teal-600 text-xs tracking-[0.3em] uppercase font-semibold mb-4"
          >
            Get Started Today
          </motion.p>

          <motion.h2
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-5xl md:text-7xl font-bold text-stone-900 mb-6"
            style={SERIF}
          >
            Everything you need,
            <br />
            <span className="italic" style={GRAD_TEXT}>
              right on campus.
            </span>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            viewport={{ once: true }}
            className="text-stone-400 text-lg mb-12"
          >
            One platform. All your campus services.
          </motion.p>

          <motion.button
            onClick={() => navigate("/auth")}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="px-12 py-5 text-white font-semibold text-base rounded-full inline-flex items-center gap-3 transition-all shadow-xl shadow-teal-200/50"
            style={{ background: GRAD }}
          >
            Start Booking <ArrowRight className="w-5 h-5" />
          </motion.button>

          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            viewport={{ once: true }}
            className="mt-10 flex items-center justify-center gap-8 flex-wrap"
          >
            {["No credit card required", "100% Free to join", "Instant access"].map((text, i) => (
              <div key={i} className="flex items-center gap-2 text-stone-400 text-sm">
                <CheckCircle className="w-4 h-4 text-teal-500" />
                <span>{text}</span>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────── */}
      <footer className="bg-white border-t border-stone-100 py-12" style={{ fontFamily: "'DM Sans', sans-serif" }}>
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <p
            className="text-stone-900 font-bold text-xl"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            StudEx{" "}
            <span style={GRAD_TEXT}>·</span>{" "}
            Made in Nigeria 🇳🇬
          </p>

          <div className="flex gap-8 text-sm">
            <button onClick={() => navigate("/terms")} className="text-stone-400 hover:text-stone-700 transition">Terms</button>
            <button onClick={() => navigate("/privacy-policy")} className="text-stone-400 hover:text-stone-700 transition">Privacy</button>
          </div>

          <p className="text-stone-300 text-sm">© 2025 StudEx. All rights reserved.</p>
        </div>
      </footer>
    </>
  );
}