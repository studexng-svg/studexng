"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  User, Mail, Phone, BookOpen, Layers, School, Heart,
  ShoppingBag, Store, Edit3, CheckCircle2, Lock, Save,
  ArrowLeft, Camera, X, Cake, Users, Gift, MessageCircle,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useAuth, fetchWithAuth } from "@/lib/authStore";
import { useWishlistStore } from "@/lib/wishlistStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

interface Profile {
  name: string;
  email: string;
  phone: string;
  bio: string;
  whatsapp: string;
  department: string;
  level: string;
  school: string;
  campus: string;
  avatar: string;
  dob: string;
  gender: string;
}

export default function ProfilePage() {
  const router = useRouter();
  const { user } = useAuth();
  const { wishlist } = useWishlistStore();
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [bonusGranted, setBonusGranted] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [usernameError, setUsernameError] = useState("");

  const [stats, setStats] = useState({ sold: 0, bought: 0, wishlist: 0 });

  const [profile, setProfile] = useState<Profile>({
    name: "",
    email: "",
    phone: "",
    bio: "",
    whatsapp: "",
    department: "",
    level: "",
    school: "Pan-Atlantic University",
    campus: "Lekki Campus",
    avatar: "",
    dob: "",
    gender: "",
  });

  const storageKey = user?.id ? `userProfileExtras_${user.id}` : null;

  // ── Load profile from Django + localStorage ───────────────────────────────
  const loadProfile = async () => {
    if (!user) return;
    const extras = storageKey ? localStorage.getItem(storageKey) : null;
    const parsed = extras ? JSON.parse(extras) : {};
    try {
      const res = await fetchWithAuth(`${API_URL}/api/auth/me/`);
      if (res.ok) {
        const djangoUser = await res.json();
        setProfile({
          name: djangoUser.username || "",
          email: djangoUser.email || "",
          phone: djangoUser.phone || "",
          bio: djangoUser.bio || "",
          whatsapp: djangoUser.whatsapp || "",
          department: parsed.department || "",
          level: parsed.level || "",
          school: "Pan-Atlantic University",
          campus: parsed.campus || "Lekki Campus",
          avatar: parsed.avatar || "",
          dob: parsed.dob || "",
          gender: parsed.gender || "",
        });
        if (djangoUser.profile_bonus_eligible || djangoUser.profile_bonus_used) {
          setBonusGranted(true);
        }
        return;
      }
    } catch (e) {
      console.warn("Failed to load Django profile", e);
    }
    // Fallback
    setProfile({
      name: user.username || "",
      email: user.email || "",
      phone: "",
      bio: "",
      whatsapp: "",
      department: parsed.department || "",
      level: parsed.level || "",
      school: "Pan-Atlantic University",
      campus: parsed.campus || "Lekki Campus",
      avatar: parsed.avatar || "",
      dob: parsed.dob || "",
      gender: parsed.gender || "",
    });
  };

  useEffect(() => {
    if (user) loadProfile();
  }, [user, storageKey]);

  useEffect(() => {
    if (!user) return;
    const loadStats = async () => {
      try {
        const res = await fetchWithAuth(`${API_URL}/api/orders/orders/`);
        if (!res.ok) return;
        const data = await res.json();
        const orders = Array.isArray(data) ? data : (data.results || []);
        const bought = orders.filter(
          (o: any) =>
            o.buyer === user.username ||
            o.buyer?.username === user.username ||
            o.buyer_username === user.username
        ).length;
        const sold = orders.filter(
          (o: any) =>
            (o.listing?.vendor?.username === user.username ||
              o.listing?.vendor === user.username) &&
            !["pending", "cancelled"].includes(o.status)
        ).length;
        setStats(prev => ({ ...prev, sold, bought }));
      } catch {}
    };
    loadStats();
  }, [user]);

  useEffect(() => {
    setStats(prev => ({ ...prev, wishlist: wishlist.length }));
  }, [wishlist]);

  const completionFields = [
    { key: "name",       label: "Username" },
    { key: "phone",      label: "Phone Number" },
    { key: "bio",        label: "Bio" },
    { key: "whatsapp",   label: "WhatsApp" },
    { key: "dob",        label: "Date of Birth" },
    { key: "gender",     label: "Gender" },
    { key: "department", label: "Department" },
    { key: "level",      label: "Level" },
  ];
  const completedCount = completionFields.filter(f => !!profile[f.key as keyof Profile]).length;
  const completionPct = Math.round((completedCount / completionFields.length) * 100);
  const missingFields = completionFields.filter(f => !profile[f.key as keyof Profile]).map(f => f.label);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    if (name === "email") return;
    if (name === "name") {
      if (value && !/^[a-zA-Z0-9_]*$/.test(value)) {
        setUsernameError("Only letters, numbers, and underscores allowed.");
      } else {
        setUsernameError("");
      }
    }
    setProfile(prev => ({ ...prev, [name]: value }));
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setProfile(prev => ({ ...prev, avatar: reader.result as string }));
    reader.readAsDataURL(file);
  };

  // ── Save profile ──────────────────────────────────────────────────────────
  const saveProfile = async () => {
    if (!storageKey) return;
    if (usernameError) return;

    const username = profile.name.trim();
    if (!username) {
      setSaveError("Username cannot be empty.");
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      setSaveError("Username can only contain letters, numbers, and underscores.");
      return;
    }

    setSaving(true);
    setSaveError("");

    // 1. Save local extras
    const localExtras = {
      department: profile.department,
      level: profile.level,
      campus: profile.campus,
      avatar: profile.avatar,
      dob: profile.dob,
      gender: profile.gender,
    };
    localStorage.setItem(storageKey, JSON.stringify(localExtras));

    // 2. PATCH Django — include username + all other fields
    try {
      const res = await fetchWithAuth(`${API_URL}/api/auth/profile/update/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username,          // ✅ send username so backend saves it
          phone: profile.phone,
          bio: profile.bio,
          whatsapp: profile.whatsapp,
          hostel: profile.campus,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        // Show specific username error if returned
        const usernameMsg = err?.username?.[0] || err?.error || "";
        if (usernameMsg.toLowerCase().includes("already") || usernameMsg.toLowerCase().includes("exist")) {
          setSaveError("That username is already taken. Choose another.");
        } else if (usernameMsg) {
          setSaveError(usernameMsg);
        } else {
          setSaveError("Some fields failed to save. Please try again.");
        }
        setSaving(false);
        return;
      }

      // 3. ✅ Re-fetch from server so profile reflects what was actually saved
      await loadProfile();

    } catch (e) {
      console.warn("Django sync failed:", e);
      setSaveError("Network error. Please try again.");
      setSaving(false);
      return;
    }

    // 4. Check profile completion bonus
    const nowComplete = completionFields.every(f => !!profile[f.key as keyof Profile]);
    if (nowComplete && !bonusGranted) {
      try {
        const res = await fetchWithAuth(`${API_URL}/api/auth/profile/check-completion/`, { method: "POST" });
        if (res.ok) {
          const data = await res.json();
          if (data.bonus) setBonusGranted(true);
        }
      } catch {}
    }

    setSaving(false);
    setIsEditing(false);
    setUsernameError("");
    setSavedMsg(
      nowComplete && !bonusGranted
        ? "Profile complete! You earned 5% off your first order 🎉"
        : "Profile saved!"
    );
    setTimeout(() => setSavedMsg(""), 4000);
  };

  const fields: {
    label: string;
    name: keyof Profile;
    icon: any;
    type?: string;
    options?: string[];
    editable: boolean;
    note?: string;
    multiline?: boolean;
    placeholder?: string;
  }[] = [
    {
      label: "Username", name: "name", icon: User, editable: true,
      placeholder: "e.g. jane_doe123",
      note: "Letters, numbers and underscores only. No spaces.",
    },
    {
      label: "Student Email", name: "email", icon: Mail, editable: false,
      note: "Email is tied to your account and cannot be changed here.",
    },
    { label: "Phone Number",  name: "phone",    icon: Phone,         editable: true },
    { label: "WhatsApp",      name: "whatsapp", icon: MessageCircle, editable: true },
    { label: "Bio",           name: "bio",       icon: User,          editable: true, multiline: true },
    { label: "Date of Birth", name: "dob",       icon: Cake,          type: "date", editable: true },
    { label: "Gender",        name: "gender",    icon: Users,         type: "select",
      options: ["Male", "Female", "Prefer not to say"], editable: true },
    { label: "Department",    name: "department", icon: BookOpen, editable: true },
    { label: "Level",         name: "level",      icon: Layers,  editable: true },
  ];

  return (
    <>
      <motion.div
        initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        className="sticky top-0 bg-white dark:bg-gray-900 backdrop-blur-xl z-40 border-b border-gray-200 dark:border-gray-800 shadow-sm"
      >
        <div className="flex items-center justify-between p-4">
          <button onClick={() => router.back()}
            className="text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 p-2 rounded-full transition">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-xl font-black bg-gradient-to-r from-purple-600 to-teal-500 bg-clip-text text-transparent">
            My Profile
          </h1>
          <div className="w-10" />
        </div>
      </motion.div>

      <div className="p-5 pb-32 space-y-6 bg-gray-50 dark:bg-gray-950 min-h-screen">

        {savedMsg && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            className="bg-green-50 border border-green-300 rounded-2xl p-3 text-center text-green-700 font-bold text-sm">
            ✓ {savedMsg}
          </motion.div>
        )}

        {saveError && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            className="bg-red-50 border border-red-300 rounded-2xl p-3 text-center text-red-700 font-bold text-sm">
            ⚠️ {saveError}
          </motion.div>
        )}

        {completionPct < 100 && !bonusGranted && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-r from-purple-600 to-teal-500 text-white rounded-2xl p-5 shadow-lg">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-black flex items-center gap-2">
                  <Gift className="w-5 h-5" /> Complete Profile!
                </h3>
                <p className="text-sm opacity-90 mt-0.5">Earn 5% discount on first order</p>
              </div>
              <p className="text-4xl font-black">{completionPct}%</p>
            </div>
            <div className="mt-3 bg-white/30 h-2.5 rounded-full overflow-hidden">
              <motion.div initial={{ width: 0 }} animate={{ width: `${completionPct}%` }}
                transition={{ duration: 0.8 }} className="h-full bg-white rounded-full" />
            </div>
            {missingFields.length > 0 && (
              <p className="text-xs text-white/80 mt-2">Missing: {missingFields.join(" • ")}</p>
            )}
          </motion.div>
        )}

        {bonusGranted && completionPct === 100 && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-2xl p-4 flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0" />
            <div>
              <p className="font-bold text-green-800 dark:text-green-300 text-sm">Profile Complete!</p>
              <p className="text-xs text-green-700 dark:text-green-400">5% discount applied to your first order</p>
            </div>
          </motion.div>
        )}

        {/* Avatar */}
        <div className="text-center">
          <div className="relative inline-block">
            <div className="w-28 h-28 rounded-full overflow-hidden bg-gradient-to-br from-purple-100 to-teal-100 shadow-xl border-4 border-white dark:border-gray-800">
              {profile.avatar ? (
                <Image src={profile.avatar} alt="Profile" width={112} height={112} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-4xl font-black text-purple-600">
                  {profile.name?.[0]?.toUpperCase() || "S"}
                </div>
              )}
            </div>
            {isEditing && (
              <label className="absolute bottom-0 right-0 bg-purple-600 text-white p-2.5 rounded-full cursor-pointer shadow-lg hover:bg-purple-700 transition">
                <Camera className="w-4 h-4" />
                <input type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
              </label>
            )}
            {profile.avatar && isEditing && (
              <button onClick={() => setProfile(p => ({ ...p, avatar: "" }))}
                className="absolute top-0 right-0 bg-red-500 text-white p-1.5 rounded-full shadow-lg">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <h2 className="text-xl font-black text-gray-900 dark:text-white mt-3">
            {profile.name || "Student"}
          </h2>
          <p className="text-sm text-gray-500 flex items-center justify-center gap-1 mt-1">
            Verified PAU Student <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </p>
        </div>

        {/* Personal Info */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-black text-gray-900 dark:text-white">Personal Information</h3>
            {!isEditing && (
              <button onClick={() => setIsEditing(true)}
                className="flex items-center gap-1.5 text-purple-600 bg-purple-50 dark:bg-purple-900/30 px-3 py-1.5 rounded-xl text-sm font-bold">
                <Edit3 className="w-4 h-4" /> Edit
              </button>
            )}
          </div>

          <div className="space-y-5">
            {fields.map(({ label, name, icon: Icon, type, options, editable, note, multiline, placeholder }) => (
              <div key={name} className="flex items-start gap-3">
                <div className="w-10 h-10 bg-purple-50 dark:bg-purple-900/30 rounded-xl flex items-center justify-center flex-shrink-0 mt-1">
                  <Icon className="w-5 h-5 text-purple-600" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</p>
                    {!editable && (
                      <span className="text-[10px] bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded-full font-semibold">
                        locked
                      </span>
                    )}
                  </div>

                  {isEditing ? (
                    <>
                      {type === "select" ? (
                        <select name={name} value={profile[name] || ""} onChange={handleChange}
                          className="w-full p-3 rounded-xl border-2 border-purple-400 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-medium focus:outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-200 transition">
                          <option value="">Select {label.toLowerCase()}</option>
                          {options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      ) : multiline ? (
                        <textarea name={name} value={profile[name] || ""} onChange={handleChange}
                          rows={3} placeholder={placeholder || `Enter ${label.toLowerCase()}`}
                          className="w-full p-3 rounded-xl border-2 border-purple-400 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-medium focus:outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-200 transition resize-none" />
                      ) : (
                        <input type={type || "text"} name={name} value={profile[name] || ""}
                          onChange={handleChange} readOnly={!editable}
                          placeholder={editable ? (placeholder || `Enter ${label.toLowerCase()}`) : ""}
                          className={`w-full p-3 rounded-xl border-2 font-medium focus:outline-none transition text-gray-900 dark:text-white ${
                            editable
                              ? "border-purple-400 bg-white dark:bg-gray-800 focus:border-purple-600 focus:ring-2 focus:ring-purple-200"
                              : "border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-not-allowed"
                          }`}
                        />
                      )}
                      {/* Username-specific validation error */}
                      {name === "name" && usernameError && (
                        <p className="text-xs text-red-500 mt-1.5">⚠️ {usernameError}</p>
                      )}
                      {note && !(name === "name" && usernameError) && (
                        <p className="text-xs text-amber-500 mt-1.5">ℹ️ {note}</p>
                      )}
                    </>
                  ) : (
                    <p className={`font-bold text-base mt-0.5 ${
                      profile[name] ? "text-gray-900 dark:text-white" : "text-gray-300 dark:text-gray-600 italic"
                    }`}>
                      {profile[name] || "Not set"}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* School Details */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-gray-200 dark:border-gray-800">
          <h3 className="text-base font-black text-gray-900 dark:text-white mb-4">Student Details</h3>
          {[
            { icon: School, label: "School", value: "Pan-Atlantic University" },
            { icon: Layers, label: "Campus", value: profile.campus },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex items-center gap-3 mb-3 last:mb-0">
              <div className="w-10 h-10 bg-teal-50 dark:bg-teal-900/20 rounded-xl flex items-center justify-center">
                <Icon className="w-5 h-5 text-teal-600" />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</p>
                <p className="font-bold text-gray-900 dark:text-white">{value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: Store,       label: "Sold",     value: stats.sold,     from: "from-purple-50", to: "to-indigo-50",   iconColor: "text-purple-600", numColor: "text-purple-700" },
            { icon: ShoppingBag, label: "Bought",   value: stats.bought,   from: "from-teal-50",   to: "to-emerald-50",  iconColor: "text-teal-600",   numColor: "text-teal-700" },
            { icon: Heart,       label: "Wishlist", value: stats.wishlist, from: "from-pink-50",   to: "to-purple-50",   iconColor: "text-pink-600",   numColor: "text-pink-700" },
          ].map(({ icon: Icon, label, value, from, to, iconColor, numColor }) => (
            <motion.div key={label} whileHover={{ y: -3 }}
              className={`bg-gradient-to-br ${from} ${to} rounded-2xl p-4 text-center shadow-sm border border-white`}>
              <Icon className={`w-7 h-7 ${iconColor} mx-auto mb-1`} />
              <p className={`text-xl font-black ${numColor}`}>{value}</p>
              <p className="text-xs text-gray-600 font-medium">{label}</p>
            </motion.div>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          {isEditing ? (
            <motion.button whileTap={{ scale: 0.98 }} onClick={saveProfile}
              disabled={saving || !!usernameError}
              className="w-full py-4 bg-gradient-to-r from-teal-500 to-emerald-500 text-white rounded-2xl font-black text-lg shadow-lg flex items-center justify-center gap-2 disabled:opacity-70">
              <Save className="w-5 h-5" />
              {saving ? "Saving..." : "Save Changes"}
            </motion.button>
          ) : (
            <motion.button whileTap={{ scale: 0.98 }} onClick={() => setIsEditing(true)}
              className="w-full py-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-2xl font-black text-lg shadow-lg flex items-center justify-center gap-2">
              <Edit3 className="w-5 h-5" /> Edit Profile
            </motion.button>
          )}

          {isEditing && (
            <motion.button whileTap={{ scale: 0.98 }}
              onClick={() => { setIsEditing(false); setSaveError(""); setUsernameError(""); loadProfile(); }}
              className="w-full py-3 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-2xl font-bold text-base flex items-center justify-center gap-2">
              Cancel
            </motion.button>
          )}

          <Link href="/account/change-password">
            <motion.button whileTap={{ scale: 0.98 }}
              className="w-full py-4 bg-white dark:bg-gray-800 text-red-600 rounded-2xl font-black text-lg shadow border-2 border-red-100 dark:border-red-900 flex items-center justify-center gap-2 mt-2">
              <Lock className="w-5 h-5" /> Change Password
            </motion.button>
          </Link>
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          Member since 2025 • Campus: PAU • Version 1.0.0
        </p>
      </div>
    </>
  );
}
