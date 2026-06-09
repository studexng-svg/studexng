"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Heart, ShoppingCart, User, ChevronLeft } from "lucide-react";
import { useAuth } from "@/lib/authStore";
import { useCart } from "@/lib/cartStore";
import { GRAD, SERIF } from "@/lib/tokens";

interface TopNavProps {
  showBack?: boolean;
  backHref?: string;
  activeNav?: "arrivals" | "services" | "vendors";
}

export default function TopNav({ showBack = false, backHref, activeNav }: TopNavProps) {
  const router = useRouter();
  const { isLoggedIn, user } = useAuth();
  const { cart } = useCart();

  const handleBack = () => {
    if (backHref && window.history.length <= 1) {
      router.push(backHref);
    } else {
      router.back();
    }
  };

  return (
    <header className="sticky top-0 bg-white z-40 border-b border-stone-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">

        {showBack && (
          <button onClick={handleBack}
            className="p-2 rounded-xl border border-stone-200 hover:bg-stone-50 transition flex-shrink-0">
            <ChevronLeft className="w-5 h-5 text-stone-600" />
          </button>
        )}

        <Link href="/home" className="flex items-center gap-2 flex-shrink-0">
          <div className="w-9 h-9 rounded-xl overflow-hidden border border-stone-100 shadow-sm flex items-center justify-center p-1 bg-white">
            <img src="/images/logo-1.jpg" alt="StudEx" loading="lazy" className="w-full h-full object-contain" />
          </div>
          <span className="font-black text-lg text-stone-900 hidden sm:block" style={SERIF}>
            Stud<span className="text-transparent bg-clip-text" style={{ backgroundImage: GRAD }}>Ex</span>
          </span>
        </Link>

        <nav className="hidden lg:flex items-center gap-6 flex-shrink-0">
          <Link href="/home"
            className={`text-sm pb-0.5 transition ${activeNav === "arrivals" ? "font-semibold text-teal-600 border-b-2 border-teal-500" : "font-medium text-stone-500 hover:text-stone-700"}`}>
            New Arrivals
          </Link>
          <Link href="/categories"
            className={`text-sm pb-0.5 transition ${activeNav === "services" ? "font-semibold text-teal-600 border-b-2 border-teal-500" : "font-medium text-stone-500 hover:text-stone-700"}`}>
            Explore
          </Link>
          <Link href="/home#vendors"
            className={`text-sm pb-0.5 transition ${activeNav === "vendors" ? "font-semibold text-teal-600 border-b-2 border-teal-500" : "font-medium text-stone-500 hover:text-stone-700"}`}>
            Vendors
          </Link>
        </nav>

        <div className="flex-1" />

        <div className="flex items-center gap-2 flex-shrink-0">
          {isLoggedIn ? (
            <>
              <Link href="/wishlist" className="p-2 rounded-xl hover:bg-stone-50 transition text-stone-500 hover:text-teal-600">
                <Heart className="w-5 h-5" />
              </Link>
              <Link href="/cart" className="p-2 rounded-xl hover:bg-stone-50 transition text-stone-500 hover:text-teal-600 relative">
                <ShoppingCart className="w-5 h-5" />
                {cart.length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 text-xs font-bold text-white rounded-full flex items-center justify-center" style={{ background: GRAD }}>
                    {cart.length}
                  </span>
                )}
              </Link>
              <Link href="/account" className="hidden lg:flex items-center gap-1.5 text-sm text-stone-600 hover:text-teal-600 transition ml-1">
                <User className="w-4 h-4" />
                <span className="font-semibold text-stone-900">{(user as any)?.username}</span>
              </Link>
            </>
          ) : (
            <Link href="/auth">
              <button className="px-4 py-2 text-white font-semibold rounded-xl text-sm shadow-sm" style={{ background: GRAD }}>
                Login
              </button>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
