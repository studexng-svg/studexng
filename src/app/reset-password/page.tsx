"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Lock, Eye, EyeOff, Store, CheckCircle } from "lucide-react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const uid = searchParams.get("uid");
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [showPass2, setShowPass2] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Validate link has required params
  useEffect(() => {
    if (!uid || !token) {
      setError("Invalid or expired reset link. Please request a new one.");
    }
  }, [uid, token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!password || !password2) {
      setError("Please fill in both fields");
      return;
    }

    if (password !== password2) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    if (!uid || !token) {
        setError("Invalid reset link");
        return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/reset-password/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, token, password}),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail ||
          data.error ||
          "Failed to reset password"
        );
      }

      setSuccess(true);
      setTimeout(() => router.push("/auth"), 3000);
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFF8F0] dark:bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl rounded-3xl shadow-2xl p-8 border border-white/30 dark:border-gray-700/30">

          {/* Logo */}
          <div className="text-center mb-8">
            <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-teal-500 to-purple-600 rounded-full flex items-center justify-center shadow-xl">
              <Store className="w-12 h-12 text-white" />
            </div>
            <h1 className="text-3xl font-black bg-gradient-to-r from-teal-600 to-purple-600 bg-clip-text text-transparent">
              {success ? "Password Reset!" : "Set New Password"}
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 font-medium">
              {success ? "Redirecting you to login..." : "Choose a strong new password"}
            </p>
          </div>

          {success ? (
            /* SUCCESS STATE */
            <div className="text-center space-y-6">
              <div className="w-24 h-24 mx-auto bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center">
                <CheckCircle className="w-14 h-14 text-emerald-600 dark:text-emerald-400" />
              </div>
              <p className="text-gray-700 dark:text-gray-300 font-medium">
                Your password has been updated successfully. You can now log in with your new password.
              </p>
              <button
                onClick={() => router.push("/auth")}
                className="w-full py-5 rounded-2xl font-black text-white text-lg shadow-xl bg-gradient-to-r from-teal-500 to-purple-600 hover:from-teal-600 hover:to-purple-700 transition-all"
              >
                Go to Login →
              </button>
            </div>
          ) : (
            /* FORM STATE */
            <form onSubmit={handleSubmit} className="space-y-5">

              {/* Invalid link error */}
              {!uid || !token ? (
                <div className="text-center p-4 bg-red-50 dark:bg-red-900/20 rounded-2xl border border-red-200 dark:border-red-700">
                  <p className="text-red-600 dark:text-red-400 font-medium text-sm">
                    This reset link is invalid or has expired. Please go back and request a new one.
                  </p>
                  <button
                    type="button"
                    onClick={() => router.push("/auth")}
                    className="mt-4 text-purple-600 dark:text-purple-400 font-bold underline"
                  >
                    Back to Login
                  </button>
                </div>
              ) : (
                <>
                  {/* New Password */}
                  <div className="relative">
                    <label className="block text-sm font-medium mb-2 text-purple-700 dark:text-purple-400">
                      <Lock className="w-4 h-4 inline mr-1" /> New Password
                    </label>
                    <input
                      type={showPass ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter new password"
                      className="w-full p-4 pr-14 rounded-2xl border-2 focus:outline-none transition-all bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400"
                      style={{ borderColor: password ? "#7C3AED" : "#e2e8f0" }}
                      required
                      disabled={isLoading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(!showPass)}
                      className="absolute right-4 top-11 text-gray-500 dark:text-gray-400 hover:text-purple-600 transition"
                    >
                      {showPass ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>

                  {/* Confirm Password */}
                  <div className="relative">
                    <label className="block text-sm font-medium mb-2 text-purple-700 dark:text-purple-400">
                      <Lock className="w-4 h-4 inline mr-1" /> Confirm New Password
                    </label>
                    <input
                      type={showPass2 ? "text" : "password"}
                      value={password2}
                      onChange={(e) => setPassword2(e.target.value)}
                      placeholder="Confirm new password"
                      className="w-full p-4 pr-14 rounded-2xl border-2 focus:outline-none transition-all bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400"
                      style={{ borderColor: password2 ? (password2 === password ? "#10b981" : "#ef4444") : "#e2e8f0" }}
                      required
                      disabled={isLoading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass2(!showPass2)}
                      className="absolute right-4 top-11 text-gray-500 dark:text-gray-400 hover:text-purple-600 transition"
                    >
                      {showPass2 ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>

                  {/* Password match indicator */}
                  {password2 && (
                    <p className={`text-sm font-medium -mt-2 ${password === password2 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>
                      {password === password2 ? "✓ Passwords match" : "✗ Passwords do not match"}
                    </p>
                  )}

                  {error && (
                    <p className="text-sm text-red-600 dark:text-red-400 text-center">{error}</p>
                  )}

                  <motion.button
                    whileHover={{ scale: isLoading ? 1 : 1.02 }}
                    whileTap={{ scale: isLoading ? 1 : 0.98 }}
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-5 rounded-2xl font-black text-white text-lg shadow-xl bg-gradient-to-r from-teal-500 to-purple-600 hover:from-teal-600 hover:to-purple-700 transition-all disabled:opacity-50"
                  >
                    {isLoading ? "Resetting..." : "Reset Password"}
                  </motion.button>

                  <button
                    type="button"
                    onClick={() => router.push("/auth")}
                    className="w-full text-center text-purple-600 dark:text-purple-400 font-medium underline"
                  >
                    Back to Login
                  </button>
                </>
              )}
            </form>
          )}

          <p className="text-center text-xs text-gray-500 dark:text-gray-400 mt-8">© 2025 StudEx • Pan-Atlantic University Only</p>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#FFF8F0] dark:bg-gray-950 flex items-center justify-center">
        <div className="w-20 h-20 border-4 border-transparent bg-gradient-to-r from-teal-500 to-purple-600 rounded-full animate-spin"></div>
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  );
}
