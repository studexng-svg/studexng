// src/app/account/delete-account/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/authStore";
import { AlertTriangle, Eye, EyeOff, Trash2, XCircle, CheckCircle } from "lucide-react";
import TopNav from "@/components/layout/TopNav";

const CONFIRM_PHRASE = "DELETE";

export default function DeleteAccountPage() {
  const router = useRouter();
  const { logout } = useAuth();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const canSubmit = password.length > 0 && confirmText.trim().toUpperCase() === CONFIRM_PHRASE && !submitting;

  const handleDelete = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await api.auth.deleteAccount(password);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Could not delete your account.");
      }
      setDone(true);
      setTimeout(() => {
        logout();
        router.push("/");
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete your account.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F5F5]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <TopNav showBack />

      <div className="px-4 pt-6 pb-32">
        <div className="max-w-md mx-auto space-y-6">
          {done ? (
            <div className="bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-5 text-center animate-fadeUp">
              <CheckCircle className="w-12 h-12 text-emerald-600 mx-auto mb-3" />
              <p className="font-semibold text-emerald-800">Account Deleted</p>
              <p className="text-sm text-emerald-700">Sorry to see you go. Redirecting…</p>
            </div>
          ) : (
            <>
              <div className="text-center">
                <div className="w-20 h-20 mx-auto bg-red-50 rounded-full flex items-center justify-center shadow-sm border border-red-100 mb-4">
                  <Trash2 className="w-10 h-10 text-red-600" />
                </div>
                <h2 className="text-2xl font-bold text-stone-900">Delete Your Account</h2>
                <p className="text-sm text-stone-500 mt-2">This can&apos;t be undone. Read the details below.</p>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  <p className="text-sm font-semibold text-amber-900">What happens when you delete your account</p>
                </div>
                <ul className="text-xs text-amber-800 space-y-1.5 list-disc pl-5">
                  <li>Your profile, contact details, and personal info are permanently erased.</li>
                  <li>You&apos;re signed out everywhere immediately and can&apos;t log back in.</li>
                  <li>Any listings you sell disappear from the marketplace right away.</li>
                  <li>Order and payment records are kept in anonymized form — required for accounting and dispute records, never shown as yours again.</li>
                </ul>
              </div>

              <div className="bg-white rounded-2xl p-4 border border-stone-200">
                <p className="text-sm text-stone-600">
                  You&apos;ll need to finish or cancel any order in progress, and withdraw your wallet balance to
                  ₦0, before you can delete your account.
                </p>
              </div>

              <div className="bg-white rounded-2xl p-6 shadow-sm border border-stone-200 space-y-5">
                <div>
                  <label className="text-sm font-semibold text-stone-700">Confirm your password</label>
                  <div className="relative mt-2">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={e => { setPassword(e.target.value); setError(""); }}
                      className="w-full px-4 py-3 rounded-xl border-2 border-stone-200 pr-12 focus:outline-none focus:border-red-400 transition-all"
                      placeholder="Enter your password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(s => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-red-600 transition"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-semibold text-stone-700">
                    Type <span className="font-mono bg-stone-100 px-1.5 py-0.5 rounded text-red-600">DELETE</span> to confirm
                  </label>
                  <input
                    type="text"
                    value={confirmText}
                    onChange={e => { setConfirmText(e.target.value); setError(""); }}
                    className="w-full mt-2 px-4 py-3 rounded-xl border-2 border-stone-200 focus:outline-none focus:border-red-400 transition-all"
                    placeholder="DELETE"
                  />
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm font-medium flex items-center gap-2 animate-fadeUp">
                    <XCircle className="w-5 h-5 flex-shrink-0" />
                    {error}
                  </div>
                )}
              </div>

              <button
                onClick={handleDelete}
                disabled={!canSubmit}
                className="w-full py-4 bg-red-600 text-white rounded-full font-semibold text-base shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition active:scale-[0.98] hover:bg-red-700"
              >
                <Trash2 className="w-5 h-5" />
                {submitting ? "Deleting…" : "Permanently Delete My Account"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
