// src/app/seller/listings/page.tsx
"use client";

import { Package, Trash2, Pencil, AlertCircle, Plus } from "lucide-react";
import TopNav from "@/components/layout/TopNav";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, fetchWithAuth } from "@/lib/authStore";
import { GRAD, SERIF } from "@/lib/tokens";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

interface Listing {
  id: number;
  title: string;
  description: string;
  price: number;
  image: string | null;
  is_available: boolean;
  created_at: string;
}

export default function SellerListings() {
  useScrollRestoration("seller-listings", ["/seller/listings/", "/seller/edit/"]);
  const [products, setProducts] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const router = useRouter();
  const { user: authUser } = useAuth();

  useEffect(() => {
    if (!authUser) {
      router.push("/auth");
      return;
    }

    const fetchListings = async () => {
      try {
        const res = await fetchWithAuth(`${API_URL}/api/services/listings/?vendor_username=${encodeURIComponent(authUser.username)}`);

        if (!res.ok) {
          if (res.status === 401) {
            setError("Session expired. Please log in again.");
            setTimeout(() => router.push("/auth"), 2000);
            return;
          }
          throw new Error("Failed to load listings");
        }

        const data = await res.json();
        const listingsList = Array.isArray(data) ? data : data.results || [];
        setProducts(listingsList);
      } catch (err) {
        setError("Failed to load your listings. Try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchListings();
  }, [router, authUser]);

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this product? This cannot be undone.")) return;
    try {
      const res = await fetchWithAuth(`${API_URL}/api/listings/${id}/`, {
        method: "DELETE",
      });
      if (res.ok) {
        setProducts(products.filter((p) => p.id !== id));
      } else {
        alert("Failed to delete. You can only delete your own listings.");
      }
    } catch (err) {
      alert("Network error. Try again.");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F5F5]">
        <div className="animate-spin">
          <Package className="w-10 h-10 text-teal-600" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F5F5]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <TopNav showBack />
      <div className="flex justify-end px-4 pt-3 max-w-2xl mx-auto">
        <Link href="/seller/add">
          <button className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white rounded-full shadow-sm active:scale-95 transition-all" style={{ background: "linear-gradient(135deg,#2DD4BF 0%,#0D9488 100%)" }}>
            <Plus className="w-3.5 h-3.5" /> Add Listing
          </button>
        </Link>
      </div>

      <div className="px-4 pt-6 pb-32 max-w-2xl mx-auto space-y-4">
        {error ? (
          <div className="mt-12 text-center">
            <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
            <p className="text-red-600 text-sm font-medium">{error}</p>
          </div>
        ) : products.length === 0 ? (
          <div className="mt-16 text-center space-y-4">
            <div className="w-24 h-24 mx-auto bg-stone-100 rounded-full flex items-center justify-center">
              <Package className="w-12 h-12 text-stone-400" />
            </div>
            <h2 className="text-lg font-bold text-stone-800" style={SERIF}>
              No Listings Yet
            </h2>
            <p className="text-sm text-stone-500">Start selling and earn on campus!</p>
            <Link href="/seller/add">
              <button
                className="mt-2 px-8 py-3 text-white font-semibold rounded-full shadow-md flex items-center gap-2 mx-auto"
                style={{ background: GRAD }}
              >
                <Plus className="w-4 h-4" />
                Add First Listing
              </button>
            </Link>
          </div>
        ) : (
          products.map((p, i) => (
            <div key={p.id} className="animate-fadeUp">
              <Link href={`/seller/listings/${p.id}`}>
                <div className="bg-white border border-stone-200 rounded-2xl shadow-sm hover:border-teal-300 hover:shadow-md transition-all flex items-center justify-between p-4 gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {p.image ? (
                      <img
                        src={p.image}
                        alt={p.title}
                        loading="lazy"
                        decoding="async"
                        className="w-16 h-16 object-cover rounded-xl border border-stone-100 flex-shrink-0"
                      />
                    ) : (
                      <div className="w-16 h-16 bg-stone-100 rounded-xl flex items-center justify-center flex-shrink-0">
                        <Package className="w-8 h-8 text-stone-400" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold text-stone-900 text-sm truncate">{p.title}</p>
                      <p className="text-teal-600 font-bold text-sm mt-0.5">
                        ₦{parseFloat(String(p.price)).toLocaleString()}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          p.is_available ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-500"
                        }`}>
                          {p.is_available ? "Active" : "Unavailable"}
                        </span>
                        <span className="text-xs text-stone-400">
                          {new Date(p.created_at).toLocaleDateString("en-GB")}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 flex-shrink-0" onClick={(e) => e.preventDefault()}>
                    <Link href={`/seller/edit/${p.id}`}>
                      <button className="p-2 bg-teal-50 rounded-xl hover:bg-teal-100 transition-colors">
                        <Pencil className="w-4 h-4 text-teal-600" />
                      </button>
                    </Link>
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="p-2 bg-red-50 rounded-xl hover:bg-red-100 transition-colors"
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </button>
                  </div>
                </div>
              </Link>
            </div>
          ))
        )}
      </div>

      {products.length > 0 && (
        <Link href="/seller/add">
          <button
            className="fixed bottom-24 right-4 text-white p-4 rounded-full shadow-xl z-40 active:scale-95 transition-all"
            style={{ background: GRAD }}
          >
            <Plus className="w-6 h-6" />
          </button>
        </Link>
      )}
    </div>
  );
}
