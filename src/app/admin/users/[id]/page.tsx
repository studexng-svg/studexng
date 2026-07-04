// src/app/admin/users/[id]/page.tsx
"use client";

import {
  Mail, Phone, ShieldCheck, User, Ban, AlertTriangle, Users,
  Store, Hash, Home, MessageCircle, Instagram, Star,
  ShoppingBag, Wallet, Calendar, BadgeCheck, Shield, Clock, Truck,
} from "lucide-react";
import AdminTopBar from "@/components/layout/AdminTopBar";
import { useParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";

function relativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function activityLabel(lastSeen: string | null | undefined): string {
  if (!lastSeen) return "Never";
  const mins = Math.floor((Date.now() - new Date(lastSeen).getTime()) / 60000);
  if (mins < 3) return "🟢 Online now";
  return `Last seen ${relativeTime(lastSeen)} · ${new Date(lastSeen).toLocaleDateString("en-NG", { year: "numeric", month: "short", day: "numeric" })}`;
}

function Row({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value?: string | number | null }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-stone-100 last:border-0">
      <Icon className="w-4 h-4 text-stone-400 mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-stone-400">{label}</p>
        <p className="text-sm font-semibold text-stone-900 break-words">{value}</p>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
      <p className="text-teal-600 text-xs tracking-[0.18em] uppercase font-semibold mb-3">{title}</p>
      {children}
    </div>
  );
}

export default function AdminUserDetail() {
  const { id } = useParams();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    api.admin.user(id as string)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setUser(d))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, [id]);

  const patch = async (body: object) => {
    setActionLoading(true);
    setError("");
    try {
      const res = await api.admin.updateUser(id as string, body as Record<string, unknown>);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setUser(data);
    } catch (e: any) {
      setError(e.message || "Action failed");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F5F5] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-stone-200 border-t-teal-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#F5F5F5] flex flex-col items-center justify-center px-6 gap-4">
        <Users className="w-12 h-12 text-stone-300" />
        <p className="text-stone-500 font-medium">User not found</p>
        <button onClick={() => router.push("/admin/users")}
          className="px-5 py-2.5 bg-white border border-stone-200 rounded-full text-stone-700 text-sm font-semibold">
          Back to Users
        </button>
      </div>
    );
  }

  const isVendor = user.user_type === "vendor";
  const isRider = user.user_type === "rider";
  const p = user.profile || {};
  const initials = (user.business_name || user.username || "?").slice(0, 2).toUpperCase();

  const handleRiderToggle = async () => {
    setActionLoading(true);
    setError("");
    try {
      const res = isRider
        ? await api.admin.removeRider(id as string)
        : await api.admin.makeRider(id as string);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setUser(data);
    } catch (e: any) {
      setError(e.message || "Action failed");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F5F5]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <AdminTopBar title="User Detail" back="/admin/users" />

      <div className="px-6 pt-5 pb-28 space-y-4">

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-2xl text-sm font-medium flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError("")} className="underline text-red-500 ml-3">Dismiss</button>
          </div>
        )}

        {/* Avatar + name card */}
        <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm flex items-center gap-4">
          {user.profile_picture ? (
            <img src={user.profile_picture} alt={user.username}
              className="w-16 h-16 rounded-full object-cover flex-shrink-0 ring-2 ring-white shadow-md" />
          ) : (
            <div className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-xl flex-shrink-0"
              style={{ background: "#7C3AED" }}>
              {initials}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-bold text-stone-900 text-lg leading-tight">{user.username}</p>
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                isVendor ? "bg-teal-100 text-teal-700"
                : isRider ? "bg-blue-100 text-blue-700"
                : "bg-stone-100 text-stone-600"
              }`}>
                {isVendor ? "Vendor" : isRider ? "Rider" : "Student"}
              </span>
              {user.is_staff && (
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-700">Staff</span>
              )}
              {user.is_superuser && (
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">Superuser</span>
              )}
            </div>
            <p className="text-stone-500 text-sm mt-0.5 truncate">{user.email}</p>
            <div className="flex items-center gap-3 mt-1.5">
              <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                user.is_active ? "bg-teal-50 text-teal-700" : "bg-red-50 text-red-600"
              }`}>
                {user.is_active ? "Active" : "Inactive"}
              </span>
              {isVendor && (
                <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                  p.is_verified_vendor ? "bg-teal-50 text-teal-700" : "bg-amber-50 text-amber-700"
                }`}>
                  {p.is_verified_vendor
                    ? <><ShieldCheck className="w-3 h-3" /> Verified</>
                    : <><AlertTriangle className="w-3 h-3" /> Unverified</>}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Personal info */}
        <Section title="Personal Info">
          <Row icon={Mail}    label="Email"              value={user.email} />
          <Row icon={Phone}   label="Phone"              value={user.phone} />
          <Row icon={User}    label="Username"           value={user.username} />
          <Row icon={Shield}  label="Verification Type"  value={user.verification_type === "nin" ? "NIN" : user.verification_type === "matric" ? "Matric Number" : user.verification_type} />
          <Row icon={Hash}    label="Matric Number"      value={user.matric_number} />
          <Row icon={BadgeCheck} label="NIN"             value={user.nin} />
          <Row icon={Home}    label="Hostel"             value={user.hostel} />
          <Row icon={Calendar} label="Date Joined"
            value={new Date(user.date_joined).toLocaleDateString("en-NG", {
              year: "numeric", month: "long", day: "numeric",
            })} />
          <Row icon={Clock} label="Activity" value={activityLabel(user.last_seen)} />
        </Section>

        {/* Account info */}
        <Section title="Account">
          <Row icon={Wallet}    label="Wallet Balance" value={user.wallet_balance ? `₦${parseFloat(user.wallet_balance).toLocaleString()}` : "₦0"} />
          <Row icon={Shield}    label="Staff Access"   value={user.is_staff ? "Yes — can access admin" : "No"} />
          <Row icon={BadgeCheck} label="Superuser"     value={user.is_superuser ? "Yes" : "No"} />
        </Section>

        {/* Vendor info */}
        {isVendor && (
          <Section title="Vendor Info">
            <Row icon={Store}          label="Business Name"    value={user.business_name} />
            <Row icon={MessageCircle}  label="WhatsApp"         value={p.whatsapp} />
            <Row icon={Instagram}      label="Instagram"        value={p.instagram} />
            <Row icon={Star}           label="Rating"           value={p.rating ? `${p.rating} / 5` : null} />
            <Row icon={ShoppingBag}    label="Total Orders"     value={p.total_orders} />
            <Row icon={Users}          label="Total Reviews"    value={p.total_reviews} />
            <Row icon={Wallet}         label="On-Platform Sales" value={p.on_platform_sales ? `₦${parseFloat(p.on_platform_sales).toLocaleString()}` : null} />
            <Row icon={BadgeCheck}     label="Vendor Badge"     value={p.vendor_badge} />
          </Section>
        )}

        {/* Actions */}
        <Section title="Actions">
          <button
            onClick={handleRiderToggle}
            disabled={actionLoading}
            className={`w-full py-3.5 mb-2 font-semibold rounded-xl flex items-center justify-center gap-2 text-sm transition disabled:opacity-50 ${
              isRider
                ? "bg-red-50 text-red-600 hover:bg-red-100"
                : "bg-blue-50 text-blue-700 hover:bg-blue-100"
            }`}
          >
            <Truck className="w-4 h-4" />
            {actionLoading ? "Saving…" : isRider ? "Remove Rider Role" : "Make Rider"}
          </button>
          {isVendor && !p.is_verified_vendor && (
            <button
              onClick={() => patch({ profile: { is_verified_vendor: true } })}
              disabled={actionLoading}
              className="w-full py-3.5 mb-2 text-white font-semibold rounded-xl flex items-center justify-center gap-2 text-sm transition hover:opacity-90 disabled:opacity-50"
              style={{ background: "#0D9488" }}
            >
              <ShieldCheck className="w-4 h-4" />
              {actionLoading ? "Saving…" : "Verify Vendor"}
            </button>
          )}
          <button
            onClick={() => patch({ is_active: !user.is_active })}
            disabled={actionLoading}
            className={`w-full py-3.5 font-semibold rounded-xl flex items-center justify-center gap-2 text-sm transition disabled:opacity-50 ${
              user.is_active
                ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                : "bg-teal-100 text-teal-700 hover:bg-teal-200"
            }`}
          >
            <Ban className="w-4 h-4" />
            {actionLoading ? "Saving…" : user.is_active ? "Deactivate User" : "Activate User"}
          </button>
        </Section>

      </div>
    </div>
  );
}
