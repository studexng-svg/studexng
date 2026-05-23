// src/app/seller/listings/[id]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Package, Tag, FileText, Calendar, Eye, TrendingUp, Edit3, AlertCircle } from "lucide-react";
import TopNav from "@/components/layout/TopNav";
import Link from "next/link";
import { fetchWithAuth, useAuth } from "@/lib/authStore";
import { GRAD, SERIF } from "@/lib/tokens";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

interface Listing {
  id: number;
  title: string;
  description: string;
  price: number;
  image: string | null;
  is_available: boolean;
  category: {
    title: string;
  };
  created_at: string;
}

export default function SellerProductDetails() {
  const { user } = useAuth();
  const { id } = useParams();
  const [product, setProduct] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const router = useRouter();

  useEffect(() => {
    const fetchProduct = async () => {
      try {
        const res = await fetchWithAuth(`${API_URL}/api/services/listings/${id}/`);

        if (!res.ok) {
          if (res.status === 404) {
            setError("Product not found");
          } else if (res.status === 401) {
            setError("Session expired. Redirecting to login...");
            setTimeout(() => router.push("/auth"), 2000);
          } else {
            throw new Error("Failed to load product");
          }
          setLoading(false);
          return;
        }

        const data = await res.json();
        setProduct(data);
      } catch (err) {
        setError("Failed to load product details");
      } finally {
        setLoading(false);
      }
    };

    fetchProduct();
  }, [id, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF9F6]">
        <div className="animate-spin">
          <Package className="w-10 h-10 text-teal-600" />
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex flex-col items-center justify-center p-6 text-center" style={{ fontFamily: "'DM Sans', sans-serif" }}>
        <AlertCircle className="w-14 h-14 text-red-400 mx-auto mb-4" />
        <h2 className="text-lg font-bold text-stone-800 mb-2" style={SERIF}>
          Product Not Found
        </h2>
        <p className="text-sm text-stone-500 mb-6">{error || "This item may have been removed."}</p>
        <Link href="/seller/listings">
          <button
            className="px-8 py-3 text-white font-semibold rounded-full shadow-md flex items-center gap-2"
            style={{ background: GRAD }}
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Listings
          </button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF9F6]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <TopNav showBack backHref="/seller/listings" />

      <div className="px-4 pt-6 pb-32 space-y-5 max-w-2xl mx-auto">
        {/* IMAGE */}
        {product.image ? (
          <div className="rounded-2xl overflow-hidden border border-stone-200 shadow-sm">
            <img
              src={product.image}
              alt={product.title}
              loading="lazy"
              decoding="async"
              className="w-full h-72 object-cover"
            />
          </div>
        ) : (
          <div className="h-72 bg-stone-100 rounded-2xl flex items-center justify-center border border-stone-200">
            <Package className="w-16 h-16 text-stone-300" />
          </div>
        )}

        {/* TITLE + PRICE */}
        <div>
          <h2 className="text-xl font-bold text-stone-900" style={SERIF}>
            {product.title}
          </h2>
          <p className="text-2xl font-bold text-teal-600 mt-1">
            ₦{parseFloat(String(product.price)).toLocaleString()}
          </p>
        </div>

        {/* STATS ROW */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white border border-stone-200 rounded-2xl p-4 text-center shadow-sm">
            <Eye className="w-5 h-5 text-teal-600 mx-auto mb-1" />
            <p className="text-xs font-semibold text-stone-600">Views</p>
          </div>
          <div className="bg-white border border-stone-200 rounded-2xl p-4 text-center shadow-sm">
            <Package className="w-5 h-5 text-purple-600 mx-auto mb-1" />
            <p className="text-xs font-semibold text-stone-600">
              {product.is_available ? "Active" : "Unavailable"}
            </p>
          </div>
          <div className="bg-white border border-stone-200 rounded-2xl p-4 text-center shadow-sm">
            <TrendingUp className="w-5 h-5 text-amber-500 mx-auto mb-1" />
            <p className="text-xs font-semibold text-stone-600">Sales</p>
          </div>
        </div>

        {/* CAMPUS BADGE */}
        <div className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-2.5 flex items-center gap-2">
          <span className="text-xs font-semibold text-teal-700">
            {user?.school?.toUpperCase() || 'PAU'} Marketplace
          </span>
          <span className="text-xs text-teal-500">— visible to {user?.school?.toUpperCase() || 'PAU'} students only</span>
        </div>

        {/* INFO GRID */}
        <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-3">
            <Tag className="w-4 h-4 text-teal-600 flex-shrink-0" />
            <div>
              <p className="text-xs text-stone-400">Category</p>
              <p className="text-sm font-semibold text-stone-800">{product.category.title}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Calendar className="w-4 h-4 text-purple-500 flex-shrink-0" />
            <div>
              <p className="text-xs text-stone-400">Listed On</p>
              <p className="text-sm font-semibold text-stone-800">
                {new Date(product.created_at).toLocaleDateString("en-GB")}
              </p>
            </div>
          </div>
        </div>

        {/* DESCRIPTION */}
        <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm">
          <h3 className="font-semibold text-stone-800 mb-3 flex items-center gap-2 text-sm">
            <FileText className="w-4 h-4 text-teal-600" />
            Description
          </h3>
          <p className="text-stone-600 text-sm leading-relaxed whitespace-pre-wrap">{product.description}</p>
        </div>

        {/* ACTION BUTTONS */}
        <div className="flex gap-3 pt-2">
          <Link href={`/seller/edit/${product.id}`} className="flex-1">
            <button
              className="w-full py-3.5 text-white font-semibold rounded-full shadow-md flex items-center justify-center gap-2 text-sm"
              style={{ background: GRAD }}
            >
              <Edit3 className="w-4 h-4" />
              Edit Listing
            </button>
          </Link>
          <Link href="/seller/listings" className="flex-1">
            <button className="w-full py-3.5 bg-white text-stone-700 rounded-full font-semibold border border-stone-200 shadow-sm flex items-center justify-center gap-2 text-sm hover:border-stone-300 transition-all">
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}
