"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Star, Sparkles, MapPin, Shield, BellRing, UserX, X as XIcon } from "lucide-react";
import TopNav from "@/components/layout/TopNav";
import Link from "next/link";
import { fetchWithAuth } from "@/lib/authStore";
import { GRAD, GRAD_TEXT, SERIF } from "@/lib/tokens";
import { useAdminMode } from "@/hooks/useAdminMode";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

function VerifiedTick() {
  return (
    <span
      className="inline-flex items-center justify-center w-4 h-4 rounded-full flex-shrink-0"
      style={{ background: "#10b981" }}
      title="Verified Vendor"
    >
      <svg viewBox="0 0 12 12" className="w-2.5 h-2.5" fill="none">
        <path d="M2.5 6L4.5 8.5L9.5 3.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function SafeImage({ src, alt, className }: { src: string | null | undefined; alt: string; className?: string }) {
  const [error, setError] = useState(false);
  if (!src || error || !src.startsWith("http")) {
    return (
      <div className={`w-full h-full bg-gradient-to-br from-teal-50 to-purple-50 flex items-center justify-center ${className || ""}`}>
        <Sparkles className="w-6 h-6 text-stone-300" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className={`w-full h-full object-cover ${className || ""}`}
      onError={() => setError(true)}
    />
  );
}

export default function VendorProfilePage() {
  const params = useParams();
  const router = useRouter();
  const username = params.username as string;
  const { isAdmin } = useAdminMode();
  const [vendor, setVendor] = useState<any>(null);
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adminLoading, setAdminLoading] = useState<string | null>(null);
  const [adminToast, setAdminToast] = useState("");
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [notifyTitle, setNotifyTitle] = useState("");
  const [notifyMessage, setNotifyMessage] = useState("");
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const showAdminToast = (msg: string) => {
    setAdminToast(msg);
    setTimeout(() => setAdminToast(""), 2500);
  };

  useEffect(() => {
    const load = async () => {
      try {
        const [vRes, lRes] = await Promise.all([
          fetch(`${API_URL}/api/auth/vendors/${username}/`),
          fetchWithAuth(`${API_URL}/api/services/listings/?vendor_username=${username}`),
        ]);
        if (vRes.ok) setVendor(await vRes.json());
        if (lRes.ok) {
          const d = await lRes.json();
          setListings(d.results || d || []);
        }
      } catch {}
      finally { setLoading(false); }
    };
    load();
  }, [username]);

  const handleRevokeVendor = async () => {
    if (!vendor?.id) return;
    if (!confirmRevoke) { setConfirmRevoke(true); return; }
    setAdminLoading("revoke");
    try {
      const res = await fetchWithAuth(`${API_URL}/api/admin/users/${vendor.id}/`, {
        method: "PATCH",
        body: JSON.stringify({ user_type: "student" }),
      });
      if (!res.ok) throw new Error("Failed to revoke vendor");
      showAdminToast("Vendor status revoked");
      setConfirmRevoke(false);
    } catch {
      showAdminToast("Failed to revoke vendor status");
    } finally {
      setAdminLoading(null);
    }
  };

  const handleSendNotification = async () => {
    if (!vendor?.id || !notifyTitle.trim() || !notifyMessage.trim()) return;
    setAdminLoading("notify");
    try {
      const res = await fetchWithAuth(`${API_URL}/api/admin/users/${vendor.id}/notify/`, {
        method: "POST",
        body: JSON.stringify({ title: notifyTitle.trim(), message: notifyMessage.trim() }),
      });
      if (!res.ok) throw new Error("Failed to send notification");
      showAdminToast("Notification sent!");
      setNotifyOpen(false);
      setNotifyTitle("");
      setNotifyMessage("");
    } catch {
      showAdminToast("Failed to send notification");
    } finally {
      setAdminLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F5F5] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-stone-200 border-t-teal-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F5F5]" style={{ fontFamily: "'DM Sans', sans-serif" }}>

      <TopNav showBack activeNav="vendors" />

      {/* Admin toast */}
      {adminToast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-purple-700 text-white px-6 py-3 rounded-full font-medium text-sm shadow-lg">
          {adminToast}
        </div>
      )}

      {/* Notify modal */}
      {notifyOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center p-4 pb-24">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="font-bold text-stone-900">Send Notification</p>
              <button onClick={() => setNotifyOpen(false)} className="p-1.5 rounded-full hover:bg-stone-100">
                <XIcon className="w-4 h-4 text-stone-500" />
              </button>
            </div>
            <input
              value={notifyTitle}
              onChange={e => setNotifyTitle(e.target.value)}
              placeholder="Title"
              className="w-full px-4 py-3 rounded-xl border border-stone-200 text-sm focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20"
            />
            <textarea
              value={notifyMessage}
              onChange={e => setNotifyMessage(e.target.value)}
              placeholder="Message"
              rows={3}
              className="w-full px-4 py-3 rounded-xl border border-stone-200 text-sm focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20 resize-none"
            />
            <button
              onClick={handleSendNotification}
              disabled={!!adminLoading || !notifyTitle.trim() || !notifyMessage.trim()}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 transition-all"
            >
              {adminLoading === "notify" ? "Sending..." : "Send"}
            </button>
          </div>
        </div>
      )}


      <div className="px-4 pt-6 pb-28 max-w-2xl mx-auto space-y-6">
        {/* Vendor profile card */}
        {vendor && (
          <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm flex items-center gap-4">
            <div
              className="w-16 h-16 rounded-full overflow-hidden flex-shrink-0"
              style={{ boxShadow: "0 0 0 3px #0b1a18" }}
            >
              {vendor.profile_picture ? (
                <img
                  src={vendor.profile_picture}
                  alt={vendor.username}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center text-white font-bold text-xl"
                  style={{ background: GRAD }}
                >
                  {(vendor.business_name || vendor.username || "?").slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>
            <div>
              <div className="flex items-center gap-1">
                <p className="font-bold text-stone-900">{vendor.business_name || vendor.username}</p>
                <VerifiedTick />
              </div>
              <p className="text-xs text-stone-400">@{vendor.username}</p>
              {vendor.vendor_badge && vendor.vendor_badge !== "none" && (
                <span className={`inline-flex items-center gap-0.5 mt-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${
                  vendor.vendor_badge === "top"
                    ? "bg-amber-50 text-amber-700 border-amber-200"
                    : vendor.vendor_badge === "trusted"
                    ? "bg-blue-50 text-blue-700 border-blue-200"
                    : "bg-purple-50 text-purple-700 border-purple-200"
                }`}>
                  {vendor.vendor_badge === "top" ? "🏆" : vendor.vendor_badge === "trusted" ? "✅" : "⭐"}
                  {" "}{vendor.vendor_badge === "top" ? "Top Vendor" : vendor.vendor_badge === "trusted" ? "Trusted Vendor" : "Rising Vendor"}
                </span>
              )}
              {vendor.total_reviews > 0 && (
                <div className="flex items-center gap-1 mt-1">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  <span className="text-xs text-stone-600 font-medium">{vendor.rating}</span>
                  <span className="text-xs text-stone-400">({vendor.total_reviews} reviews)</span>
                </div>
              )}
              {vendor.hostel && (
                <div className="flex items-center gap-1 mt-1">
                  <MapPin className="w-3 h-3 text-teal-500" />
                  <span className="text-xs text-stone-400">{vendor.hostel}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {!vendor && (
          <div className="bg-white border border-stone-100 rounded-2xl p-10 text-center">
            <Sparkles className="w-10 h-10 text-stone-200 mx-auto mb-3" />
            <p className="text-stone-400 text-sm">Vendor not found</p>
          </div>
        )}

        {/* Admin panel */}
        {isAdmin && vendor && (
          <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-purple-600" />
              <p className="text-purple-700 text-xs tracking-[0.2em] uppercase font-semibold">Admin Controls</p>
            </div>
            {/* Details */}
            <div className="text-xs text-stone-600 space-y-1">
              {vendor.email && <p><span className="font-medium text-stone-800">Email:</span> {vendor.email}</p>}
              {vendor.school && <p><span className="font-medium text-stone-800">School:</span> {vendor.school.toUpperCase()}</p>}
              {vendor.user_type && <p><span className="font-medium text-stone-800">Type:</span> {vendor.user_type}</p>}
              {vendor.is_active !== undefined && (
                <p><span className="font-medium text-stone-800">Account:</span>{" "}
                  <span className={vendor.is_active ? "text-teal-600" : "text-red-500"}>
                    {vendor.is_active ? "Active" : "Deactivated"}
                  </span>
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setNotifyOpen(true)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold bg-purple-100 text-purple-700 hover:bg-purple-200 transition-all"
              >
                <BellRing className="w-4 h-4" /> Notify
              </button>
              <button
                onClick={handleRevokeVendor}
                disabled={!!adminLoading}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 ${confirmRevoke ? "bg-red-500 text-white hover:bg-red-600" : "bg-red-100 text-red-700 hover:bg-red-200"}`}
              >
                <UserX className="w-4 h-4" />
                {adminLoading === "revoke" ? "Revoking..." : confirmRevoke ? "Confirm Revoke" : "Revoke Vendor"}
              </button>
            </div>
            {confirmRevoke && (
              <p className="text-xs text-red-500 text-center">Tap &quot;Confirm Revoke&quot; to remove vendor status</p>
            )}
          </div>
        )}

        {/* Listings */}
        <div>
          <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-semibold mb-3">Listings</p>
          {listings.length === 0 ? (
            <div className="bg-white border border-stone-100 rounded-2xl p-10 text-center">
              <Sparkles className="w-10 h-10 text-stone-200 mx-auto mb-3" />
              <p className="text-stone-400 text-sm">No listings yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {listings.map(listing => (
                <Link key={listing.id} href={`/listing/${listing.id}`}>
                  <div className="bg-white border border-stone-200 hover:border-teal-300 rounded-2xl overflow-hidden shadow-sm flex gap-3 p-3 transition-all active:scale-[0.98]">
                    <div className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0">
                      <SafeImage
                        src={listing.image?.startsWith("http") ? listing.image : null}
                        alt={listing.title}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-stone-900 text-sm line-clamp-1">{listing.title}</p>
                      <p className="text-xs text-stone-400 mt-0.5 line-clamp-2">{listing.description}</p>
                      <p className="text-base font-bold mt-1" style={GRAD_TEXT}>
                        ₦{Number(listing.price).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
