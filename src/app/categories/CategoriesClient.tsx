"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Sparkles, Search, X } from "lucide-react";
import TopNav from "@/components/layout/TopNav";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";
import { api } from "@/lib/api";

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

const JAKARTA = { fontFamily: "'Plus Jakarta Sans', sans-serif" };

export default function CategoriesClient({ categories }: { categories: Category[] }) {
  useScrollRestoration("categories", ["/category/"]);

  const [selectedSlug, setSelectedSlug] = useState<string>(categories[0]?.slug ?? "");
  const [listings, setListings]         = useState<any[]>([]);
  const [loading, setLoading]           = useState(false);
  const [countsBySlug, setCountsBySlug] = useState<Record<string, number>>({});

  const [searchQuery, setSearchQuery]     = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const handleSearch = (q: string) => {
    setSearchQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!q.trim()) { setSearchResults([]); return; }
    searchTimer.current = setTimeout(() => {
      setSearchLoading(true);
      api.pub
        .listings({ campus: campusRef.current, search: q.trim(), page_size: "24" })
        .then(r => (r.ok ? r.json() : { results: [] }))
        .then(d => setSearchResults(d.results ?? d ?? []))
        .catch(() => {})
        .finally(() => setSearchLoading(false));
    }, 350);
  };

  const clearSearch = () => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setSearchQuery("");
    setSearchResults([]);
  };

  const scrollChips = (dir: "left" | "right") => {
    chipScrollRef.current?.scrollBy({ left: dir === "left" ? -240 : 240, behavior: "smooth" });
  };

  const selectedCat  = categories.find(c => c.slug === selectedSlug);
  const count        = countsBySlug[selectedSlug];
  const isSearching  = searchQuery.trim().length > 0;

  const ListingCard = ({ listing }: { listing: any }) => (
    <Link href={`/listing/${listing.id}`} className="group">
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
        {listing.variants?.length
          ? `From ₦${Math.min(...listing.variants.map((v: any) => Number(v.price))).toLocaleString()}`
          : `₦${Number(listing.price).toLocaleString()}`}
      </p>
    </Link>
  );

  const SkeletonGrid = () => (
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
  );

  return (
    <div className="min-h-screen bg-[#F5F5F5]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <TopNav showBack activeNav="services" />

      <div className="pt-6 pb-32 max-w-4xl mx-auto">

        {/* ── HEADER ── */}
        <div className="px-5">
          <h1 className="text-3xl font-black text-stone-900" style={JAKARTA}>
            Browse by Category
          </h1>

          {/* Search bar */}
          <div className="mt-4 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => handleSearch(e.target.value)}
              placeholder="Search for anything on campus…"
              className="w-full pl-11 pr-10 py-3.5 bg-white border border-stone-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 placeholder:text-stone-400 transition-all shadow-sm"
            />
            {searchQuery && (
              <button
                onClick={clearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 transition"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* ── CHIP SCROLLER (hidden while searching) ── */}
        {!isSearching && (
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
        )}

        {/* ── SEARCH RESULTS ── */}
        {isSearching && (
          <div className="mt-8 px-5">
            <div className="flex items-baseline gap-2 mb-4">
              <h2 className="text-2xl font-black text-stone-900" style={JAKARTA}>
                Search Results
              </h2>
              {!searchLoading && (
                <span className="text-sm text-stone-400">
                  {searchResults.length > 0 ? `${searchResults.length} found` : ""}
                </span>
              )}
            </div>

            {searchLoading ? (
              <SkeletonGrid />
            ) : searchResults.length === 0 ? (
              <div className="bg-white rounded-2xl p-12 text-center border border-stone-100 shadow-sm">
                <Search className="w-10 h-10 text-stone-200 mx-auto mb-3" />
                <p className="font-semibold text-stone-700 text-sm">No results for "{searchQuery}"</p>
                <p className="text-stone-400 text-xs mt-1">Try a different keyword or browse by category</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {searchResults.map(listing => <ListingCard key={listing.id} listing={listing} />)}
              </div>
            )}
          </div>
        )}

        {/* ── CATEGORY LISTING GRID ── */}
        {!isSearching && selectedCat && (
          <div className="mt-8 px-5">
            <div className="flex items-baseline gap-2 mb-4">
              <h2 className="text-2xl font-black text-stone-900" style={JAKARTA}>
                {selectedCat.title}
              </h2>
              {count !== undefined && (
                <span className="text-sm text-stone-400">( {count} Listings )</span>
              )}
            </div>

            {loading ? (
              <SkeletonGrid />
            ) : listings.length === 0 ? (
              <div className="bg-white rounded-2xl p-12 text-center border border-stone-100 shadow-sm">
                <Sparkles className="w-10 h-10 text-stone-200 mx-auto mb-3" />
                <p className="text-stone-400 text-sm">No listings in this category yet</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {listings.map(listing => <ListingCard key={listing.id} listing={listing} />)}
              </div>
            )}
          </div>
        )}

        {!isSearching && categories.length === 0 && (
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
