// src/app/login/page.tsx
"use client";

import { motion } from "framer-motion";
import { Mail, Lock, Eye, EyeOff, Store, ArrowLeft } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/authStore";

export default function UserLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);

  const { login } = useAuth();
  const router = useRouter();

const handleLogin = async (e: React.FormEvent) => {
  e.preventDefault();
  setError("");

  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/auth/login/`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      }
    );

    if (!res.ok) throw new Error("Invalid credentials");

    const data = await res.json();

    login(data.user, data.access, data.refresh);

    router.push("/home");
  } catch (err: any) {
    setError(err.message);
  }
};

const handleResetPassword = async (e: React.FormEvent) => {
  e.preventDefault();
  setError("");

  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/auth/password-reset/`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resetEmail }),
      }
    );

    if (!res.ok) throw new Error("Failed to send reset email");

    setResetSent(true);
  } catch (err: any) {
    setError(err.message || "Reset failed");
  }
};

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-teal-50 flex items-center justify-center p-4">
      
      {/* Back Button */}
      <button
        onClick={() => router.back()}
        className="absolute top-6 left-6 z-50 text-purple-600 hover:bg-purple-50 p-3 rounded-full transition-all shadow-lg bg-white/80 backdrop-blur"
      >
        <ArrowLeft className="w-7 h-7" />
      </button>

      {/* LOGIN PAGE WITH FADE IN */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.5, ease: "easeInOut" }}
        className="w-full max-w-md"
      >
        <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl p-8 border border-white/30">

          {/* Logo & Title */}
          <div className="text-center mb-8">
            <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-purple-600 to-teal-500 rounded-2xl flex items-center justify-center shadow-lg">
              <Store className="w-12 h-12 text-white" />
            </div>
            <h1 className="text-3xl font-black bg-gradient-to-r from-purple-600 to-teal-500 bg-clip-text text-transparent">
              {isForgotPassword ? "Reset Password" : "Welcome Back"}
            </h1>
            <p className="text-sm text-gray-600 mt-2">
              {isForgotPassword ? "We'll send you a reset link" : "Login to your StudEx account"}
            </p>
          </div>

          {/* Forgot Password Form */}
          {isForgotPassword ? (
            <form onSubmit={handleResetPassword} className="space-y-6">
              {resetSent ? (
                <div className="text-center py-8">
                  <div className="w-20 h-20 mx-auto mb-4 bg-emerald-100 rounded-full flex items-center justify-center">
                    <Mail className="w-10 h-10 text-emerald-600" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-800">Check your email!</h3>
                  <p className="text-sm text-gray-600 mt-2">We sent a password reset link to</p>
                  <p className="font-bold text-purple-600 mt-1">{resetEmail}</p>
                  <button
                    onClick={() => {
                      setIsForgotPassword(false);
                      setResetSent(false);
                      setResetEmail("");
                    }}
                    className="mt-6 text-purple-600 font-medium underline"
                  >
                    Back to Login
                  </button>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-2 text-purple-700">
                      <Mail className="w-4 h-4 inline mr-1" /> Student Email
                    </label>
                    <input
                      type="email"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      placeholder="you@pau.edu.ng"
                      className="w-full p-4 rounded-2xl border-2 focus:outline-none transition-all"
                      style={{ borderColor: resetEmail ? "#7C3AED" : "#e2e8f0" }}
                      required
                    />
                  </div>

                  {error && <p className="text-sm text-red-600 text-center -mt-2">{error}</p>}

                  <button
                    type="submit"
                    className="w-full py-5 rounded-2xl font-black text-white text-lg shadow-xl bg-gradient-to-r from-purple-600 to-teal-500 hover:from-purple-700 hover:to-teal-600 transition-all"
                  >
                    Send Reset Link
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsForgotPassword(false);
                      setError("");
                    }}
                    className="w-full text-center text-purple-600 font-medium underline mt-4"
                  >
                    Back to Login
                  </button>
                </>
              )}
            </form>
          ) : (
            /* Normal Login Form */
            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="block text-sm font-medium mb-2 text-purple-700">
                  <Mail className="w-4 h-4 inline mr-1" /> Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@pau.edu.ng"
                  className="w-full p-4 rounded-2xl border-2 focus:outline-none transition-all"
                  style={{ borderColor: email ? "#7C3AED" : "#e2e8f0" }}
                  required
                />
              </div>

              <div className="relative">
                <label className="block text-sm font-medium mb-2 text-purple-700">
                  <Lock className="w-4 h-4 inline mr-1" /> Password
                </label>
                <input
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full p-4 pr-14 rounded-2xl border-2 focus:outline-none transition-all"
                  style={{ borderColor: password ? "#7C3AED" : "#e2e8f0" }}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-4 top-11 text-gray-500 hover:text-purple-600 transition"
                >
                  {showPass ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>

              <div className="flex justify-between items-center">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="rounded text-purple-600" />
                  <span className="text-gray-700">Remember me</span>
                </label>
                <button
                  type="button"
                  onClick={() => setIsForgotPassword(true)}
                  className="text-sm text-purple-600 font-medium hover:underline"
                >
                  Forgot password?
                </button>
              </div>

              {error && <p className="text-sm text-red-600 text-center -mt-2">{error}</p>}

              <button
                type="submit"
                className="w-full py-5 rounded-2xl font-black text-white text-lg shadow-xl bg-gradient-to-r from-purple-600 to-teal-500 hover:from-purple-700 hover:to-teal-600 transition-all"
              >
                Login to StudEx
              </button>
            </form>
          )}

          {/* Navigate to Signup */}
          {!isForgotPassword && (
            <p className="text-center text-sm text-gray-600 mt-8">
              New to StudEx?{" "}
              <button
                type="button"
                onClick={() => router.push("/signup")}
                className="font-bold text-purple-600 underline hover:text-purple-700 transition"
              >
                Create account
              </button>
            </p>
          )}

          <p className="text-center text-xs text-gray-500 mt-8">© 2025 StudEx • Pan-Atlantic University Only</p>
        </div>
      </motion.div>
    </div>
  );
}