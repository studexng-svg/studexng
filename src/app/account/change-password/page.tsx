// src/app/account/change-password/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Lock, ChevronLeft, Save, Eye, EyeOff, CheckCircle, XCircle } from "lucide-react";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [passwords, setPasswords] = useState({
    oldPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [show, setShow] = useState({
    old: false,
    new: false,
    confirm: false,
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const toggleShow = (key: "old" | "new" | "confirm") => {
    setShow(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setPasswords(prev => ({ ...prev, [name]: value }));
    setError("");
  };

  const validatePassword = (pwd: string) => {
    const minLength = pwd.length >= 8;
    const hasNumber = /\d/.test(pwd);
    const hasSpecial = /[!@#$%^&*]/.test(pwd);
    return { minLength, hasNumber, hasSpecial, isValid: minLength && hasNumber && hasSpecial };
  };

  const handleSave = async () => {
    setError("");

    if (!passwords.oldPassword || !passwords.newPassword || !passwords.confirmPassword) {
      setError("All fields are required");
      return;
    }

    if (passwords.newPassword !== passwords.confirmPassword) {
      setError("New passwords do not match");
      return;
    }

    const { isValid } = validatePassword(passwords.newPassword);
    if (!isValid) {
      setError("Password must be 8+ chars with number & symbol");
      return;
    }

    try {
      const token = localStorage.getItem("accessToken");

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/auth/change-password/`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            old_password: passwords.oldPassword,
            new_password: passwords.newPassword,
          }),
        }
      );

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Password change failed");
      }

      setSuccess(true);

      setTimeout(() => {
        router.push("/account/profile");
      }, 1500);
    } catch (err: any) {
      setError(err.message || "Failed to update password");
    }
  };

  const { minLength, hasNumber, hasSpecial } = validatePassword(passwords.newPassword);

  return (
    <div className="min-h-screen bg-[#FAFAF9]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      {/* HEADER */}
      <div className="sticky top-0 bg-white/80 backdrop-blur-md z-40 border-b border-stone-100 shadow-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={() => router.back()}
            className="p-2.5 bg-white border border-stone-200 rounded-full shadow-sm active:scale-95 transition-all"
          >
            <ChevronLeft className="w-5 h-5 text-stone-600" />
          </button>
          <h1 className="text-base font-bold text-stone-900" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
            Change Password
          </h1>
          <div className="w-10" />
        </div>
      </div>

      <div className="px-4 pt-6 pb-32">
        <div className="max-w-md mx-auto space-y-8">
          {/* SUCCESS MESSAGE */}
          {success && (
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-5 text-center"
            >
              <CheckCircle className="w-12 h-12 text-emerald-600 mx-auto mb-3" />
              <p className="font-semibold text-emerald-800">Password Changed!</p>
              <p className="text-sm text-emerald-700">Redirecting to profile...</p>
            </motion.div>
          )}

          {/* FORM */}
          {!success && (
            <>
              <div className="text-center">
                <div className="w-20 h-20 mx-auto bg-teal-50 rounded-full flex items-center justify-center shadow-sm border border-teal-100 mb-4">
                  <Lock className="w-10 h-10 text-teal-600" />
                </div>
                <h2 className="text-2xl font-bold text-stone-900">Secure Your Account</h2>
                <p className="text-sm text-stone-500 mt-2">Use a strong password to protect your account</p>
              </div>

              <div className="bg-white rounded-2xl p-6 shadow-sm border border-stone-200 space-y-6">
                {[
                  { label: "Current Password", name: "oldPassword", key: "old" },
                  { label: "New Password", name: "newPassword", key: "new" },
                  { label: "Confirm New Password", name: "confirmPassword", key: "confirm" },
                ].map(({ label, name, key }) => (
                  <div key={name}>
                    <label className="text-sm font-semibold text-stone-700">{label}</label>
                    <div className="relative mt-2">
                      <input
                        type={show[key as keyof typeof show] ? "text" : "password"}
                        name={name}
                        value={passwords[name as keyof typeof passwords]}
                        onChange={handleChange}
                        className="w-full px-4 py-3 rounded-xl border-2 pr-12 transition-all focus:outline-none"
                        style={{
                          borderColor: passwords[name as keyof typeof passwords]
                            ? (name === "newPassword" && validatePassword(passwords.newPassword).isValid ? "#10B981" : "#0D9488")
                            : "#e2e8f0",
                        }}
                        placeholder={`Enter ${label.toLowerCase()}`}
                      />
                      <button
                        type="button"
                        onClick={() => toggleShow(key as "old" | "new" | "confirm")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-teal-600 transition"
                      >
                        {show[key as keyof typeof show] ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>
                ))}

                {/* PASSWORD STRENGTH */}
                {passwords.newPassword && (
                  <div className="space-y-2 text-sm">
                    <p className="font-semibold text-stone-700">Password must include:</p>
                    <div className="flex items-center gap-2">
                      {minLength ? <CheckCircle className="w-4 h-4 text-emerald-600" /> : <XCircle className="w-4 h-4 text-stone-300" />}
                      <span className={minLength ? "text-emerald-600" : "text-stone-400"}>8+ characters</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {hasNumber ? <CheckCircle className="w-4 h-4 text-emerald-600" /> : <XCircle className="w-4 h-4 text-stone-300" />}
                      <span className={hasNumber ? "text-emerald-600" : "text-stone-400"}>1 number</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {hasSpecial ? <CheckCircle className="w-4 h-4 text-emerald-600" /> : <XCircle className="w-4 h-4 text-stone-300" />}
                      <span className={hasSpecial ? "text-emerald-600" : "text-stone-400"}>1 symbol (!@#$%)</span>
                    </div>
                  </div>
                )}

                {/* ERROR */}
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm font-medium flex items-center gap-2"
                  >
                    <XCircle className="w-5 h-5" />
                    {error}
                  </motion.div>
                )}
              </div>

              {/* SAVE BUTTON */}
              <button
                onClick={handleSave}
                disabled={!passwords.oldPassword || !passwords.newPassword || !passwords.confirmPassword}
                className="w-full py-4 text-white rounded-full font-semibold text-base shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition active:scale-[0.98]"
                style={{ background: "linear-gradient(135deg, #0D9488 0%, #7C3AED 100%)" }}
              >
                <Save className="w-5 h-5" />
                Update Password
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
