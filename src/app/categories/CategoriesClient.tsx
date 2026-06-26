"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, AlignJustify, Sparkles } from "lucide-react";
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

  const [listingsBySlug, setListingsBySlug] = useState<Record<string, any[]>>({});
  const [countsBySlug, setCountsBySlug]     = useState<Record<string, number>>({});
  const [loading, setLoading]               = useState(true);

  const chipScrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs   = useRef<Record<string, HTMLDivElement | null>>({});
  const rowRefs       = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!categories.length) { setLoading(false); return; }
    const campus = getCampus();
    Promise.all(
      categories.map(cat =>
        api.pub
          .listings({ campus, category: cat.slug, page_size: "6" })
          .then(r => (r.ok ? r.json() : { results: [], count: 0 }))
          .then(d => ({
            slug:  cat.slug,
            items: d.results ?? d ?? [],
            count: d.count  ?? (d.results ?? d ?? []).length,
          }))
          .catch(() => ({ slug: cat.slug, items: [], count: 0 }))
      )
    ).then(results => {
      const bySlug: Record<string, any[]>  = {};
      const counts: Record<string, number> = {};
      results.forEach(({ slug, items, count }) => {
        bySlug[slug] = items;
        counts[slug] = count;
      });
      setListingsBySlug(bySlug);
      setCountsBySlug(counts);
    }).finally(() => setLoading(false));
  }, [categories]);

  const scrollChips = (dir: "left" | "right") => {
    chipScrollRef.current?.scrollBy({ left: dir === "left" ? -240 : 240, behavior: "smooth" });
  };

  const scrollRow = (slug: string, dir: "left" | "right") => {
    rowRefs.current[slug]?.scrollBy({ left: dir === "left" ? -300 : 300, behavior: "smooth" });
  };

  const scrollToSection = (slug: string) => {
    sectionRefs.current[slug]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen bg-[#F5F5F5]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <TopNav showBack activeNav="services" />

      <div className="pt-6 pb-32 max-w-4xl mx-auto">

        {/* ── HEADER ── */}
        <div className="px-5">
          <h1 className="text-3xl font-black text-stone-900" style={SERIF}>
            Browse by Category
          </h1>
        </div>

        {/* ── CATEGORY CHIP SCROLLER ── */}
        <div className="mt-5 flex items-center gap-2 px-5">
          <button
            onClick={() => scrollChips("left")}
            className="flex-shrink-0 w-10 h-10 rounded-xl bg-stone-900 flex items-center justify-center shadow-md hover:bg-stone-700 transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-white" />
          </button>

          <div
            ref={chipScrollRef}
            className="flex gap-3 overflow-x-auto scrollbar-hide scroll-smooth flex-1"
          >
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => scrollToSection(cat.slug)}
                className="flex flex-col items-center gap-1.5 flex-shrink-0 w-[88px] py-3 px-2 bg-white rounded-2xl shadow-sm border border-stone-100 hover:border-teal-300 hover:shadow-md active:scale-95 transition-all"
              >
                <div className="w-12 h-12 rounded-xl overflow-hidden bg-stone-100 flex items-center justify-center flex-shrink-0">
                  {cat.image?.startsWith("http") ? (
                    <img src={cat.image} alt={cat.title} className="w-full h-full object-cover" />
                  ) : (
                    <Sparkles className="w-6 h-6 text-stone-300" />
                  )}
                </div>
                <p className="text-xs font-semibold text-stone-800 text-center leading-tight line-clamp-1">
                  {cat.title}
                </p>
                <p className="text-[10px] text-stone-400 text-center leading-tight">
                  {countsBySlug[cat.slug] !== undefined
                    ? `${countsBySlug[cat.slug]} Listings`
                    : loading ? "—" : "0 Listings"}
                </p>
              </button>
            ))}
          </div>

          <button
            onClick={() => scrollChips("right")}
            className="flex-shrink-0 w-10 h-10 rounded-xl bg-stone-900 flex items-center justify-center shadow-md hover:bg-stone-700 transition-colors"
          >
            <ChevronRight className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* ── PER-CATEGORY SECTIONS ── */}
        {categories.length === 0 ? (
          <div className="px-5 mt-10">
            <div className="bg-white rounded-2xl p-12 text-center border border-stone-100 shadow-sm">
              <Sparkles className="w-12 h-12 text-stone-200 mx-auto mb-3" />
              <p className="text-stone-400 text-sm">No categories yet. Check back soon!</p>
            </div>
          </div>
        ) : (
          categories.map(cat => {
            const items = listingsBySlug[cat.slug] || [];
            const count = countsBySlug[cat.slug]  ?? 0;

            return (
              <div
                key={cat.id}
                ref={el => { sectionRefs.current[cat.slug] = el; }}
                className="mt-10 scroll-mt-20"
              >
                {/* Section header */}
                <div className="flex items-center justify-between px-5 mb-4">
                  <div className="flex items-baseline gap-2 min-w-0">
                    <h2
                      className="text-2xl font-black text-stone-900 leading-tight"
                      style={SERIF}
                    >
                      {cat.title}
                    </h2>
                    {!loading && count > 0 && (
                      <span className="text-sm text-stone-400 flex-shrink-0">
                        ( {count} Listings )
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                    <Link href={`/category/${cat.slug}`}>
                      <div className="w-8 h-8 rounded-lg bg-stone-100 flex items-center justify-center hover:bg-stone-200 transition-colors cursor-pointer">
                        <AlignJustify className="w-4 h-4 text-stone-500" />
                      </div>
                    </Link>
                    <button
                      onClick={() => scrollRow(cat.slug, "left")}
                      className="w-8 h-8 rounded-lg border border-stone-200 bg-white flex items-center justify-center hover:bg-stone-50 transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4 text-stone-600" />
                    </button>
                    <button
                      onClick={() => scrollRow(cat.slug, "right")}
                      className="w-8 h-8 rounded-lg border border-stone-200 bg-white flex items-center justify-center hover:bg-stone-50 transition-colors"
                    >
                      <ChevronRight className="w-4 h-4 text-stone-600" />
                    </button>
                  </div>
                </div>

                {/* Horizontal listing scroll */}
                {loading ? (
                  <div
                    ref={el => { rowRefs.current[cat.slug] = el; }}
                    className="flex gap-4 overflow-x-auto scrollbar-hide px-5"
                  >
                    {[1, 2, 3, 4, 5].map(i => (
                      <div key={i} className="flex-shrink-0 w-40 animate-pulse">
                        <div className="aspect-[3/4] rounded-2xl bg-stone-200" />
                        <div className="h-3 bg-stone-200 rounded-full mt-3 w-4/5" />
                        <div className="h-2.5 bg-stone-100 rounded-full mt-1.5 w-3/5" />
                      </div>
                    ))}
                  </div>
                ) : items.length === 0 ? (
                  <div className="px-5">
                    <div className="bg-white rounded-2xl p-8 text-center border border-stone-100">
                      <p className="text-stone-400 text-sm">No listings in this category yet</p>
                      <Link
                        href={`/category/${cat.slug}`}
                        className="text-teal-600 text-sm font-semibold mt-2 inline-block hover:underline"
                      >
                        Browse anyway →
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div
                    ref={el => { rowRefs.current[cat.slug] = el; }}
                    className="flex gap-4 overflow-x-auto scrollbar-hide px-5 pb-2"
                  >
                    {items.map((listing: any) => (
                      <Link
                        key={listing.id}
                        href={`/listing/${listing.id}`}
                        className="flex-shrink-0 w-40 group"
                      >
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

                    {/* See all card */}
                    {count > items.length && (
                      <Link href={`/category/${cat.slug}`} className="flex-shrink-0 w-40">
                        <div className="aspect-[3/4] rounded-2xl border-2 border-dashed border-stone-200 bg-white flex flex-col items-center justify-center gap-2 hover:border-teal-400 hover:bg-teal-50/40 transition-all">
                          <div className="w-10 h-10 rounded-full bg-stone-100 flex items-center justify-center">
                            <ChevronRight className="w-5 h-5 text-stone-500" />
                          </div>
                          <p className="text-xs font-semibold text-stone-400 text-center px-2 leading-tight">
                            See all {count}
                          </p>
                        </div>
                      </Link>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}

      </div>
    </div>
  );
}
