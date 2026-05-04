"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Mail, Lock, Eye, EyeOff, Store, ArrowLeft, User, Phone, MapPin, AlertCircle, CheckCircle2, XCircle, Loader2, GraduationCap, Hash } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/authStore";
import { GRAD, SERIF } from "@/lib/tokens";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

const PAU_HOSTELS = [
  "Cedar", "Trezadel", "Trinity", "Pearl", "Redwood",
  "Cooperative Queens", "Queen Mary", "Aster Hall",
  "Cooperative Kings", "Pod", "Faith", "Amethyst", "Emerald", "EDC",
];

const FUTO_HOSTELS = [
  "Tetfund Boys", "Tetfund Girls", "NDDC Hostel",
  "Hostel A", "Hostel B", "Hostel C", "Hostel D", "Hostel E",
  "Umuchima", "PG Hostel","Eziobodo", "Off-Campus",
];

const SCHOOLS = ["PAU", "FUTO"];

// ── Validators ────────────────────────────────────────────────────────────────
const validateUsername = (v: string) => {
  if (!v) return { ok: false, msg: "" };
  if (v.includes(" ")) return { ok: false, msg: "No spaces allowed" };
  if (!/^[a-zA-Z0-9_]+$/.test(v)) return { ok: false, msg: "Only letters, numbers and underscores" };
  if (v.length < 3) return { ok: false, msg: "At least 3 characters" };
  if (v.length > 30) return { ok: false, msg: "Max 30 characters" };
  return { ok: true, msg: "Looks good!" };
};

const validateEmail = (v: string, school: string) => {
  if (!v) return { ok: false, msg: "" };
  if (!v.includes("@")) return { ok: false, msg: "Enter a valid email address" };
  if (school === "PAU") {
    if (!v.toLowerCase().endsWith("@pau.edu.ng")) return { ok: false, msg: "PAU students must use @pau.edu.ng email" };
    return { ok: true, msg: "Valid PAU email ✓" };
  }
  if (school === "FUTO") {
    const ok = v.toLowerCase().endsWith("@futo.edu.ng") || v.toLowerCase().endsWith("@gmail.com");
    if (!ok) return { ok: false, msg: "Use your @futo.edu.ng or Gmail address" };
    return { ok: true, msg: "Valid FUTO email ✓" };
  }
  return { ok: false, msg: "Please select your school first" };
};

const validateMatric = (v: string) => {
  if (!v) return { ok: false, msg: "" };
  if (!/^\d{11}$/.test(v)) return { ok: false, msg: "Must be exactly 11 digits" };
  const year = parseInt(v.substring(0, 4));
  const currentYear = new Date().getFullYear();
  if (year < 2015 || year > currentYear) return { ok: false, msg: "Enter a valid admission year" };
  return { ok: true, msg: "Valid matric number ✓" };
};

const validatePhone = (v: string) => {
  if (!v) return { ok: false, msg: "" };
  const cleaned = v.replace(/[\s\-]/g, "");
  if (!/^\d+$/.test(cleaned)) return { ok: false, msg: "Numbers only" };
  if (cleaned.length < 11) return { ok: false, msg: `${11 - cleaned.length} more digit(s) needed` };
  if (cleaned.length > 11) return { ok: false, msg: "Must be exactly 11 digits" };
  if (!cleaned.startsWith("0")) return { ok: false, msg: "Must start with 0 (e.g. 08012345678)" };
  return { ok: true, msg: "Valid phone number ✓" };
};

const validatePassword = (v: string) => {
  if (!v) return { ok: false, msg: "", checks: { length: false, upper: false, lower: false, number: false } };
  const checks = {
    length: v.length >= 8,
    upper: /[A-Z]/.test(v),
    lower: /[a-z]/.test(v),
    number: /\d/.test(v),
  };
  const allOk = Object.values(checks).every(Boolean);
  return { ok: allOk, msg: allOk ? "Strong password ✓" : "", checks };
};

function FieldFeedback({ ok, msg }: { ok: boolean; msg: string }) {
  if (!msg) return null;
  return (
    <div className={`flex items-center gap-1.5 mt-1.5 text-xs font-semibold ${ok ? "text-teal-600" : "text-red-500"}`}>
      {ok ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" /> : <XCircle className="w-3.5 h-3.5 flex-shrink-0" />}
      {msg}
    </div>
  );
}

function PasswordStrength({ checks }: { checks: { length: boolean; upper: boolean; lower: boolean; number: boolean } }) {
  const passed = Object.values(checks).filter(Boolean).length;
  const colors = ["bg-red-400", "bg-orange-400", "bg-yellow-400", "bg-teal-500"];
  return (
    <div className="mt-2 space-y-2">
      <div className="flex gap-1">
        {[0,1,2,3].map(i => (
          <div key={i} className={`h-1.5 flex-1 rounded-full transition-all ${i < passed ? colors[passed-1] : "bg-stone-200"}`} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1">
        {[
          { key: "length", label: "8+ characters" },
          { key: "upper", label: "Uppercase letter" },
          { key: "lower", label: "Lowercase letter" },
          { key: "number", label: "Number" },
        ].map(({ key, label }) => (
          <div key={key} className={`flex items-center gap-1 text-xs ${checks[key as keyof typeof checks] ? "text-teal-600" : "text-stone-400"}`}>
            {checks[key as keyof typeof checks] ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AuthPage() {
  const [mounted, setMounted] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [step, setStep] = useState(1);
  const [otp, setOtp] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [resetLink, setResetLink] = useState("");
  const [accountDisabled, setAccountDisabled] = useState(false);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [rememberMe, setRememberMe] = useState(false);

  const [signupForm, setSignupForm] = useState({ username: "", email: "", phone: "", hostel: "", password: "", school: "", matric_number: "" });
  const [touched, setTouched] = useState({ username: false, email: false, phone: false, hostel: false, password: false, school: false });
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const usernameTimer = useRef<NodeJS.Timeout | null>(null);

  const router = useRouter();
  const { login: storeLogin, isLoggedIn, isHydrated } = useAuth();

  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem("studex-remember");
      if (saved) {
        const { email, password } = JSON.parse(saved);
        if (email) setLoginEmail(email);
        if (password) setLoginPassword(password);
        setRememberMe(true);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (isHydrated && isLoggedIn) router.push("/home");
  }, [isHydrated, isLoggedIn, router]);

  useEffect(() => {
    const v = validateUsername(signupForm.username);
    if (!v.ok || !signupForm.username) { setUsernameAvailable(null); setUsernameChecking(false); return; }
    if (usernameTimer.current) clearTimeout(usernameTimer.current);
    setUsernameChecking(true);
    usernameTimer.current = setTimeout(async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      try {
        const res = await fetch(
          `${API_URL}/api/auth/check-username/?username=${encodeURIComponent(signupForm.username)}`,
          { signal: controller.signal }
        );
        clearTimeout(timeoutId);
        const data = await res.json();
        setUsernameAvailable(data.available ?? null);
      } catch {
        clearTimeout(timeoutId);
        setUsernameAvailable(null);
      } finally {
        setUsernameChecking(false);
      }
    }, 600);
    return () => { if (usernameTimer.current) clearTimeout(usernameTimer.current); };
  }, [signupForm.username]);

  const usernameVal = validateUsername(signupForm.username);
  const emailVal = validateEmail(signupForm.email, signupForm.school);
  const phoneVal = validatePhone(signupForm.phone);
  const passwordVal = validatePassword(signupForm.password);
  const hostelOk = !!signupForm.hostel;
  const matricVal = validateMatric(signupForm.matric_number || "");
  const isFUTO = signupForm.school === "FUTO";
  const schoolOk = !!signupForm.school;
  const step1Valid = usernameVal.ok && usernameAvailable !== false && emailVal.ok &&
    phoneVal.ok && hostelOk && passwordVal.ok && schoolOk &&
    (!isFUTO || matricVal.ok);

  const handleSignupChange = (e: any) => {
    const { name, value } = e.target;
    setSignupForm(prev => ({ ...prev, [name]: value }));
    setTouched(prev => ({ ...prev, [name]: true }));
  };

  const inputClass = (field: keyof typeof touched, isOk: boolean) =>
    `w-full px-4 py-2.5 rounded-xl border focus:outline-none transition-all text-sm bg-white text-stone-900 placeholder:text-stone-400 ${
      !touched[field] || !signupForm[field as keyof typeof signupForm]
        ? "border-stone-200 focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
        : isOk
          ? "border-teal-400 focus:ring-2 focus:ring-teal-200 focus:border-teal-500"
          : "border-red-300 focus:ring-2 focus:ring-red-200 focus:border-red-400"
    }`;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(""); setAccountDisabled(false); setIsLoading(true);
    if (!loginEmail || !loginPassword) { setLoginError("Please fill in all fields"); setIsLoading(false); return; }
    try {
      const result = await api.login({ email: loginEmail, password: loginPassword });
      storeLogin(result.user, result.tokens.access, result.tokens.refresh);
      if (rememberMe) localStorage.setItem("studex-remember", JSON.stringify({ email: loginEmail, password: loginPassword }));
      else localStorage.removeItem("studex-remember");
      setMessage("Login successful!");
      setTimeout(() => router.push("/home"), 1000);
    } catch (err: any) {
      const msg = err.message || "";
      if (msg.includes("disabled") || err.disabled) { setAccountDisabled(true); setLoginError("Sorry, your account has been disabled. Contact support."); }
      else setLoginError(msg || "Invalid login details, please try again.");
    } finally { setIsLoading(false); }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail || !resetEmail.includes("@")) { setLoginError("Please enter a valid email address"); return; }
    setIsLoading(true); setLoginError("");
    try {
      const result = await api.forgotPassword(resetEmail);
      setResetLink((result as any).reset_url || ""); setResetSent(true);
    } catch (err: any) { setLoginError(err.message || "Something went wrong."); }
    finally { setIsLoading(false); }
  };

  const handleSignupSubmit = async (e: any) => {
    e.preventDefault();
    setMessage("");
    if (step === 1) {
      setTouched({ username: true, email: true, phone: true, hostel: true, password: true, school: true });
      if (!step1Valid) { setMessage("Please fix all errors before continuing."); return; }
      setIsLoading(true);
      try {
        const res = await fetch(`${API_URL}/api/auth/send-otp/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: signupForm.email }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to send OTP");
        setMessage(`Verification code sent to ${signupForm.email}`);
        setStep(2);
      } catch (err: any) {
        setMessage(err.message || "Failed to send code. Please try again.");
      } finally {
        setIsLoading(false);
      }
    } else {
      if (otp.length !== 6) { setMessage("Enter the full 6-digit code."); return; }
      setIsLoading(true);
      try {
        const verifyRes = await fetch(`${API_URL}/api/auth/verify-otp/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: signupForm.email, otp }),
        });
        const verifyData = await verifyRes.json();
        if (!verifyRes.ok) throw new Error(verifyData.error || "Invalid code");

        const result = await api.register({
          username: signupForm.username, email: signupForm.email, phone: signupForm.phone,
          password: signupForm.password, password2: signupForm.password, user_type: "student",
          hostel: signupForm.hostel, school: signupForm.school,
          matric_number: signupForm.matric_number || "",
          campus: signupForm.school.toLowerCase(),
        });
        storeLogin(result.user, result.tokens.access, result.tokens.refresh);
        setMessage("Welcome to StudEx!");
        setTimeout(() => router.push("/home"), 1500);
      } catch (err: any) {
        setMessage(err.message || "Registration failed. Please check your details.");
      } finally {
        setIsLoading(false);
      }
    }
  };

  const flipToSignup = () => { setIsFlipped(true); setIsForgotPassword(false); setLoginError(""); setMessage(""); setAccountDisabled(false); };
  const flipToLogin = () => { setIsFlipped(false); setStep(1); setMessage(""); setOtp(""); };

  if (!mounted) return (
    <div className="min-h-screen bg-[#FAFAF9] flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-stone-200 border-t-teal-500 rounded-full animate-spin" />
    </div>
  );

  return (
    // FIX 1: Replaced pb-24 md:pb-4 with py-8 so content isn't pushed under the bottom nav.
    // Added overflow-y-auto so the page itself scrolls if the viewport is short.
    <div
      className="min-h-screen bg-[#FAFAF9] flex items-start justify-center p-4 py-16 relative overflow-x-hidden overflow-y-auto"
      style={{ fontFamily: "'DM Sans', sans-serif" }}
    >

      {/* Gradient blobs */}
      <div className="fixed top-[-80px] right-[-80px] w-[300px] h-[300px] rounded-full bg-gradient-to-br from-teal-100/60 to-purple-100/40 blur-3xl pointer-events-none" />
      <div className="fixed bottom-[-60px] left-[-60px] w-[200px] h-[200px] rounded-full bg-gradient-to-tr from-purple-100/40 to-teal-100/30 blur-3xl pointer-events-none" />

      {/* Back button */}
      <button onClick={() => router.push("/")}
        className="fixed top-6 left-6 z-50 p-2.5 bg-white/80 backdrop-blur-md border border-stone-200 hover:border-stone-300 rounded-full shadow-sm transition-all active:scale-95">
        <ArrowLeft className="w-5 h-5 text-stone-600" />
      </button>

      {/* FIX 2: The perspective wrapper is now relative (not the card children).
          The card children use a grid trick: both sides are in the same grid cell
          so the taller one always sets the container height. The inactive side is
          made invisible + pointer-events-none so it doesn't intercept clicks. */}
      <div className="relative w-full max-w-md mt-8" style={{ perspective: "1200px" }}>
        <motion.div
          className="relative w-full"
          initial={false}
          animate={{ rotateY: isFlipped ? 180 : 0 }}
          transition={{ duration: 1.2, type: "spring", stiffness: 60, damping: 20 }}
          style={{ transformStyle: "preserve-3d" }}
        >

          {/* ══════════════════════════════════════
              LOGIN SIDE
          ══════════════════════════════════════ */}
          {/* FIX 3: Removed absolute positioning. Card sits in normal flow.
              The inactive side is hidden via visibility so it doesn't take space
              during the flip — but the active side always dictates the height. */}
          <div
            style={{
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              // When flipped away, collapse out of flow so signup card can set height
              position: isFlipped ? "absolute" : "relative",
              inset: 0,
            }}
          >
            <div className="bg-white rounded-2xl shadow-xl border border-stone-100">
              <div className="p-6 md:p-8">

              {/* Header */}
              <div className="text-center mb-8">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center shadow-md"
                  style={{ background: GRAD }}>
                  <Store className="w-9 h-9 text-white" />
                </div>
                <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-semibold mb-1">StudEx</p>
                <h1 className="text-2xl font-bold text-stone-900"
                  style={SERIF}>
                  {isForgotPassword ? "Reset Password" : "Welcome Back"}
                </h1>
                <p className="text-sm text-stone-400 mt-1">
                  {isForgotPassword ? "Enter your email to get a reset link" : "Login to your StudEx account"}
                </p>
              </div>

              {/* Forgot password flow */}
              {isForgotPassword ? (
                <form onSubmit={handleResetPassword} className="space-y-5">
                  {resetSent ? (
                    <div className="text-center py-4 space-y-4">
                      <div className="w-16 h-16 mx-auto bg-teal-50 rounded-2xl flex items-center justify-center">
                        <Mail className="w-8 h-8 text-teal-600" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-stone-900"
                          style={SERIF}>Link Ready!</h3>
                        <p className="text-sm text-stone-400 mt-1">Reset link for</p>
                        <p className="font-semibold text-teal-600 mt-0.5 text-sm">{resetEmail}</p>
                      </div>
                      {resetLink && (
                        <a href={resetLink}
                          className="block w-full py-3.5 rounded-full text-white font-semibold text-sm text-center shadow-lg shadow-teal-200/60"
                          style={{ background: GRAD }}>
                          Reset My Password →
                        </a>
                      )}
                      <button type="button" onClick={() => { setIsForgotPassword(false); setResetSent(false); setResetEmail(""); setResetLink(""); setLoginError(""); }}
                        className="w-full text-center text-teal-600 font-medium text-sm hover:underline">
                        Back to Login
                      </button>
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className="block text-sm font-medium mb-1.5 text-stone-700">
                          <Mail className="w-4 h-4 inline mr-1" /> Email Address
                        </label>
                        <input type="email" value={resetEmail} onChange={e => setResetEmail(e.target.value)}
                          placeholder="you@school.edu.ng"
                          className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition text-sm bg-white text-stone-900 placeholder:text-stone-400"
                          required disabled={isLoading} />
                      </div>
                      {loginError && <p className="text-sm text-red-500 text-center">{loginError}</p>}
                      <button type="submit" disabled={isLoading}
                        className="w-full py-3.5 rounded-full font-semibold text-white text-sm shadow-lg shadow-teal-200/60 disabled:opacity-50"
                        style={{ background: GRAD }}>
                        {isLoading ? "Getting link..." : "Get Reset Link"}
                      </button>
                      <button type="button" onClick={() => { setIsForgotPassword(false); setLoginError(""); }}
                        className="w-full text-center text-teal-600 font-medium text-sm hover:underline">
                        Back to Login
                      </button>
                    </>
                  )}
                </form>
              ) : (
                /* Login form */
                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1.5 text-stone-700">
                      <Mail className="w-4 h-4 inline mr-1" /> Email
                    </label>
                    <input type="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)}
                      placeholder="you@school.edu.ng"
                      className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition text-sm bg-white text-stone-900 placeholder:text-stone-400"
                      required disabled={isLoading || accountDisabled} />
                  </div>

                  <div className="relative">
                    <label className="block text-sm font-medium mb-1.5 text-stone-700">
                      <Lock className="w-4 h-4 inline mr-1" /> Password
                    </label>
                    <input type={showPass ? "text" : "password"} value={loginPassword}
                      onChange={e => setLoginPassword(e.target.value)} placeholder="Enter your password"
                      className="w-full px-4 py-3 pr-12 rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition text-sm bg-white text-stone-900 placeholder:text-stone-400"
                      required disabled={isLoading || accountDisabled} />
                    <button type="button" onClick={() => setShowPass(!showPass)}
                      className="absolute right-3 top-9 text-stone-400 hover:text-teal-600 transition">
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  <div className="flex justify-between items-center">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)}
                        className="rounded accent-teal-600" />
                      <span className="text-stone-600">Remember me</span>
                    </label>
                    <button type="button" onClick={() => setIsForgotPassword(true)}
                      className="text-sm text-teal-600 font-medium hover:underline">
                      Forgot password?
                    </button>
                  </div>

                  {loginError && (
                    <div className={`flex items-start gap-2 p-3 rounded-xl text-sm ${
                      accountDisabled ? "bg-red-50 border border-red-200 text-red-700" : "text-red-500 text-center"
                    }`}>
                      {accountDisabled && <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
                      <span>{loginError}</span>
                    </div>
                  )}
                  {message && <p className="text-sm text-teal-600 text-center">{message}</p>}

                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                    type="submit" disabled={isLoading || accountDisabled}
                    className="w-full py-3.5 rounded-full font-semibold text-white text-sm shadow-lg shadow-teal-200/60 transition-all disabled:opacity-50"
                    style={{ background: GRAD }}>
                    {isLoading ? "Logging in..." : accountDisabled ? "Account Disabled" : "Login to StudEx"}
                  </motion.button>
                </form>
              )}

              {!isForgotPassword && (
                <p className="text-center text-sm text-stone-500 mt-6">
                  New to StudEx?{" "}
                  <button type="button" onClick={flipToSignup}
                    className="font-semibold text-teal-600 hover:underline transition">
                    Create account
                  </button>
                </p>
              )}
              <p className="text-center text-xs text-stone-400 mt-3">© 2026 StudEx</p>
              </div>
            </div>
          </div>

          {/* ══════════════════════════════════════
              SIGNUP SIDE
          ══════════════════════════════════════ */}
          <div
            style={{
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
              // When flipped away (login showing), collapse so login card sets height
              position: isFlipped ? "relative" : "absolute",
              inset: 0,
            }}
          >
            <div className="bg-white rounded-2xl shadow-xl border border-stone-100">
              <div className="p-6 md:p-8">

              {/* Header */}
              <div className="text-center mb-6">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center shadow-md"
                  style={{ background: GRAD }}>
                  <Store className="w-9 h-9 text-white" />
                </div>
                <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-semibold mb-1">StudEx</p>
                <h1 className="text-2xl font-bold text-stone-900"
                  style={SERIF}>
                  {step === 1 ? "Create Account" : "Verify Email"}
                </h1>
                <p className="text-sm text-stone-400 mt-1">
                  {step === 1 ? "Join your campus marketplace in 30 seconds" : "Enter the 6-digit code we emailed you"}
                </p>
              </div>

              <form onSubmit={handleSignupSubmit} className="space-y-3 md:space-y-4">
                {step === 1 ? (
                  <>
                    {/* SCHOOL */}
                    <div>
                      <label className="text-sm font-medium text-stone-700 flex items-center gap-1.5 mb-1.5">
                        <GraduationCap className="w-4 h-4" /> School / University
                      </label>
                      <select
                        value={signupForm.school}
                        onChange={e => {
                          setSignupForm(prev => ({ ...prev, school: e.target.value, hostel: "", matric_number: "" }));
                          setTouched(prev => ({ ...prev, school: true }));
                        }}
                        className={inputClass("school", !!signupForm.school)}
                        disabled={isLoading}>
                        <option value="">Select your university</option>
                        <option value="PAU">Pan-Atlantic University (PAU)</option>
                        <option value="FUTO">Federal University of Technology Owerri (FUTO)</option>
                      </select>
                      {touched.school && !schoolOk && <FieldFeedback ok={false} msg="Please select your school" />}
                    </div>

                    {/* USERNAME */}
                    <div>
                      <label className="text-sm font-medium text-stone-700 flex items-center gap-1.5 mb-1.5">
                        <User className="w-4 h-4" /> Username
                      </label>
                      <div className="relative">
                        <span className="absolute left-4 top-3 text-teal-500 font-bold">@</span>
                        <input type="text" name="username" value={signupForm.username}
                          onChange={handleSignupChange} placeholder="chinedu_tech"
                          className={`${inputClass("username", usernameVal.ok && usernameAvailable === true)} pl-9 pr-9`}
                          disabled={isLoading} />
                        <div className="absolute right-3 top-3">
                          {usernameChecking && <Loader2 className="w-4 h-4 text-stone-400 animate-spin" />}
                          {!usernameChecking && usernameAvailable === true && signupForm.username && <CheckCircle2 className="w-4 h-4 text-teal-500" />}
                          {!usernameChecking && usernameAvailable === false && <XCircle className="w-4 h-4 text-red-500" />}
                        </div>
                      </div>
                      {touched.username && signupForm.username && !usernameVal.ok && <FieldFeedback ok={false} msg={usernameVal.msg} />}
                      {touched.username && signupForm.username && usernameVal.ok && !usernameChecking && usernameAvailable !== null && (
                        <FieldFeedback ok={usernameAvailable} msg={usernameAvailable ? "Username is available!" : "Username already taken — try another"} />
                      )}
                      {usernameChecking && <p className="text-xs text-stone-400 mt-1 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Checking...</p>}
                      {!touched.username && <p className="text-xs text-stone-400 mt-1">Letters, numbers and underscores only.</p>}
                    </div>

                    {/* EMAIL */}
                    <div>
                      <label className="text-sm font-medium text-stone-700 flex items-center gap-1.5 mb-1.5">
                        <Mail className="w-4 h-4" /> Student Email
                      </label>
                      <input type="email" name="email" value={signupForm.email}
                        onChange={handleSignupChange}
                        placeholder={isFUTO ? "you@futo.edu.ng or gmail" : "john.doe@pau.edu.ng"}
                        className={inputClass("email", emailVal.ok)} disabled={isLoading} />
                      {touched.email && signupForm.email && <FieldFeedback ok={emailVal.ok} msg={emailVal.msg} />}
                      {!touched.email && (
                        <p className="text-xs text-stone-400 mt-1">
                          {isFUTO ? "Use your @futo.edu.ng or Gmail address" : signupForm.school === "PAU" ? "Must be your @pau.edu.ng email" : "Select your school above first"}
                        </p>
                      )}
                    </div>

                    {/* PHONE */}
                    <div>
                      <label className="text-sm font-medium text-stone-700 flex items-center gap-1.5 mb-1.5">
                        <Phone className="w-4 h-4" /> Phone Number
                      </label>
                      <input type="tel" name="phone" value={signupForm.phone}
                        onChange={handleSignupChange} placeholder="08012345678" maxLength={11}
                        className={inputClass("phone", phoneVal.ok)} disabled={isLoading} />
                      {touched.phone && signupForm.phone && <FieldFeedback ok={phoneVal.ok} msg={phoneVal.msg} />}
                      {!touched.phone && <p className="text-xs text-stone-400 mt-1">11-digit Nigerian number</p>}
                    </div>

                    {/* MATRIC — FUTO only */}
                    {isFUTO && (
                      <div>
                        <label className="text-sm font-medium text-stone-700 flex items-center gap-1.5 mb-1.5">
                          <Hash className="w-4 h-4" /> Matric Number
                        </label>
                        <input
                          type="text"
                          name="matric_number"
                          value={signupForm.matric_number || ""}
                          onChange={handleSignupChange}
                          placeholder="e.g. 20241430493"
                          maxLength={11}
                          inputMode="numeric"
                          className={inputClass("matric_number" as any, matricVal.ok)}
                          disabled={isLoading}
                        />
                        {signupForm.matric_number && <FieldFeedback ok={matricVal.ok} msg={matricVal.msg} />}
                        {!signupForm.matric_number && <p className="text-xs text-stone-400 mt-1">Your 11-digit FUTO matric number</p>}
                      </div>
                    )}

                    {/* HOSTEL */}
                    <div>
                      <label className="text-sm font-medium text-stone-700 flex items-center gap-1.5 mb-1.5">
                        <MapPin className="w-4 h-4" /> {isFUTO ? "Hostel / Hall" : "Hostel / Location"}
                      </label>
                      <select
                        name="hostel"
                        value={signupForm.hostel}
                        onChange={handleSignupChange}
                        className={`${inputClass("hostel", hostelOk)} appearance-none`}
                        disabled={isLoading || !signupForm.school}>
                        <option value="">
                          {!signupForm.school ? "Select school first" : `Select your hostel`}
                        </option>
                        {(isFUTO ? FUTO_HOSTELS : PAU_HOSTELS).map(h => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                      {touched.hostel && !hostelOk && <FieldFeedback ok={false} msg="Please select your hostel" />}
                    </div>

                    {/* PASSWORD */}
                    <div>
                      <label className="text-sm font-medium text-stone-700 flex items-center gap-1.5 mb-1.5">
                        <Lock className="w-4 h-4" /> Password
                      </label>
                      <div className="relative">
                        <input type={showPass ? "text" : "password"} name="password" value={signupForm.password}
                          onChange={handleSignupChange} placeholder="Create a strong password"
                          className={`${inputClass("password", passwordVal.ok)} pr-10`} disabled={isLoading} />
                        <button type="button" onClick={() => setShowPass(p => !p)}
                          className="absolute right-3 top-3 text-stone-400 hover:text-teal-600">
                          {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      {signupForm.password && <PasswordStrength checks={passwordVal.checks} />}
                      {!signupForm.password && <p className="text-xs text-stone-400 mt-1">Min 8 chars with uppercase, lowercase & number</p>}
                    </div>
                  </>
                ) : (
                  /* OTP Step */
                  <div className="space-y-5">
                    <div className="text-center p-4 bg-teal-50 rounded-2xl border border-teal-200">
                      <p className="text-sm font-medium text-teal-700">Code sent to</p>
                      <p className="text-xl font-bold text-stone-900 mt-1">{signupForm.email}</p>
                      <button type="button" onClick={() => { setStep(1); setOtp(""); setMessage(""); }}
                        className="text-xs text-teal-600 underline mt-2 hover:text-teal-700">
                        Wrong email? Go back
                      </button>
                    </div>

                    <input type="text" inputMode="numeric" value={otp}
                      onChange={e => { setOtp(e.target.value.replace(/\D/g, "").slice(0, 6)); if (message) setMessage(""); }}
                      placeholder="000000"
                      className="w-full text-center text-3xl md:text-4xl font-bold tracking-widest py-4 md:py-6 rounded-xl border-2 border-stone-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30 focus:outline-none bg-stone-50 text-stone-900"
                      maxLength={6} autoFocus />
                    {otp.length > 0 && otp.length < 6 && (
                      <p className="text-xs text-stone-400 text-center">{6 - otp.length} more digit(s)</p>
                    )}
                    <button type="button" onClick={async () => {
                      setOtp(""); setMessage(""); setIsLoading(true);
                      try {
                        await fetch(`${API_URL}/api/auth/send-otp/`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ email: signupForm.email }),
                        });
                        setMessage("New code sent!");
                      } catch {
                        setMessage("Failed to resend. Try again.");
                      } finally {
                        setIsLoading(false);
                      }
                    }} className="text-teal-600 font-medium underline text-sm w-full text-center">
                      Resend Code
                    </button>
                  </div>
                )}

                {message && (
                  <motion.p initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                    className={`text-center font-medium text-sm px-4 py-3 rounded-xl border ${
                      message.includes("Welcome") || message.includes("sent") || message.includes("code")
                        ? "bg-teal-50 text-teal-700 border-teal-200"
                        : "bg-red-50 text-red-600 border-red-200"
                    }`}>
                    {message}
                  </motion.p>
                )}

                <motion.button whileHover={{ scale: isLoading ? 1 : 1.02 }} whileTap={{ scale: isLoading ? 1 : 0.97 }}
                  type="submit" disabled={isLoading || (step === 1 && !step1Valid)}
                  className="w-full py-3 rounded-full font-semibold text-white text-sm shadow-lg shadow-teal-200/60 transition-all disabled:opacity-50"
                  style={{ background: GRAD }}>
                  {isLoading ? "Processing..." : step === 1 ? "Send Verification Code" : "Complete Signup"}
                </motion.button>
              </form>

              <p className="text-center text-sm text-stone-500 mt-5">
                Already have an account?{" "}
                <button type="button" onClick={flipToLogin}
                  className="font-semibold text-teal-600 hover:underline" disabled={isLoading}>
                  Login here
                </button>
              </p>
              </div>
            </div>
          </div>

        </motion.div>
      </div>
    </div>
  );
}