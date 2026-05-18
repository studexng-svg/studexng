"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight, Sparkles, Star, Quote,
  Search, CreditCard, CheckCircle, GraduationCap, Store,
  ShieldCheck, Zap, Utensils, Droplets, Camera, Shirt, Dumbbell,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import Link from "next/link";
import { useAuth } from "@/lib/authStore";
// REMOVE BEFORE PRODUCTION
import { generateStructuredData } from "@/lib/metadata";
import { GRAD_TEXT, SERIF } from "@/lib/tokens";

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

const heroImages = [
  { src: "https://images.unsplash.com/photo-1490645935967-10de6ba17061?auto=format&fit=crop&q=60&w=1200", label: "Food" },
  { src: "https://images.unsplash.com/photo-1445205170230-053b83016050?auto=format&fit=crop&q=60&w=1200", label: "Fashion" },
  { src: "https://images.unsplash.com/photo-1582735689369-4fe89db7114c?auto=format&fit=crop&q=60&w=1200", label: "Laundry" },
  { src: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&q=60&w=1200", label: "Photography" },
  { src: "https://images.unsplash.com/photo-1519699047748-de8e457a634e?auto=format&fit=crop&q=60&w=1200", label: "Hair" },
  { src: "https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&q=60&w=1200", label: "Nails" },
  { src: "https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?auto=format&fit=crop&q=60&w=1200", label: "Drinks" },
  { src: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&q=60&w=1200", label: "Makeup" },
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

/* ─── GLASS ICON ─────────────────────────────────────────── */
function Icon3D({
  icon: IconComp,
  color = "#374151",
  px = 48,
  iconPx = 22,
  radius = 14,
  glint = false,
  glintDelay = 0,
}: {
  icon: LucideIcon;
  color?: string;
  px?: number;
  iconPx?: number;
  radius?: number;
  glint?: boolean;
  glintDelay?: number;
}) {
  const onDark = color === "white";

  return (
    <div
      className="relative flex items-center justify-center flex-shrink-0 overflow-hidden"
      style={{
        width: px,
        height: px,
        borderRadius: radius,
        background: onDark ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.78)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        border: `1px solid ${onDark ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.08)"}`,
        boxShadow: onDark
          ? "0 2px 14px rgba(0,0,0,0.14), inset 0 1px 0 rgba(255,255,255,0.22)"
          : "0 2px 10px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,0.95)",
      }}
    >
      {glint && (
        <motion.div
          animate={{ x: ["-120%", "220%"] }}
          transition={{ duration: 1.4, repeat: Infinity, repeatDelay: 3.7, ease: "easeInOut", delay: glintDelay }}
          style={{
            position: "absolute", inset: 0, zIndex: 10, pointerEvents: "none",
            background: "linear-gradient(108deg, transparent 20%, rgba(255,255,255,0.44) 50%, transparent 80%)",
          }}
        />
      )}
      <IconComp size={iconPx} strokeWidth={1.75} color={color} style={{ position: "relative", zIndex: 1 }} />
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
                &ldquo;{reviews[current].text}&rdquo;
              </p>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-stone-900 font-semibold text-sm">{reviews[current].name}</p>
                  <p className="text-stone-400 text-xs mt-0.5">Student</p>
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
  const { isLoggedIn, isHydrated } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (isHydrated && isLoggedIn) router.replace("/home");
  }, [isHydrated, isLoggedIn, router]);
  const [featuredListings, setFeaturedListings] = useState<any[]>([]);
  const [heroIndex, setHeroIndex] = useState(0);
  const [listingIndex, setListingIndex] = useState(0);
  const listingCount = 53;
  const vendorCount = 38;

  useEffect(() => {
    setMounted(true);
    document.title = "StudEx — Campus Marketplace for Student Services";

    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
    fetch(`${API_URL}/api/services/listings/?campus=pau`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!data) return;
        const all = data.results || data || [];
        setFeaturedListings(all.filter((l: any) => l.image?.startsWith("http")).slice(0, 6));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const t = setInterval(() => setHeroIndex(p => (p + 1) % heroImages.length), 4000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (featuredListings.length < 2) return;
    const t = setInterval(() => setListingIndex(p => (p + 1) % featuredListings.length), 4000);
    return () => clearInterval(t);
  }, [featuredListings.length]);

  const navigate = (path: string) => { window.location.href = path; };

  if (!mounted) {
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
      <div className="relative min-h-screen flex flex-col bg-purple-950 overflow-hidden">

        {/* Hero background image */}
        {heroImages.map((img, i) => (
          <img
            key={img.label}
            src={img.src}
            alt={img.label}
            crossOrigin="anonymous"
            loading={i === 0 ? "eager" : "lazy"}
            decoding="async"
            className="absolute inset-0 w-full h-full object-cover object-center transition-opacity duration-1000"
            style={{ zIndex: 0, opacity: i === heroIndex ? 1 : 0 }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ))}
        {/* Overlay */}
        <div className="absolute inset-0" style={{ zIndex: 1, background: "linear-gradient(to bottom, rgba(13,148,136,0.30) 0%, rgba(124,58,237,0.50) 45%, rgba(88,28,135,0.82) 100%)" }} />

        {/* Logo bar — top left */}
        <div className="absolute top-5 left-5 z-20">
          <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center p-1 shadow-md overflow-hidden">
            <img src="/images/logo-1.jpg" alt="StudEx logo" className="w-full h-full object-contain" />
          </div>
        </div>

        {/* Content — flex-1 so it fills the min-h-screen and centres vertically */}
        <div className="relative z-10 flex-1 flex items-center w-full">
          <div className="w-full max-w-7xl mx-auto px-6 lg:px-16 text-white py-24">
            <div className="grid grid-cols-1 lg:grid-cols-2 lg:gap-16 lg:items-center">

              {/* ── Left: badge + headline + subheadline ── */}
              <div>
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white text-xs font-bold tracking-widest uppercase mb-6">
                  <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
                  Now Live
                </div>

                <h1 className="text-5xl md:text-7xl lg:text-5xl xl:text-6xl font-black leading-[0.95] tracking-tighter italic uppercase mb-6"
                  style={{ fontFamily: "var(--font-jakarta), 'Plus Jakarta Sans', sans-serif" }}>
                  THE CAMPUS<br />
                  <span style={{
                    background: "linear-gradient(to right, #5eead4, #ffffff, #c4b5fd)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}>MARKETPLACE</span><span className="text-white/60 text-sm font-bold uppercase tracking-widest"> — At Your Fingertips</span>
                </h1>

                <p className="text-white/70 text-base lg:text-lg leading-relaxed max-w-md">
                  Food, beauty, laundry, photography and more, all from verified vendors right on your campus.
                </p>
              </div>

              {/* ── Right: pills + CTAs + stats ── */}
              <div className="mt-10 lg:mt-0">
                <div className="flex flex-wrap gap-2 mb-6">
                  {["🍜 Food", "💅 Nails", "🧺 Laundry", "📸 Photography", "👗 Fashion", "💇 Hair"].map(s => (
                    <span key={s} className="px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-white text-xs font-semibold">
                      {s}
                    </span>
                  ))}
                </div>

                <div className="flex flex-row gap-3 mb-8">
                  <Link href="/auth">
                    <button className="px-8 py-3 text-white font-semibold rounded-full text-sm uppercase tracking-widest shadow-lg transition-all hover:scale-105 hover:shadow-teal-500/30 active:scale-95"
                      style={{ background: "linear-gradient(135deg, #0D9488 0%, #7C3AED 100%)" }}>
                      Start Ordering →
                    </button>
                  </Link>
                  <Link href="/home">
                    <button className="px-8 py-3 text-white/75 font-semibold rounded-full border border-white/25 text-sm uppercase tracking-widest hover:bg-white/10 hover:text-white transition-all active:scale-95">
                      Browse Services
                    </button>
                  </Link>
                </div>

                <div className="flex items-center gap-8 pt-6 border-t border-white/10">
                  <div>
                    <p className="text-3xl font-black text-white">{vendorCount}+</p>
                    <p className="text-xs text-white/40 font-bold uppercase tracking-wider mt-0.5">Vendors</p>
                  </div>
                  <div className="w-px h-10 bg-white/10" />
                  <div>
                    <p className="text-3xl font-black text-white">{listingCount}+</p>
                    <p className="text-xs text-white/40 font-bold uppercase tracking-wider mt-0.5">Services</p>
                  </div>
                  <div className="w-px h-10 bg-white/10" />
                  <div>
                    <p className="text-3xl font-black text-white">2</p>
                    <p className="text-xs text-white/40 font-bold uppercase tracking-wider mt-0.5">Campuses</p>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>

      {/* ── WHO IS THIS FOR ──────────────────────────────── */}
      <section className="py-12 px-6 bg-white border-b border-stone-100">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 gap-4 max-w-lg">
            <Link href="/auth">
              <div className="p-5 rounded-2xl border-2 border-teal-500 bg-teal-50 hover:bg-teal-100 transition cursor-pointer">
                <div className="mb-3">
                  <Icon3D icon={GraduationCap} px={44} iconPx={22} radius={12} color="#0D9488" />
                </div>
                <p className="font-black text-stone-900 text-sm uppercase tracking-wide">I&apos;m a Buyer</p>
                <p className="text-stone-500 text-xs mt-1">Browse and order services on campus</p>
                <p className="text-teal-600 font-bold text-xs mt-3">Start Ordering →</p>
              </div>
            </Link>
            <Link href="/auth">
              <div className="p-5 rounded-2xl border-2 border-purple-500 bg-purple-50 hover:bg-purple-100 transition cursor-pointer">
                <div className="mb-3">
                  <Icon3D icon={Store} px={44} iconPx={22} radius={12} color="#7C3AED" />
                </div>
                <p className="font-black text-stone-900 text-sm uppercase tracking-wide">I&apos;m a Vendor</p>
                <p className="text-stone-500 text-xs mt-1">List your services and earn on campus</p>
                <p className="text-purple-600 font-bold text-xs mt-3">Start Selling →</p>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────── */}
      <section className="py-20 px-6 text-white" style={{ background: "linear-gradient(135deg, #0D9488 0%, #7C3AED 100%)" }}>
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-black italic tracking-tighter uppercase mb-16 text-center">
            Order in <span style={{ color: "#ccfbf1" }}>3 Steps</span>
          </h2>
          <div className="max-w-3xl mx-auto grid grid-cols-3 lg:gap-20 gap-6">
            {[
              { num: "01", Icon: Search,      title: "Browse",  desc: "Find services from verified vendors on your campus" },
              { num: "02", Icon: CreditCard,  title: "Pay",     desc: "Secure payment via Paystack, fast and safe" },
              { num: "03", Icon: CheckCircle, title: "Receive", desc: "Confirm delivery and release payment to vendor" },
            ].map((step) => (
              <div key={step.num} className="text-center flex flex-col items-center">
                <p className="text-5xl font-black text-white/30 mb-3">{step.num}</p>
                <div className="mb-3">
                  <Icon3D icon={step.Icon} px={52} iconPx={24} radius={16} color="white" />
                </div>
                <p className="font-black text-white text-sm uppercase tracking-wider mb-1">{step.title}</p>
                <p className="text-white/85 text-xs leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CATEGORIES ───────────────────────────────────── */}
      <section className="py-20 px-6 bg-[#FAFAF9]">
        <div className="max-w-6xl mx-auto">
          <div className="lg:flex lg:gap-16 lg:items-center">
            {/* Heading — left col on desktop */}
            <div className="mb-10 lg:mb-0 lg:w-60 lg:flex-shrink-0">
              <p className="text-teal-700 text-xs tracking-[0.25em] uppercase font-bold mb-2">What&apos;s Available</p>
              <h2 className="text-4xl font-black italic tracking-tighter uppercase text-stone-900"
                style={{ fontFamily: "var(--font-jakarta), 'Plus Jakarta Sans', sans-serif" }}>
                Everything<br />You Need
              </h2>
              <Link href="/home">
                <button className="mt-6 hidden lg:inline-block px-5 py-2.5 rounded-full border border-stone-300 text-stone-600 text-xs font-bold uppercase tracking-wider hover:bg-stone-100 transition">
                  Browse All →
                </button>
              </Link>
            </div>
            {/* Grid — right col on desktop */}
            <div className="flex-1 grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                { Icon: Utensils, iconColor: "#ea580c", name: "Food & Drinks", desc: "Jollof, pasta, zobo & more" },
                { Icon: Sparkles, iconColor: "#7c3aed", name: "Beauty",        desc: "Nails, lashes, makeup"      },
                { Icon: Droplets, iconColor: "#0D9488", name: "Laundry",       desc: "Wash, dry & fold"           },
                { Icon: Camera,   iconColor: "#2563eb", name: "Photography",   desc: "Shoots & editing"           },
                { Icon: Shirt,    iconColor: "#db2777", name: "Fashion",       desc: "Tailoring & styling"        },
                { Icon: Dumbbell, iconColor: "#16a34a", name: "Fitness",       desc: "Personal trainers"          },
              ].map((cat) => (
                <Link key={cat.name} href="/home">
                  <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4 lg:p-5 hover:scale-105 active:scale-95 transition-transform cursor-pointer">
                    <div className="mb-3">
                      <Icon3D icon={cat.Icon} px={44} iconPx={22} radius={12} color={cat.iconColor} />
                    </div>
                    <p className="font-black text-stone-900 text-sm uppercase tracking-wide">{cat.name}</p>
                    <p className="text-stone-400 text-xs mt-0.5">{cat.desc}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── LIVE LISTINGS ────────────────────────────────── */}
      <section className="py-20 px-6 bg-[#FAFAF9]">
        <div className="max-w-6xl mx-auto">
          <div className="lg:grid lg:grid-cols-5 lg:gap-12 lg:items-start">

            {/* Left col: heading + CTA (desktop) */}
            <div className="lg:col-span-2 mb-8 lg:mb-0">
              <div className="flex items-center justify-between lg:flex-col lg:items-start lg:gap-4 mb-4 lg:mb-8">
                <div>
                  <p className="text-teal-700 text-xs tracking-[0.25em] uppercase font-bold mb-1">Live Now</p>
                  <h2 className="text-3xl font-black italic tracking-tighter uppercase text-stone-900"
                    style={{ fontFamily: "var(--font-jakarta), 'Plus Jakarta Sans', sans-serif" }}>
                    {listingCount}+<br className="hidden lg:block" /> Services<br className="hidden lg:block" /> Available
                  </h2>
                </div>
                <Link href="/home">
                  <button className="px-4 py-2 rounded-full border border-teal-600 text-teal-700 text-xs font-bold uppercase tracking-wider hover:bg-teal-50 transition">
                    View All →
                  </button>
                </Link>
              </div>
              {/* CTA box — shown in left col on desktop */}
              <div className="hidden lg:block p-5 bg-teal-50 border border-teal-100 rounded-2xl">
                <p className="text-teal-800 font-bold text-sm mb-1">Want to order any of these?</p>
                <p className="text-teal-600 text-xs mb-4">Create a free account — takes 30 seconds</p>
                <Link href="/auth">
                  <button className="w-full py-2.5 text-white font-black rounded-full text-xs uppercase tracking-wider"
                    style={{ background: "linear-gradient(135deg, #0D9488 0%, #7C3AED 100%)" }}>
                    Sign Up Free →
                  </button>
                </Link>
              </div>
            </div>

            {/* Right col: slideshow */}
            <div className="lg:col-span-3">
              <div className="relative rounded-2xl overflow-hidden" style={{ height: "320px" }}>
                {featuredListings.length > 0 ? featuredListings.map((listing: any, i: number) => (
                  <Link
                    key={listing.id}
                    href="/auth"
                    className="absolute inset-0 transition-opacity duration-1000"
                    style={{ opacity: i === listingIndex ? 1 : 0 }}
                  >
                    <div className="relative w-full h-full bg-stone-100">
                      <img
                        src={listing.image}
                        alt={listing.title}
                        className="w-full h-full object-cover"
                        loading={i === 0 ? "eager" : "lazy"}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                      <div className="absolute bottom-0 left-0 right-0 p-4">
                        <p className="text-white font-bold text-base line-clamp-1">{listing.title}</p>
                        <p className="text-white/70 text-xs mt-1">@{listing.vendor?.username}</p>
                      </div>
                    </div>
                  </Link>
                )) : (
                  <div className="absolute inset-0 bg-stone-100 animate-pulse" />
                )}
              </div>
              <div className="flex justify-center gap-2 mt-3">
                {(featuredListings.length > 0 ? featuredListings : [1,2,3]).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setListingIndex(i)}
                    className={`rounded-full transition-all duration-300 ${
                      i === listingIndex ? "w-6 h-1.5 bg-teal-500" : "w-1.5 h-1.5 bg-stone-300 hover:bg-stone-400"
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* CTA box — mobile only */}
          <div className="mt-6 lg:hidden p-4 bg-teal-50 border border-teal-100 rounded-2xl text-center">
            <p className="text-teal-800 font-bold text-sm mb-1">Want to order any of these?</p>
            <p className="text-teal-600 text-xs mb-3">Create a free account — takes 30 seconds</p>
            <Link href="/auth">
              <button className="px-6 py-2.5 text-white font-black rounded-full text-xs uppercase tracking-wider"
                style={{ background: "linear-gradient(135deg, #0D9488 0%, #7C3AED 100%)" }}>
                Sign Up Free →
              </button>
            </Link>
          </div>
        </div>
      </section>

      {/* ── REVIEWS ──────────────────────────────────────── */}
      <ReviewCarousel />

      {/* ── TRUST ────────────────────────────────────────── */}
      <section className="py-20 px-6 text-white" style={{ background: "linear-gradient(135deg, #7C3AED 0%, #0D9488 100%)" }}>
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-black italic tracking-tighter uppercase mb-10 text-center">
            Built for <span style={{ color: "#ccfbf1" }}>Students</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { Icon: ShieldCheck, title: "Verified Vendors Only", desc: "Every vendor submits valid ID before listing on StudEx" },
              { Icon: Zap,         title: "Campus-Fast",           desc: "Everything is on campus, no long waits or delivery fees" },
            ].map((item) => (
              <div key={item.title} className="flex items-start gap-4 p-5 rounded-2xl bg-white/15 border border-white/25 hover:bg-white/25 transition">
                <Icon3D icon={item.Icon} px={48} iconPx={22} radius={14} color="white" glint />
                <div>
                  <p className="font-black text-white text-sm uppercase tracking-wide">{item.title}</p>
                  <p className="text-white/90 text-xs mt-0.5 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CAMPUSES WE SUPPORT ──────────────────────────── */}
      <section className="py-16 px-6 bg-white border-b border-stone-100">
        <div className="max-w-6xl mx-auto text-center">
          <p className="text-teal-700 text-xs tracking-[0.3em] uppercase font-semibold mb-3">Where We Operate</p>
          <h2 className="text-3xl md:text-4xl font-black italic tracking-tighter uppercase text-stone-900 mb-12"
            style={{ fontFamily: "var(--font-jakarta), 'Plus Jakarta Sans', sans-serif" }}>
            Campuses We Support
          </h2>
          <div className="flex flex-wrap justify-center gap-12 md:gap-24">
            <div className="flex flex-col items-center gap-4">
              <div className="w-28 h-28 rounded-2xl bg-stone-900 flex items-center justify-center p-4 shadow-md overflow-hidden">
                <img src="/images/pau-logo.png" alt="Pan-Atlantic University" className="w-full h-full object-contain" />
              </div>
              <div>
                <p className="text-stone-900 font-bold text-sm">Pan-Atlantic University</p>
                <p className="text-stone-400 text-xs mt-0.5">Ibeju-Lekki, Lagos</p>
              </div>
            </div>
            <div className="flex flex-col items-center gap-4">
              <div className="w-28 h-28 rounded-2xl bg-white border border-stone-200 flex items-center justify-center p-3 shadow-md overflow-hidden">
                <img src="/images/futo-logo.png" alt="Federal University of Technology Owerri" className="w-full h-full object-contain" />
              </div>
              <div>
                <p className="text-stone-900 font-bold text-sm">Federal University of Technology Owerri</p>
                <p className="text-stone-400 text-xs mt-0.5">Owerri, Imo State</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ────────────────────────────────────── */}
      <section className="py-20 px-6 bg-[#FAFAF9] text-center">
        <div className="max-w-xl mx-auto">
          <h2 className="text-4xl font-black italic tracking-tighter uppercase text-stone-900 mb-3"
            style={{ fontFamily: "var(--font-jakarta), 'Plus Jakarta Sans', sans-serif" }}>
            Ready to Order?
          </h2>
          <p className="text-stone-400 text-sm mb-8">Join students across campus already using StudEx.</p>
          <Link href="/auth">
            <button className="w-full md:w-auto md:px-16 px-8 py-4 text-white font-black rounded-full text-sm uppercase tracking-wider shadow-xl transition-transform hover:scale-105 active:scale-95"
              style={{ background: "linear-gradient(135deg, #0D9488 0%, #7C3AED 100%)" }}>
              Create Free Account →
            </button>
          </Link>
          <p className="text-stone-400 text-xs mt-4">Free to join. No hidden charges.</p>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────── */}
      <footer className="bg-white border-t border-stone-100 py-12" style={{ fontFamily: "'DM Sans', sans-serif" }}>
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <p
            className="text-stone-900 font-bold text-xl"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            StudEx
          </p>

          <div className="flex gap-8 text-sm">
            <button onClick={() => navigate("/terms")} className="text-stone-400 hover:text-stone-700 transition">Terms</button>
            <button onClick={() => navigate("/privacy-policy")} className="text-stone-400 hover:text-stone-700 transition">Privacy</button>
          </div>

          <p className="text-stone-300 text-sm">© 2026 StudEx. All rights reserved.</p>
        </div>
      </footer>
    </>
  );
}
