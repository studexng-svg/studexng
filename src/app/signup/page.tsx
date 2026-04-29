"use client";

import {
  User, Phone, MapPin, Lock, Eye, EyeOff, Mail, ArrowLeft,
  CheckCircle2, XCircle, Loader2
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/authStore";
import { validateUsername, validateEmail, validatePhone, validatePassword } from "@/lib/validators";
import Image from "next/image";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

// ─── Field feedback component ─────────────────────────────────────────────────

function FieldFeedback({ show, ok, msg }: { show: boolean; ok: boolean; msg: string }) {
  if (!show || !msg) return null;
  return (
    <div className={`flex items-center gap-1.5 mt-1.5 text-xs font-semibold ${ok ? "text-teal-600" : "text-red-500"}`}>
      {ok
        ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
        : <XCircle className="w-3.5 h-3.5 flex-shrink-0" />}
      {msg}
    </div>
  );
}

// ─── Password strength bar ────────────────────────────────────────────────────

function PasswordStrength({ checks }: { checks: { length: boolean; upper: boolean; lower: boolean; number: boolean } }) {
  const passed = Object.values(checks).filter(Boolean).length;
  const barColors = ["bg-red-400", "bg-orange-400", "bg-yellow-400", "bg-teal-500"];
  const textColors = ["text-red-500", "text-orange-500", "text-yellow-500", "text-teal-600"];
  const labels = ["Weak", "Fair", "Good", "Strong"];

  return (
    <div className="mt-2 space-y-2">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${i < passed ? barColors[passed - 1] : "bg-gray-200"}`} />
        ))}
      </div>
      {passed > 0 && (
        <p className={`text-xs font-bold ${textColors[passed - 1]}`}>{labels[passed - 1]}</p>
      )}
      <div className="grid grid-cols-2 gap-1">
        {[
          { key: "length", label: "8+ characters" },
          { key: "upper", label: "Uppercase letter" },
          { key: "lower", label: "Lowercase letter" },
          { key: "number", label: "Number" },
        ].map(({ key, label }) => (
          <div key={key} className={`flex items-center gap-1 text-xs ${checks[key as keyof typeof checks] ? "text-teal-600" : "text-gray-400"}`}>
            {checks[key as keyof typeof checks]
              ? <CheckCircle2 className="w-3 h-3" />
              : <XCircle className="w-3 h-3" />}
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function UserSignup() {
  const [showPass, setShowPass] = useState(false);
  const [step, setStep] = useState(1);
  const [otp, setOtp] = useState("");
  const [sentOtp, setSentOtp] = useState("");

  const [devOtpVisible, setDevOtpVisible] = useState(false);
  const [devOtpCode, setDevOtpCode] = useState("");

  const [message, setMessage] = useState<{ text: string; type: "error" | "success" | "info" } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    username: "",
    email: "",
    phone: "",
    hostel: "",
    password: "",
  });

  const [touched, setTouched] = useState({
    username: false,
    email: false,
    phone: false,
    hostel: false,
    password: false,
  });

  const [usernameChecking, setUsernameChecking] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const usernameTimer = useRef<NodeJS.Timeout | null>(null);

  const { login } = useAuth();
  const router = useRouter();

  const hostels = [
    "Cedar", "Trezadel", "Trinity", "Pearl", "Redwood",
    "Cooperative Queens", "Aster Hall", "Cooperative Kings",
    "Queen Mary", "Pod", "Faith", "Amethyst", "Emerald", "EDC", "Lekki Campus"
  ];

  useEffect(() => {
    const v = validateUsername(form.username);
    if (!v.ok || !form.username) {
      setUsernameAvailable(null);
      setUsernameChecking(false);
      return;
    }
    if (usernameTimer.current) clearTimeout(usernameTimer.current);
    setUsernameChecking(true);

    usernameTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`${API_URL}/api/auth/check-username/?username=${encodeURIComponent(form.username)}`);
        const data = await res.json();
        setUsernameAvailable(data.available);
      } catch {
        setUsernameAvailable(null);
      } finally {
        setUsernameChecking(false);
      }
    }, 600);

    return () => { if (usernameTimer.current) clearTimeout(usernameTimer.current); };
  }, [form.username]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
    setTouched(prev => ({ ...prev, [name]: true }));
  };

  const handleBlur = (field: keyof typeof touched) => {
    setTouched(prev => ({ ...prev, [field]: true }));
  };

  const usernameVal = validateUsername(form.username);
  const emailVal = validateEmail(form.email, "PAU");
  const phoneVal = validatePhone(form.phone);
  const passwordVal = validatePassword(form.password);
  const hostelOk = !!form.hostel;

  const step1Valid =
    usernameVal.ok &&
    usernameAvailable === true &&
    emailVal.ok &&
    phoneVal.ok &&
    hostelOk &&
    passwordVal.ok;

  const generateOTP = () => {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setSentOtp(code);
    setDevOtpCode(code);
    setDevOtpVisible(true);
    setMessage({ text: "Verification code generated!", type: "success" });
  };

  const handleStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ username: true, email: true, phone: true, hostel: true, password: true });
    if (!step1Valid) {
      setMessage({ text: "Please fix all the errors above before continuing.", type: "error" });
      return;
    }
    setMessage(null);
    generateOTP();
    setStep(2);
  };

  const fetchWithRetry = async (url: string, options: RequestInit, retries = 3): Promise<Response> => {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const res = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timeout);
        return res;
      } catch (err: unknown) {
        const isAbort = err instanceof Error && err.name === "AbortError";
        if (attempt === retries - 1) throw err;
        if (isAbort) {
          setMessage({ text: `Server is waking up... retrying (${attempt + 2}/${retries})`, type: "info" });
        }
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
      }
    }
    throw new Error("All retries failed");
  };

  const handleStep2 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 6) {
      setMessage({ text: "Please enter the full 6-digit code.", type: "error" });
      return;
    }
    if (otp !== sentOtp) {
      setMessage({ text: "Wrong code. Double-check and try again.", type: "error" });
      return;
    }

    setSubmitting(true);
    setMessage({ text: "Creating your account...", type: "info" });

    try {
      const res = await fetchWithRetry(
        `${API_URL}/api/auth/register/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: form.username,
            email: form.email,
            phone: form.phone,
            hostel: form.hostel,
            password: form.password,
            password2: form.password,
            user_type: "student",
          }),
        },
        3
      );

      const data = await res.json();

      if (!res.ok) {
        const firstError = Object.values(data)[0];
        const errorMsg = Array.isArray(firstError) ? firstError[0] : String(firstError);
        setMessage({ text: errorMsg, type: "error" });
        setSubmitting(false);
        return;
      }

      if (data.tokens && data.user) {
        login(data.user, data.tokens.access, data.tokens.refresh);
      }

      localStorage.setItem("userProfile", JSON.stringify(form));
      setMessage({ text: "🎉 Welcome to StudEx!", type: "success" });
      setTimeout(() => router.push("/home"), 1200);
    } catch (err) {
      console.error("Registration error:", err);
      setMessage({
        text: "Connection timed out. The server may be waking up — please try again in a moment.",
        type: "error",
      });
      setSubmitting(false);
    }
  };

  const handleSubmit = step === 1 ? handleStep1 : handleStep2;

  const inputClass = (field: keyof typeof touched, isOk: boolean) =>
    `w-full px-4 py-4 rounded-2xl border-2 focus:outline-none transition-all text-base font-medium bg-white ${
      !touched[field] || !form[field as keyof typeof form]
        ? "border-purple-200 focus:border-purple-500"
        : isOk
        ? "border-teal-400 focus:border-teal-500"
        : "border-red-400 focus:border-red-500"
    }`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-teal-50 flex items-center justify-center p-4">

      {/* Back button */}
      <button
        onClick={() => {
          if (step === 2) {
            setStep(1);
            setOtp("");
            setMessage(null);
            setDevOtpVisible(false);
          } else {
            router.back();
          }
        }}
        className="absolute top-6 left-6 z-50 text-purple-600 hover:bg-purple-50 p-3 rounded-full transition-all shadow-lg bg-white/80 backdrop-blur"
      >
        <ArrowLeft className="w-6 h-6" />
      </button>

      <div className="bg-white/95 backdrop-blur-2xl rounded-3xl shadow-2xl p-8 w-full max-w-md border border-purple-100 my-8">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="mx-auto w-48 h-20 relative">
            <Image
              src="/images/logo-2.jpg"
              alt="StudEx"
              fill
              className="object-contain drop-shadow-xl"
              priority
            />
          </div>
          <h1 className="text-3xl font-black bg-gradient-to-r from-purple-600 to-teal-500 bg-clip-text text-transparent mt-4">
            {step === 1 ? "Create Account" : "Verify Phone"}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {step === 1
              ? "Join the PAU movement in 30 seconds"
              : `Enter the 6-digit code for ${form.phone}`}
          </p>
        </div>

        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-8">
          {[1, 2].map(i => (
            <div key={i} className={`h-2 rounded-full transition-all duration-300 ${
              i === step ? "w-8 bg-purple-600" : i < step ? "w-4 bg-teal-500" : "w-4 bg-gray-200"
            }`} />
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {step === 1 ? (
            <div className="space-y-5">

              {/* USERNAME */}
              <div>
                <label className="text-sm font-bold text-purple-700 flex items-center gap-2 mb-2">
                  <User className="w-4 h-4" /> Username
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-4 text-purple-400 font-bold">@</span>
                  <input
                    type="text"
                    name="username"
                    value={form.username}
                    onChange={handleChange}
                    onBlur={() => handleBlur("username")}
                    placeholder="chinedu_tech"
                    className={`${inputClass("username", usernameVal.ok && usernameAvailable === true)} pl-10 pr-10`}
                    autoComplete="off"
                  />
                  <div className="absolute right-4 top-4">
                    {usernameChecking && <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />}
                    {!usernameChecking && usernameAvailable === true && form.username && <CheckCircle2 className="w-5 h-5 text-teal-500" />}
                    {!usernameChecking && usernameAvailable === false && <XCircle className="w-5 h-5 text-red-500" />}
                  </div>
                </div>

                {touched.username && form.username && !usernameVal.ok && (
                  <FieldFeedback show={true} ok={false} msg={usernameVal.msg} />
                )}
                {touched.username && form.username && usernameVal.ok && !usernameChecking && usernameAvailable !== null && (
                  <FieldFeedback
                    show={true}
                    ok={usernameAvailable}
                    msg={usernameAvailable ? "Username is available!" : "Username already taken — try another"}
                  />
                )}
                {usernameChecking && (
                  <p className="text-xs text-purple-500 mt-1 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> Checking availability...
                  </p>
                )}
                {!touched.username && (
                  <p className="text-xs text-gray-400 mt-1">Letters, numbers and underscores only. No spaces.</p>
                )}
              </div>

              {/* EMAIL */}
              <div>
                <label className="text-sm font-bold text-purple-700 flex items-center gap-2 mb-2">
                  <Mail className="w-4 h-4" /> Student Email
                </label>
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  onBlur={() => handleBlur("email")}
                  placeholder="john.doe@pau.edu.ng"
                  className={inputClass("email", emailVal.ok)}
                  autoComplete="email"
                />
                {touched.email && form.email && (
                  <FieldFeedback show={true} ok={emailVal.ok} msg={emailVal.msg} />
                )}
                {!touched.email && (
                  <p className="text-xs text-gray-400 mt-1">Must be your official @pau.edu.ng email</p>
                )}
              </div>

              {/* PHONE */}
              <div>
                <label className="text-sm font-bold text-purple-700 flex items-center gap-2 mb-2">
                  <Phone className="w-4 h-4" /> Phone Number
                </label>
                <input
                  type="tel"
                  name="phone"
                  value={form.phone}
                  onChange={handleChange}
                  onBlur={() => handleBlur("phone")}
                  placeholder="08012345678"
                  maxLength={11}
                  className={inputClass("phone", phoneVal.ok)}
                />
                {touched.phone && form.phone && (
                  <FieldFeedback show={true} ok={phoneVal.ok} msg={phoneVal.msg} />
                )}
                {!touched.phone && (
                  <p className="text-xs text-gray-400 mt-1">11-digit Nigerian number (e.g. 08012345678)</p>
                )}
              </div>

              {/* HOSTEL */}
              <div>
                <label className="text-sm font-bold text-purple-700 flex items-center gap-2 mb-2">
                  <MapPin className="w-4 h-4" /> Hostel / Location
                </label>
                <select
                  name="hostel"
                  value={form.hostel}
                  onChange={handleChange}
                  onBlur={() => handleBlur("hostel")}
                  className={`${inputClass("hostel", hostelOk)} appearance-none`}
                >
                  <option value="">Select your hostel</option>
                  {hostels.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
                {touched.hostel && !hostelOk && (
                  <FieldFeedback show={true} ok={false} msg="Please select your hostel" />
                )}
              </div>

              {/* PASSWORD */}
              <div>
                <label className="text-sm font-bold text-purple-700 flex items-center gap-2 mb-2">
                  <Lock className="w-4 h-4" /> Password
                </label>
                <div className="relative">
                  <input
                    type={showPass ? "text" : "password"}
                    name="password"
                    value={form.password}
                    onChange={handleChange}
                    onBlur={() => handleBlur("password")}
                    placeholder="Create a strong password"
                    className={`${inputClass("password", passwordVal.ok)} pr-12`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(p => !p)}
                    className="absolute right-4 top-4 text-purple-400 hover:text-purple-600"
                  >
                    {showPass ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                {form.password && <PasswordStrength checks={passwordVal.checks} />}
                {!form.password && (
                  <p className="text-xs text-gray-400 mt-1">Min 8 chars with uppercase, lowercase & number</p>
                )}
              </div>

              {!step1Valid && touched.username && touched.email && touched.phone && touched.hostel && touched.password && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700 font-medium">
                  ⚠️ Please fix the errors above before continuing.
                </div>
              )}
            </div>

          ) : (
            /* ── OTP STEP ─────────────────────────────────────────────────── */
            <div className="space-y-6">

              <div className="text-center p-5 bg-purple-50 rounded-2xl border-2 border-purple-200">
                <p className="text-sm font-bold text-purple-700">Code sent to</p>
                <p className="text-xl font-black text-purple-900 mt-1">{form.phone}</p>
                <button
                  type="button"
                  onClick={() => { setStep(1); setOtp(""); setMessage(null); setDevOtpVisible(false); }}
                  className="text-xs text-purple-500 underline mt-2 hover:text-purple-700"
                >
                  Wrong number? Go back to edit
                </button>
              </div>

              {/* DEV/MVP OTP DISPLAY — replace with real SMS (Termii, Twilio) before full launch */}
              {devOtpVisible && devOtpCode && (
                <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 text-center">
                  <p className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-1">
                    📱 Your Verification Code
                  </p>
                  <p className="text-4xl font-black text-amber-900 tracking-widest">{devOtpCode}</p>
                  <p className="text-xs text-amber-600 mt-2">
                    Copy this code and enter it below
                  </p>
                </div>
              )}

              <div>
                <input
                  type="text"
                  inputMode="numeric"
                  value={otp}
                  onChange={e => {
                    const val = e.target.value.replace(/\D/g, "").slice(0, 6);
                    setOtp(val);
                    if (message?.type === "error") setMessage(null);
                  }}
                  placeholder="000000"
                  className="w-full text-center text-5xl font-black tracking-widest py-7 rounded-2xl border-4 border-purple-300 focus:border-purple-600 focus:outline-none bg-purple-50 transition-all"
                  maxLength={6}
                  autoFocus
                />
                {otp.length > 0 && otp.length < 6 && (
                  <p className="text-xs text-gray-400 text-center mt-1">{6 - otp.length} more digit(s)</p>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  setOtp("");
                  generateOTP();
                }}
                className="text-purple-600 font-bold underline text-sm w-full text-center hover:text-purple-800 transition"
              >
                Resend Code
              </button>
            </div>
          )}

          {/* Global message banner */}
          {message && (
            <p className={`text-center font-bold text-sm px-4 py-3 rounded-xl border ${
              message.type === "success"
                ? "bg-teal-50 text-teal-700 border-teal-200"
                : message.type === "info"
                ? "bg-purple-50 text-purple-700 border-purple-200"
                : "bg-red-50 text-red-600 border-red-200"
            }`}>
              {message.text}
            </p>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={submitting || (step === 1 && !step1Valid)}
            className={`w-full py-5 rounded-2xl font-black text-white text-lg shadow-xl transition-all
              bg-gradient-to-r from-purple-600 to-teal-500
              ${(submitting || (step === 1 && !step1Valid)) ? "opacity-60 cursor-not-allowed" : "hover:from-purple-700 hover:to-teal-600"}`}
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" /> Creating account...
              </span>
            ) : step === 1 ? "Send Verification Code" : "Complete Signup"}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          Already have an account?{" "}
          <a href="/auth" className="font-black text-purple-600 underline hover:text-purple-800 cursor-pointer">
            Login here
          </a>
        </p>
      </div>
    </div>
  );
}
