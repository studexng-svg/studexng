"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, Eye, EyeOff, CheckCircle, AlertCircle, ChevronLeft } from "lucide-react";
import { GRAD, SERIF } from "@/lib/tokens";

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

  useEffect(() => {
    if (!uid || !token) {
      setError("Invalid or expired reset link. Please request a new one.");
    }
  }, [uid, token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!password || !password2) { setError("Please fill in both fields"); return; }
    if (password !== password2) { setError("Passwords do not match"); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
    if (!uid || !token) { setError("Invalid reset link"); return; }

    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/reset-password/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, token, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || data.error || "Failed to reset password");
      setSuccess(true);
      setTimeout(() => router.push("/auth"), 3000);
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAF9]" style={{ fontFamily: "'DM Sans', sans-serif" }}>

      {/* HEADER */}
      <div className="sticky top-0 bg-white/80 backdrop-blur-md z-40 border-b border-stone-100 shadow-sm">
        <div className="flex items-center justify-between px-4 py-3 max-w-2xl mx-auto">
          <button
            onClick={() => router.push("/auth")}
            className="p-2.5 bg-white border border-stone-200 rounded-full shadow-sm active:scale-95 transition-all"
          >
            <ChevronLeft className="w-5 h-5 text-stone-600" />
          </button>
          <h1 className="text-base font-bold text-stone-900" style={SERIF}>
            Reset Password
          </h1>
          <div className="w-10" />
        </div>
      </div>

      <div className="flex justify-center px-4 pt-10 pb-28">
        <div className="w-full max-w-md">

          {/* SUCCESS STATE */}
          {success ? (
            <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-8 text-center space-y-5">
              <div className="w-20 h-20 mx-auto bg-teal-50 rounded-full flex items-center justify-center border border-teal-100">
                <CheckCircle className="w-10 h-10 text-teal-600" />
              </div>
              <div>
                <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-semibold">Done!</p>
                <h2 className="text-2xl font-bold text-stone-900 mt-0.5" style={SERIF}>Password Updated</h2>
                <p className="text-sm text-stone-500 mt-2">Your password has been updated. Redirecting to login...</p>
              </div>
              <button
                onClick={() => router.push("/auth")}
                className="w-full py-4 rounded-full text-white font-semibold text-base shadow-lg transition active:scale-[0.98]"
                style={{ background: GRAD }}
              >
                Go to Login →
              </button>
            </div>
          ) : (
            <div className="space-y-6">

              {/* HEADING */}
              <div>
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: GRAD }}>
                  <Lock className="w-7 h-7 text-white" />
                </div>
                <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-semibold">Secure your account</p>
                <h2 className="text-2xl font-bold text-stone-900 mt-0.5" style={SERIF}>Set New Password</h2>
                <p className="text-sm text-stone-500 mt-1">Choose a strong password to protect your account.</p>
              </div>

              {/* INVALID LINK */}
              {(!uid || !token) ? (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-red-700 text-sm font-semibold">Invalid or expired link</p>
                    <p className="text-red-600 text-xs mt-0.5">Please go back and request a new password reset.</p>
                    <button
                      type="button"
                      onClick={() => router.push("/auth")}
                      className="mt-3 text-teal-600 font-semibold text-sm underline underline-offset-2"
                    >
                      Back to Login
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 space-y-5">

                  {/* New Password */}
                  <div>
                    <label className="text-sm font-semibold text-stone-700">New Password</label>
                    <div className="relative mt-2">
                      <input
                        type={showPass ? "text" : "password"}
                        value={password}
                        onChange={e => { setPassword(e.target.value); setError(""); }}
                        placeholder="At least 8 characters"
                        required
                        disabled={isLoading}
                        className="w-full px-4 py-3 pr-12 rounded-xl border border-stone-200 bg-white text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 placeholder:text-stone-400 transition"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPass(!showPass)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-teal-600 transition"
                      >
                        {showPass ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>

                  {/* Confirm Password */}
                  <div>
                    <label className="text-sm font-semibold text-stone-700">Confirm New Password</label>
                    <div className="relative mt-2">
                      <input
                        type={showPass2 ? "text" : "password"}
                        value={password2}
                        onChange={e => { setPassword2(e.target.value); setError(""); }}
                        placeholder="Confirm your password"
                        required
                        disabled={isLoading}
                        className="w-full px-4 py-3 pr-12 rounded-xl border border-stone-200 bg-white text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 placeholder:text-stone-400 transition"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPass2(!showPass2)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-teal-600 transition"
                      >
                        {showPass2 ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                    {password2 && (
                      <p className={`text-xs font-medium mt-1.5 ${password === password2 ? "text-teal-600" : "text-red-500"}`}>
                        {password === password2 ? "✓ Passwords match" : "✗ Passwords do not match"}
                      </p>
                    )}
                  </div>

                  {/* Error */}
                  {error && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                      <p className="text-red-700 text-sm">{error}</p>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-4 rounded-full text-white font-semibold text-base shadow-lg disabled:opacity-50 transition active:scale-[0.98]"
                    style={{ background: GRAD }}
                  >
                    {isLoading ? "Resetting..." : "Reset Password"}
                  </button>

                  <button
                    type="button"
                    onClick={() => router.push("/auth")}
                    className="w-full text-center text-teal-600 font-medium text-sm"
                  >
                    Back to Login
                  </button>
                </form>
              )}
            </div>
          )}

          <p className="text-center text-xs text-stone-400 mt-8">© 2026 StudEx · Campus Marketplace</p>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#FAFAF9] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  );
}
