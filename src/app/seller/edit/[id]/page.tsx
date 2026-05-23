"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertCircle, Image as ImageIcon, Save, X } from "lucide-react";
import TopNav from "@/components/layout/TopNav";
import { fetchWithAuth } from "@/lib/authStore";
import { GRAD, SERIF } from "@/lib/tokens";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

interface Category {
  id: number;
  title: string;
  slug: string;
}

export default function EditProductPage() {
  const { id } = useParams();
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");

  const [existingImage, setExistingImage] = useState<string | null>(null);
  const [newImageFile, setNewImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const [categories, setCategories] = useState<Category[]>([]);
  const [fetchingCategories, setFetchingCategories] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchListing = async () => {
      try {
        const res = await fetchWithAuth(`${API_URL}/api/services/listings/${id}/`);
        if (!res.ok) {
          if (res.status === 401) {
            router.push("/auth");
            return;
          }
          throw new Error("Failed to load listing");
        }
        const data = await res.json();
        setTitle(data.title || "");
        setPrice(String(data.price || ""));
        setDescription(data.description || "");
        setCategory(data.category?.slug || data.category || "");
        if (data.image) {
          setExistingImage(data.image);
          setImagePreview(data.image);
        }
      } catch {
        setError("Failed to load listing. Please go back and try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchListing();
  }, [id, router]);

  useEffect(() => {
    fetchWithAuth(`${API_URL}/api/services/categories/`)
      .then(r => r.json())
      .then(data => setCategories(data.results || data || []))
      .catch(() => setCategories([]))
      .finally(() => setFetchingCategories(false));
  }, []);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setNewImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setExistingImage(null);
  };

  const clearImage = () => {
    setNewImageFile(null);
    setImagePreview(null);
    setExistingImage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError("Service name is required"); return; }
    if (!price || Number(price) <= 0) { setError("Valid price is required"); return; }
    if (!category) { setError("Category is required"); return; }
    if (!description.trim()) { setError("Description is required"); return; }

    if (!newImageFile && !existingImage) {
      setError("Please upload a listing image before saving.");
      return;
    }

    setSaving(true);
    setError("");

    const fd = new FormData();
    fd.append("title", title);
    fd.append("description", description);
    fd.append("price", price);
    fd.append("category", category);
    if (newImageFile) {
      fd.append("image", newImageFile);
    }

    try {
      const res = await fetchWithAuth(`${API_URL}/api/services/listings/${id}/`, {
        method: "PATCH",
        body: fd,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || (Object.values(data)[0] as string[])?.[0] || "Failed to save changes");
      }
      router.push(`/seller/listings/${id}`);
    } catch (err: any) {
      setError(err.message || "Something went wrong. Try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF9F6]">
        <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF9F6]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <TopNav showBack backHref="/seller/listings" />

      {error && (
        <div className="mx-4 mt-4 bg-red-50 border border-red-200 rounded-2xl p-4 flex gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-red-700 text-sm font-medium">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="px-4 pt-6 pb-32 space-y-6 max-w-2xl mx-auto">

        {/* IMAGE */}
        <div className="space-y-3">
          <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-semibold">Photo</p>
          <h2 className="text-lg font-bold text-stone-900" style={SERIF}>
            Service Photo <span className="text-red-500">*</span>
          </h2>

          {imagePreview ? (
            <div className="relative w-full h-48 rounded-xl overflow-hidden border border-stone-200">
              <img src={imagePreview} alt="Listing" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={clearImage}
                className="absolute top-2 right-2 w-7 h-7 bg-red-500 text-white rounded-full flex items-center justify-center shadow"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <label className="border-2 border-dashed border-stone-300 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer hover:border-teal-400 hover:bg-teal-50/50 transition-all">
              <ImageIcon className="w-7 h-7 text-stone-400 mb-1" />
              <span className="text-sm text-stone-500 font-medium">Upload Photo</span>
              <span className="text-xs text-stone-400 mt-0.5">JPG, PNG accepted</span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="hidden"
              />
            </label>
          )}

          {/* Hidden input so clicking the preview area can also trigger file picker */}
          {imagePreview && (
            <>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-xs text-teal-600 font-semibold underline underline-offset-2"
              >
                Replace photo
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="hidden"
              />
            </>
          )}
        </div>

        {/* SERVICE NAME */}
        <div className="space-y-2">
          <label className="text-sm font-semibold text-stone-700">Service Name</label>
          <input
            type="text"
            value={title}
            onChange={e => { setTitle(e.target.value); setError(""); }}
            placeholder="e.g. Gel Manicure, Braiding..."
            required
            className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition placeholder:text-stone-400"
          />
        </div>

        {/* CATEGORY */}
        <div className="space-y-3">
          <label className="text-sm font-semibold text-stone-700">Category</label>
          {fetchingCategories ? (
            <p className="text-sm text-stone-400">Loading categories...</p>
          ) : categories.length === 0 ? (
            <p className="text-sm text-stone-400">No categories available</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {categories.map(cat => (
                <button
                  key={cat.slug}
                  type="button"
                  onClick={() => setCategory(cat.slug)}
                  className={`p-3 rounded-xl border-2 transition-all text-center text-sm font-medium ${
                    category === cat.slug
                      ? "border-teal-500 bg-teal-50 text-teal-700"
                      : "border-stone-200 bg-white text-stone-700 hover:border-stone-300"
                  }`}
                >
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
            <input
              type="number"
              value={price}
              onChange={e => { setPrice(e.target.value); setError(""); }}
              placeholder="5000"
              required
              className="w-full pl-8 pr-4 py-3 bg-white border border-stone-200 rounded-xl text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition"
            />
          </div>
        </div>

        {/* DESCRIPTION */}
        <div className="space-y-2">
          <label className="text-sm font-semibold text-stone-700">Description</label>
          <textarea
            value={description}
            onChange={e => { setDescription(e.target.value); setError(""); }}
            rows={5}
            placeholder="Describe what you offer, your experience, what's included..."
            className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition resize-none placeholder:text-stone-400"
          />
        </div>

        {/* SUBMIT */}
        <button
          type="submit"
          disabled={saving}
          className="w-full py-4 rounded-full text-white font-semibold text-base shadow-lg shadow-teal-200/60 disabled:opacity-60 flex items-center justify-center gap-2 transition active:scale-[0.98]"
          style={{ background: GRAD }}
        >
          <Save className="w-5 h-5" />
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </form>
    </div>
  );
}
