"use client";

import { motion } from "framer-motion";
import {
  Search, ShieldCheck, Zap, Star, Heart,
  GraduationCap, Store, Package, MessageSquare, LayoutDashboard,
  ChevronLeft, ChevronRight, ArrowRight, MapPin, Tag,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/lib/authStore";
import { generateStructuredData } from "@/lib/metadata";
import { GRAD, TEAL, PURPLE } from "@/lib/tokens";

/* ─── DATA ─────────────────────────────────────────────── */
const reviews = [
  { name: "Valerie",                   role: "Student, PAU",   campus: "Pan-Atlantic University", text: "It was really neat and the registration was easy. I love how everything just works.",                                                                             stars: 5 },
  { name: "Emeh & Evelyn",             role: "Students",       campus: "PAU",                     text: "I love the interface and how easy it is to navigate. Best campus app we've used.",                                                                                stars: 5 },
  { name: "Kachi",                     role: "Student",        campus: "FUTO",                    text: "It was super easy to navigate and everything worked perfectly for me. Highly recommend!",                                                                          stars: 5 },
  { name: "Kachi",                     role: "Student",        campus: "FUTO",                    text: "I love the variety of vendors on there. I hope all the services will actually be available when you launch fully!",                                               stars: 4 },
  { name: "Khalid, Semilore & Samuel", role: "Students",       campus: "PAU",                     text: "I like the website layout and navigation. Clean, simple, and it just works.",                                                                                     stars: 5 },
  { name: "Rehwa & Chierika",          role: "Students",       campus: "FUTO",                    text: "I love everything about the idea and website. Campus commerce done right!",                                                                                       stars: 5 },
  { name: "Lolope & Nonye",            role: "Students",       campus: "PAU",                     text: "I like the aesthetics. The whole vibe of the platform is clean and fun to use.",                                                                                  stars: 5 },
  { name: "Sommy",                     role: "Student, FUTO",  campus: "FUTO",                    text: "The website design is so clean and everything is well laid out. I can already tell this will be huge when it launches fully at FUTO!",                         stars: 5 },
  { name: "Dubby",                     role: "Student",        campus: "PAU",                     text: "The escrow payment gives me so much confidence. My money is safe until I confirm delivery. 10/10.",                                                               stars: 5 },
  { name: "Dxtny",                     role: "Student, FUTO",  campus: "FUTO",                    text: "The layout is genuinely clean and intuitive. This is exactly the kind of platform FUTO students have been waiting for. Big potential here.",                   stars: 5 },
  { name: "Temi",                      role: "Student, IMSU",  campus: "IMSU",                    text: "Amazing concept and the interface is beautiful. The escrow idea for campus vendors is so smart — IMSU students are going to love this!",                      stars: 5 },
  { name: "Chioma",                    role: "Vendor, FUTO",   campus: "FUTO",                    text: "The vendor dashboard looks incredibly well designed. I already know I'm listing my fashion business the moment StudEx officially launches at FUTO.",            stars: 5 },
  { name: "Femi",                      role: "Student",        campus: "PAU",                     text: "The real-time messaging with vendors is a game changer. I coordinated my photoshoot entirely through the chat.",                                                  stars: 5 },
  { name: "Bolu",                      role: "Student, IMSU",  campus: "IMSU",                    text: "The design is super clean and easy to navigate. The whole concept of secure campus commerce is exactly what IMSU has been missing.",                             stars: 4 },
  { name: "Adaeze",                    role: "Student",        campus: "FUTO",                    text: "I've been exploring the website and the design is stunning. The way everything is laid out and categorized feels so professional and easy to use.",              stars: 5 },
  { name: "Zara",                      role: "Student, PAU",   campus: "Pan-Atlantic University", text: "Ordered makeup for my friend's event through StudEx. The vendor was professional and arrived on time. So impressed!",                                            stars: 5 },
];

const DOT_BG: React.CSSProperties = {
  backgroundColor: "#f6f5f2",
  backgroundImage: "radial-gradient(#d6d3cd 1.2px, transparent 1.2px)",
  backgroundSize: "22px 22px",
};

const JK: React.CSSProperties = { fontFamily: "'Plus Jakarta Sans', sans-serif" };

const GRAD_TEXT: React.CSSProperties = {
  background: GRAD,
  WebkitBackgroundClip: "text",
  WebkitTextFillColor: "transparent",
  backgroundClip: "text",
};

/* ─── HELPERS ─────────────────────────────────────────── */
function Stars({ count }: { count: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={`w-3.5 h-3.5 ${i < count ? "fill-amber-400 text-amber-400" : "text-stone-200"}`} />
      ))}
    </div>
  );
}

const AVATAR_COLORS = ["#0D9488","#7C3AED","#F59E0B","#EF4444","#3B82F6","#10B981","#F97316","#EC4899","#8B5CF6","#06B6D4"];

function TestimonialCard({ review }: { review: typeof reviews[0] }) {
  const color = AVATAR_COLORS[review.name.charCodeAt(0) % AVATAR_COLORS.length];
  const [liked, setLiked] = useState(false);
  const [count, setCount] = useState(Math.floor(review.name.charCodeAt(0) % 30) + 4);
  return (
    <div className="w-full bg-white rounded-2xl shadow-md border border-stone-100 p-5 select-none transition-all duration-200 hover:scale-[1.04] hover:shadow-xl hover:border-stone-200 cursor-default">
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
          style={{ backgroundColor: color }}
        >
          {review.name[0].toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-stone-900 text-sm truncate">{review.name}</p>
          <p className="text-stone-400 text-xs">{review.role}</p>
        </div>
        <div className="flex-shrink-0">
          <Stars count={review.stars} />
        </div>
      </div>
      <p className="text-stone-600 text-sm leading-relaxed line-clamp-3">{review.text}</p>
      <div className="mt-3 pt-3 border-t border-stone-100 flex items-center justify-between">
        <span className="text-xs font-medium text-teal-600 bg-teal-50 px-2.5 py-1 rounded-full border border-teal-100">
          {review.campus}
        </span>
        <button
          className="flex items-center gap-1 transition-all duration-150 cursor-pointer"
          onClick={() => { setLiked(l => !l); setCount(c => liked ? c - 1 : c + 1); }}
        >
          <Heart className={`w-4 h-4 transition-all duration-150 ${liked ? "fill-rose-500 text-rose-500 scale-110" : "text-stone-300 hover:text-rose-400"}`} />
          <span className={`text-xs font-medium transition-colors duration-150 ${liked ? "text-rose-500" : "text-stone-300"}`}>{count}</span>
        </button>
      </div>
    </div>
  );
}

const FEATURED_REVIEWS = [
  reviews[0],  // Valerie — PAU
  reviews[2],  // Kachi — FUTO
  reviews[6],  // Lolope & Nonye — PAU
  reviews[7],  // Sommy — FUTO
  reviews[13], // Adaeze — FUTO
  reviews[14], // Zara — PAU
];

function TestimonialGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 px-5 max-w-5xl mx-auto">
      {FEATURED_REVIEWS.map((review, i) => (
        <motion.div
          key={i}
          animate={{ opacity: [1, 0.28, 1] }}
          transition={{
            duration: 2.8 + (i % 3) * 0.7,
            delay: i * 0.35,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          <TestimonialCard review={review} />
        </motion.div>
      ))}
    </div>
  );
}

function SectionPill({ label }: { label: string }) {
  return (
    <span
      className="inline-block px-3 py-1 rounded-full text-xs font-semibold border mb-5"
      style={{ borderColor: "#0D9488", color: "#0D9488", backgroundColor: "rgba(13,148,136,0.06)" }}
    >
      {label}
    </span>
  );
}

/* Mini listing card used inside hero floating panels */
function MiniListingCard({ listing, size = "md" }: { listing: any; size?: "sm" | "md" }) {
  const sm = size === "sm";
  return (
    <div className={`flex items-center gap-2.5 ${sm ? "p-2" : "p-2.5"}`}>
      <div className={`${sm ? "w-9 h-9" : "w-11 h-11"} rounded-xl overflow-hidden bg-stone-100 flex-shrink-0`}>
        {listing?.image
          ? <img src={listing.image} alt={listing.title} className="w-full h-full object-cover" />
          : <div className="w-full h-full bg-stone-200 animate-pulse" />
        }
      </div>
      <div className="min-w-0">
        <p className={`font-semibold text-stone-900 truncate ${sm ? "text-[11px]" : "text-xs"}`}>{listing?.title ?? "Loading..."}</p>
        <div className="flex items-center gap-1 mt-0.5">
          <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400 flex-shrink-0" />
          <span className="text-[10px] text-stone-500">4.9</span>
          {listing?.price && (
            <span className="text-[10px] font-bold ml-1" style={GRAD_TEXT}>₦{Number(listing.price).toLocaleString()}</span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── MAIN ─────────────────────────────────────────────── */
export default function LandingClient({ initialListings }: { initialListings: any[] }) {
  const { isLoggedIn, isHydrated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isHydrated && isLoggedIn) router.replace("/home");
  }, [isHydrated, isLoggedIn, router]);

  const scrollTo = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  const l = initialListings;

  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=DM+Sans:wght@300;400;500&display=swap"
        rel="stylesheet"
      />

      <Script id="sd-org"  type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(generateStructuredData.organization()) }} />
      <Script id="sd-biz"  type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(generateStructuredData.localBusiness()) }} />
      <Script id="sd-site" type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(generateStructuredData.website()) }} />

      <div style={{ fontFamily: "'DM Sans', sans-serif" }}>

        {/* ── NAV ───────────────────────────────────────────── */}
        <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-stone-200">
          <div className="max-w-6xl mx-auto px-5 py-3 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg overflow-hidden border border-stone-100">
                <Image src="/images/logo-1.jpg" alt="StudEx" width={32} height={32} className="w-full h-full object-contain" />
              </div>
              <span className="font-black text-stone-900" style={JK}>
                Stud<span style={GRAD_TEXT}>Ex</span>
              </span>
            </Link>

            <div className="hidden md:flex items-center gap-6 text-sm text-stone-500 font-medium">
              <button onClick={() => scrollTo("how")}      className="hover:text-stone-900 transition">How it Works</button>
              <button onClick={() => scrollTo("features")} className="hover:text-stone-900 transition">Features</button>
              <button onClick={() => scrollTo("reviews")}  className="hover:text-stone-900 transition">Reviews</button>
              <button onClick={() => scrollTo("campuses")} className="hover:text-stone-900 transition">Campuses</button>
            </div>

            <div className="flex items-center gap-3">
              <Link href="/auth" className="hidden md:block text-sm text-stone-500 font-medium hover:text-stone-900 transition">
                Sign in
              </Link>
              <Link href="/auth">
                <button className="px-4 py-2 text-white text-sm font-semibold rounded-full shadow-sm" style={{ background: TEAL }}>
                  Get Started
                </button>
              </Link>
            </div>
          </div>
        </nav>

        {/* ── HERO ──────────────────────────────────────────── */}
        <section className="relative overflow-hidden bg-white min-h-[680px] flex items-center py-14 px-5">

          {/* Background blobs */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute -top-24 -right-24 w-[480px] h-[480px] rounded-full"
              style={{ background: "radial-gradient(circle, #FDE68A44 0%, #FCA5A530 50%, transparent 70%)" }} />
            <div className="absolute -bottom-28 -left-28 w-[420px] h-[420px] rounded-full"
              style={{ background: "radial-gradient(circle, #99F6E430 0%, #5EEAD420 50%, transparent 70%)" }} />
            <div className="absolute top-1/2 left-[30%] w-[260px] h-[260px] rounded-full"
              style={{ background: "radial-gradient(circle, #E7E5E420 0%, transparent 70%)" }} />
          </div>

          <div className="relative z-10 max-w-6xl mx-auto w-full">
            <div className="flex flex-col lg:flex-row items-center gap-10 lg:gap-16">

              {/* ── LEFT ── */}
              <div className="flex-1 text-center lg:text-left">

                <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
                  className="text-xs font-bold tracking-[0.22em] uppercase mb-3" style={{ color: TEAL }}>
                  CAMPUS SHOPPING
                </motion.p>

                <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.05 }}
                  className="text-5xl md:text-6xl lg:text-[68px] font-black leading-[1.04] tracking-tight mb-5" style={JK}>
                  <span className="text-stone-900">Your Campus</span>
                  <br />
                  <span style={{ color: TEAL }}>Marketplace</span>
                </motion.h1>

                <motion.p initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}
                  className="text-stone-500 text-lg leading-relaxed max-w-md mx-auto lg:mx-0 mb-8">
                  Verified campus vendors — food, products, services, tech and more. All escrow-protected. Fast campus delivery.
                </motion.p>

                <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.15 }}
                  className="flex flex-wrap justify-center lg:justify-start gap-3 mb-8">
                  <Link href="/auth">
                    <button className="px-8 py-4 text-white font-bold rounded-full shadow-md hover:opacity-90 transition text-[15px] flex items-center gap-2" style={{ background: TEAL }}>
                      Start Shopping <ArrowRight className="w-4 h-4" />
                    </button>
                  </Link>
                  <Link href="/home">
                    <button className="px-8 py-4 text-stone-700 font-semibold rounded-full border-2 border-stone-200 bg-white hover:bg-stone-50 transition text-[15px]">
                      Browse Services
                    </button>
                  </Link>
                </motion.div>

                {/* Stats */}
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }}
                  className="flex flex-wrap justify-center lg:justify-start gap-8 mb-6">
                  {[{ v: "70+", l: "Vendors" }, { v: "320+", l: "Listings" }, { v: "3", l: "Campuses" }].map(s => (
                    <div key={s.l} className="text-center lg:text-left">
                      <p className="text-2xl font-black text-stone-900" style={JK}>{s.v}</p>
                      <p className="text-xs text-stone-400 font-medium">{s.l}</p>
                    </div>
                  ))}
                </motion.div>

                {/* Category pills */}
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.25 }}
                  className="flex flex-wrap justify-center lg:justify-start gap-2">
                  {["📦 Products", "🍜 Food", "💡 Tutoring", "💻 Tech", "👗 Fashion", "📸 Photography"].map(s => (
                    <span key={s} className="px-3 py-1.5 rounded-full bg-stone-50 border border-stone-200 text-stone-600 text-xs font-medium">
                      {s}
                    </span>
                  ))}
                </motion.div>
              </div>

              {/* ── RIGHT — iPhone 17 Pro Max mockup + side badges ── */}
              <motion.div initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.7, delay: 0.2 }}
                className="flex-shrink-0 flex items-center gap-5">

                {/* Left badges column */}
                <div className="hidden lg:flex flex-col gap-4">
                  <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.6, duration: 0.4 }}
                    className="flex flex-row items-center gap-3 bg-white rounded-2xl px-4 py-3 shadow-xl border border-stone-100 whitespace-nowrap">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-amber-400">
                      <Star className="w-5 h-5 text-white fill-white" />
                    </div>
                    <div>
                      <p className="text-[11px] text-stone-400 leading-none mb-1">Avg Rating</p>
                      <p className="text-base font-black text-stone-800 leading-none">4.9 ★</p>
                    </div>
                  </motion.div>
                  <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.7, duration: 0.4 }}
                    className="flex flex-row items-center gap-3 bg-white rounded-2xl px-4 py-3 shadow-xl border border-stone-100 whitespace-nowrap">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: PURPLE }}>
                      <MapPin className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="text-[11px] text-stone-400 leading-none mb-1">Campuses</p>
                      <p className="text-base font-black text-stone-800 leading-none">3 Active</p>
                    </div>
                  </motion.div>
                  <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.8, duration: 0.4 }}
                    className="flex flex-row items-center gap-3 bg-white rounded-2xl px-4 py-3 shadow-xl border border-stone-100 whitespace-nowrap">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-emerald-500">
                      <Store className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="text-[11px] text-stone-400 leading-none mb-1">Vendors</p>
                      <p className="text-base font-black text-stone-800 leading-none">70+ Active</p>
                    </div>
                  </motion.div>
                </div>

                {/* Phone frame */}
                <div className="relative w-[270px] md:w-[290px]">

                  {/* Side buttons */}
                  <div className="absolute left-[-4px] top-[90px] w-[4px] h-6 rounded-l-full" style={{ background: "linear-gradient(to right, #4B5563, #374151)" }} />
                  <div className="absolute left-[-4px] top-[124px] w-[4px] h-9 rounded-l-full" style={{ background: "linear-gradient(to right, #4B5563, #374151)" }} />
                  <div className="absolute left-[-4px] top-[170px] w-[4px] h-9 rounded-l-full" style={{ background: "linear-gradient(to right, #4B5563, #374151)" }} />
                  <div className="absolute right-[-4px] top-[140px] w-[4px] h-14 rounded-r-full" style={{ background: "linear-gradient(to left, #4B5563, #374151)" }} />

                  {/* Titanium outer shell */}
                  <div className="rounded-[54px] p-[3px]"
                    style={{ background: "linear-gradient(145deg, #6B7280 0%, #374151 40%, #1F2937 70%, #4B5563 100%)", boxShadow: "0 40px 80px -15px rgba(0,0,0,0.55), 0 0 0 0.5px rgba(255,255,255,0.12) inset" }}>

                    {/* Inner black bezel */}
                    <div className="bg-stone-950 rounded-[51px] p-[5px]">

                      {/* Screen glass */}
                      <div className="relative rounded-[46px] overflow-hidden flex flex-col bg-white">

                        {/* Status bar — time left, Dynamic Island center, icons right */}
                        <div className="relative flex items-center justify-between bg-white px-5 flex-shrink-0" style={{ height: "44px" }}>
                          {/* Dynamic Island */}
                          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-stone-950 z-10"
                            style={{ width: "88px", height: "26px" }} />
                          {/* Time */}
                          <span className="text-[11px] font-semibold text-stone-900 tabular-nums z-20 relative">9:41</span>
                          {/* Signal + WiFi + Battery */}
                          <div className="flex items-center gap-1.5 z-20 relative">
                            <div className="flex items-end gap-[2px]" style={{ height: "12px" }}>
                              {[3, 4, 5, 6].map(h => (
                                <div key={h} className="w-[2.5px] bg-stone-900 rounded-[1px]" style={{ height: `${h}px` }} />
                              ))}
                            </div>
                            <svg width="13" height="10" viewBox="0 0 13 10" fill="none">
                              <path d="M0.5 3.5C2.3 1.5 4.3 0.5 6.5 0.5S10.7 1.5 12.5 3.5" stroke="#111827" strokeWidth="1.3" strokeLinecap="round"/>
                              <path d="M2.5 5.8C3.7 4.7 5 4 6.5 4S9.3 4.7 10.5 5.8" stroke="#111827" strokeWidth="1.3" strokeLinecap="round"/>
                              <circle cx="6.5" cy="8.5" r="1.2" fill="#111827"/>
                            </svg>
                            <div className="flex items-center gap-[1.5px]">
                              <div className="w-[18px] h-[9px] rounded-[2px] border border-stone-800 relative overflow-hidden">
                                <div className="absolute inset-[1.5px] rounded-[1px] bg-stone-900" style={{ width: "75%" }} />
                              </div>
                              <div className="w-[2px] h-[5px] rounded-r-sm bg-stone-800 opacity-50" />
                            </div>
                          </div>
                        </div>

                        {/* Screenshot 1 — app header through filter tabs */}
                        <div className="overflow-hidden flex-shrink-0" style={{ height: "300px" }}>
                          <img src="/images/app-screen-1.png" alt="StudEx home" className="w-full block" loading="lazy" />
                        </div>

                        {/* Screenshot 2 — listing cards */}
                        <div className="overflow-hidden flex-shrink-0" style={{ height: "220px" }}>
                          <img src="/images/app-screen-2.png" alt="StudEx listings" className="w-full block" loading="lazy" />
                        </div>

                        {/* Home indicator */}
                        <div className="bg-white pb-2 pt-1.5 flex justify-center flex-shrink-0">
                          <div className="w-24 h-[4px] bg-stone-900 rounded-full opacity-25" />
                        </div>

                      </div>
                    </div>
                  </div>
                </div>

                {/* Right badges column */}
                <div className="hidden lg:flex flex-col gap-4">
                  <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.6, duration: 0.4 }}
                    className="flex flex-row items-center gap-3 bg-white rounded-2xl px-4 py-3 shadow-xl border border-stone-100 whitespace-nowrap">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: TEAL }}>
                      <ShieldCheck className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="text-[11px] text-stone-400 leading-none mb-1">Payment</p>
                      <p className="text-base font-black text-stone-800 leading-none">Escrow Safe</p>
                    </div>
                  </motion.div>
                  <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.7, duration: 0.4 }}
                    className="flex flex-row items-center gap-3 bg-white rounded-2xl px-4 py-3 shadow-xl border border-stone-100 whitespace-nowrap">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#F59E0B" }}>
                      <Zap className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="text-[11px] text-stone-400 leading-none mb-1">Delivery</p>
                      <p className="text-base font-black text-stone-800 leading-none">Fast & Local</p>
                    </div>
                  </motion.div>
                  <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.8, duration: 0.4 }}
                    className="flex flex-row items-center gap-3 bg-white rounded-2xl px-4 py-3 shadow-xl border border-stone-100 whitespace-nowrap">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#EF4444" }}>
                      <Tag className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="text-[11px] text-stone-400 leading-none mb-1">Listings</p>
                      <p className="text-base font-black text-stone-800 leading-none">320+ Items</p>
                    </div>
                  </motion.div>
                </div>

              </motion.div>

            </div>
          </div>
        </section>

        {/* ── STATS BAR ─────────────────────────────────────── */}
        <section className="bg-white border-b border-stone-200 py-6 px-5">
          <div className="max-w-2xl mx-auto grid grid-cols-4 text-center">
            {[
              { value: "70+",  label: "Vendors"  },
              { value: "320+", label: "Listings" },
              { value: "53+",  label: "Services" },
              { value: "3",    label: "Campuses" },
            ].map(stat => (
              <div key={stat.label}>
                <p className="text-2xl font-extrabold" style={{ ...JK, ...GRAD_TEXT }}>{stat.value}</p>
                <p className="text-xs text-stone-400 font-medium mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── SOLUTIONS ─────────────────────────────────────── */}
        <section id="how" style={DOT_BG} className="py-24 px-5">
          <div className="max-w-5xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ duration: 0.5 }}
              className="text-center mb-14"
            >
              <SectionPill label="Solutions" />
              <h2 className="text-4xl md:text-5xl font-extrabold text-stone-900 tracking-tight" style={JK}>
                Solve your <span style={GRAD_TEXT}>campus</span> needs
              </h2>
            </motion.div>
            <div className="grid md:grid-cols-3 gap-4">
              {[
                { Icon: Search,      title: "Find anything on campus", desc: "Browse hundreds of verified campus vendors — food, products, services, tech, and more." },
                { Icon: ShieldCheck, title: "Pay with confidence",     desc: "Our escrow system holds your payment until you confirm delivery — no risk, ever."               },
                { Icon: Zap,         title: "Campus-fast delivery",    desc: "Everything is on campus. No long waits, no delivery fees from off-campus vendors."              },
              ].map(({ Icon, title, desc }, i) => (
                <motion.div
                  key={title}
                  initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }} transition={{ duration: 0.5, delay: i * 0.08 }}
                  className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm"
                >
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4" style={{ background: i === 1 ? PURPLE : TEAL }}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <p className="font-bold text-stone-900 mb-1.5" style={JK}>{title}</p>
                  <p className="text-stone-500 text-sm leading-relaxed">{desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ── BROWSER MOCKUP ────────────────────────────────── */}
        <section className="py-24 px-5 bg-white">
          <div className="max-w-5xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ duration: 0.5 }}
              className="text-center mb-10"
            >
              <SectionPill label="Product" />
              <h2 className="text-4xl md:text-5xl font-extrabold text-stone-900 tracking-tight" style={JK}>
                See it in <span style={GRAD_TEXT}>action</span>
              </h2>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 32 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ duration: 0.55, delay: 0.1 }}
              className="rounded-2xl overflow-hidden border border-stone-200 shadow-xl"
            >
              {/* macOS chrome */}
              <div className="bg-stone-100 border-b border-stone-200 px-4 py-3 flex items-center gap-3">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-amber-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                </div>
                <div className="flex-1 mx-4 bg-white rounded-lg px-4 py-1.5 text-xs text-stone-400 border border-stone-200 max-w-xs">
                  studex.com.ng/home
                </div>
              </div>

              {/* Mini listing grid */}
              <div className="bg-[#F5F5F5] p-4">
                {l.length > 0 ? (
                  <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                    {l.slice(0, 6).map((listing: any) => (
                      <div key={listing.id} className="rounded-xl overflow-hidden bg-white border border-stone-100 shadow-sm">
                        <img src={listing.image} alt={listing.title} className="w-full aspect-square object-cover" />
                        <div className="p-1.5">
                          <p className="text-[10px] font-semibold text-stone-800 line-clamp-1">{listing.title}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-6 gap-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="rounded-xl bg-stone-200 animate-pulse aspect-square" />
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </section>

        {/* ── FEATURES BENTO ────────────────────────────────── */}
        <section id="features" style={DOT_BG} className="py-24 px-5">
          <div className="max-w-5xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ duration: 0.5 }}
              className="text-center mb-14"
            >
              <SectionPill label="Features" />
              <h2 className="text-4xl md:text-5xl font-extrabold text-stone-900 tracking-tight" style={JK}>
                Everything in <span style={GRAD_TEXT}>one place</span>
              </h2>
            </motion.div>

            <div className="grid md:grid-cols-3 gap-4 auto-rows-min">
              {/* Tall card — Browse & Discover */}
              <motion.div
                initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }} transition={{ duration: 0.5 }}
                className="md:row-span-2 rounded-2xl border border-stone-200 shadow-sm flex flex-col overflow-hidden"
                style={{ background: "linear-gradient(180deg, #ffffff 60%, rgba(13,148,136,0.06) 100%)" }}
              >
                <div className="p-6 flex-1 flex flex-col">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4" style={{ background: TEAL }}>
                    <Search className="w-5 h-5 text-white" />
                  </div>
                  <p className="font-bold text-stone-900 text-lg mb-2" style={JK}>Browse &amp; Discover</p>
                  <p className="text-stone-500 text-sm leading-relaxed mb-6">
                    Explore dozens of categories across campus — products, services, food, tech and more in one marketplace.
                  </p>
                  <div className="flex flex-wrap gap-2 mt-auto">
                    {["📦 Products", "🍜 Food", "💡 Tutoring", "📸 Photo", "💻 Tech", "👗 Fashion"].map(s => (
                      <span key={s} className="px-2.5 py-1 rounded-full text-xs font-medium bg-stone-50 border border-stone-200 text-stone-600">{s}</span>
                    ))}
                  </div>
                </div>
              </motion.div>

              {/* Escrow */}
              <motion.div
                initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.05 }}
                className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm"
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4 bg-teal-50 border border-teal-100">
                  <ShieldCheck className="w-5 h-5 text-teal-600" />
                </div>
                <p className="font-bold text-stone-900 mb-1.5" style={JK}>Escrow Payment</p>
                <p className="text-stone-500 text-sm leading-relaxed">Pay safely via Paystack. Funds are held until you confirm receipt.</p>
              </motion.div>

              {/* Messaging */}
              <motion.div
                initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.1 }}
                className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm"
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4 bg-purple-50 border border-purple-100">
                  <MessageSquare className="w-5 h-5 text-purple-600" />
                </div>
                <p className="font-bold text-stone-900 mb-1.5" style={JK}>Real-time Messaging</p>
                <p className="text-stone-500 text-sm leading-relaxed">Chat directly with vendors to coordinate your orders and delivery.</p>
              </motion.div>

              {/* Vendor Dashboard */}
              <motion.div
                initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.15 }}
                className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm"
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4 bg-amber-50 border border-amber-100">
                  <LayoutDashboard className="w-5 h-5 text-amber-600" />
                </div>
                <p className="font-bold text-stone-900 mb-1.5" style={JK}>Vendor Dashboard</p>
                <p className="text-stone-500 text-sm leading-relaxed">Manage listings, view orders, track earnings — all from one panel.</p>
              </motion.div>

              {/* Order Tracking */}
              <motion.div
                initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.2 }}
                className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm"
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4 bg-sky-50 border border-sky-100">
                  <Package className="w-5 h-5 text-sky-600" />
                </div>
                <p className="font-bold text-stone-900 mb-1.5" style={JK}>Order Tracking</p>
                <p className="text-stone-500 text-sm leading-relaxed">Follow your order from placement to delivery in real-time.</p>
              </motion.div>
            </div>
          </div>
        </section>

        {/* ── TESTIMONIALS ──────────────────────────────────── */}
        <section id="reviews" className="py-24 bg-white overflow-hidden">
          <div className="max-w-5xl mx-auto px-5 mb-14">
            <motion.div
              initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ duration: 0.5 }}
              className="text-center"
            >
              <SectionPill label="Testimonials" />
              <h2 className="text-4xl md:text-5xl font-extrabold text-stone-900 tracking-tight max-w-lg mx-auto" style={JK}>
                Students just like you <span style={GRAD_TEXT}>love StudEx</span>
              </h2>
            </motion.div>
          </div>
          <TestimonialGrid />
        </section>

        {/* ── CAMPUSES ──────────────────────────────────────── */}
        <section id="campuses" style={DOT_BG} className="py-24 px-5">
          <div className="max-w-5xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ duration: 0.5 }}
            >
              <SectionPill label="Campuses" />
              <h2 className="text-4xl md:text-5xl font-extrabold text-stone-900 tracking-tight mb-14" style={JK}>
                Where we <span style={GRAD_TEXT}>operate</span>
              </h2>
            </motion.div>
            <div className="flex flex-wrap justify-center gap-10 md:gap-20">
              {[
                { src: "/images/pau-logo.png",  name: "Pan-Atlantic University",                 bg: "bg-stone-900", location: "Ibeju-Lekki, Lagos" },
                { src: "/images/futo-logo.png", name: "Federal University of Technology Owerri", bg: "bg-white",     location: "Owerri, Imo State"  },
                { src: "/images/imsu-logo.png", name: "Imo State University, Owerri",            bg: "bg-white",     location: "Owerri, Imo State"  },
              ].map((campus, i) => (
                <motion.div
                  key={campus.name}
                  initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }} transition={{ duration: 0.45, delay: i * 0.1 }}
                  className="flex flex-col items-center gap-4"
                >
                  <div className={`w-24 h-24 rounded-2xl ${campus.bg} border border-stone-200 flex items-center justify-center p-3 shadow-md overflow-hidden`}>
                    <Image src={campus.src} alt={campus.name} width={96} height={96} className="w-full h-full object-contain" />
                  </div>
                  <div>
                    <p className="text-stone-900 font-bold text-sm">{campus.name}</p>
                    <p className="text-stone-400 text-xs mt-0.5">{campus.location}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ── FINAL CTA ─────────────────────────────────────── */}
        <section className="py-24 px-5 bg-white">
          <div className="max-w-4xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ duration: 0.5 }}
            >
              <SectionPill label="Get Started" />
              <h2 className="text-4xl md:text-5xl font-extrabold text-stone-900 tracking-tight mb-3" style={JK}>
                Ready to get <span style={GRAD_TEXT}>started?</span>
              </h2>
              <p className="text-stone-400 text-sm mb-10">Free to join. No hidden charges.</p>
            </motion.div>
            <div className="grid sm:grid-cols-2 gap-4 max-w-xl mx-auto">
              <motion.div
                initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }} transition={{ duration: 0.45, delay: 0.05 }}
              >
                <Link href="/auth">
                  <div className="p-6 rounded-2xl bg-teal-500 hover:bg-teal-600 transition cursor-pointer text-left shadow-md">
                    <GraduationCap className="w-8 h-8 text-white mb-3" />
                    <p className="text-white font-bold text-lg" style={JK}>I&apos;m a Buyer</p>
                    <p className="text-teal-100 text-sm mt-1">Browse and order campus services</p>
                    <p className="text-white font-semibold text-sm mt-4">Start Ordering →</p>
                  </div>
                </Link>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }} transition={{ duration: 0.45, delay: 0.1 }}
              >
                <Link href="/auth">
                  <div className="p-6 rounded-2xl bg-purple-600 hover:bg-purple-700 transition cursor-pointer text-left shadow-md">
                    <Store className="w-8 h-8 text-white mb-3" />
                    <p className="text-white font-bold text-lg" style={JK}>I&apos;m a Vendor</p>
                    <p className="text-purple-200 text-sm mt-1">List your services and earn on campus</p>
                    <p className="text-white font-semibold text-sm mt-4">Start Selling →</p>
                  </div>
                </Link>
              </motion.div>
            </div>
          </div>
        </section>

        {/* ── FOOTER ────────────────────────────────────────── */}
        <footer style={DOT_BG} className="border-t border-stone-200 py-14 px-5">
          <div className="max-w-5xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between gap-10 mb-10">
              {/* Brand */}
              <div className="max-w-xs">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg overflow-hidden border border-stone-200">
                    <Image src="/images/logo-1.jpg" alt="StudEx" width={32} height={32} className="w-full h-full object-contain" />
                  </div>
                  <span className="font-black text-stone-900" style={JK}>
                    Stud<span style={GRAD_TEXT}>Ex</span>
                  </span>
                </div>
                <p className="text-stone-400 text-sm leading-relaxed">
                  The campus marketplace — buy, book &amp; order everything you need, all in one place.
                </p>
              </div>

              {/* Links */}
              <div className="flex gap-14">
                <div>
                  <p className="text-stone-900 font-semibold text-sm mb-3" style={JK}>Product</p>
                  <div className="flex flex-col gap-2.5 text-sm text-stone-400">
                    <button onClick={() => scrollTo("how")}      className="hover:text-stone-700 text-left transition">How it Works</button>
                    <button onClick={() => scrollTo("features")} className="hover:text-stone-700 text-left transition">Features</button>
                    <button onClick={() => scrollTo("reviews")}  className="hover:text-stone-700 text-left transition">Reviews</button>
                    <button onClick={() => scrollTo("campuses")} className="hover:text-stone-700 text-left transition">Campuses</button>
                  </div>
                </div>
                <div>
                  <p className="text-stone-900 font-semibold text-sm mb-3" style={JK}>Company</p>
                  <div className="flex flex-col gap-2.5 text-sm text-stone-400">
                    <Link href="/terms"          className="hover:text-stone-700 transition">Terms</Link>
                    <Link href="/privacy-policy" className="hover:text-stone-700 transition">Privacy</Link>
                    <Link href="/auth"           className="hover:text-stone-700 transition">Sign Up</Link>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom bar */}
            <div className="border-t border-stone-200 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-stone-400 text-sm">© 2026 StudEx. All rights reserved.</p>
              <div className="flex items-center gap-5">
                <a href="https://www.instagram.com/studextechnologies/" target="_blank" rel="noopener noreferrer" aria-label="StudEx on Instagram">
                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24">
                    <defs>
                      <radialGradient id="ig-grad" cx="30%" cy="107%" r="150%">
                        <stop offset="0%"   stopColor="#feda77"/>
                        <stop offset="15%"  stopColor="#fa7e1e"/>
                        <stop offset="45%"  stopColor="#d62976"/>
                        <stop offset="75%"  stopColor="#962fbf"/>
                        <stop offset="100%" stopColor="#4f5bd5"/>
                      </radialGradient>
                    </defs>
                    <path fill="url(#ig-grad)" d="M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077"/>
                  </svg>
                </a>
                <a href="https://www.tiktok.com/@studex_solutions" target="_blank" rel="noopener noreferrer" aria-label="StudEx on TikTok">
                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24">
                    <defs><clipPath id="tt-clip"><rect width="24" height="24" rx="4"/></clipPath></defs>
                    <rect width="24" height="24" rx="4" fill="#000"/>
                    <g clipPath="url(#tt-clip)">
                      <path fill="#EE1D52" transform="translate(2,0)" d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
                      <path fill="#69C9D0" transform="translate(-2,0)" d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
                      <path fill="#fff" d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
                    </g>
                  </svg>
                </a>
                <a href="mailto:studex.ng@gmail.com" aria-label="Email StudEx">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="18" viewBox="52 42 88 66">
                    <path fill="#4285f4" d="M58 108h14V74L52 59v43c0 3.32 2.69 6 6 6"/>
                    <path fill="#34a853" d="M120 108h14c3.32 0 6-2.69 6-6V59l-20 15"/>
                    <path fill="#fbbc04" d="M120 48v26l20-15v-8c0-7.42-8.47-11.65-14.4-7.2"/>
                    <path fill="#ea4335" d="M72 74V48l24 18 24-18v26L96 92"/>
                    <path fill="#c5221f" d="M52 51v8l20 15V48l-5.6-4.2c-5.94-4.45-14.4-.22-14.4 7.2"/>
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </footer>

      </div>
    </>
  );
}
