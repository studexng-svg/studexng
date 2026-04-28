// src/app/admin/login/page.tsx
"use client";

import { Shield, Mail, Lock, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { adminApi } from "@/lib/adminApi";

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const router = useRouter();

  // Prevent redirect loop on login page
  useEffect(() => {
    const isAdmin = localStorage.getItem("isAdmin") === "true";
    if (isAdmin && window.location.pathname !== "/admin/login") {
      router.replace("/admin");
    }
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      // Call real backend API
      const response = await adminApi.login({ email, password });

      // Save admin tokens and info
      localStorage.setItem("admin_access_token", response.tokens.access);
      localStorage.setItem("admin_refresh_token", response.tokens.refresh);
      localStorage.setItem("isAdmin", "true");
      localStorage.setItem("adminName", response.user.username);
      localStorage.setItem("adminEmail", response.user.email);

      // Redirect to admin dashboard
      router.push("/admin");
    } catch (error: any) {
      setError(error.message || "Login failed. Please try again.");
      setIsLoading(false);
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4"
      >

        {/* Background glow */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
        <div className="absolute top-0 left-0 w-96 h-96 bg-purple-800/20 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-teal-800/20 rounded-full blur-3xl" />

        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="relative z-10 w-full max-w-md"
        >
          
          {/* Top Links */}
          <div className="flex justify-between items-center mb-10">
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => router.push("/auth")}
              className="text-white/70 hover:text-white flex items-center gap-2 text-sm font-medium transition"
            >
              <ArrowLeft className="w-5 h-5" />
              User Login
            </motion.button>
            <Link href="/" className="text-white/60 hover:text-white text-sm transition">
              ← Back to StudEx
            </Link>
          </div>

          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="bg-white/5 backdrop-blur-2xl rounded-3xl shadow-2xl p-10 border border-white/10"
          >

            {/* Shield + Title */}
            <div className="text-center mb-10">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 200, damping: 15 }}
                className="w-24 h-24 mx-auto bg-gradient-to-br from-purple-600 to-teal-600 rounded-2xl flex items-center justify-center shadow-2xl mb-6"
              >
                <motion.div
                  animate={{ y: [0, -6, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Shield className="w-14 h-14 text-white" />
                </motion.div>
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-4xl font-black text-white tracking-tight"
              >
                Admin Portal
              </motion.h1>

              <p className="text-white/70 text-lg mt-2">StudEx Management</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-6">

              <motion.div
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.5 }}
              >
                <label className="text-white/90 text-sm font-semibold flex items-center gap-2 mb-3">
                  <Mail className="w-5 h-5" />
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@studex.com"
                  className="w-full px-5 py-4 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:ring-4 focus:ring-purple-500/50 transition"
                  required
                />
              </motion.div>

              <motion.div
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.5 }}
                className="relative"
              >
                <label className="text-white/90 text-sm font-semibold flex items-center gap-2 mb-3">
                  <Lock className="w-5 h-5" />
                  Password
                </label>
                <input
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full px-5 py-4 pr-14 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:ring-4 focus:ring-purple-500/50 transition"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-4 top-11 text-white/60 hover:text-white"
                >
                  {showPass ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </motion.div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-red-500/20 border border-red-500/40 text-red-200 px-4 py-3 rounded-xl text-center text-sm"
                >
                  {error}
                </motion.div>
              )}

              <motion.button
                whileTap={{ scale: 0.95 }}
                type="submit"
                disabled={isLoading}
                className="w-full py-5 rounded-xl font-black text-white text-lg shadow-xl transition-all hover:shadow-purple-500/25 disabled:opacity-70 disabled:cursor-not-allowed"
                style={{
                  background: "linear-gradient(to right, #7C3AED, #14B8A6)",
                }}
              >
                {isLoading ? "Accessing Panel..." : "Login as Admin"}
              </motion.button>
            </form>

            {/* Admin Signup Link */}
            <div className="mt-8 text-center">
              <p className="text-white/60 text-sm">
                Don't have admin access?{" "}
                <Link
                  href="/admin/signup"
                  className="text-purple-300 hover:text-purple-100 font-bold underline transition"
                >
                  Request Admin Account
                </Link>
              </p>
            </div>

            <p className="text-center text-white/40 text-xs mt-10">
              © 2025 StudEx • Admin Access Restricted
            </p>
          </motion.div>
        </motion.div>
      </motion.div>
    </>
  );
}
