// src/app/account/change-password/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Lock, ArrowLeft, Save, Eye, EyeOff, CheckCircle, XCircle } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

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

  const fadeInUp = { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.6 } };

  return (
    <>
      {/* TOP BAR — BIG LOGO */}
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="sticky top-0 bg-white/80 backdrop-blur-xl z-40 border-b border-white/20 shadow-sm"
      >
        <div className="flex items-center justify-between p-4">
          <button
            onClick={() => router.back()}
            className="text-purple-600 hover:bg-purple-50 p-2 rounded-full transition-all"
          >
            <ArrowLeft className="w-7 h-7" />
          </button>
          <Link href="/" className="flex items-center">
            <Image
              src="/images/logo-1.jpg"
              alt="StudEx Logo"
              width={160}
              height={50}
              className="h-11 w-auto object-contain"
              priority
            />
          </Link>
          <h1 className="text-xl font-black bg-gradient-to-r from-purple-600 to-teal-500 bg-clip-text text-transparent">
            Change Password
          </h1>
        </div>
      </motion.div>

      <div className="p-6 pb-32">
        <motion.div {...fadeInUp} className="max-w-md mx-auto space-y-8">
          {/* SUCCESS MESSAGE */}
          {success && (
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-5 text-center"
            >
              <CheckCircle className="w-12 h-12 text-emerald-600 mx-auto mb-3" />
              <p className="font-black text-emerald-800">Password Changed!</p>
              <p className="text-sm text-emerald-700">Redirecting to profile...</p>
            </motion.div>
          )}

          {/* FORM */}
          {!success && (
            <>
              <div className="text-center">
                <div className="w-20 h-20 mx-auto bg-gradient-to-br from-purple-100 to-teal-100 rounded-full flex items-center justify-center shadow-xl mb-4">
                  <Lock className="w-10 h-10 text-purple-600" />
                </div>
                <h2 className="text-2xl font-black text-gray-800">Secure Your Account</h2>
                <p className="text-sm text-gray-600 mt-2">Use a strong password to protect your PAU account</p>
              </div>

              <div className="bg-white/70 backdrop-blur-md rounded-2xl p-6 shadow-lg border border-white/30 space-y-6">
                {[
                  { label: "Current Password", name: "oldPassword", key: "old" },
                  { label: "New Password", name: "newPassword", key: "new" },
                  { label: "Confirm New Password", name: "confirmPassword", key: "confirm" },
                ].map(({ label, name, key }) => (
                  <div key={name}>
                    <label className="text-sm font-bold text-gray-700">{label}</label>
                    <div className="relative mt-2">
                      <input
                        type={show[key as keyof typeof show] ? "text" : "password"}
                        name={name}
                        value={passwords[name as keyof typeof passwords]}
                        onChange={handleChange}
                        className="w-full p-4 rounded-xl border-2 pr-12 transition-all"
                        style={{
                          borderColor: passwords[name as keyof typeof passwords]
                            ? (name === "newPassword" && validatePassword(passwords.newPassword).isValid ? "#10B981" : "#7C3AED")
                            : "#d1d5db",
                        }}
                        placeholder={`Enter ${label.toLowerCase()}`}
                      />
                      <button
                        type="button"
                        onClick={() => toggleShow(key as "old" | "new" | "confirm")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-purple-600 transition"
                      >
                        {show[key as keyof typeof show] ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>
                ))}

                {/* PASSWORD STRENGTH */}
                {passwords.newPassword && (
                  <div className="space-y-2 text-sm">
                    <p className="font-bold text-gray-700">Password must include:</p>
                    <div className="flex items-center gap-2">
                      {minLength ? <CheckCircle className="w-4 h-4 text-emerald-600" /> : <XCircle className="w-4 h-4 text-gray-400" />}
                      <span className={minLength ? "text-emerald-600" : "text-gray-500"}>8+ characters</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {hasNumber ? <CheckCircle className="w-4 h-4 text-emerald-600" /> : <XCircle className="w-4 h-4 text-gray-400" />}
                      <span className={hasNumber ? "text-emerald-600" : "text-gray-500"}>1 number</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {hasSpecial ? <CheckCircle className="w-4 h-4 text-emerald-600" /> : <XCircle className="w-4 h-4 text-gray-400" />}
                      <span className={hasSpecial ? "text-emerald-600" : "text-gray-500"}>1 symbol (!@#$%)</span>
                    </div>
                  </div>
                )}

                {/* ERROR */}
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-red-50 border-2 border-red-200 rounded-xl p-3 text-red-700 text-sm font-medium flex items-center gap-2"
                  >
                    <XCircle className="w-5 h-5" />
                    {error}
                  </motion.div>
                )}
              </div>

              {/* SAVE BUTTON */}
              <motion.button
                whileHover={{ scale: passwords.newPassword && passwords.confirmPassword && passwords.oldPassword ? 1.02 : 1 }}
                whileTap={{ scale: passwords.newPassword && passwords.confirmPassword && passwords.oldPassword ? 0.98 : 1 }}
                onClick={handleSave}
                disabled={!passwords.oldPassword || !passwords.newPassword || !passwords.confirmPassword}
                className="w-full py-5 bg-gradient-to-r from-purple-600 to-teal-500 text-white rounded-2xl font-black text-lg shadow-xl flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <Save className="w-5 h-5" />
                Update Password
              </motion.button>
            </>
          )}
        </motion.div>
      </div>

      {/* BOTTOM NAV */}
      <motion.div
        initial={{ y: 100 }}
        animate={{ y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-white/20 z-50 shadow-2xl"
      >
        <div className="flex justify-around py-3">
          <Link href="/" className="text-gray-500"><span className="text-xs">Home</span></Link>
          <Link href="/categories" className="text-gray-500"><span className="text-xs">Shop</span></Link>
          <Link href="/cart" className="text-gray-500"><span className="text-xs">Cart</span></Link>
          <Link href="/wishlist" className="text-gray-500"><span className="text-xs">Wishlist</span></Link>
          <div className="text-teal-600 font-black"><span className="text-xs">Account</span></div>
        </div>
      </motion.div>
    </>
  );
}