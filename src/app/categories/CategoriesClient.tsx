"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import TopNav from "@/components/layout/TopNav";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";
import { api } from "@/lib/api";
import { SERIF } from "@/lib/tokens";

interface Category {
  id: number;
  title: string;
  slug: string;
  image: string;
}

function getCampus(): string {
  try {
    return (
      document.cookie
        .split(";")
        .find(s => s.trim().startsWith("studex_campus="))
        ?.split("=")?.[1] || "pau"
    );
  } catch {
    return "pau";
  }
}

export default function CategoriesClient({ categories }: { categories: Category[] }) {
  useScrollRestoration("categories", ["/category/"]);

  const [selectedSlug, setSelectedSlug] = useState<string>(categories[0]?.slug ?? "");
  const [listings, setListings]         = useState<any[]>([]);
  const [loading, setLoading]           = useState(false);
  const [countsBySlug, setCountsBySlug] = useState<Record<string, number>>({});

  const chipScrollRef = useRef<HTMLDivElement>(null);
  const campusRef     = useRef("pau");

  useEffect(() => {
    campusRef.current = getCampus();
    if (categories.length) loadCategory(categories[0].slug);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadCategory = (slug: string) => {
    setLoading(true);
    setListings([]);
    api.pub
      .listings({ campus: campusRef.current, category: slug, page_size: "24" })
      .then(r => (r.ok ? r.json() : { results: [], count: 0 }))
      .then(d => {
        setListings(d.results ?? d ?? []);
        setCountsBySlug(prev => ({
          ...prev,
          [slug]: d.count ?? (d.results ?? d ?? []).length,
        }));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const handleSelect = (slug: string) => {
    if (slug === selectedSlug) return;
    setSelectedSlug(slug);
    loadCategory(slug);
  };

  const scrollChips = (dir: "left" | "right") => {
    chipScrollRef.current?.scrollBy({ left: dir === "left" ? -240 : 240, behavior: "smooth" });
  };

  const selectedCat = categories.find(c => c.slug === selectedSlug);
  const count       = countsBySlug[selectedSlug];

  return (
    <div className="min-h-screen bg-[#F5F5F5]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <TopNav showBack activeNav="services" />

      <div className="pt-6 pb-32 max-w-4xl mx-auto">

        {/* ── HEADER ── */}
        <div className="px-5">
          <h1 className="text-3xl font-black text-stone-900" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            Browse by Category
          </h1>
        </div>

        {/* ── CHIP SCROLLER ── */}
        <div className="mt-5 flex items-center gap-2 px-5">
          <button
            onClick={() => scrollChips("left")}
            className="flex-shrink-0 w-10 h-10 rounded-xl bg-stone-900 flex items-center justify-center shadow-md hover:bg-stone-700 transition-colors active:scale-95"
          >
            <ChevronLeft className="w-5 h-5 text-white" />
          </button>

          <div
            ref={chipScrollRef}
            className="flex gap-3 overflow-x-auto hide-scrollbar scroll-smooth flex-1"
          >
            {categories.map(cat => {
              const active = cat.slug === selectedSlug;
              return (
                <button
                  key={cat.id}
                  onClick={() => handleSelect(cat.slug)}
                  className={`flex flex-col items-center gap-1.5 flex-shrink-0 w-[88px] py-3 px-2 rounded-2xl border transition-all active:scale-95 ${
                    active
                      ? "bg-teal-50 border-teal-400 shadow-md"
                      : "bg-white border-stone-100 shadow-sm hover:border-teal-200 hover:shadow-md"
                  }`}
                >
                  <div className="w-12 h-12 rounded-xl overflow-hidden bg-stone-100 flex items-center justify-center flex-shrink-0">
                    {cat.image?.startsWith("http") ? (
                      <img src={cat.image} alt={cat.title} className="w-full h-full object-cover" />
                    ) : (
                      <Sparkles className="w-6 h-6 text-stone-300" />
                    )}
                  </div>
                  <p className={`text-xs font-semibold text-center leading-tight line-clamp-1 ${active ? "text-teal-700" : "text-stone-800"}`}>
                    {cat.title}
                  </p>
                  <p className={`text-[10px] text-center leading-tight ${active ? "text-teal-500" : "text-stone-400"}`}>
                    {countsBySlug[cat.slug] !== undefined ? `${countsBySlug[cat.slug]} Listings` : "—"}
                  </p>
                </button>
              );
            })}
          </div>

          <button
            onClick={() => scrollChips("right")}
            className="flex-shrink-0 w-10 h-10 rounded-xl bg-stone-900 flex items-center justify-center shadow-md hover:bg-stone-700 transition-colors active:scale-95"
          >
            <ChevronRight className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* ── CATEGORY LISTING GRID ── */}
        {selectedCat && (
          <div className="mt-8 px-5">
            {/* Section label */}
            <div className="flex items-baseline gap-2 mb-4">
              <h2 className="text-2xl font-black text-stone-900" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                {selectedCat.title}
              </h2>
              {count !== undefined && (
                <span className="text-sm text-stone-400">( {count} Listings )</span>
              )}
            </div>

            {loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="animate-pulse">
                    <div className="aspect-[3/4] rounded-2xl bg-stone-200" />
                    <div className="h-3 bg-stone-200 rounded-full mt-3 w-4/5" />
                    <div className="h-2.5 bg-stone-100 rounded-full mt-1.5 w-3/5" />
                    <div className="h-3 bg-stone-200 rounded-full mt-1.5 w-2/5" />
                  </div>
                ))}
              </div>
            ) : listings.length === 0 ? (
              <div className="bg-white rounded-2xl p-12 text-center border border-stone-100 shadow-sm">
                <Sparkles className="w-10 h-10 text-stone-200 mx-auto mb-3" />
                <p className="text-stone-400 text-sm">No listings in this category yet</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {listings.map((listing: any) => (
                  <Link key={listing.id} href={`/listing/${listing.id}`} className="group">
                    <div className="aspect-[3/4] rounded-2xl overflow-hidden bg-stone-100 shadow-sm">
                      {listing.image?.startsWith("http") ? (
                        <img
                          src={listing.image}
                          alt={listing.title}
                          loading="lazy"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Sparkles className="w-8 h-8 text-stone-300" />
                        </div>
                      )}
                    </div>
                    <p className="font-bold text-stone-900 text-sm mt-2.5 leading-tight line-clamp-2">
                      {listing.title}
                    </p>
                    <p className="text-stone-400 text-xs mt-0.5 truncate">
                      @{listing.vendor?.username ?? listing.vendor}
                    </p>
                    <p className="font-semibold text-stone-800 text-sm mt-1">
                      ₦{Number(listing.price).toLocaleString()}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {categories.length === 0 && (
          <div className="px-5 mt-10">
            <div className="bg-white rounded-2xl p-12 text-center border border-stone-100 shadow-sm">
              <Sparkles className="w-12 h-12 text-stone-200 mx-auto mb-3" />
              <p className="text-stone-400 text-sm">No categories yet. Check back soon!</p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
