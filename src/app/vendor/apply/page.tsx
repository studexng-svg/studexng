"use client";

import { Store, CheckCircle, X, Shield, ArrowRight, CreditCard, FlipHorizontal, FileText, IdCard } from "lucide-react";
import TopNav from "@/components/layout/TopNav";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/authStore";
import { TEAL } from "@/lib/tokens";
import { api } from "@/lib/api";

type DocType = "id_card" | "admission_letter" | "nin";

export default function VendorApplyPage() {
  const [step, setStep] = useState(1);
  const [docType, setDocType] = useState<DocType>("id_card");

  const [files, setFiles] = useState({
    idFront: null as File | null,
    idBack: null as File | null,
    admissionLetter: null as File | null,
    ninDocument: null as File | null,
  });
  const [previews, setPreviews] = useState({
    idFront: null as string | null,
    idBack: null as string | null,
    admissionLetter: null as string | null,
    ninDocument: null as string | null,
  });

  const [businessAge, setBusinessAge] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const router = useRouter();
  const { isLoggedIn } = useAuth();

  const handleFile = (key: keyof typeof files, file: File | null) => {
    setFiles(prev => ({ ...prev, [key]: file }));
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () =>
        setPreviews(prev => ({ ...prev, [key]: reader.result as string }));
      reader.readAsDataURL(file);
    } else {
      setPreviews(prev => ({ ...prev, [key]: null }));
    }
  };

  const removeFile = (key: keyof typeof files) => {
    setFiles(prev => ({ ...prev, [key]: null }));
    setPreviews(prev => ({ ...prev, [key]: null }));
  };

  const isStep2Complete =
    docType === "id_card"
      ? !!(files.idFront && files.idBack && businessAge)
      : docType === "admission_letter"
      ? !!(files.admissionLetter && businessAge)
      : !!(files.ninDocument && businessAge);

  const handleSubmit = async () => {
    if (!isStep2Complete) {
      setError(
        docType === "id_card"
          ? "Please upload both sides of your ID card and check the declaration"
          : "Please upload your document and check the declaration"
      );
      return;
    }
    if (!isLoggedIn) {
      router.push("/auth");
      return;
    }
    setLoading(true);
    setError("");

    const formData = new FormData();
    if (docType === "id_card") {
      formData.append("id_front", files.idFront!);
      formData.append("id_back", files.idBack!);
    } else if (docType === "admission_letter") {
      formData.append("admission_letter", files.admissionLetter!);
    } else {
      formData.append("nin_document", files.ninDocument!);
    }
    formData.append("business_age_confirmed", "true");

    try {
      const response = await api.auth.applyVendor(formData);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(
          data.detail ||
          (Array.isArray(data.non_field_errors) && data.non_field_errors[0]) ||
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

  return (
    <div className="min-h-screen bg-[#F5F5F5]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <TopNav showBack />

      <div className="px-4 pt-8 pb-32 max-w-lg mx-auto">
        {/* PROGRESS STEPS */}
        <div className="flex justify-center items-center mb-10 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center">
              <div
                className={`w-11 h-11 rounded-full flex items-center justify-center font-semibold text-sm shadow-sm transition-all ${
                  i <= step ? "text-white" : "bg-stone-100 text-stone-400"
                }`}
                style={i <= step ? { background: TEAL } : {}}
              >
                {i < step ? <CheckCircle className="w-5 h-5" /> : i}
              </div>
              {i < 3 && (
                <div className={`w-16 h-1 mx-1 rounded-full transition-all ${i < step ? "bg-teal-500" : "bg-stone-200"}`} />
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
              <h2 className="text-2xl font-bold text-stone-900" style={SERIF}>Sell on StudEx</h2>
              <p className="text-sm text-stone-500 mt-2 leading-relaxed max-w-xs mx-auto">
                Join campus sellers. Earn real money. Get verified in 24–48 hours.
              </p>
            </div>
            <button
              onClick={() => setStep(2)}
              className="w-full py-4 rounded-full font-semibold text-white shadow-md flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
              style={{ background: TEAL }}
            >
              Start Application <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* STEP 2: DOCUMENTS */}
        {step === 2 && (
          <div className="animate-fadeUp space-y-6">
            <div>
              <h2 className="text-xl font-bold text-stone-900" style={SERIF}>Verify Your Identity</h2>
              <p className="text-sm text-stone-500 mt-1">Choose a document to verify your identity</p>
            </div>

            {/* DOC TYPE DROPDOWN */}
            <div>
              <label className="block text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">
                Verification Document
              </label>
              <div className="relative">
                <select
                  value={docType}
                  onChange={(e) => { setDocType(e.target.value as DocType); setError(""); }}
                  className="w-full appearance-none bg-white border-2 border-stone-200 rounded-2xl px-4 py-3.5 pr-10 text-sm font-semibold text-stone-800 focus:outline-none focus:border-teal-500 transition-colors cursor-pointer"
                >
                  <option value="id_card">🪪  Student ID Card (front &amp; back)</option>
                  <option value="admission_letter">📄  Admission Letter</option>
                  <option value="nin">🆔  NIN Document (National ID Number)</option>
                </select>
                <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-stone-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>

            {error && (
              <p className="text-red-600 text-sm text-center font-medium bg-red-50 border border-red-100 p-3 rounded-xl">
                {error}
              </p>
            )}

            <div className="space-y-4">
              {/* ID CARD OPTION */}
              {docType === "id_card" && ([
                { key: "idFront" as const, label: "ID Card — Front", hint: "Shows your name, photo & matric number", Icon: CreditCard },
                { key: "idBack"  as const, label: "ID Card — Back",  hint: "Shows expiry date, barcode or institution seal", Icon: FlipHorizontal },
              ]).map(({ key, label, hint, Icon }) => (
                <label key={key} className="block cursor-pointer">
                  {files[key] ? (
                    <div className="rounded-2xl border-2 border-teal-500 bg-teal-50 p-4 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {previews[key] && previews[key]!.startsWith("data:image") ? (
                          <img
                            src={previews[key]!}
                            alt={label}
                            className="w-14 h-14 rounded-xl object-cover flex-shrink-0 border border-teal-200"
                          />
                        ) : (
                          <div className="w-10 h-10 bg-teal-100 rounded-xl flex items-center justify-center flex-shrink-0">
                            <Icon className="w-5 h-5 text-teal-600" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-teal-800 flex items-center gap-1.5">
                            <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" /> {label}
                          </p>
                          <p className="text-xs text-teal-600 mt-0.5 truncate">{files[key]!.name}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeFile(key); }}
                        className="p-1.5 bg-red-100 hover:bg-red-200 rounded-full transition flex-shrink-0"
                      >
                        <X className="w-3.5 h-3.5 text-red-600" />
                      </button>
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
                        accept="image/*,application/pdf"
                        onChange={(e) => handleFile(key, e.target.files?.[0] || null)}
                      />
                    </div>
                  )}
                </label>
              ))}

              {/* ADMISSION LETTER OPTION */}
              {docType === "admission_letter" && (
                <label className="block cursor-pointer">
                  {files.admissionLetter ? (
                    <div className="rounded-2xl border-2 border-teal-500 bg-teal-50 p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-teal-100 rounded-xl flex items-center justify-center flex-shrink-0">
                          <FileText className="w-5 h-5 text-teal-600" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-teal-800 flex items-center gap-1.5">
                            <CheckCircle className="w-4 h-4 text-emerald-500" /> Document uploaded
                          </p>
                          <p className="text-xs text-teal-600 mt-0.5 truncate max-w-[180px]">
                            {files.admissionLetter.name}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFile("admissionLetter")}
                        className="p-1.5 bg-red-100 hover:bg-red-200 rounded-full transition"
                      >
                        <X className="w-3.5 h-3.5 text-red-600" />
                      </button>
                    </div>
                  ) : (
                    <div className="border-2 border-dashed border-stone-300 rounded-2xl p-8 text-center hover:border-teal-400 hover:bg-teal-50/30 transition-all">
                      <div className="w-14 h-14 mx-auto mb-3 bg-stone-100 rounded-2xl flex items-center justify-center">
                        <FileText className="w-7 h-7 text-stone-400" />
                      </div>
                      <p className="text-sm font-semibold text-stone-700">Admission Letter</p>
                      <p className="text-xs text-stone-400 mt-1">Your letter of admission or student enrollment proof</p>
                      <p className="text-xs text-teal-600 mt-2 font-medium">Tap to upload · PDF, JPG or PNG</p>
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*,application/pdf"
                        onChange={(e) => handleFile("admissionLetter", e.target.files?.[0] || null)}
                      />
                    </div>
                  )}
                </label>
              )}

              {/* NIN OPTION */}
              {docType === "nin" && (
                <label className="block cursor-pointer">
                  {files.ninDocument ? (
                    <div className="rounded-2xl border-2 border-teal-500 bg-teal-50 p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-teal-100 rounded-xl flex items-center justify-center flex-shrink-0">
                          <IdCard className="w-5 h-5 text-teal-600" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-teal-800 flex items-center gap-1.5">
                            <CheckCircle className="w-4 h-4 text-emerald-500" /> NIN uploaded
                          </p>
                          <p className="text-xs text-teal-600 mt-0.5 truncate max-w-[180px]">
                            {files.ninDocument.name}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFile("ninDocument")}
                        className="p-1.5 bg-red-100 hover:bg-red-200 rounded-full transition"
                      >
                        <X className="w-3.5 h-3.5 text-red-600" />
                      </button>
                    </div>
                  ) : (
                    <div className="border-2 border-dashed border-stone-300 rounded-2xl p-8 text-center hover:border-teal-400 hover:bg-teal-50/30 transition-all">
                      <div className="w-14 h-14 mx-auto mb-3 bg-stone-100 rounded-2xl flex items-center justify-center">
                        <IdCard className="w-7 h-7 text-stone-400" />
                      </div>
                      <p className="text-sm font-semibold text-stone-700">NIN Document</p>
                      <p className="text-xs text-stone-400 mt-1">Your NIN slip or National ID card scan</p>
                      <p className="text-xs text-teal-600 mt-2 font-medium">Tap to upload · PDF, JPG or PNG</p>
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*,application/pdf"
                        onChange={(e) => handleFile("ninDocument", e.target.files?.[0] || null)}
                      />
                    </div>
                  )}
                </label>
              )}

              {/* DECLARATION CHECKBOX */}
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
                      <Shield className="w-4 h-4 text-teal-600" /> Business Age Declaration
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
              style={{ background: isStep2Complete ? TEAL : "#D6D3D1" }}
            >
              Continue to Review {isStep2Complete && <ArrowRight className="w-4 h-4" />}
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
              <h2 className="text-2xl font-bold text-stone-900" style={SERIF}>
                {success ? "Application Submitted!" : "Ready to Submit?"}
              </h2>
            </div>

            {!success && (
              <div className="grid grid-cols-2 gap-3 text-left">
                {docType === "id_card" ? (
                  <>
                    {(previews.idFront || files.idFront) && (
                      <div className="rounded-2xl overflow-hidden border border-stone-200 shadow-sm">
                        {previews.idFront
                          ? <img src={previews.idFront} alt="ID Front" className="w-full h-28 object-cover" />
                          : <div className="w-full h-28 bg-teal-50 flex items-center justify-center"><FileText className="w-8 h-8 text-teal-400" /></div>
                        }
                        <p className="text-xs font-medium text-stone-500 p-2 bg-stone-50 truncate">{files.idFront?.name || "ID Front"}</p>
                      </div>
                    )}
                    {(previews.idBack || files.idBack) && (
                      <div className="rounded-2xl overflow-hidden border border-stone-200 shadow-sm">
                        {previews.idBack
                          ? <img src={previews.idBack} alt="ID Back" className="w-full h-28 object-cover" />
                          : <div className="w-full h-28 bg-teal-50 flex items-center justify-center"><FileText className="w-8 h-8 text-teal-400" /></div>
                        }
                        <p className="text-xs font-medium text-stone-500 p-2 bg-stone-50 truncate">{files.idBack?.name || "ID Back"}</p>
                      </div>
                    )}
                  </>
                ) : docType === "admission_letter" ? (
                  <div className="col-span-2 rounded-2xl border border-teal-200 bg-teal-50 p-4 flex items-center gap-3">
                    <FileText className="w-8 h-8 text-teal-600 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-teal-800">Admission Letter</p>
                      <p className="text-xs text-teal-600 truncate">{files.admissionLetter?.name}</p>
                    </div>
                  </div>
                ) : (
                  <div className="col-span-2 rounded-2xl border border-teal-200 bg-teal-50 p-4 flex items-center gap-3">
                    <IdCard className="w-8 h-8 text-teal-600 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-teal-800">NIN Document</p>
                      <p className="text-xs text-teal-600 truncate">{files.ninDocument?.name}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            <p className="text-sm text-stone-500 max-w-xs mx-auto leading-relaxed">
              {success
                ? "We'll review your documents and notify you within 48 hours."
                : "Double-check your documents before submitting."}
            </p>

            {error && (
              <p className="text-red-600 text-sm text-center font-medium bg-red-50 border border-red-100 p-3 rounded-xl">
                {error}
              </p>
            )}

            {success ? (
              <p className="text-emerald-600 font-semibold text-sm">Redirecting to your account...</p>
            ) : (
              <div className="space-y-3">
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="w-full py-4 rounded-full font-semibold text-white shadow-md disabled:opacity-50 transition-all active:scale-[0.98]"
                  style={{ background: TEAL }}
                >
                  {loading ? "Submitting Application..." : "Submit Application"}
                </button>
                <button
                  onClick={() => setStep(2)}
                  className="w-full py-3 rounded-full font-medium text-stone-500 hover:text-stone-700 transition text-sm"
                >
                  ← Re-upload documents
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
