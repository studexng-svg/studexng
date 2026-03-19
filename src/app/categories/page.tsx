// src/app/categories/page.tsx — OFFICIAL STUDEx 3.0 CATEGORIES PAGE (Database-Driven)
"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Sparkles, Zap, Package, Scissors, Shirt } from "lucide-react";
import { useEffect, useState } from "react";
import ThemeToggle from "@/components/ThemeToggle";

interface Category {
  id: number;
  title: string;
  slug: string; // for href: /category/slug
  image: string;
  icon: "sparkles" | "zap" | "package" | "scissors" | "shirt";
  color: string;
}

const iconMap = {
  sparkles: Sparkles,
  zap: Zap,
  package: Package,
  scissors: Scissors,
  shirt: Shirt,
};

export default function CategoriesPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
        const res = await fetch(`${API_URL}/api/services/categories/`, {
          headers: { "Content-Type": "application/json" },
        });

        if (!res.ok) {
          throw new Error(`Failed to fetch categories. Status: ${res.status}`);
        }

        const data = await res.json();
        console.log("Fetched categories:", data.results || data);

        setCategories(data.results || data || []);
      } catch (err: any) {
        console.error("Categories fetch error:", err);

        // Fallback hardcoded categories if API fails
        setCategories([
          {
            id: 1,
            title: "Lashes",
            slug: "lashes",
            image: "/images/lashes-1.jpg",
            icon: "sparkles",
            color: "from-purple-500 to-pink-500",
          },
          {
            id: 2,
            title: "Nails",
            slug: "nails",
            image: "/images/nails-1.jpg",
            icon: "zap",
            color: "from-teal-500 to-cyan-500",
          },
          {
            id: 3,
            title: "Laundry",
            slug: "laundry",
            image: "/images/laundry-1.jpg",
            icon: "shirt",
            color: "from-blue-500 to-indigo-500",
          },
          {
            id: 4,
            title: "Food",
            slug: "food",
            image: "/images/food-1.jpg",
            icon: "package",
            color: "from-orange-500 to-red-500",
          },
        ]);
      } finally {
        setLoading(false);
      }
    };

    fetchCategories();
  }, []);

  return (
    <>
      {/* HEADER */}
      <div className="sticky top-0 bg-white/95 dark:bg-gray-900/95 backdrop-blur-3xl z-50 border-b border-purple-100 dark:border-gray-800">
        <div className="flex items-center justify-between p-5">
          <button
            onClick={() => router.push("/home")}
            className="p-4 rounded-2xl bg-gradient-to-br from-purple-100 to-teal-100 dark:from-purple-900/30 dark:to-teal-900/30 hover:from-purple-200 hover:to-teal-200 dark:hover:from-purple-900/50 dark:hover:to-teal-900/50 active:scale-95 transition-all shadow-lg"
          >
            <ChevronLeft className="w-7 h-7 text-purple-700 dark:text-purple-400" />
          </button>

          <div className="text-center">
            <h1 className="text-3xl font-black bg-gradient-to-r from-purple-600 via-pink-600 to-teal-600 bg-clip-text text-transparent tracking-tight">
              Choose Your Vibe
            </h1>
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mt-1">
              Campus luxury, one tap away
            </p>
          </div>

          <ThemeToggle />
        </div>
      </div>

      {/* CATEGORIES GRID */}
      <div className="px-6 pt-8 pb-40 bg-[#FFF8F0] dark:bg-gray-950 min-h-screen">
        {/* HERO */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center mb-12"
        >
          <h2 className="text-5xl font-black leading-tight">
            <span className="bg-gradient-to-r from-purple-600 via-pink-500 to-teal-600 bg-clip-text text-transparent">
              What do you
            </span>
            <br />
            <span className="bg-gradient-to-r from-purple-600 to-teal-600 bg-clip-text text-transparent">
              need today?
            </span>
          </h2>
          <div className="flex justify-center gap-3 mt-6">
            <Sparkles className="w-10 h-10 text-purple-500 dark:text-purple-400 animate-pulse" />
            <Sparkles className="w-8 h-8 text-pink-500 dark:text-pink-400 animate-pulse delay-75" />
            <Sparkles className="w-10 h-10 text-teal-500 dark:text-teal-400 animate-pulse delay-150" />
          </div>
        </motion.div>

        {/* LOADING STATE */}
        {loading ? (
          <div className="grid grid-cols-2 gap-8">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="aspect-[4/5] bg-gray-200 dark:bg-gray-700 rounded-3xl animate-pulse" />
            ))}
          </div>
        ) : categories.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-xl text-gray-500 dark:text-gray-400">No categories yet. Coming soon!</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-8">
            {categories.map((cat, i) => {
              const Icon = iconMap[cat.icon] || Package;
              return (
                <motion.div
                  key={cat.id}
                  initial={{ opacity: 0, scale: 0.8, y: 50 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ delay: i * 0.15, type: "spring", stiffness: 120 }}
                >
                  <Link href={`/category/${cat.slug}`}>
                    <motion.div
                      whileHover={{ y: -16, scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="group relative overflow-hidden rounded-3xl shadow-2xl border-2 border-white/20 dark:border-gray-700/20"
                    >
                      <div
                        className={`absolute inset-0 bg-gradient-to-br ${cat.color} opacity-0 group-hover:opacity-90 transition-all duration-700`}
                      />
                      <div className="absolute inset-0 blur-3xl opacity-0 group-hover:opacity-60 transition-opacity duration-1000">
                        <div className={`absolute inset-0 bg-gradient-to-br ${cat.color}`} />
                      </div>

                      <div className="relative aspect-[4/5] overflow-hidden">
                        <Image
                          src={cat.image}
                          alt={cat.title}
                          fill
                          sizes="(max-width: 768px) 50vw, 25vw"
                          className="object-cover group-hover:scale-125 transition-transform duration-1000"
                          priority={i < 2}
                        />
                        <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-all duration-700" />
                      </div>

                      <div className="absolute inset-0 flex flex-col justify-end p-8">
                        <div className="text-white">
                          <Icon className="w-12 h-12 mb-3 drop-shadow-2xl" />
                          <h3 className="text-4xl font-black drop-shadow-2xl tracking-tight">{cat.title}</h3>
                        </div>

                        <motion.div
                          initial={{ width: 0 }}
                          whileHover={{ width: "70%" }}
                          transition={{ duration: 0.6 }}
                          className={`h-2 mt-4 rounded-full bg-gradient-to-r ${cat.color} shadow-2xl`}
                        />
                      </div>

                      <motion.div
                        initial={{ y: 20, opacity: 0 }}
                        whileHover={{ y: 0, opacity: 1 }}
                        className="absolute top-6 right-6"
                      >
                        <div className="px-4 py-2 bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl">
                          <span className={`font-black text-sm bg-gradient-to-r ${cat.color} bg-clip-text text-transparent`}>
                            LIVE
                          </span>
                        </div>
                      </motion.div>
                    </motion.div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* FINAL CTA */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }} className="text-center mt-16">
          <p className="text-lg font-medium text-gray-600 dark:text-gray-400">Everything you need. Nothing you don't.</p>
          <p className="text-3xl font-black bg-gradient-to-r from-purple-600 to-teal-600 bg-clip-text text-transparent mt-3">Just StudEx.</p>
        </motion.div>
      </div>
    </>
  );
}