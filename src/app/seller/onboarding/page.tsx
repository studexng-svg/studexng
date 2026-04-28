"use client";

import { Store, ChevronLeft, CheckCircle, X, Shield, ArrowRight, CreditCard, FlipHorizontal } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, fetchWithAuth } from "@/lib/authStore";

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
      const response = await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/auth/seller/applications/`,
        {
          method: "POST",
          body: formData,
        }
      );
      if (!response.ok) {
        const data = await response.json();
        throw new Error(
          data.detail || (Object.values(data)[0] as string[])?.[0] || "Submission failed"
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

  const idFields: {
    key: "idFront" | "idBack";
    label: string;
    hint: string;
    Icon: React.ElementType;
  }[] = [
    { key: "idFront", label: "ID Card — Front", hint: "Shows your name, photo & matric number", Icon: CreditCard },
    { key: "idBack", label: "ID Card — Back", hint: "Shows expiry date, barcode or institution seal", Icon: FlipHorizontal },
  ];

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
            Become a Seller
          </h1>
          <div className="w-10" />
        </div>
      </div>

      <div className="px-4 pt-8 pb-32 max-w-lg mx-auto">
        {/* PROGRESS STEPS */}
        <div className="flex justify-center items-center mb-10 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center">
              <div
                className={`w-11 h-11 rounded-full flex items-center justify-center font-semibold text-sm shadow-sm transition-all ${
                  i <= step
                    ? "text-white"
                    : "bg-stone-100 text-stone-400"
                }`}
                style={i <= step ? { background: "linear-gradient(135deg, #0D9488 0%, #7C3AED 100%)" } : {}}
              >
                {i < step ? <CheckCircle className="w-5 h-5" /> : i}
              </div>
              {i < 3 && (
                <div className={`w-16 h-1 mx-1 rounded-full transition-all ${
                  i < step ? "bg-teal-500" : "bg-stone-200"
                }`} />
              )}
            </div>
          ))}
        </div>

        {/* STEP 1: WELCOME */}
        {step === 1 && (
          <div className="animate-fadeUp text-center space-y-6">
            <div className="w-24 h-24 mx-auto bg-teal-50 rounded-full flex items-center justify-center border border-teal-100">
              <Store className="w-12 h-12 text-teal-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-stone-900" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                Sell on StudEx
              </h2>
              <p className="text-sm text-stone-500 mt-2 leading-relaxed max-w-xs mx-auto">
                Join thousands of campus sellers. Earn real money. Get verified in 24–48 hours.
              </p>
            </div>
            <button
              onClick={() => setStep(2)}
              className="w-full py-4 rounded-full font-semibold text-white shadow-md flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
              style={{ background: "linear-gradient(135deg, #0D9488 0%, #7C3AED 100%)" }}
            >
              Start Application
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* STEP 2: DOCUMENTS */}
        {step === 2 && (
          <div className="animate-fadeUp space-y-6">
            <div>
              <h2 className="text-xl font-bold text-stone-900" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                Verify Your Identity
              </h2>
              <p className="text-sm text-stone-500 mt-1">Upload both sides of your student ID card</p>
            </div>

            {error && (
              <p className="text-red-600 text-sm text-center font-medium bg-red-50 border border-red-100 p-3 rounded-xl">
                {error}
              </p>
            )}

            <div className="space-y-4">
              {idFields.map(({ key, label, hint, Icon }) => (
                <label key={key} className="block cursor-pointer">
                  {previews[key] ? (
                    <div className="relative rounded-2xl overflow-hidden border-2 border-teal-500">
                      <img src={previews[key]!} alt={label} className="w-full h-44 object-cover" />
                      <div className="absolute bottom-0 left-0 right-0 bg-black/50 backdrop-blur-sm px-4 py-2 flex items-center justify-between">
                        <p className="text-white text-sm font-semibold flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-emerald-400" />
                          {label}
                        </p>
                        <button
                          type="button"
                          onClick={() => removeFile(key)}
                          className="p-1.5 bg-red-500/80 hover:bg-red-600 rounded-full transition"
                        >
                          <X className="w-3.5 h-3.5 text-white" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="border-2 border-dashed border-stone-300 rounded-2xl p-6 text-center hover:border-teal-400 hover:bg-teal-50/30 transition-all">
                      <div className="w-12 h-12 mx-auto mb-3 bg-stone-100 rounded-2xl flex items-center justify-center">
                        <Icon className="w-6 h-6 text-stone-400" />
                      </div>
                      <p className="text-sm font-semibold text-stone-700">{label}</p>
                      <p className="text-xs text-stone-400 mt-1">{hint}</p>
                      <p className="text-xs text-teal-600 mt-2 font-medium">Tap to upload · JPG, PNG or PDF</p>
                      <input
                        type="file"
                        className="hidden"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={(e) => handleFile(key, e.target.files?.[0] || null)}
                      />
                    </div>
                  )}
                </label>
              ))}

              {/* HONESTY CHECKBOX */}
              <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={businessAge}
                    onChange={(e) => setBusinessAge(e.target.checked)}
                    className="w-5 h-5 text-teal-600 rounded mt-0.5 focus:ring-0"
                  />
                  <div>
                    <p className="font-semibold text-stone-800 text-sm flex items-center gap-2">
                      <Shield className="w-4 h-4 text-teal-600" />
                      Business Age Declaration
                    </p>
                    <p className="text-xs text-stone-500 mt-1 leading-relaxed">
                      I confirm that I have been selling on campus for{" "}
                      <strong>6 months or more</strong>.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            <button
              onClick={() => setStep(3)}
              disabled={!isStep2Complete}
              className="w-full py-4 rounded-full font-semibold text-white shadow-md flex items-center justify-center gap-2 transition-all disabled:opacity-50 active:scale-[0.98]"
              style={{ background: isStep2Complete ? "linear-gradient(135deg, #0D9488 0%, #7C3AED 100%)" : "#D6D3D1" }}
            >
              Continue to Review
              {isStep2Complete && <ArrowRight className="w-4 h-4" />}
            </button>
          </div>
        )}

        {/* STEP 3: REVIEW & SUBMIT */}
        {step === 3 && (
          <div className="animate-fadeUp text-center space-y-6">
            <div className="w-24 h-24 mx-auto bg-emerald-50 rounded-full flex items-center justify-center border border-emerald-100">
              <CheckCircle className="w-12 h-12 text-emerald-600" />
            </div>

            <div>
              <h2 className="text-2xl font-bold text-stone-900" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                {success ? "Application Submitted!" : "Ready to Submit?"}
              </h2>
            </div>

            {!success && (
              <div className="grid grid-cols-2 gap-3 text-left">
                {idFields.map(({ key, label }) =>
                  previews[key] ? (
                    <div key={key} className="rounded-2xl overflow-hidden border border-stone-200 shadow-sm">
                      <img src={previews[key]!} alt={label} className="w-full h-28 object-cover" />
                      <p className="text-xs font-medium text-stone-500 p-2 bg-stone-50">{label}</p>
                    </div>
                  ) : null
                )}
              </div>
            )}

            <p className="text-sm text-stone-500 max-w-xs mx-auto leading-relaxed">
              {success
                ? "We'll review your ID and notify you within 48 hours."
                : "Double-check your ID photos before submitting."}
            </p>

            {error && (
              <p className="text-red-600 text-sm text-center font-medium bg-red-50 border border-red-100 p-3 rounded-xl">
                {error}
              </p>
            )}

            {success ? (
              <p className="text-emerald-600 font-semibold text-sm">Redirecting to Account...</p>
            ) : (
              <div className="space-y-3">
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="w-full py-4 rounded-full font-semibold text-white shadow-md disabled:opacity-50 transition-all active:scale-[0.98]"
                  style={{ background: "linear-gradient(135deg, #0D9488 0%, #7C3AED 100%)" }}
                >
                  {loading ? "Submitting Application..." : "Submit Application"}
                </button>
                <button
                  onClick={() => setStep(2)}
                  className="w-full py-3 rounded-full font-medium text-stone-500 hover:text-stone-700 transition text-sm"
                >
                  ← Re-upload ID photos
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
