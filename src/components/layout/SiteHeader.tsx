"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Search, ShoppingCart, Heart, Trophy, X } from "lucide-react";
import Image from "next/image";
import { useAuth } from "@/lib/authStore";
import { useCart } from "@/lib/cartStore";
import { GRAD, TEAL } from "@/lib/tokens";

export default function SiteHeader() {
  const router   = useRouter();
  const pathname = usePathname();
  const { isLoggedIn, user } = useAuth();
  const { cart } = useCart();
  const [search, setSearch] = useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = search.trim();
    if (q) { router.push(`/categories?search=${encodeURIComponent(q)}`); setSearch(""); }
  };

  const isActive = (href: string) =>
    href === "/home" ? pathname === href : pathname.startsWith(href);

  return (
    <header className="hidden lg:block sticky top-0 bg-white z-40 border-b border-stone-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">

        {/* Logo */}
        <Link href="/home" className="flex items-center gap-2 flex-shrink-0">
          <div className="w-9 h-9 rounded-xl overflow-hidden border border-stone-100 shadow-sm flex items-center justify-center p-1 bg-white">
            <Image src="/images/logo-1.jpg" alt="StudEx" width={36} height={36} className="w-full h-full object-contain" />
          </div>
          <span className="font-black text-lg text-stone-900" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            Stud<span className="text-transparent bg-clip-text" style={{ backgroundImage: GRAD }}>Ex</span>
          </span>
        </Link>

        {/* Nav links */}
        <nav className="flex items-center gap-6 flex-shrink-0">
          <Link href="/home"
            className={`text-sm font-medium transition ${isActive("/home") ? "text-teal-600 font-semibold border-b-2 border-teal-500 pb-0.5" : "text-stone-500 hover:text-stone-700"}`}>
            Home
          </Link>
          <Link href="/categories"
            className={`text-sm font-medium transition ${isActive("/categories") ? "text-teal-600 font-semibold border-b-2 border-teal-500 pb-0.5" : "text-stone-500 hover:text-stone-700"}`}>
            Shop
          </Link>
          <Link href="/leaderboard"
            className={`text-sm font-medium flex items-center gap-1 transition ${isActive("/leaderboard") ? "text-teal-600 font-semibold border-b-2 border-teal-500 pb-0.5" : "text-stone-500 hover:text-stone-700"}`}>
            <Trophy className="w-3.5 h-3.5 text-amber-500" /> Leaderboard
          </Link>
        </nav>

        {/* Search */}
        <form onSubmit={handleSearch} className="relative flex-1 max-w-2xl">
          <Search className="w-4 h-4 absolute left-4 top-3 text-stone-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search for services, vendors and more..."
            className="w-full pl-11 pr-9 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 placeholder:text-stone-400 transition-all"
          />
          {search && (
            <button type="button" onClick={() => setSearch("")} className="absolute right-3 top-3 text-stone-400 hover:text-stone-600">
              <X className="w-4 h-4" />
            </button>
          )}
        </form>

        {/* Right actions */}
        <div className="flex items-center gap-4 flex-shrink-0">
          {isLoggedIn && user ? (
            <>
              <Link href="/wishlist" className="flex flex-col items-center gap-0.5 text-stone-500 hover:text-teal-600 transition cursor-pointer">
                <Heart className="w-5 h-5" />
                <span className="text-xs font-medium">Wishlist</span>
              </Link>
              <Link href="/cart" className="flex flex-col items-center gap-0.5 text-stone-500 hover:text-teal-600 transition cursor-pointer">
                <div className="relative">
                  <ShoppingCart className="w-5 h-5" />
                  {cart.length > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 w-4 h-4 text-xs font-bold text-white rounded-full flex items-center justify-center" style={{ background: TEAL }}>
                      {cart.length}
                    </span>
                  )}
                </div>
                <span className="text-xs font-medium">Cart</span>
              </Link>
              <Link href="/account" className="flex items-center gap-2 text-sm text-stone-600 hover:text-teal-600 transition cursor-pointer">
                {(user as any).profile_image ? (
                  <img src={(user as any).profile_image} alt={(user as any).username} className="w-8 h-8 rounded-full object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0" style={{ background: TEAL }}>
                    {((user as any).username?.[0] || "U").toUpperCase()}
                  </div>
                )}
                <span>Hi, <span className="font-semibold text-stone-900">{(user as any).username}</span></span>
              </Link>
            </>
          ) : (
            <>
              <Link href="/auth" className="text-sm text-stone-500 hover:text-teal-600 font-medium transition">
                Sell on StudEx
              </Link>
              <Link href="/auth">
                <button className="px-4 py-2 text-white font-semibold rounded-xl text-sm shadow-sm" style={{ background: GRAD }}>
                  Login
                </button>
              </Link>
            </>
          )}
        </div>

      </div>
    </header>
  );
}
