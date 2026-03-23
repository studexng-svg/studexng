// src/app/seller/add/page.tsx
"use client";

import { Plus, X, AlertCircle, ChevronLeft, Image as ImageIcon } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import Image from "next/image";

interface Category {
  id: number;
  title: string;
  slug: string;
}

export default function AddService() {
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
    const fetchCategories = async () => {
      try {
        const res = await fetch("http://127.0.0.1:8000/api/categories/");
        if (!res.ok) throw new Error("Failed to load categories");
        const data = await res.json();
        const categoryList = Array.isArray(data) ? data : data.results || [];
        setCategories(categoryList);
      } catch (err) {
        setError("Failed to load categories. Try again.");
      } finally {
        setFetchingCategories(false);
      }
    };

    fetchCategories();
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
    setForm({
      ...form,
      images: form.images.filter((_, i) => i !== index),
    });
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
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError("");

    const formData = new FormData();
    formData.append("title", form.title);
    formData.append("description", form.description);
    formData.append("price", form.price);
    formData.append("category", form.category);
    formData.append("is_available", "true");

    // Send first image as main image (backend currently supports one)
    // When we upgrade Listing model to multiple images, we'll send all
    formData.append("image", form.images[0]);

    try {
      const res = await fetch("http://127.0.0.1:8000/api/listings/", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
        },
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

  const fadeInUp = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.4 },
  };

  return (
    <>
      {/* TOP BAR */}
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="sticky top-0 bg-white/95 backdrop-blur-xl z-40 border-b border-gray-100 shadow-sm"
      >
        <div className="flex items-center gap-4 p-4 max-w-6xl mx-auto">
          <Link href="/seller">
            <button className="p-2 hover:bg-gray-100 rounded-full transition-transform hover:scale-110 active:scale-90">
              <ChevronLeft className="w-6 h-6 text-gray-700" />
            </button>
          </Link>
          <div>
            <h1 className="text-2xl font-black bg-gradient-to-r from-purple-600 to-teal-500 bg-clip-text text-transparent">
              Add New Service
            </h1>
            <p className="text-xs text-gray-600 mt-0.5">Share what you offer to campus</p>
          </div>
        </div>
      </motion.div>

      {/* ERROR BANNER */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-4 mt-4 bg-red-50 border border-red-300 rounded-xl p-4 flex gap-3"
        >
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-red-800 text-sm">Error:</p>
            <p className="text-xs text-red-700 mt-1">{error}</p>
          </div>
        </motion.div>
      )}

      {/* SUPPRESS HYDRATION WARNING FOR FORM (fixes browser extension issue) */}
      <div suppressHydrationWarning>
        <form onSubmit={handleSubmit} className="p-4 pb-32 space-y-6 max-w-3xl mx-auto">
          {/* PHOTO SECTION — Up to 4 photos */}
          <motion.div {...fadeInUp} className="space-y-3">
            <h2 className="text-lg font-bold text-gray-800">Service Photos (up to 4)</h2>
            <p className="text-sm text-gray-600">Show your best work — first photo is main</p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {previews.map((src, index) => (
                <motion.div
                  key={index}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="relative group rounded-lg overflow-hidden"
                >
                  <img src={src} alt={`Preview ${index + 1}`} className="w-full h-32 object-cover" />
                  <button
                    type="button"
                    onClick={() => removeImage(index)}
                    className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-transform hover:scale-110 active:scale-90"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </motion.div>
              ))}

              {form.images.length < 4 && (
                <label className="border-2 border-dashed border-purple-300 rounded-lg h-32 flex flex-col items-center justify-center cursor-pointer hover:border-purple-500 hover:bg-purple-50 transition-all">
                  <ImageIcon className="w-8 h-8 text-purple-500 mb-1" />
                  <span className="text-xs text-purple-600 font-semibold">Add Photo</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleImages}
                    className="hidden"
                  />
                </label>
              )}
            </div>
          </motion.div>

          {/* SERVICE NAME */}
          <motion.div {...fadeInUp} className="space-y-2">
            <label className="text-sm font-bold text-gray-800">Service Name</label>
            <input
              type="text"
              name="title"
              value={form.title}
              onChange={handleChange}
              placeholder="Hair braiding, Laundry service, Tutoring..."
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition bg-white"
              required
            />
          </motion.div>

          {/* CATEGORY */}
          <motion.div {...fadeInUp} className="space-y-3">
            <label className="text-sm font-bold text-gray-800">Category</label>
            {fetchingCategories ? (
              <p className="text-sm text-gray-500">Loading categories...</p>
            ) : categories.length === 0 ? (
              <p className="text-sm text-gray-500">No categories available</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {categories.map((cat) => (
                  <button
                    key={cat.slug}
                    type="button"
                    onClick={() => setForm({ ...form, category: cat.slug })}
                    className={`p-3 rounded-lg border-2 transition-all text-center relative overflow-hidden ${
                      form.category === cat.slug
                        ? "border-purple-500 text-white"
                        : "border-gray-200 bg-white hover:border-gray-300 text-gray-800"
                    }`}
                  >
                    {form.category === cat.slug && (
                      <motion.div
                        layoutId="categoryFill"
                        className="absolute inset-0 bg-gradient-to-br from-purple-600 via-purple-500 to-teal-500 -z-10"
                      />
                    )}
                    <div className="text-xl mb-1 relative z-10">✨</div>
                    <div className="text-xs font-semibold relative z-10">{cat.title}</div>
                  </button>
                ))}
              </div>
            )}
          </motion.div>

          {/* PRICE */}
          <motion.div {...fadeInUp} className="space-y-2">
            <label className="text-sm font-bold text-gray-800">Price (₦)</label>
            <div className="relative">
              <span className="absolute left-3 top-3 text-lg font-bold text-gray-700">₦</span>
              <input
                type="number"
                name="price"
                value={form.price}
                onChange={handleChange}
                placeholder="5000"
                className="w-full pl-8 pr-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition bg-white"
                required
              />
            </div>
          </motion.div>

          {/* DESCRIPTION */}
          <motion.div {...fadeInUp} className="space-y-2">
            <label className="text-sm font-bold text-gray-800">Description</label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              placeholder="Describe what you offer, your experience, what's included, and what clients should expect..."
              rows={5}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition resize-none bg-white"
              required
            />
            <p className="text-xs text-gray-600">Be detailed - it helps attract better clients!</p>
          </motion.div>

          {/* SUBMIT BUTTON */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex gap-3 pt-4"
          >
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-4 rounded-lg bg-gradient-to-r from-purple-600 to-teal-500 text-white font-bold shadow-lg hover:shadow-xl disabled:opacity-70 flex items-center justify-center gap-2 transition-transform hover:scale-105 active:scale-95"
            >
              <Plus className="w-5 h-5" />
              {loading ? "Publishing..." : "Publish Service"}
            </button>
          </motion.div>
        </form>
      </div>
    </>
  );
}