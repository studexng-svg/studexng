// src/app/seller/add/page.tsx
"use client";

import { Plus, X, AlertCircle, ChevronLeft, Image as ImageIcon } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fetchWithAuth, useAuth } from "@/lib/authStore";
import { GRAD, SERIF } from "@/lib/tokens";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

interface Category {
  id: number;
  title: string;
  slug: string;
}

export default function AddService() {
  const { user } = useAuth();
  const [form, setForm] = useState({
    title: "",
    price: "",
    description: "",
    category: "",
    images: [] as File[],
  });
  const [previews, setPreviews] = useState<string[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fetchingCategories, setFetchingCategories] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    fetchWithAuth(`${API_URL}/api/services/categories/`)
      .then(r => r.json())
      .then(data => setCategories(data.results || data || []))
      .catch(() => setCategories([]))
      .finally(() => setFetchingCategories(false));
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm({ ...form, [name]: value });
    setError("");
  };

  const handleImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files || []);
    if (form.images.length + newFiles.length > 4) {
      setError("Maximum 4 photos allowed");
      return;
    }
    const updatedImages = [...form.images, ...newFiles];
    setForm({ ...form, images: updatedImages });
    newFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviews((prev) => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index: number) => {
    setPreviews(previews.filter((_, i) => i !== index));
    setForm({ ...form, images: form.images.filter((_, i) => i !== index) });
  };

  const validateForm = () => {
    if (!form.title.trim()) return "Service name is required";
    if (!form.price || Number(form.price) <= 0) return "Valid price is required";
    if (!form.category) return "Category is required";
    if (!form.description.trim()) return "Description is required";
    if (form.images.length === 0) return "At least 1 photo is required";
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateForm();
    if (validationError) { setError(validationError); return; }
    setLoading(true);
    setError("");
    const formData = new FormData();
    formData.append("title", form.title);
    formData.append("description", form.description);
    formData.append("price", form.price);
    formData.append("category", form.category);
    formData.append("is_available", "true");
    formData.append("image", form.images[0]);
    try {
      const res = await fetchWithAuth(`${API_URL}/api/services/listings/`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || (Object.values(data)[0] as string[])?.[0] || "Failed to publish service");
      }
      router.push("/seller");
    } catch (err: any) {
      setError(err.message || "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAF9]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      {/* HEADER */}
      <div className="sticky top-0 bg-white/80 backdrop-blur-md z-40 border-b border-stone-100 shadow-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={() => router.back()} className="p-2.5 bg-white border border-stone-200 rounded-full shadow-sm active:scale-95 transition-all">
            <ChevronLeft className="w-5 h-5 text-stone-600" />
          </button>
          <h1 className="text-base font-bold text-stone-900" style={SERIF}>
            Add New Service
          </h1>
          <div className="w-10" />
        </div>
      </div>

      {/* ERROR BANNER */}
      {error && (
        <div className="mx-4 mt-4 bg-red-50 border border-red-200 rounded-2xl p-4 flex gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-red-700 text-sm font-medium">{error}</p>
        </div>
      )}

      <div suppressHydrationWarning>
        <form onSubmit={handleSubmit} className="px-4 pt-6 pb-32 space-y-6 max-w-2xl mx-auto">

          {/* PHOTOS */}
          <div className="space-y-3">
            <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-semibold">Photos</p>
            <h2 className="text-lg font-bold text-stone-900" style={SERIF}>
              Service Photos <span className="text-red-500">*</span> <span className="text-stone-400 font-normal text-sm">(up to 4)</span>
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {previews.map((src, index) => (
                <div key={index} className="relative group rounded-xl overflow-hidden border border-stone-200">
                  <img src={src} alt={`Preview ${index + 1}`} className="w-full h-32 object-cover" />
                  <button type="button" onClick={() => removeImage(index)}
                    className="absolute top-2 right-2 bg-red-500 text-white p-1.5 rounded-full shadow opacity-0 group-hover:opacity-100 transition">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {form.images.length < 4 && (
                <label className="border-2 border-dashed border-stone-300 rounded-xl h-32 flex flex-col items-center justify-center cursor-pointer hover:border-teal-400 hover:bg-teal-50/50 transition-all">
                  <ImageIcon className="w-7 h-7 text-stone-400 mb-1" />
                  <span className="text-xs text-stone-500 font-medium">Add Photo</span>
                  <input ref={fileInputRef} type="file" multiple accept="image/*" onChange={handleImages} className="hidden" />
                </label>
              )}
            </div>
          </div>

          {/* SERVICE NAME */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-stone-700">Service Name</label>
            <input type="text" name="title" value={form.title} onChange={handleChange}
              placeholder="Hair braiding, Laundry service, Tutoring..."
              className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition placeholder:text-stone-400"
              required />
          </div>

          {/* CATEGORY */}
          <div className="space-y-3">
            <label className="text-sm font-semibold text-stone-700">Category</label>
            <div className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-2.5 flex items-center gap-2">
              <span className="text-xs font-semibold text-teal-700">
                {user?.school?.toUpperCase() || 'PAU'} Marketplace
              </span>
              <span className="text-xs text-teal-500">— your listing will be visible to {user?.school?.toUpperCase() || 'PAU'} students only</span>
            </div>
            {fetchingCategories ? (
              <p className="text-sm text-stone-400">Loading categories...</p>
            ) : categories.length === 0 ? (
              <p className="text-sm text-stone-400">No categories available</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {categories.map((cat) => (
                  <button key={cat.slug} type="button" onClick={() => setForm({ ...form, category: cat.slug })}
                    className={`p-3 rounded-xl border-2 transition-all text-center text-sm font-medium ${
                      form.category === cat.slug
                        ? "border-teal-500 bg-teal-50 text-teal-700"
                        : "border-stone-200 bg-white text-stone-700 hover:border-stone-300"
                    }`}>
                    {cat.title}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* PRICE */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-stone-700">Price (₦)</label>
            <div className="relative">
              <span className="absolute left-4 top-3.5 text-stone-500 font-bold text-sm">₦</span>
              <input type="number" name="price" value={form.price} onChange={handleChange} placeholder="5000"
                className="w-full pl-8 pr-4 py-3 bg-white border border-stone-200 rounded-xl text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition"
                required />
            </div>
          </div>

          {/* DESCRIPTION */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-stone-700">Description</label>
            <textarea name="description" value={form.description} onChange={handleChange} rows={5}
              placeholder="Describe what you offer, your experience, what's included, and what clients should expect..."
              className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition resize-none placeholder:text-stone-400"
              required />
            <p className="text-xs text-stone-400">Be detailed — it helps attract better clients!</p>
          </div>

          {/* SUBMIT */}
          <button type="submit" disabled={loading}
            className="w-full py-4 rounded-full text-white font-semibold text-base shadow-lg shadow-teal-200/60 disabled:opacity-60 flex items-center justify-center gap-2 transition active:scale-[0.98]"
            style={{ background: GRAD }}>
            <Plus className="w-5 h-5" />
            {loading ? "Publishing..." : "Publish Service"}
          </button>
        </form>
      </div>
    </div>
  );
}
