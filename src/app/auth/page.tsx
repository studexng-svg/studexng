"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Mail, Lock, Eye, EyeOff, Store, ArrowLeft, User, Phone, MapPin, AlertCircle, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/authStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

// ── Validators ────────────────────────────────────────────────────────────────
const validateUsername = (v: string) => {
  if (!v) return { ok: false, msg: "" };
  if (v.includes(" ")) return { ok: false, msg: "No spaces allowed" };
  if (!/^[a-zA-Z0-9_]+$/.test(v)) return { ok: false, msg: "Only letters, numbers and underscores" };
  if (v.length < 3) return { ok: false, msg: "At least 3 characters" };
  if (v.length > 30) return { ok: false, msg: "Max 30 characters" };
  return { ok: true, msg: "Looks good!" };
};

const validateEmail = (v: string) => {
  if (!v) return { ok: false, msg: "" };
  if (!v.includes("@")) return { ok: false, msg: "Enter your PAU email (e.g. john@pau.edu.ng)" };
  if (!v.toLowerCase().endsWith("@pau.edu.ng")) return { ok: false, msg: "Must be a @pau.edu.ng email" };
  return { ok: true, msg: "Valid PAU email ✓" };
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
          <div key={i} className={`h-1.5 flex-1 rounded-full transition-all ${i < passed ? colors[passed-1] : "bg-gray-200"}`} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1">
        {[
          { key: "length", label: "8+ characters" },
          { key: "upper", label: "Uppercase letter" },
          { key: "lower", label: "Lowercase letter" },
          { key: "number", label: "Number" },
        ].map(({ key, label }) => (
          <div key={key} className={`flex items-center gap-1 text-xs ${checks[key as keyof typeof checks] ? "text-teal-600" : "text-gray-400"}`}>
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
  const [sentOtp, setSentOtp] = useState("");
  const [otpVisible, setOtpVisible] = useState(false);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [resetLink, setResetLink] = useState("");
  const [accountDisabled, setAccountDisabled] = useState(false);

  // Login state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [rememberMe, setRememberMe] = useState(false);

  // Signup state
  const [signupForm, setSignupForm] = useState({ username: "", email: "", phone: "", hostel: "", password: "" });
  const [touched, setTouched] = useState({ username: false, email: false, phone: false, hostel: false, password: false });
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const usernameTimer = useRef<NodeJS.Timeout | null>(null);

  const router = useRouter();
  const { login: storeLogin, isLoggedIn, isHydrated } = useAuth();

  const hostels = ["Cedar", "Trezadel", "Trinity", "Pearl", "Redwood", "Cooperative Queens", "Queen Mary", "Aster Hall", "Cooperative Kings", "Pod", "Faith", "Amethyst", "Emerald", "EDC"];

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

  // Live username availability check
  useEffect(() => {
    const v = validateUsername(signupForm.username);
    if (!v.ok || !signupForm.username) { setUsernameAvailable(null); setUsernameChecking(false); return; }
    if (usernameTimer.current) clearTimeout(usernameTimer.current);
    setUsernameChecking(true);
    usernameTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`${API_URL}/api/auth/check-username/?username=${encodeURIComponent(signupForm.username)}`);
        const data = await res.json();
        setUsernameAvailable(data.available);
      } catch { setUsernameAvailable(null); }
      finally { setUsernameChecking(false); }
    }, 600);
    return () => { if (usernameTimer.current) clearTimeout(usernameTimer.current); };
  }, [signupForm.username]);

  // Computed validations
  const usernameVal = validateUsername(signupForm.username);
  const emailVal = validateEmail(signupForm.email);
  const phoneVal = validatePhone(signupForm.phone);
  const passwordVal = validatePassword(signupForm.password);
  const hostelOk = !!signupForm.hostel;

  const step1Valid = usernameVal.ok && usernameAvailable === true && emailVal.ok && phoneVal.ok && hostelOk && passwordVal.ok;

  const handleSignupChange = (e: any) => {
    const { name, value } = e.target;
    setSignupForm(prev => ({ ...prev, [name]: value }));
    setTouched(prev => ({ ...prev, [name]: true }));
  };

  const inputClass = (field: keyof typeof touched, isOk: boolean) =>
    `w-full px-4 py-4 rounded-2xl border-2 focus:outline-none transition-all text-base font-medium bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 ${
      !touched[field] || !signupForm[field as keyof typeof signupForm]
        ? "border-purple-200 dark:border-gray-700 focus:border-purple-500"
        : isOk ? "border-teal-400 focus:border-teal-500" : "border-red-400 focus:border-red-500"
    }`;

  const generateOTP = () => {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setSentOtp(code);
    setOtpVisible(true);
  };

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
      setTouched({ username: true, email: true, phone: true, hostel: true, password: true });
      if (!step1Valid) { setMessage("Please fix all errors before continuing."); return; }
      generateOTP();
      setStep(2);
    } else {
      if (otp.length !== 6) { setMessage("Enter the full 6-digit code."); return; }
      if (otp !== sentOtp) { setMessage("Wrong code. Try again."); return; }
      setIsLoading(true);
      try {
        const result = await api.register({
          username: signupForm.username, email: signupForm.email, phone: signupForm.phone,
          password: signupForm.password, password2: signupForm.password, user_type: "student", hostel: signupForm.hostel,
        });
        storeLogin(result.user, result.tokens.access, result.tokens.refresh);
        setMessage("Welcome to StudEx!");
        setTimeout(() => router.push("/home"), 1500);
      } catch (err: any) { setMessage(err.message || "Registration failed. Please check your details."); }
      finally { setIsLoading(false); }
    }
  };

  const flipToSignup = () => { setIsFlipped(true); setIsForgotPassword(false); setLoginError(""); setMessage(""); setAccountDisabled(false); };
  const flipToLogin = () => { setIsFlipped(false); setStep(1); setMessage(""); setOtp(""); setOtpVisible(false); };

  if (!mounted) return (
    <div className="min-h-screen bg-[#FFF8F0] dark:bg-gray-950 flex items-center justify-center">
      <div className="w-20 h-20 border-4 border-transparent bg-gradient-to-r from-teal-500 to-purple-600 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#FFF8F0] dark:bg-gray-950 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 opacity-5" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M20 0l5 15h16l-13 9 5 15-13-9-13 9 5-15-13-9h16z' fill='%237C3AED' fill-opacity='0.4'/%3E%3C/svg%3E")` }} />

      <button onClick={() => router.push("/")} className="absolute top-6 left-6 z-50 text-purple-600 dark:text-purple-400 hover:bg-purple-50 p-3 rounded-full transition-all shadow-lg bg-white/80 dark:bg-gray-800/80 backdrop-blur">
        <ArrowLeft className="w-7 h-7" />
      </button>

      <div className="relative w-full max-w-md" style={{ perspective: "1000px" }}>
        <motion.div className="relative w-full" initial={false} animate={{ rotateY: isFlipped ? 180 : 0 }}
          transition={{ duration: 1.2, type: "spring", stiffness: 60, damping: 20 }} style={{ transformStyle: "preserve-3d", minHeight: "600px" }}>

          {/* ── LOGIN ── */}
          <div className="absolute w-full" style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}>
            <div className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl rounded-3xl shadow-2xl p-8 border border-white/30 dark:border-gray-700/30 overflow-y-auto max-h-[90vh]">
              <div className="text-center mb-8">
                <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-teal-500 to-purple-600 rounded-full flex items-center justify-center shadow-xl">
                  <Store className="w-12 h-12 text-white" />
                </div>
                <h1 className="text-3xl font-black bg-gradient-to-r from-teal-600 to-purple-600 bg-clip-text text-transparent">
                  {isForgotPassword ? "Reset Password" : "Welcome Back"}
                </h1>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 font-medium">
                  {isForgotPassword ? "Enter your email to get a reset link" : "Login to your StudEx account"}
                </p>
              </div>

              {isForgotPassword ? (
                <form onSubmit={handleResetPassword} className="space-y-6">
                  {resetSent ? (
                    <div className="text-center py-4 space-y-5">
                      <div className="w-20 h-20 mx-auto bg-emerald-100 rounded-full flex items-center justify-center">
                        <Mail className="w-10 h-10 text-emerald-600" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-gray-800 dark:text-gray-200">Link Ready!</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Reset link for</p>
                        <p className="font-bold text-purple-600 mt-1 text-sm">{resetEmail}</p>
                      </div>
                      {resetLink && <a href={resetLink} className="block w-full py-5 px-4 rounded-2xl bg-gradient-to-r from-teal-500 to-purple-600 text-white font-black text-lg text-center shadow-xl">Reset My Password →</a>}
                      <button type="button" onClick={() => { setIsForgotPassword(false); setResetSent(false); setResetEmail(""); setResetLink(""); setLoginError(""); }} className="w-full text-center text-purple-600 font-medium underline">Back to Login</button>
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className="block text-sm font-medium mb-2 text-purple-700 dark:text-purple-400"><Mail className="w-4 h-4 inline mr-1" /> Email Address</label>
                        <input type="email" value={resetEmail} onChange={e => setResetEmail(e.target.value)} placeholder="you@pau.edu.ng"
                          className="w-full p-4 rounded-2xl border-2 focus:outline-none transition-all bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                          style={{ borderColor: resetEmail ? "#7C3AED" : "#e2e8f0" }} required disabled={isLoading} />
                      </div>
                      {loginError && <p className="text-sm text-red-600 text-center">{loginError}</p>}
                      <button type="submit" disabled={isLoading} className="w-full py-5 rounded-2xl font-black text-white text-lg shadow-xl bg-gradient-to-r from-teal-500 to-purple-600 disabled:opacity-50">
                        {isLoading ? "Getting link..." : "Get Reset Link"}
                      </button>
                      <button type="button" onClick={() => { setIsForgotPassword(false); setLoginError(""); }} className="w-full text-center text-purple-600 font-medium underline">Back to Login</button>
                    </>
                  )}
                </form>
              ) : (
                <form onSubmit={handleLogin} className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium mb-2 text-purple-700 dark:text-purple-400"><Mail className="w-4 h-4 inline mr-1" /> Email</label>
                    <input type="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} placeholder="you@pau.edu.ng"
                      className="w-full p-4 rounded-2xl border-2 focus:outline-none transition-all bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      style={{ borderColor: loginEmail ? "#7C3AED" : "#e2e8f0" }} required disabled={isLoading || accountDisabled} />
                  </div>
                  <div className="relative">
                    <label className="block text-sm font-medium mb-2 text-purple-700 dark:text-purple-400"><Lock className="w-4 h-4 inline mr-1" /> Password</label>
                    <input type={showPass ? "text" : "password"} value={loginPassword} onChange={e => setLoginPassword(e.target.value)} placeholder="Enter your password"
                      className="w-full p-4 pr-14 rounded-2xl border-2 focus:outline-none transition-all bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      style={{ borderColor: loginPassword ? "#7C3AED" : "#e2e8f0" }} required disabled={isLoading || accountDisabled} />
                    <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-4 top-11 text-gray-500 hover:text-purple-600 transition">
                      {showPass ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  <div className="flex justify-between items-center">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} className="rounded text-purple-600" />
                      <span className="text-gray-700 dark:text-gray-300">Remember me</span>
                    </label>
                    <button type="button" onClick={() => setIsForgotPassword(true)} className="text-sm text-purple-600 font-medium hover:underline">Forgot password?</button>
                  </div>
                  {loginError && (
                    <div className={`flex items-start gap-2 p-3 rounded-xl text-sm font-medium ${accountDisabled ? "bg-red-50 border border-red-200 text-red-700" : "text-red-600 text-center"}`}>
                      {accountDisabled && <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
                      <span>{loginError}</span>
                    </div>
                  )}
                  {message && <p className="text-sm text-green-600 text-center">{message}</p>}
                  <button type="submit" disabled={isLoading || accountDisabled}
                    className="w-full py-5 rounded-2xl font-black text-white text-lg shadow-xl bg-gradient-to-r from-teal-500 to-purple-600 hover:from-teal-600 hover:to-purple-700 transition-all disabled:opacity-50">
                    {isLoading ? "Logging in..." : accountDisabled ? "Account Disabled" : "Login to StudEx"}
                  </button>
                </form>
              )}

              {!isForgotPassword && (
                <p className="text-center text-sm text-gray-600 dark:text-gray-400 mt-8">
                  New to StudEx?{" "}
                  <button type="button" onClick={flipToSignup} className="font-bold text-purple-600 underline hover:text-purple-700 transition">Create account</button>
                </p>
              )}
              <p className="text-center text-xs text-gray-500 dark:text-gray-400 mt-4">© 2025 StudEx • Pan-Atlantic University Only</p>
            </div>
          </div>

          {/* ── SIGNUP ── */}
          <div className="absolute w-full" style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", transform: "rotateY(180deg)" }}>
            <div className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-2xl rounded-3xl shadow-2xl p-8 border border-purple-100 dark:border-gray-700/30 overflow-y-auto max-h-[90vh]">
              <div className="text-center mb-6">
                <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-teal-500 to-purple-600 rounded-full flex items-center justify-center shadow-xl">
                  <Store className="w-12 h-12 text-white" />
                </div>
                <h1 className="text-3xl font-black bg-gradient-to-r from-teal-600 to-purple-600 bg-clip-text text-transparent mt-4">
                  {step === 1 ? "Create Account" : "Verify Phone"}
                </h1>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 font-medium">
                  {step === 1 ? "Join the PAU movement in 30 seconds" : `Enter the code for ${signupForm.phone}`}
                </p>
              </div>

              <form onSubmit={handleSignupSubmit} className="space-y-4">
                {step === 1 ? (
                  <>
                    {/* USERNAME */}
                    <div>
                      <label className="text-sm font-bold text-purple-700 dark:text-purple-400 flex items-center gap-2 mb-2"><User className="w-4 h-4" /> Username</label>
                      <div className="relative">
                        <span className="absolute left-4 top-4 text-purple-500 font-bold text-lg">@</span>
                        <input type="text" name="username" value={signupForm.username} onChange={handleSignupChange}
                          placeholder="chinedu_tech"
                          className={`${inputClass("username", usernameVal.ok && usernameAvailable === true)} pl-10 pr-10`}
                          disabled={isLoading} />
                        <div className="absolute right-4 top-4">
                          {usernameChecking && <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />}
                          {!usernameChecking && usernameAvailable === true && signupForm.username && <CheckCircle2 className="w-5 h-5 text-teal-500" />}
                          {!usernameChecking && usernameAvailable === false && <XCircle className="w-5 h-5 text-red-500" />}
                        </div>
                      </div>
                      {touched.username && signupForm.username && !usernameVal.ok && <FieldFeedback ok={false} msg={usernameVal.msg} />}
                      {touched.username && signupForm.username && usernameVal.ok && !usernameChecking && usernameAvailable !== null && (
                        <FieldFeedback ok={usernameAvailable} msg={usernameAvailable ? "Username is available!" : "Username already taken — try another"} />
                      )}
                      {usernameChecking && <p className="text-xs text-purple-500 mt-1 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Checking availability...</p>}
                      {!touched.username && <p className="text-xs text-gray-400 mt-1">Letters, numbers and underscores only. No spaces.</p>}
                    </div>

                    {/* EMAIL */}
                    <div>
                      <label className="text-sm font-bold text-purple-700 dark:text-purple-400 flex items-center gap-2 mb-2"><Mail className="w-4 h-4" /> Student Email</label>
                      <input type="email" name="email" value={signupForm.email} onChange={handleSignupChange}
                        placeholder="john.doe@pau.edu.ng"
                        className={inputClass("email", emailVal.ok)}
                        disabled={isLoading} />
                      {touched.email && signupForm.email && <FieldFeedback ok={emailVal.ok} msg={emailVal.msg} />}
                      {!touched.email && <p className="text-xs text-gray-400 mt-1">Must be your official @pau.edu.ng email</p>}
                    </div>

                    {/* PHONE */}
                    <div>
                      <label className="text-sm font-bold text-purple-700 dark:text-purple-400 flex items-center gap-2 mb-2"><Phone className="w-4 h-4" /> Phone Number</label>
                      <input type="tel" name="phone" value={signupForm.phone} onChange={handleSignupChange}
                        placeholder="08012345678" maxLength={11}
                        className={inputClass("phone", phoneVal.ok)}
                        disabled={isLoading} />
                      {touched.phone && signupForm.phone && <FieldFeedback ok={phoneVal.ok} msg={phoneVal.msg} />}
                      {!touched.phone && <p className="text-xs text-gray-400 mt-1">11-digit Nigerian number</p>}
                    </div>

                    {/* HOSTEL */}
                    <div>
                      <label className="text-sm font-bold text-purple-700 dark:text-purple-400 flex items-center gap-2 mb-2"><MapPin className="w-4 h-4" /> Hostel / Location</label>
                      <select name="hostel" value={signupForm.hostel} onChange={handleSignupChange}
                        className={`${inputClass("hostel", hostelOk)} appearance-none`}
                        disabled={isLoading}>
                        <option value="">Select your hostel</option>
                        {hostels.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                      {touched.hostel && !hostelOk && <FieldFeedback ok={false} msg="Please select your hostel" />}
                    </div>

                    {/* PASSWORD */}
                    <div>
                      <label className="text-sm font-bold text-purple-700 dark:text-purple-400 flex items-center gap-2 mb-2"><Lock className="w-4 h-4" /> Password</label>
                      <div className="relative">
                        <input type={showPass ? "text" : "password"} name="password" value={signupForm.password} onChange={handleSignupChange}
                          placeholder="Create a strong password"
                          className={`${inputClass("password", passwordVal.ok)} pr-12`}
                          disabled={isLoading} />
                        <button type="button" onClick={() => setShowPass(p => !p)} className="absolute right-4 top-4 text-purple-500 hover:text-purple-700">
                          {showPass ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                      </div>
                      {signupForm.password && <PasswordStrength checks={passwordVal.checks} />}
                      {!signupForm.password && <p className="text-xs text-gray-400 mt-1">Min 8 chars with uppercase, lowercase & number</p>}
                    </div>
                  </>
                ) : (
                  <div className="space-y-6">
                    <div className="text-center p-5 bg-purple-50 dark:bg-purple-900/20 rounded-2xl border-2 border-purple-200 dark:border-purple-700">
                      <p className="text-sm font-bold text-purple-700 dark:text-purple-300">Code sent to</p>
                      <p className="text-xl font-black text-purple-900 dark:text-purple-200 mt-1">{signupForm.phone}</p>
                      <button type="button" onClick={() => { setStep(1); setOtp(""); setMessage(""); setOtpVisible(false); }}
                        className="text-xs text-purple-500 underline mt-2 hover:text-purple-700">
                        Wrong number? Go back to edit
                      </button>
                    </div>

                    {/* OTP display on screen */}
                    {otpVisible && sentOtp && (
                      <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 text-center">
                        <p className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-1">📱 Your Verification Code</p>
                        <p className="text-4xl font-black text-amber-900 tracking-widest">{sentOtp}</p>
                        <p className="text-xs text-amber-600 mt-2">Copy this code and enter it below</p>
                      </div>
                    )}

                    <input type="text" inputMode="numeric" value={otp}
                      onChange={e => { setOtp(e.target.value.replace(/\D/g, "").slice(0, 6)); if (message) setMessage(""); }}
                      placeholder="000000"
                      className="w-full text-center text-5xl font-black tracking-widest py-7 rounded-2xl border-4 border-purple-300 dark:border-purple-700 focus:border-purple-600 focus:outline-none bg-purple-50 dark:bg-purple-900/20 text-gray-900 dark:text-white"
                      maxLength={6} autoFocus />
                    {otp.length > 0 && otp.length < 6 && <p className="text-xs text-gray-400 text-center">{6 - otp.length} more digit(s)</p>}

                    <button type="button" onClick={() => { setOtp(""); generateOTP(); }}
                      className="text-purple-600 font-bold underline text-sm w-full text-center">
                      Resend Code
                    </button>
                  </div>
                )}

                {message && (
                  <motion.p initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                    className={`text-center font-bold text-sm px-4 py-3 rounded-xl border ${
                      message.includes("Welcome") || message.includes("sent") || message.includes("code")
                        ? "bg-teal-50 text-teal-700 border-teal-200"
                        : "bg-red-50 text-red-600 border-red-200"
                    }`}>
                    {message}
                  </motion.p>
                )}

                <motion.button whileHover={{ scale: isLoading ? 1 : 1.02 }} whileTap={{ scale: isLoading ? 1 : 0.98 }}
                  type="submit" disabled={isLoading || (step === 1 && !step1Valid)}
                  className="w-full py-5 rounded-2xl font-black text-white text-xl shadow-2xl bg-gradient-to-r from-teal-500 via-purple-500 to-purple-600 transition-all disabled:opacity-50">
                  {isLoading ? "Processing..." : step === 1 ? "Send Verification Code" : "Complete Signup"}
                </motion.button>
              </form>

              <p className="text-center text-sm text-gray-600 dark:text-gray-400 mt-6">
                Already have an account?{" "}
                <button type="button" onClick={flipToLogin} className="font-black text-purple-600 underline hover:text-purple-800" disabled={isLoading}>Login here</button>
              </p>
            </div>
          </div>

        </motion.div>
      </div>
    </div>
  );
}
