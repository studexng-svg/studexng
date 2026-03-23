"use client";

import { Store, ChevronLeft, CheckCircle, X, Shield, ArrowRight, CreditCard, FlipHorizontal } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Image from "next/image";
import { useAuth, getToken } from "@/lib/authStore";

export default function SellerOnboarding() {
  const [step, setStep] = useState(1);
  const [files, setFiles] = useState({
    idFront: null as File | null,
    idBack: null as File | null,
  });
  const [previews, setPreviews] = useState({
    idFront: null as string | null,
    idBack: null as string | null,
  });
  const [businessAge, setBusinessAge] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const router = useRouter();
  const { user, isLoggedIn } = useAuth();

  const handleFile = (type: "idFront" | "idBack", file: File | null) => {
    setFiles((prev) => ({ ...prev, [type]: file }));

    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviews((prev) => ({ ...prev, [type]: reader.result as string }));
      };
      reader.readAsDataURL(file);
    } else {
      setPreviews((prev) => ({ ...prev, [type]: null }));
    }
  };

  const removeFile = (type: "idFront" | "idBack") => {
    setFiles((prev) => ({ ...prev, [type]: null }));
    setPreviews((prev) => ({ ...prev, [type]: null }));
  };

  const handleSubmit = async () => {
    if (!files.idFront || !files.idBack || !businessAge) {
      setError("Please upload both sides of your ID card and check the declaration");
      return;
    }

    if (!isLoggedIn) {
      setError("Please log in first");
      router.push("/auth");
      return;
    }

    setLoading(true);
    setError("");

    const formData = new FormData();
    formData.append("id_front", files.idFront!);
    formData.append("id_back", files.idBack!);
    formData.append("business_age_confirmed", "true");

    try {
      const token = getToken();

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/auth/seller/applications/`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(
          data.detail ||
            (Object.values(data)[0] as string[])?.[0] ||
            "Submission failed"
        );
      }

      setSuccess(true);
      setTimeout(() => router.push("/account"), 3000);
    } catch (err: any) {
      setError(err.message || "Failed to submit. Please try again.");
      setLoading(false);
    }
  };

  const isStep2Complete = files.idFront && files.idBack && businessAge;

  const fadeInUp = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.5 },
  };

  const idFields: {
    key: "idFront" | "idBack";
    label: string;
    hint: string;
    Icon: React.ElementType;
  }[] = [
    {
      key: "idFront",
      label: "ID Card — Front",
      hint: "Shows your name, photo & matric number",
      Icon: CreditCard,
    },
    {
      key: "idBack",
      label: "ID Card — Back",
      hint: "Shows expiry date, barcode or institution seal",
      Icon: FlipHorizontal,
    },
  ];

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
        <motion.div
          {...fadeInUp}
          className="flex justify-center items-center mb-10 gap-4"
        >
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center">
              <motion.div
                animate={{ scale: i <= step ? 1 : 0.9 }}
                className={`w-14 h-14 rounded-full flex items-center justify-center font-bold text-lg shadow-lg ${
                  i <= step
                    ? "bg-gradient-to-r from-teal-500 to-emerald-500 text-white"
                    : "bg-gray-100 text-gray-400"
                }`}
              >
                {i < step ? <CheckCircle className="w-7 h-7" /> : i}
              </motion.div>
              {i < 3 && (
                <motion.div
                  animate={{ scaleX: i < step ? 1 : 0 }}
                  className={`w-20 h-1.5 origin-left ${
                    i < step
                      ? "bg-gradient-to-r from-teal-500 to-emerald-500"
                      : "bg-gray-200"
                  }`}
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
              Join thousands of campus sellers. Earn real money. Get verified in
              24–48 hours.
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
            <div>
              <h2 className="text-xl font-black text-gray-800">
                Verify Your Identity
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Upload both sides of your student ID card
              </p>
            </div>

            {error && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-red-600 text-center font-medium text-sm"
              >
                {error}
              </motion.p>
            )}

            <div className="space-y-5">
              {idFields.map(({ key, label, hint, Icon }) => (
                <motion.div key={key} whileHover={{ y: -2 }}>
                  <label className="block">
                    {/* Upload area or image preview */}
                    {previews[key] ? (
                      <div className="relative rounded-2xl overflow-hidden border-2 border-emerald-500">
                        <img
                          src={previews[key]!}
                          alt={label}
                          className="w-full h-44 object-cover"
                        />
                        {/* overlay with label */}
                        <div className="absolute bottom-0 left-0 right-0 bg-black/50 backdrop-blur-sm px-4 py-2 flex items-center justify-between">
                          <p className="text-white text-sm font-bold flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-emerald-400" />
                            {label}
                          </p>
                          <button
                            type="button"
                            onClick={() => removeFile(key)}
                            className="p-1.5 bg-red-500/80 hover:bg-red-600 rounded-full transition"
                          >
                            <X className="w-4 h-4 text-white" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all border-purple-300 hover:border-purple-500 hover:bg-purple-50">
                        <div className="w-14 h-14 mx-auto mb-3 bg-gradient-to-br from-purple-100 to-teal-100 rounded-2xl flex items-center justify-center">
                          <Icon className="w-8 h-8 text-purple-600" />
                        </div>
                        <p className="text-sm font-bold text-gray-800">
                          {label}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">{hint}</p>
                        <p className="text-xs text-purple-500 mt-2 font-medium">
                          Tap to upload · JPG, PNG or PDF
                        </p>
                        <input
                          type="file"
                          className="hidden"
                          accept=".pdf,.jpg,.jpeg,.png"
                          onChange={(e) =>
                            handleFile(key, e.target.files?.[0] || null)
                          }
                        />
                      </div>
                    )}
                  </label>
                </motion.div>
              ))}

              {/* HONESTY CHECKBOX */}
              <motion.div
                whileHover={{ scale: 1.01 }}
                className="bg-gradient-to-r from-purple-50 to-teal-50 rounded-2xl p-5 border-2 border-purple-200"
              >
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
                      I confirm that I have been selling on campus for{" "}
                      <strong>6 months or more</strong>.
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
                background: isStep2Complete
                  ? "linear-gradient(to right, #14B8A6, #10B981)"
                  : "#9CA3AF",
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

            {/* Preview thumbnails at review step */}
            {!success && (
              <div className="grid grid-cols-2 gap-3 text-left">
                {idFields.map(({ key, label }) =>
                  previews[key] ? (
                    <div
                      key={key}
                      className="rounded-2xl overflow-hidden border border-gray-200"
                    >
                      <img
                        src={previews[key]!}
                        alt={label}
                        className="w-full h-28 object-cover"
                      />
                      <p className="text-xs font-bold text-gray-600 p-2 bg-gray-50">
                        {label}
                      </p>
                    </div>
                  ) : null
                )}
              </div>
            )}

            <p className="text-sm text-gray-600 max-w-xs mx-auto leading-relaxed">
              {success
                ? "We'll review your ID and notify you within 48 hours."
                : "Double-check your ID photos before submitting."}
            </p>

            {error && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-red-600 text-center font-medium text-sm"
              >
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
              <div className="space-y-3">
                <motion.button
                  whileHover={{ scale: !loading ? 1.02 : 1 }}
                  whileTap={{ scale: !loading ? 0.98 : 1 }}
                  onClick={handleSubmit}
                  disabled={loading}
                  className="w-full py-5 rounded-2xl font-black text-white bg-gradient-to-r from-teal-500 to-emerald-500 shadow-2xl disabled:opacity-50 transition-all"
                >
                  {loading ? "Submitting Application..." : "Submit Application"}
                </motion.button>

                {/* Go back and re-upload */}
                <button
                  onClick={() => setStep(2)}
                  className="w-full py-3 rounded-2xl font-bold text-gray-500 hover:text-gray-700 transition text-sm"
                >
                  ← Re-upload ID photos
                </button>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </>
  );
}
