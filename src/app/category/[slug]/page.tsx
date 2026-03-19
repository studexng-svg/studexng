// src/app/category/[slug]/page.tsx
"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Search, ChevronLeft, Sparkles, Loader, AlertCircle, MapPin, ShoppingCart, MessageCircle, Star } from "lucide-react";
import { useState, useEffect } from "react";
import { useCartStore } from "@/lib/cartStore";
import { useAuth } from "@/lib/authStore";
import VendorBadge from "@/components/VendorBadge";
import ChatWindow from "@/components/ChatWindow";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

interface Listing {
  id: number;
  title: string;
  description: string;
  price: number;
  image: string;
  vendor: {
    id: number;
    username: string;
    business_name?: string;
    profile?: {
      vendor_badge: "none" | "rising" | "trusted" | "top";
      completion_rate: number;
      rating: number;
      total_reviews: number;
    };
  };
  category: { id: number; title: string };
  is_available: boolean;
  listing_type?: string;
}

interface ActiveChat {
  sellerId: number;
  sellerName: string;
  listingId: number;
  productName: string;
  originalPrice: number;
}

export default function CategoryPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  const { addToCart } = useCartStore();
  const { isLoggedIn, user } = useAuth(); // ← added user

  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");
  const [activeChat, setActiveChat] = useState<ActiveChat | null>(null);

  const categoryName = slug.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');

  useEffect(() => {
    const fetchListings = async () => {
      try {
        const res = await fetch(`${API_URL}/api/services/listings/?category=${slug}`);
        if (!res.ok) throw new Error(`Status: ${res.status}`);
        const data = await res.json();
        setListings(data.results || []);
      } catch (err: any) {
        setError(err.message || 'Failed to load listings.');
      } finally {
        setLoading(false);
      }
    };
    fetchListings();
  }, [slug]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2000);
  };

  const handleAddToCart = (listing: Listing) => {
    addToCart({ id: listing.id, title: listing.title, price: listing.price, img: listing.image });
    // Store current page so cart back button returns here
    try { sessionStorage.setItem("cart-referrer", window.location.pathname); } catch {};
    showToast("Added to cart!");
  };

  const handleOpenChat = (listing: Listing) => {
    if (!isLoggedIn) { router.push("/auth"); return; }
    setActiveChat({
      sellerId: listing.vendor.id,
      sellerName: listing.vendor.business_name || listing.vendor.username,
      listingId: listing.id,
      productName: listing.title,
      originalPrice: listing.price,
    });
  };

  const filteredListings = listings.filter(l =>
    l.title.toLowerCase().includes(search.toLowerCase()) ||
    l.description.toLowerCase().includes(search.toLowerCase())
  );

  const BADGE_WEIGHT = { top: 3, trusted: 2, rising: 1, none: 0 };
  const sortedListings = [...filteredListings].sort((a, b) => {
    const aBadge = BADGE_WEIGHT[a.vendor.profile?.vendor_badge || 'none'];
    const bBadge = BADGE_WEIGHT[b.vendor.profile?.vendor_badge || 'none'];
    if (bBadge !== aBadge) return bBadge - aBadge;
    return (b.vendor.profile?.completion_rate || 0) - (a.vendor.profile?.completion_rate || 0);
  });

  if (loading) return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-teal-50 flex items-center justify-center">
      <Loader className="w-14 h-14 text-purple-600 animate-spin" />
    </div>
  );

  if (error) return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl p-8 text-center shadow-xl max-w-md">
        <AlertCircle className="w-14 h-14 text-red-500 mx-auto mb-4" />
        <p className="text-gray-600">{error}</p>
        <button onClick={() => router.back()} className="mt-4 px-6 py-3 bg-gradient-to-r from-purple-600 to-teal-600 text-white font-bold rounded-full">Go Back</button>
      </div>
    </div>
  );

  return (
    <>
      {toast && (
        <motion.div initial={{ y: -50, opacity: 0 }} animate={{ y: 60, opacity: 1 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full bg-green-500 text-white text-sm font-bold shadow-lg z-50">
          {toast}
        </motion.div>
      )}

      {activeChat && (
        <ChatWindow
          sellerId={activeChat.sellerId}
          sellerName={activeChat.sellerName}
          listingId={activeChat.listingId}
          productName={activeChat.productName}
          originalPrice={activeChat.originalPrice}
          onClose={() => setActiveChat(null)}
        />
      )}

      <div className="sticky top-0 bg-white/95 backdrop-blur-xl z-40 border-b border-purple-100 shadow-sm">
        <div className="flex items-center justify-between p-4">
          <button onClick={() => router.back()} className="p-2 hover:bg-purple-50 rounded-full">
            <ChevronLeft className="w-6 h-6 text-purple-600" />
          </button>
          <h1 className="text-xl font-black bg-gradient-to-r from-purple-600 to-teal-500 bg-clip-text text-transparent">{categoryName}</h1>
          <div className="w-10" />
        </div>
        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-4 top-3.5 w-4 h-4 text-gray-400" />
            <input type="text" placeholder={`Search ${categoryName.toLowerCase()}...`}
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-gray-50 rounded-xl text-sm border border-gray-100 focus:outline-none focus:border-purple-300" />
          </div>
        </div>
      </div>

      <div className="pb-32 px-4 pt-4 bg-gradient-to-br from-purple-50 to-teal-50 min-h-screen">
        {sortedListings.length === 0 ? (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center py-20">
            <Sparkles className="w-20 h-20 text-gray-200 mx-auto mb-4" />
            <h2 className="text-xl font-black text-gray-600">{search ? "No results found" : `No ${categoryName.toLowerCase()} available yet`}</h2>
          </motion.div>
        ) : (
          <div className="space-y-4">
            {sortedListings.map((listing, i) => {
              // ← FIX: check if this listing belongs to the logged-in user
              const isOwnListing = !!(user?.id && user.id === listing.vendor.id);

              return (
                <motion.div key={listing.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.07 }} className="bg-white rounded-2xl shadow-md overflow-hidden border border-gray-100">
                  <Link href={`/listing/${listing.id}`}>
                    <div className="relative h-48 cursor-pointer">
                      {listing.image ? (
                        <Image src={listing.image.startsWith("http") ? listing.image : `/images/${listing.image}`}
                          alt={listing.title} fill className="object-cover" />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-purple-100 to-teal-100 flex items-center justify-center">
                          <Sparkles className="w-12 h-12 text-purple-400" />
                        </div>
                      )}
                      {!listing.is_available && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                          <span className="text-white font-black bg-red-600 px-4 py-2 rounded-full text-sm">Unavailable</span>
                        </div>
                      )}
                      {/* Badge for vendor's own listings */}
                      {isOwnListing && (
                        <div className="absolute top-3 right-3 bg-teal-600 text-white text-xs font-black px-3 py-1 rounded-full shadow">
                          Your Listing
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                      <div className="absolute bottom-3 left-3 right-3">
                        <p className="text-white font-black text-lg drop-shadow leading-tight">{listing.title}</p>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <MapPin className="w-3 h-3 text-white/80" />
                          <span className="text-white/90 text-xs">{listing.vendor.business_name || listing.vendor.username}</span>
                          {listing.vendor.profile?.vendor_badge && listing.vendor.profile.vendor_badge !== 'none' && (
                            <VendorBadge badge={listing.vendor.profile.vendor_badge} size="sm" />
                          )}
                        </div>
                      </div>
                    </div>
                  </Link>
                  <div className="p-4">
                    <Link href={`/listing/${listing.id}`}>
                      <p className="text-gray-500 text-sm mb-3 line-clamp-2 hover:text-purple-600 transition">{listing.description}</p>
                    </Link>
                    {listing.vendor.profile && listing.vendor.profile.total_reviews > 0 && (
                      <div className="flex items-center gap-1.5 mb-3">
                        <div className="flex">
                          {[1,2,3,4,5].map(s => (
                            <Star key={s} className={`w-3.5 h-3.5 ${s <= Math.round(listing.vendor.profile!.rating) ? 'text-amber-400 fill-amber-400' : 'text-gray-200 fill-gray-200'}`} />
                          ))}
                        </div>
                        <span className="text-xs text-gray-500">{listing.vendor.profile.rating} ({listing.vendor.profile.total_reviews} reviews)</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-2xl font-black bg-gradient-to-r from-purple-600 to-teal-600 bg-clip-text text-transparent">
                        ₦{Number(listing.price).toLocaleString()}
                      </p>
                      <div className="flex items-center gap-2">
                        {/* ← FIX: hide Message + Add to Cart buttons for own listings */}
                        {!isOwnListing && (
                          <>
                            <motion.button whileTap={{ scale: 0.95 }} onClick={() => handleOpenChat(listing)}
                              className="p-2.5 bg-gray-100 text-gray-600 rounded-xl hover:bg-purple-50 hover:text-purple-600 transition" title="Message vendor">
                              <MessageCircle className="w-4 h-4" />
                            </motion.button>
                            {listing.is_available && listing.listing_type !== "service" && (
                              <motion.button whileTap={{ scale: 0.95 }} onClick={() => handleAddToCart(listing)}
                                className="px-4 py-2.5 bg-gradient-to-r from-purple-600 to-teal-500 text-white font-bold rounded-xl shadow text-sm flex items-center gap-1.5">
                                <ShoppingCart className="w-4 h-4" /> Add
                              </motion.button>
                            )}
                            {listing.is_available && listing.listing_type === "service" && (
                              <Link href={`/listing/${listing.id}`}>
                                <motion.button whileTap={{ scale: 0.95 }}
                                  className="px-4 py-2.5 bg-gradient-to-r from-purple-600 to-teal-500 text-white font-bold rounded-xl shadow text-sm flex items-center gap-1.5">
                                  Book
                                </motion.button>
                              </Link>
                            )}
                          </>
                        )}
                        {/* Manage button for vendor's own listings */}
                        {isOwnListing && (
                          <Link href="/vendor/dashboard">
                            <motion.button whileTap={{ scale: 0.95 }}
                              className="px-4 py-2.5 bg-teal-600 text-white font-bold rounded-xl shadow text-sm">
                              Manage
                            </motion.button>
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
