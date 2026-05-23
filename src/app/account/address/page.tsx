"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  User, Mail, Phone, BookOpen, Layers, School, Heart,
  ShoppingBag, Store, Edit3, CheckCircle2, Lock, Save,
  Camera, X, Cake, Users, Gift, MessageCircle,
  GraduationCap, Hash, MapPin,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useAuth, fetchWithAuth } from "@/lib/authStore";
import { useWishlistStore } from "@/lib/wishlistStore";
import { GRAD, SERIF } from "@/lib/tokens";
import TopNav from "@/components/layout/TopNav";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

const PAU_HOSTELS = [
  "Cedar", "Trezadel", "Trinity", "Pearl", "Redwood",
  "Cooperative Queens", "Queen Mary", "Aster Hall",
  "Cooperative Kings", "Pod", "Faith", "Amethyst", "Emerald", "EDC",
];

const FUTO_HOSTELS = [
  "Tetfund Boys", "Tetfund Girls", "NDDC Hostel",
  "Hostel A", "Hostel B", "Hostel C", "Hostel D", "Hostel E",
  "Umuchima", "PG Hostel", "Eziobodo", "Ihiagwa", "Off-Campus",
];

const NON_STUDENT_LOCATIONS = [
  "Umuchima", "Eziobodo", "Ihiagwa", "Off-Campus",
];

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
  matric_number: string;
  nin: string;
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
  const [bonusUsed, setBonusUsed] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [hostelSaving, setHostelSaving] = useState(false);
  const [hostelSaved, setHostelSaved] = useState(false);
  const [hostelError, setHostelError] = useState("");

  const [stats, setStats] = useState({ sold: 0, bought: 0, wishlist: 0 });
  const [memberSince, setMemberSince] = useState("");

  const [profile, setProfile] = useState<Profile>({
    name: "",
    email: "",
    phone: "",
    bio: "",
    whatsapp: "",
    department: "",
    level: "",
    school: "",
    campus: "",
    matric_number: "",
    nin: "",
    avatar: "",
    dob: "",
    gender: "",
  });

  const storageKey = user?.id ? `userProfileExtras_${user.id}` : null;

  const loadProfile = async () => {
    if (!user) return;
    const extras = storageKey ? localStorage.getItem(storageKey) : null;
    const parsed = extras ? JSON.parse(extras) : {};
    const getSchool = (email?: string) =>
      email?.endsWith('@pau.edu.ng') ? 'PAU' : email?.endsWith('@futo.edu.ng') ? 'FUTO' : '';
    try {
      const res = await fetchWithAuth(`${API_URL}/api/auth/me/`);
      if (res.ok) {
        const djangoUser = await res.json();
        const schoolFromEmail = getSchool(djangoUser.email);
        setProfile({
          name: djangoUser.username || "",
          email: djangoUser.email || "",
          phone: djangoUser.phone || "",
          bio: djangoUser.bio || "",
          whatsapp: djangoUser.whatsapp || "",
          department: parsed.department || "",
          level: parsed.level || "",
          school: djangoUser.school || schoolFromEmail,
          campus: djangoUser.hostel || "",
          matric_number: djangoUser.matric_number || "",
          nin: djangoUser.nin || "",
          avatar: parsed.avatar || "",
          dob: parsed.dob || "",
          gender: parsed.gender || "",
        });
        if (djangoUser.date_joined) {
          const d = new Date(djangoUser.date_joined);
          setMemberSince(d.toLocaleDateString("en-US", { month: "long", year: "numeric" }));
        }
        if (djangoUser.profile_bonus_eligible) setBonusGranted(true);
        if (djangoUser.profile_bonus_used) setBonusUsed(true);
        return;
      }
    } catch (e) {
      console.warn("Failed to load Django profile", e);
    }
    const schoolFromEmail = getSchool(user.email);
    setProfile({
      name: user.username || "",
      email: user.email || "",
      phone: "",
      bio: "",
      whatsapp: "",
      department: parsed.department || "",
      level: parsed.level || "",
      school: schoolFromEmail,
      campus: "",
      matric_number: "",
      nin: "",
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

    const localExtras = {
      department: profile.department,
      level: profile.level,
      campus: profile.campus,
      avatar: profile.avatar,
      dob: profile.dob,
      gender: profile.gender,
    };
    localStorage.setItem(storageKey, JSON.stringify(localExtras));

    try {
      const res = await fetchWithAuth(`${API_URL}/api/auth/profile/update/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username,
          phone: profile.phone,
          bio: profile.bio,
          whatsapp: profile.whatsapp,
          hostel: profile.campus,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
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

      await loadProfile();

    } catch (e) {
      console.warn("Django sync failed:", e);
      setSaveError("Network error. Please try again.");
      setSaving(false);
      return;
    }

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

  const handleHostelSave = async () => {
    if (!profile.campus) return;
    setHostelSaving(true);
    setHostelError("");
    setHostelSaved(false);
    try {
      const res = await fetchWithAuth(`${API_URL}/api/auth/profile/update/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostel: profile.campus }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setHostelError(err.detail || "Failed to update hostel.");
      } else {
        setHostelSaved(true);
        setTimeout(() => setHostelSaved(false), 3000);
      }
    } catch {
      setHostelError("Network error. Please try again.");
    } finally {
      setHostelSaving(false);
    }
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
    <div className="min-h-screen bg-[#FAF9F6]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <TopNav showBack backHref="/account" />

      <div className="px-4 pt-5 pb-32 space-y-6 max-w-2xl mx-auto">

        {savedMsg && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 text-center text-emerald-700 font-semibold text-sm animate-fadeUp">
            ✓ {savedMsg}
          </div>
        )}

        {saveError && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-3 text-center text-red-700 font-semibold text-sm animate-fadeUp">
            ⚠️ {saveError}
          </div>
        )}

        {completionPct < 100 && !bonusGranted && (
          <div className="text-white rounded-2xl p-5 shadow-lg animate-fadeUp"
            style={{ background: GRAD }}>
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Gift className="w-5 h-5" /> Complete Profile!
                </h3>
                <p className="text-sm opacity-90 mt-0.5">Earn 5% discount on first order</p>
              </div>
              <p className="text-4xl font-bold">{completionPct}%</p>
            </div>
            <div className="mt-3 bg-white/30 h-2.5 rounded-full overflow-hidden">
              <div className="h-full bg-white rounded-full transition-[width] duration-700 ease-out" style={{ width: `${completionPct}%` }} />
            </div>
            {missingFields.length > 0 && (
              <p className="text-xs text-white/80 mt-2">Missing: {missingFields.join(" • ")}</p>
            )}
          </div>
        )}

        {bonusGranted && !bonusUsed && completionPct === 100 && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center gap-3 animate-fadeUp">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0" />
            <div>
              <p className="font-semibold text-emerald-800 text-sm">Profile Complete!</p>
              <p className="text-xs text-emerald-700">5% discount active on your next order</p>
            </div>
          </div>
        )}

        {/* Avatar */}
        <div className="text-center">
          <div className="relative inline-block">
            <div className="w-28 h-28 rounded-full overflow-hidden bg-gradient-to-br from-teal-100 to-purple-100 shadow-xl border-4 border-white">
              {profile.avatar ? (
                <Image src={profile.avatar} alt="Profile" width={112} height={112} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-4xl font-bold text-teal-600">
                  {profile.name?.[0]?.toUpperCase() || "S"}
                </div>
              )}
            </div>
            {isEditing && (
              <label className="absolute bottom-0 right-0 bg-teal-600 text-white p-2.5 rounded-full cursor-pointer shadow-lg hover:bg-teal-700 transition">
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
          <h2 className="text-xl font-bold text-stone-900 mt-3">
            {profile.name || "Student"}
          </h2>
          <p className="text-sm text-stone-500 flex items-center justify-center gap-1 mt-1">
            {profile.school === "PAU" ? "Verified PAU Student" : profile.school === "FUTO" ? "Verified FUTO Student" : "StudEx Member"} <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </p>
        </div>

        {/* Personal Info */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-stone-200">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-semibold text-stone-900">Personal Information</h3>
            {!isEditing && (
              <button onClick={() => setIsEditing(true)}
                className="flex items-center gap-1.5 text-teal-600 bg-teal-50 px-3 py-1.5 rounded-xl text-sm font-semibold">
                <Edit3 className="w-4 h-4" /> Edit
              </button>
            )}
          </div>

          <div className="space-y-5">
            {fields.map(({ label, name, icon: Icon, type, options, editable, note, multiline, placeholder }) => (
              <div key={name} className="flex items-start gap-3">
                <div className="w-10 h-10 bg-teal-50 rounded-xl flex items-center justify-center flex-shrink-0 mt-1">
                  <Icon className="w-5 h-5 text-teal-600" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide">{label}</p>
                    {!editable && (
                      <span className="text-[10px] bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full font-semibold">
                        locked
                      </span>
                    )}
                  </div>

                  {isEditing ? (
                    <>
                      {type === "select" ? (
                        <select name={name} value={profile[name] || ""} onChange={handleChange}
                          className="w-full p-3 rounded-xl border-2 border-teal-400 bg-white text-stone-900 font-medium focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-200 transition">
                          <option value="">Select {label.toLowerCase()}</option>
                          {options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      ) : multiline ? (
                        <textarea name={name} value={profile[name] || ""} onChange={handleChange}
                          rows={3} placeholder={placeholder || `Enter ${label.toLowerCase()}`}
                          className="w-full p-3 rounded-xl border-2 border-teal-400 bg-white text-stone-900 font-medium focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-200 transition resize-none" />
                      ) : (
                        <input type={type || "text"} name={name} value={profile[name] || ""}
                          onChange={handleChange} readOnly={!editable}
                          placeholder={editable ? (placeholder || `Enter ${label.toLowerCase()}`) : ""}
                          className={`w-full p-3 rounded-xl border-2 font-medium focus:outline-none transition text-stone-900 ${
                            editable
                              ? "border-teal-400 bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-200"
                              : "border-stone-200 bg-stone-100 text-stone-400 cursor-not-allowed"
                          }`}
                        />
                      )}
                      {name === "name" && usernameError && (
                        <p className="text-xs text-red-500 mt-1.5">⚠️ {usernameError}</p>
                      )}
                      {note && !(name === "name" && usernameError) && (
                        <p className="text-xs text-amber-500 mt-1.5">ℹ️ {note}</p>
                      )}
                    </>
                  ) : (
                    <p className={`font-semibold text-base mt-0.5 ${
                      profile[name] ? "text-stone-900" : "text-stone-300 italic"
                    }`}>
                      {profile[name] || "Not set"}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Campus & Location */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-stone-200 space-y-5">
          <div>
            <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-semibold">Campus</p>
            <h3 className="text-base font-semibold text-stone-900 mt-0.5">My Location</h3>
          </div>

          {/* School — read-only badge */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-teal-50 rounded-xl flex items-center justify-center flex-shrink-0">
              <GraduationCap className="w-5 h-5 text-teal-600" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-1">Account Type</p>
              <div className="flex items-center gap-2 flex-wrap">
                {profile.school === "PAU" ? (
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-teal-100 text-teal-700">
                    Pan-Atlantic University
                  </span>
                ) : profile.school === "FUTO" ? (
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-700">
                    Federal University of Technology Owerri
                  </span>
                ) : (
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-stone-100 text-stone-600">
                    Non-Student
                  </span>
                )}
                <span className="text-xs text-stone-400 flex items-center gap-1">
                  <Lock className="w-3 h-3" /> permanent
                </span>
              </div>
            </div>
          </div>

          {/* Matric — read-only, FUTO students only */}
          {profile.school === "FUTO" && (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center flex-shrink-0">
                <Hash className="w-5 h-5 text-purple-600" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-1">Matric Number</p>
                <div className="flex items-center gap-2">
                  <p className={`font-semibold text-base ${profile.matric_number ? "text-stone-900" : "text-stone-400 italic"}`}>
                    {profile.matric_number || "Not set"}
                  </p>
                  <span className="text-xs text-stone-400 flex items-center gap-1">
                    <Lock className="w-3 h-3" /> permanent
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* NIN — read-only, non-students only */}
          {!profile.school && (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center flex-shrink-0">
                <Hash className="w-5 h-5 text-purple-600" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-1">NIN</p>
                <div className="flex items-center gap-2">
                  <p className={`font-semibold text-base ${profile.nin ? "text-stone-900" : "text-stone-400 italic"}`}>
                    {profile.nin || "Not set"}
                  </p>
                  <span className="text-xs text-stone-400 flex items-center gap-1">
                    <Lock className="w-3 h-3" /> permanent
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Hostel / Location — editable */}
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-teal-50 rounded-xl flex items-center justify-center flex-shrink-0 mt-1">
              <MapPin className="w-5 h-5 text-teal-600" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-1.5">
                {profile.school === "FUTO" ? "Hostel / Hall" : profile.school === "PAU" ? "Hostel / Location" : "Location"}
              </p>
              <select
                value={profile.campus}
                onChange={e => {
                  setProfile(prev => ({ ...prev, campus: e.target.value }));
                  setHostelSaved(false);
                  setHostelError("");
                }}
                className="w-full px-4 py-3 rounded-xl border-2 border-teal-400 bg-white text-stone-900 font-medium focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-200 transition text-sm appearance-none"
              >
                <option value="">
                  {profile.school === "FUTO" ? "Select your hostel" : profile.school === "PAU" ? "Select your hostel" : "Select your area"}
                </option>
                {(profile.school === "FUTO"
                  ? FUTO_HOSTELS
                  : profile.school === "PAU"
                  ? PAU_HOSTELS
                  : NON_STUDENT_LOCATIONS
                ).map(h => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>

              {hostelSaved && (
                <p className="text-xs text-teal-600 font-semibold mt-2 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> {profile.school ? "Hostel" : "Location"} updated!
                </p>
              )}
              {hostelError && (
                <p className="text-xs text-red-500 mt-2">{hostelError}</p>
              )}

              <button
                onClick={handleHostelSave}
                disabled={hostelSaving || !profile.campus}
                className="mt-3 w-full py-3 text-white rounded-full font-semibold text-sm shadow-md flex items-center justify-center gap-2 disabled:opacity-50 tap-scale"
                style={{ background: GRAD }}
              >
                <Save className="w-4 h-4" />
                {hostelSaving ? "Saving..." : profile.school ? "Update Hostel" : "Update Location"}
              </button>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: Store,       label: "Sold",     value: stats.sold,     from: "from-teal-50",   to: "to-emerald-50",  iconColor: "text-teal-600",   numColor: "text-teal-700" },
            { icon: ShoppingBag, label: "Bought",   value: stats.bought,   from: "from-purple-50", to: "to-indigo-50",   iconColor: "text-purple-600", numColor: "text-purple-700" },
            { icon: Heart,       label: "Wishlist", value: stats.wishlist, from: "from-pink-50",   to: "to-purple-50",   iconColor: "text-pink-600",   numColor: "text-pink-700" },
          ].map(({ icon: Icon, label, value, from, to, iconColor, numColor }) => (
            <div key={label}
              className={`bg-gradient-to-br ${from} ${to} rounded-2xl p-4 text-center shadow-sm border border-white hover:-translate-y-1 transition-transform`}>
              <Icon className={`w-7 h-7 ${iconColor} mx-auto mb-1`} />
              <p className={`text-xl font-bold ${numColor}`}>{value}</p>
              <p className="text-xs text-stone-600 font-medium">{label}</p>
            </div>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          {isEditing ? (
            <button onClick={saveProfile}
              disabled={saving || !!usernameError}
              className="w-full py-4 text-white rounded-full font-semibold text-lg shadow-lg flex items-center justify-center gap-2 disabled:opacity-70 tap-scale"
              style={{ background: GRAD }}>
              <Save className="w-5 h-5" />
              {saving ? "Saving..." : "Save Changes"}
            </button>
          ) : (
            <button onClick={() => setIsEditing(true)}
              className="w-full py-4 text-white rounded-full font-semibold text-lg shadow-lg flex items-center justify-center gap-2 tap-scale"
              style={{ background: GRAD }}>
              <Edit3 className="w-5 h-5" /> Edit Profile
            </button>
          )}

          {isEditing && (
            <button
              onClick={() => { setIsEditing(false); setSaveError(""); setUsernameError(""); loadProfile(); }}
              className="w-full py-3 bg-stone-100 text-stone-600 rounded-full font-semibold text-base flex items-center justify-center gap-2 tap-scale">
              Cancel
            </button>
          )}

          <Link href="/account/change-password">
            <button
              className="w-full py-4 bg-white text-red-600 rounded-full font-semibold text-lg shadow border-2 border-red-100 flex items-center justify-center gap-2 mt-2 tap-scale">
              <Lock className="w-5 h-5" /> Change Password
            </button>
          </Link>
        </div>

        <p className="text-center text-xs text-stone-400 mt-4">
          {memberSince ? `Member since ${memberSince} • ` : ""}{profile.school || "StudEx"} • Version 1.0.0
        </p>
      </div>
    </div>
  );
}
