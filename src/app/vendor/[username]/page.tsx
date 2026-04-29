"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, Star, Sparkles } from "lucide-react";
import Link from "next/link";
import { fetchWithAuth } from "@/lib/authStore";
import { GRAD, GRAD_TEXT, SERIF } from "@/lib/tokens";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

function SafeImage({ src, alt, className }: { src: string | null | undefined; alt: string; className?: string }) {
  const [error, setError] = useState(false);
  if (!src || error || !src.startsWith("http")) {
    return (
      <div className={`w-full h-full bg-gradient-to-br from-teal-50 to-purple-50 flex items-center justify-center ${className || ""}`}>
        <Sparkles className="w-6 h-6 text-stone-300" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className={`w-full h-full object-cover ${className || ""}`}
      onError={() => setError(true)}
    />
  );
}

export default function VendorProfilePage() {
  const params = useParams();
  const router = useRouter();
  const username = params.username as string;
  const [vendor, setVendor] = useState<any>(null);
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [vRes, lRes] = await Promise.all([
          fetch(`${API_URL}/api/auth/vendors/${username}/`),
          fetchWithAuth(`${API_URL}/api/services/listings/?vendor_username=${username}`),
        ]);
        if (vRes.ok) setVendor(await vRes.json());
        if (lRes.ok) {
          const d = await lRes.json();
          setListings(d.results || d || []);
        }
      } catch {}
      finally { setLoading(false); }
    };
    load();
  }, [username]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFAF9] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-stone-200 border-t-teal-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAF9]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      {/* Header */}
      <div className="sticky top-0 bg-white/80 backdrop-blur-md z-40 border-b border-stone-100 shadow-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={() => router.back()}
            className="p-2.5 bg-white border border-stone-200 rounded-full shadow-sm active:scale-95"
          >
            <ChevronLeft className="w-5 h-5 text-stone-600" />
          </button>
          <h1 className="text-base font-bold text-stone-900" style={SERIF}>
            {vendor?.business_name || vendor?.username || "Vendor"}
          </h1>
          <div className="w-10" />
        </div>
      </div>

      <div className="px-4 pt-6 pb-28 max-w-2xl mx-auto space-y-6">
        {/* Vendor profile card */}
        {vendor && (
          <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm flex items-center gap-4">
            <div
              className="w-16 h-16 rounded-full overflow-hidden flex-shrink-0"
              style={{ boxShadow: "0 0 0 3px #0b1a18" }}
            >
              {vendor.profile_picture ? (
                <img
                  src={vendor.profile_picture}
                  alt={vendor.username}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center text-white font-bold text-xl"
                  style={{ background: GRAD }}
                >
                  {(vendor.business_name || vendor.username || "?").slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>
            <div>
              <p className="font-bold text-stone-900">{vendor.business_name || vendor.username}</p>
              <p className="text-xs text-stone-400">@{vendor.username}</p>
              {vendor.total_reviews > 0 && (
                <div className="flex items-center gap-1 mt-1">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  <span className="text-xs text-stone-600 font-medium">{vendor.rating}</span>
                  <span className="text-xs text-stone-400">({vendor.total_reviews} reviews)</span>
                </div>
              )}
            </div>
          </div>
        )}

        {!vendor && (
          <div className="bg-white border border-stone-100 rounded-2xl p-10 text-center">
            <Sparkles className="w-10 h-10 text-stone-200 mx-auto mb-3" />
            <p className="text-stone-400 text-sm">Vendor not found</p>
          </div>
        )}

        {/* Listings */}
        <div>
          <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-semibold mb-3">Listings</p>
          {listings.length === 0 ? (
            <div className="bg-white border border-stone-100 rounded-2xl p-10 text-center">
              <Sparkles className="w-10 h-10 text-stone-200 mx-auto mb-3" />
              <p className="text-stone-400 text-sm">No listings yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {listings.map(listing => (
                <Link key={listing.id} href={`/listing/${listing.id}`}>
                  <div className="bg-white border border-stone-200 hover:border-teal-300 rounded-2xl overflow-hidden shadow-sm flex gap-3 p-3 transition-all active:scale-[0.98]">
                    <div className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0">
                      <SafeImage
                        src={listing.image?.startsWith("http") ? listing.image : null}
                        alt={listing.title}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-stone-900 text-sm line-clamp-1">{listing.title}</p>
                      <p className="text-xs text-stone-400 mt-0.5 line-clamp-2">{listing.description}</p>
                      <p className="text-base font-bold mt-1" style={GRAD_TEXT}>
                        ₦{Number(listing.price).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
