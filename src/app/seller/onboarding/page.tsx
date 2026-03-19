// src/app/seller/onboarding/page.tsx
"use client";

import { Store, ChevronLeft, CheckCircle, FileText, X, Shield, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Image from "next/image";
import { useAuth, getToken } from "@/lib/authStore";

export default function SellerOnboarding() {
  const [step, setStep] = useState(1);
  const [files, setFiles] = useState({
    id: null as File | null,
    admission: null as File | null,
  });
  const [businessAge, setBusinessAge] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const router = useRouter();
  const { user, isLoggedIn } = useAuth();

  const handleFile = (type: "id" | "admission", file: File | null) => {
    setFiles(prev => ({ ...prev, [type]: file }));
  };

  const removeFile = (type: "id" | "admission") => {
    setFiles(prev => ({ ...prev, [type]: null }));
  };

  const handleSubmit = async () => {
    if (!files.id || !files.admission || !businessAge) {
      setError("Please complete all fields");
      return;
    }

    // Check Django JWT login
    if (!isLoggedIn) {
      setError("Please log in first");
      router.push("/auth");
      return;
    }

    setLoading(true);
    setError("");

    const formData = new FormData();
    formData.append("id_document", files.id!);
    formData.append("admission_letter", files.admission!);
    formData.append("business_age_confirmed", "true");

    try {
      const token = getToken();

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/auth/seller/applications/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || data.error || "Submission failed");
      }

      setSuccess(true);
      setTimeout(() => {
        router.push("/account");
      }, 3000);
    } catch (err: any) {
      setError(err.message || "Failed to submit. Please try again.");
      setLoading(false);
    }
  };

  const isStep2Complete = files.id && files.admission && businessAge;

  const fadeInUp = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.5 },
  };

  return (
    <>
      {/* TOP BAR */}
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="sticky top-0 bg-white/80 backdrop-blur-xl z-40 border-b border-white/20 shadow-sm"
      >
        <div className="flex items-center justify-between p-4">
          <button
            onClick={() => router.back()}
            className="p-4 rounded-2xl bg-gradient-to-br from-purple-100 to-teal-100 hover:from-purple-200 hover:to-teal-200 active:scale-95 transition-all shadow-lg"
          >
            <ChevronLeft className="w-7 h-7 text-purple-700" />
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
            Become a Seller
          </h1>
        </div>
      </motion.div>

      <div className="p-6 pb-32">
        {/* PROGRESS STEPS */}
        <motion.div {...fadeInUp} className="flex justify-center items-center mb-10 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center">
              <motion.div
                animate={{ scale: i <= step ? 1 : 0.9 }}
                className={`w-14 h-14 rounded-full flex items-center justify-center font-bold text-lg shadow-lg ${
                  i <= step ? "bg-gradient-to-r from-teal-500 to-emerald-500 text-white" : "bg-gray-100 text-gray-400"
                }`}
              >
                {i < step ? <CheckCircle className="w-7 h-7" /> : i}
              </motion.div>
              {i < 3 && (
                <motion.div
                  animate={{ scaleX: i < step ? 1 : 0 }}
                  className={`w-20 h-1.5 origin-left ${i < step ? "bg-gradient-to-r from-teal-500 to-emerald-500" : "bg-gray-200"}`}
                />
              )}
            </div>
          ))}
        </motion.div>

        {/* STEP 1: WELCOME */}
        {step === 1 && (
          <motion.div {...fadeInUp} className="text-center space-y-8">
            <motion.div
              animate={{ rotate: [0, 10, -10, 0] }}
              transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
              className="w-28 h-28 mx-auto bg-gradient-to-br from-purple-100 to-teal-100 rounded-full flex items-center justify-center shadow-xl"
            >
              <Store className="w-16 h-16 text-purple-600" />
            </motion.div>
            <h2 className="text-2xl font-black bg-gradient-to-r from-purple-600 to-teal-500 bg-clip-text text-transparent">
              Sell on StudEx
            </h2>
            <p className="text-sm text-gray-600 max-w-xs mx-auto leading-relaxed">
              Join thousands of campus sellers. Earn real money. Get verified in 24–48 hours.
            </p>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setStep(2)}
              className="w-full py-5 rounded-2xl font-black text-white bg-gradient-to-r from-teal-500 to-emerald-500 shadow-2xl flex items-center justify-center gap-3"
            >
              Start Application
              <ArrowRight className="w-5 h-5" />
            </motion.button>
          </motion.div>
        )}

        {/* STEP 2: DOCUMENTS */}
        {step === 2 && (
          <motion.div {...fadeInUp} className="space-y-8">
            <h2 className="text-xl font-black text-gray-800">Verify Your Identity</h2>

            {error && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-red-600 text-center font-medium">
                {error}
              </motion.p>
            )}

            <div className="space-y-6">
              {/* STUDENT ID */}
              <motion.div whileHover={{ y: -2 }}>
                <label className="block">
                  <div className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
                    files.id ? "border-emerald-500 bg-emerald-50" : "border-purple-300 hover:border-purple-500"
                  }`}>
                    <FileText className="w-10 h-10 mx-auto mb-3 text-purple-600" />
                    <p className="text-sm font-bold text-gray-800">Student ID</p>
                    <p className="text-xs text-gray-500 mt-1">JPG, PNG, or PDF</p>
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={(e) => handleFile("id", e.target.files?.[0] || null)}
                    />
                  </div>
                  {files.id && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="mt-3 p-3 bg-emerald-100 rounded-xl flex items-center justify-between shadow-sm"
                    >
                      <p className="text-xs font-bold text-emerald-800 flex items-center gap-2">
                        <CheckCircle className="w-4 h-4" />
                        {files.id.name}
                      </p>
                      <button onClick={() => removeFile("id")} className="p-1.5 hover:bg-red-200 rounded-full transition">
                        <X className="w-4 h-4 text-red-600" />
                      </button>
                    </motion.div>
                  )}
                </label>
              </motion.div>

              {/* ADMISSION LETTER */}
              <motion.div whileHover={{ y: -2 }}>
                <label className="block">
                  <div className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
                    files.admission ? "border-emerald-500 bg-emerald-50" : "border-purple-300 hover:border-purple-500"
                  }`}>
                    <FileText className="w-10 h-10 mx-auto mb-3 text-purple-600" />
                    <p className="text-sm font-bold text-gray-800">Admission Letter</p>
                    <p className="text-xs text-gray-500 mt-1">Proof of enrollment</p>
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={(e) => handleFile("admission", e.target.files?.[0] || null)}
                    />
                  </div>
                  {files.admission && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="mt-3 p-3 bg-emerald-100 rounded-xl flex items-center justify-between shadow-sm"
                    >
                      <p className="text-xs font-bold text-emerald-800 flex items-center gap-2">
                        <CheckCircle className="w-4 h-4" />
                        {files.admission.name}
                      </p>
                      <button onClick={() => removeFile("admission")} className="p-1.5 hover:bg-red-200 rounded-full transition">
                        <X className="w-4 h-4 text-red-600" />
                      </button>
                    </motion.div>
                  )}
                </label>
              </motion.div>

              {/* HONESTY CHECKBOX */}
              <motion.div whileHover={{ scale: 1.01 }} className="bg-gradient-to-r from-purple-50 to-teal-50 rounded-2xl p-5 border-2 border-purple-200">
                <label className="flex items-start gap-4 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={businessAge}
                    onChange={(e) => setBusinessAge(e.target.checked)}
                    className="w-6 h-6 text-teal-600 rounded focus:ring-0 mt-0.5"
                  />
                  <div>
                    <p className="font-bold text-gray-800 flex items-center gap-2">
                      <Shield className="w-5 h-5 text-purple-600" />
                      Business Age Declaration
                    </p>
                    <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                      I confirm that I have been selling on campus for <strong>6 months or more</strong>.
                    </p>
                  </div>
                </label>
              </motion.div>
            </div>

            <motion.button
              whileHover={{ scale: isStep2Complete ? 1.02 : 1 }}
              whileTap={{ scale: isStep2Complete ? 0.98 : 1 }}
              onClick={() => setStep(3)}
              disabled={!isStep2Complete}
              className="w-full py-5 rounded-2xl font-black text-white shadow-2xl flex items-center justify-center gap-3 transition-all disabled:opacity-50"
              style={{
                background: isStep2Complete ? "linear-gradient(to right, #14B8A6, #10B981)" : "#9CA3AF"
              }}
            >
              Continue to Review
              {isStep2Complete && <ArrowRight className="w-5 h-5" />}
            </motion.button>
          </motion.div>
        )}

        {/* STEP 3: REVIEW & SUBMIT */}
        {step === 3 && (
          <motion.div {...fadeInUp} className="text-center space-y-8">
            <motion.div
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 0.6, repeat: success ? 1 : Infinity }}
              className="w-28 h-28 mx-auto bg-gradient-to-br from-emerald-100 to-teal-100 rounded-full flex items-center justify-center shadow-xl"
            >
              <CheckCircle className="w-16 h-16 text-emerald-600" />
            </motion.div>
            <h2 className="text-2xl font-black bg-gradient-to-r from-purple-600 to-teal-500 bg-clip-text text-transparent">
              {success ? "Application Submitted!" : "Ready to Submit?"}
            </h2>
            <p className="text-sm text-gray-600 max-w-xs mx-auto leading-relaxed">
              {success
                ? "We'll review your documents and notify you via app within 48 hours."
                : "Double-check your files and declaration before submitting."}
            </p>

            {error && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-red-600 text-center font-medium">
                {error}
              </motion.p>
            )}

            {success ? (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-emerald-600 font-bold"
              >
                Redirecting to Account...
              </motion.p>
            ) : (
              <motion.button
                whileHover={{ scale: !loading ? 1.02 : 1 }}
                whileTap={{ scale: !loading ? 0.98 : 1 }}
                onClick={handleSubmit}
                disabled={loading}
                className="w-full py-5 rounded-2xl font-black text-white bg-gradient-to-r from-teal-500 to-emerald-500 shadow-2xl disabled:opacity-50 transition-all"
              >
                {loading ? "Submitting Application..." : "Submit Application"}
              </motion.button>
            )}
          </motion.div>
        )}
      </div>
    </>
  );
}
