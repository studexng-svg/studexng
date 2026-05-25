"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { GRAD, GRAD_TEXT, SERIF } from "@/lib/tokens";
import TopNav from "@/components/layout/TopNav";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";

interface Category {
  id: number;
  title: string;
  slug: string;
  image: string;
}

export default function CategoriesClient({ categories }: { categories: Category[] }) {
  useScrollRestoration("categories", ["/category/"]);
  return (
    <div className="min-h-screen bg-[#F5F5F5]" style={{ fontFamily: "'DM Sans', sans-serif" }}>

      <TopNav showBack activeNav="services" />

      <div className="px-4 pt-6 pb-28 max-w-4xl mx-auto space-y-6">

        {/* ── SECTION HEADER ── */}
        <div className="animate-fadeUp">
          <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-semibold">Browse</p>
          <h2 className="text-2xl font-bold text-stone-900 mt-1" style={SERIF}>
            What do you need today?
          </h2>
          <p className="text-stone-400 text-sm mt-0.5">All services available on campus.</p>
        </div>

        {categories.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-stone-100 shadow-sm animate-fadeIn">
            <Sparkles className="w-12 h-12 text-stone-200 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-stone-400" style={SERIF}>
              No categories yet
            </h3>
            <p className="text-stone-400 text-sm mt-1">Check back soon!</p>
          </div>
        ) : (
          /* ── CATEGORIES GRID ── */
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {categories.map((cat, i) => (
              <div key={cat.id} className="animate-fadeUp">
                <Link href={`/category/${cat.slug}`}>
                  <div className="relative aspect-square rounded-2xl overflow-hidden shadow-sm border border-stone-200 hover:border-teal-300 hover:shadow-md transition-all cursor-pointer group hover:-translate-y-1 tap-scale">

                    {/* Image */}
                    {cat.image?.startsWith("http") ? (
                      <img
                        src={cat.image}
                        alt={cat.title}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-teal-100 to-purple-100 flex items-center justify-center">
                        <Sparkles className="w-10 h-10 text-stone-300" />
                      </div>
                    )}

                    {/* Gradient overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

                    {/* Title */}
                    <div className="absolute bottom-0 left-0 right-0 p-3">
                      <p className="text-white font-bold text-sm leading-tight drop-shadow">
                        {cat.title}
                      </p>
                      <div
                        className="h-0.5 mt-1.5 rounded-full w-0 group-hover:w-8 transition-all duration-300"
                        style={{ background: GRAD }}
                      />
                    </div>

                    {/* Live badge on hover */}
                    <div className="absolute top-2.5 right-2.5 px-2 py-0.5 bg-white/90 backdrop-blur-sm rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="text-[10px] font-bold" style={GRAD_TEXT}>LIVE</span>
                    </div>

                  </div>
                </Link>
              </div>
            ))}
          </div>
        )}

        {/* ── BOTTOM CTA ── */}
        {categories.length > 0 && (
          <div className="text-center py-4 animate-fadeIn">
            <p className="text-stone-400 text-sm">Everything you need.</p>
            <p className="font-bold mt-1" style={{ ...SERIF, ...GRAD_TEXT, fontSize: "1.25rem" }}>Just StudEx.</p>
          </div>
        )}

      </div>
    </div>
  );
}
