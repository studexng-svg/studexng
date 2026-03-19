"use client";

import { motion } from "framer-motion";
import { Mail, Lock, Eye, EyeOff, Store, ArrowLeft, User, Phone, MapPin, AlertCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/authStore";

export default function AuthPage() {
  const [mounted, setMounted] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [step, setStep] = useState(1);
  const [otp, setOtp] = useState("");
  const [sentOtp, setSentOtp] = useState("");
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
  const [signupForm, setSignupForm] = useState({
    username: "", email: "", phone: "", hostel: "", password: "", password2: "",
  });

  const router = useRouter();
  const { login: storeLogin, isLoggedIn, isHydrated } = useAuth();

  const hostels = ["Cedar", "Trezadel", "Trinity", "Pearl", "Redwood", "Cooperative Queens", "Aster Hall", "Cooperative Kings", "Pod", "Faith", "Amethyst", "Emerald", "EDC"];

  useEffect(() => {
    setMounted(true);
    // Load remembered credentials
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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setAccountDisabled(false);
    setIsLoading(true);

    if (!loginEmail || !loginPassword) {
      setLoginError("Please fill in all fields");
      setIsLoading(false);
      return;
    }

    try {
      const result = await api.login({ email: loginEmail, password: loginPassword });
      storeLogin(result.user, result.tokens.access, result.tokens.refresh);

      // Save or clear remembered credentials
      if (rememberMe) {
        localStorage.setItem("studex-remember", JSON.stringify({ email: loginEmail, password: loginPassword }));
      } else {
        localStorage.removeItem("studex-remember");
      }

      setMessage("Login successful!");
      setTimeout(() => router.push("/home"), 1000);
    } catch (err: any) {
      const msg = err.message || "";
      if (msg.includes("disabled") || err.disabled) {
        setAccountDisabled(true);
        setLoginError("Sorry, your account has been disabled. Contact support to get your account re-enabled.");
      } else {
        setLoginError(msg || "Invalid login details, please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!resetEmail || !emailRegex.test(resetEmail)) {
      setLoginError("Please enter a valid email address");
      return;
    }
    setIsLoading(true);
    setLoginError("");
    try {
      const result = await api.forgotPassword(resetEmail);
      setResetLink((result as any).reset_url || "");
      setResetSent(true);
    } catch (err: any) {
      setLoginError(err.message || "Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignupChange = (e: any) => {
    const { name, value } = e.target;
    setSignupForm(prev => ({ ...prev, [name]: value }));
  };

  const generateOTP = () => {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setSentOtp(code);
    alert(`Your OTP: ${code}`);
    setMessage("OTP sent to your phone!");
  };

  const handleSignupSubmit = async (e: any) => {
    e.preventDefault();
    setMessage("");

    if (step === 1) {
      if (!signupForm.username || !signupForm.email || !signupForm.phone || !signupForm.hostel || !signupForm.password) {
        setMessage("Please fill all fields");
        return;
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(signupForm.email)) {
        setMessage("Please enter a valid email address");
        return;
      }
      signupForm.password2 = signupForm.password;
      generateOTP();
      setStep(2);
    } else {
      if (otp === sentOtp) {
        setIsLoading(true);
        try {
          const result = await api.register({
            username: signupForm.username,
            email: signupForm.email,
            phone: signupForm.phone,
            password: signupForm.password,
            password2: signupForm.password2,
            user_type: "student",
            hostel: signupForm.hostel,
          });
          storeLogin(result.user, result.tokens.access, result.tokens.refresh);
          setMessage("Welcome to StudEx!");
          setTimeout(() => router.push("/home"), 1500);
        } catch (err: any) {
          setMessage(err.message || "Registration failed");
        } finally {
          setIsLoading(false);
        }
      } else {
        setMessage("Wrong OTP. Try again.");
      }
    }
  };

  const flipToSignup = () => { setIsFlipped(true); setIsForgotPassword(false); setLoginError(""); setMessage(""); setAccountDisabled(false); };
  const flipToLogin = () => { setIsFlipped(false); setStep(1); setMessage(""); setOtp(""); };

  if (!mounted) {
    return (
      <div className="min-h-screen bg-[#FFF8F0] dark:bg-gray-950 flex items-center justify-center">
        <div className="w-20 h-20 border-4 border-transparent bg-gradient-to-r from-teal-500 to-purple-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FFF8F0] dark:bg-gray-950 flex items-center justify-center p-4 perspective-1000 relative overflow-hidden">
      <div className="absolute inset-0 opacity-5" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M20 0l5 15h16l-13 9 5 15-13-9-13 9 5-15-13-9h16z' fill='%237C3AED' fill-opacity='0.4'/%3E%3C/svg%3E")`,
      }} />

      <button onClick={() => router.push("/")}
        className="absolute top-6 left-6 z-50 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/30 p-3 rounded-full transition-all shadow-lg bg-white/80 dark:bg-gray-800/80 backdrop-blur">
        <ArrowLeft className="w-7 h-7" />
      </button>

      <div className="relative w-full max-w-md h-[700px]" style={{ perspective: "1000px" }}>
        <motion.div className="relative w-full h-full" initial={false}
          animate={{ rotateY: isFlipped ? 180 : 0 }}
          transition={{ duration: 1.2, type: "spring", stiffness: 60, damping: 20 }}
          style={{ transformStyle: "preserve-3d" }}>

          {/* ========== LOGIN SIDE ========== */}
          <div className="absolute w-full h-full" style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}>
            <div className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl rounded-3xl shadow-2xl p-8 border border-white/30 dark:border-gray-700/30 h-full overflow-y-auto">
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
                      <div className="w-20 h-20 mx-auto bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center">
                        <Mail className="w-10 h-10 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-gray-800 dark:text-gray-200">Link Ready!</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Click below to reset the password for</p>
                        <p className="font-bold text-purple-600 dark:text-purple-400 mt-1 text-sm">{resetEmail}</p>
                      </div>
                      {resetLink && (
                        <a href={resetLink} className="block w-full py-5 px-4 rounded-2xl bg-gradient-to-r from-teal-500 to-purple-600 text-white font-black text-lg text-center shadow-xl">
                          Reset My Password →
                        </a>
                      )}
                      <button type="button" onClick={() => { setIsForgotPassword(false); setResetSent(false); setResetEmail(""); setResetLink(""); setLoginError(""); }}
                        className="w-full text-center text-purple-600 dark:text-purple-400 font-medium underline">
                        Back to Login
                      </button>
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className="block text-sm font-medium mb-2 text-purple-700 dark:text-purple-400">
                          <Mail className="w-4 h-4 inline mr-1" /> Email Address
                        </label>
                        <input type="email" value={resetEmail} onChange={e => setResetEmail(e.target.value)}
                          placeholder="you@pau.edu.ng"
                          className="w-full p-4 rounded-2xl border-2 focus:outline-none transition-all bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400"
                          style={{ borderColor: resetEmail ? "#7C3AED" : "#e2e8f0" }} required disabled={isLoading} />
                      </div>
                      {loginError && <p className="text-sm text-red-600 dark:text-red-400 text-center">{loginError}</p>}
                      <button type="submit" disabled={isLoading}
                        className="w-full py-5 rounded-2xl font-black text-white text-lg shadow-xl bg-gradient-to-r from-teal-500 to-purple-600 disabled:opacity-50">
                        {isLoading ? "Getting link..." : "Get Reset Link"}
                      </button>
                      <button type="button" onClick={() => { setIsForgotPassword(false); setLoginError(""); }}
                        className="w-full text-center text-purple-600 dark:text-purple-400 font-medium underline">
                        Back to Login
                      </button>
                    </>
                  )}
                </form>
              ) : (
                <form onSubmit={handleLogin} className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium mb-2 text-purple-700 dark:text-purple-400">
                      <Mail className="w-4 h-4 inline mr-1" /> Email
                    </label>
                    <input type="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)}
                      placeholder="you@pau.edu.ng"
                      className="w-full p-4 rounded-2xl border-2 focus:outline-none transition-all bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400"
                      style={{ borderColor: loginEmail ? "#7C3AED" : "#e2e8f0" }} required disabled={isLoading || accountDisabled} />
                  </div>
                  <div className="relative">
                    <label className="block text-sm font-medium mb-2 text-purple-700 dark:text-purple-400">
                      <Lock className="w-4 h-4 inline mr-1" /> Password
                    </label>
                    <input type={showPass ? "text" : "password"} value={loginPassword} onChange={e => setLoginPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="w-full p-4 pr-14 rounded-2xl border-2 focus:outline-none transition-all bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400"
                      style={{ borderColor: loginPassword ? "#7C3AED" : "#e2e8f0" }} required disabled={isLoading || accountDisabled} />
                    <button type="button" onClick={() => setShowPass(!showPass)}
                      className="absolute right-4 top-11 text-gray-500 dark:text-gray-400 hover:text-purple-600 transition">
                      {showPass ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  <div className="flex justify-between items-center">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)}
                        className="rounded text-purple-600" />
                      <span className="text-gray-700 dark:text-gray-300">Remember me</span>
                    </label>
                    <button type="button" onClick={() => setIsForgotPassword(true)}
                      className="text-sm text-purple-600 dark:text-purple-400 font-medium hover:underline">
                      Forgot password?
                    </button>
                  </div>

                  {/* Error message */}
                  {loginError && (
                    <div className={`flex items-start gap-2 p-3 rounded-xl text-sm font-medium ${
                      accountDisabled
                        ? "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400"
                        : "text-red-600 dark:text-red-400 text-center"
                    }`}>
                      {accountDisabled && <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
                      <span>{loginError}</span>
                    </div>
                  )}

                  {message && <p className="text-sm text-green-600 dark:text-green-400 text-center">{message}</p>}

                  <button type="submit" disabled={isLoading || accountDisabled}
                    className="w-full py-5 rounded-2xl font-black text-white text-lg shadow-xl bg-gradient-to-r from-teal-500 to-purple-600 hover:from-teal-600 hover:to-purple-700 transition-all disabled:opacity-50">
                    {isLoading ? "Logging in..." : accountDisabled ? "Account Disabled" : "Login to StudEx"}
                  </button>
                </form>
              )}

              {!isForgotPassword && (
                <p className="text-center text-sm text-gray-600 dark:text-gray-400 mt-8">
                  New to StudEx?{" "}
                  <button type="button" onClick={flipToSignup}
                    className="font-bold text-purple-600 dark:text-purple-400 underline hover:text-purple-700 transition">
                    Create account
                  </button>
                </p>
              )}
              <p className="text-center text-xs text-gray-500 dark:text-gray-400 mt-4">© 2025 StudEx • Pan-Atlantic University Only</p>
            </div>
          </div>

          {/* ========== SIGNUP SIDE ========== */}
          <div className="absolute w-full h-full" style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", transform: "rotateY(180deg)" }}>
            <div className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-2xl rounded-3xl shadow-2xl p-8 border border-purple-100 dark:border-gray-700/30 h-full overflow-y-auto">
              <div className="text-center mb-6">
                <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-teal-500 to-purple-600 rounded-full flex items-center justify-center shadow-xl">
                  <Store className="w-12 h-12 text-white" />
                </div>
                <h1 className="text-3xl font-black bg-gradient-to-r from-teal-600 to-purple-600 bg-clip-text text-transparent mt-4">
                  {step === 1 ? "Create Account" : "Verify Phone"}
                </h1>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 font-medium">
                  {step === 1 ? "Join the PAU movement in 30 seconds" : "Enter the 6-digit code"}
                </p>
              </div>

              <form onSubmit={handleSignupSubmit} className="space-y-5">
                {step === 1 ? (
                  <>
                    <div>
                      <label className="text-sm font-bold text-purple-700 dark:text-purple-400 flex items-center gap-2 mb-2">
                        <User className="w-4 h-4" /> Username
                      </label>
                      <div className="relative">
                        <span className="absolute left-4 top-4 text-purple-500 font-bold text-lg">@</span>
                        <input type="text" name="username" value={signupForm.username} onChange={handleSignupChange}
                          placeholder="chinedu_tech"
                          className="w-full pl-12 pr-4 py-4 rounded-2xl border-2 border-purple-200 dark:border-gray-700 focus:border-purple-500 focus:outline-none transition-all text-lg font-medium bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400"
                          required disabled={isLoading} />
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-bold text-purple-700 dark:text-purple-400 flex items-center gap-2 mb-2">
                        <Mail className="w-4 h-4" /> Email Address
                      </label>
                      <input type="email" name="email" value={signupForm.email} onChange={handleSignupChange}
                        placeholder="you@pau.edu.ng"
                        className="w-full px-4 py-4 rounded-2xl border-2 border-purple-200 dark:border-gray-700 focus:border-purple-500 focus:outline-none transition-all text-lg font-medium bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400"
                        required disabled={isLoading} />
                    </div>
                    <div>
                      <label className="text-sm font-bold text-purple-700 dark:text-purple-400 flex items-center gap-2 mb-2">
                        <Phone className="w-4 h-4" /> Phone Number
                      </label>
                      <input type="tel" name="phone" value={signupForm.phone} onChange={handleSignupChange}
                        placeholder="08012345678"
                        className="w-full px-4 py-4 rounded-2xl border-2 border-purple-200 dark:border-gray-700 focus:border-purple-500 focus:outline-none transition-all text-lg font-medium bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400"
                        required disabled={isLoading} />
                    </div>
                    <div>
                      <label className="text-sm font-bold text-purple-700 dark:text-purple-400 flex items-center gap-2 mb-2">
                        <MapPin className="w-4 h-4" /> Hostel / Location
                      </label>
                      <select name="hostel" value={signupForm.hostel} onChange={handleSignupChange}
                        className="w-full px-4 py-4 rounded-2xl border-2 border-purple-200 dark:border-gray-700 focus:border-purple-500 focus:outline-none transition-all text-lg font-medium bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                        required disabled={isLoading}>
                        <option value="">Select your hostel</option>
                        {hostels.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-bold text-purple-700 dark:text-purple-400 flex items-center gap-2 mb-2">
                        <Lock className="w-4 h-4" /> Password
                      </label>
                      <div className="relative">
                        <input type={showPass ? "text" : "password"} name="password" value={signupForm.password} onChange={handleSignupChange}
                          placeholder="Create strong password"
                          className="w-full pr-12 pl-4 py-4 rounded-2xl border-2 border-purple-200 dark:border-gray-700 focus:border-purple-500 focus:outline-none transition-all text-lg font-medium bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400"
                          required disabled={isLoading} />
                        <button type="button" onClick={() => setShowPass(!showPass)}
                          className="absolute right-4 top-4 text-purple-500 hover:text-purple-700">
                          {showPass ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="space-y-8">
                    <div className="text-center p-6 bg-purple-50 dark:bg-purple-900/20 rounded-2xl border-2 border-purple-200 dark:border-purple-700">
                      <p className="text-sm font-bold text-purple-800 dark:text-purple-300">We sent a code to</p>
                      <p className="text-xl font-black text-purple-900 dark:text-purple-200 mt-1">{signupForm.phone}</p>
                    </div>
                    <input type="text" value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="000000"
                      className="w-full text-center text-5xl font-black tracking-widest py-8 rounded-2xl border-4 border-purple-300 dark:border-purple-700 focus:border-purple-600 focus:outline-none bg-purple-50 dark:bg-purple-900/20 text-gray-900 dark:text-white"
                      maxLength={6} required disabled={isLoading} />
                    <button type="button" onClick={generateOTP}
                      className="text-purple-600 dark:text-purple-400 font-bold underline text-sm w-full text-center" disabled={isLoading}>
                      Resend Code
                    </button>
                  </div>
                )}

                {message && (
                  <motion.p initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                    className={`text-center font-bold text-lg ${message.includes("Welcome") || message.includes("sent") ? "text-teal-600 dark:text-teal-400" : "text-red-600 dark:text-red-400"}`}>
                    {message}
                  </motion.p>
                )}

                <motion.button whileHover={{ scale: isLoading ? 1 : 1.02 }} whileTap={{ scale: isLoading ? 1 : 0.98 }}
                  type="submit" disabled={isLoading}
                  className="w-full py-5 rounded-2xl font-black text-white text-xl shadow-2xl bg-gradient-to-r from-teal-500 via-purple-500 to-purple-600 hover:from-teal-600 hover:to-purple-700 transition-all disabled:opacity-50">
                  {isLoading ? "Processing..." : step === 1 ? "Send Code" : "Complete Signup"}
                </motion.button>
              </form>

              <p className="text-center text-sm text-gray-600 dark:text-gray-400 mt-6 font-medium">
                Already have an account?{" "}
                <button type="button" onClick={flipToLogin}
                  className="font-black text-purple-600 dark:text-purple-400 underline hover:text-purple-800" disabled={isLoading}>
                  Login here
                </button>
              </p>
            </div>
          </div>

        </motion.div>
      </div>
    </div>
  );
}
