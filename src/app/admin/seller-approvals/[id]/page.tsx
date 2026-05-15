// src/app/admin/seller-approvals/[id]/page.tsx
"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Mail, Phone, Hash, Home, MessageCircle, Instagram, Store,
  CreditCard, FlipHorizontal, FileText, ExternalLink,
  Eye, ZoomIn, Check, X, Loader2, Calendar, User, AlertTriangle,
} from "lucide-react";
import AdminTopBar from "@/components/layout/AdminTopBar";
import { useParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { fetchWithAuth } from "@/lib/authStore";
import { GRAD } from "@/lib/tokens";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Application {
  id: number;
  status: "pending" | "approved" | "rejected";
  submitted_at: string;
  notes: string | null;
  business_age_confirmed: boolean;
  applicant_user_id: number;
  applicant_name: string;
  applicant_email: string;
  applicant_matric: string;
  applicant_phone: string;
  applicant_business_name: string;
  applicant_hostel: string;
  applicant_whatsapp: string;
  applicant_instagram: string;
  id_front_url: string | null;
  id_back_url: string | null;
  admission_letter_url: string | null;
  nin_document_url: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const IMAGE_EXTENSIONS = /\.(jpe?g|png|gif|webp|svg|bmp|avif|tiff?)(\?|$)/i;
const isPdf = (url: string) =>
  url.toLowerCase().includes(".pdf") ||
  (url.includes("res.cloudinary.com") && !IMAGE_EXTENSIONS.test(url));

// ─── Document preview modal ───────────────────────────────────────────────────

function DocModal({ url, label, onClose }: { url: string; label: string; onClose: () => void }) {
  const pdf = isPdf(url);
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.85, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          className="relative max-w-3xl w-full bg-white rounded-2xl overflow-hidden border border-stone-200 shadow-2xl"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between p-4 border-b border-stone-100">
            <p className="text-stone-900 font-bold text-base">{label}</p>
            <div className="flex items-center gap-2">
              <a href={url} target="_blank" rel="noopener noreferrer"
                className="p-2 rounded-xl bg-stone-100 hover:bg-stone-200 transition text-stone-700 flex items-center gap-1.5 text-sm">
                <ExternalLink className="w-4 h-4" /> Open
              </a>
              <button onClick={onClose}
                className="p-2 rounded-xl bg-stone-100 hover:bg-stone-200 transition text-stone-600">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="p-4">
            {pdf ? (
              <iframe
                src={`https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`}
                title={label} className="w-full rounded-2xl border border-white/10"
                style={{ height: "70vh" }}
              />
            ) : (
              <img src={url} alt={label}
                className="w-full rounded-2xl object-contain max-h-[70vh]"
                onError={e => { (e.target as HTMLImageElement).src = "https://via.placeholder.com/600x400?text=Not+Found"; }}
              />
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Row component ─────────────────────────────────────────────────────────────

function Row({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value?: string | null }) {
  if (!value) return null;
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

// ─── Doc card ──────────────────────────────────────────────────────────────────

function DocCard({ url, label, hint, onPreview }: {
  url: string | null; label: string; hint: string;
  onPreview: (url: string, label: string) => void;
}) {
  return (
    <div className="bg-stone-50 border border-stone-200 rounded-2xl overflow-hidden">
      {url ? (
        <>
          <div className="relative group">
            {isPdf(url) ? (
              <div className="w-full h-36 flex items-center justify-center bg-red-50">
                <FileText className="w-10 h-10 text-red-400" />
              </div>
            ) : (
              <img src={url} alt={label} className="w-full h-36 object-cover"
                onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
            )}
            <button
              onClick={() => onPreview(url, label)}
              className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100"
            >
              <div className="bg-white/80 p-2.5 rounded-full">
                <ZoomIn className="w-5 h-5 text-stone-700" />
              </div>
            </button>
          </div>
          <div className="p-3 flex items-center justify-between border-t border-stone-100">
            <div>
              <p className="font-semibold text-stone-900 text-xs">{label}</p>
              <p className="text-stone-400 text-xs">{hint}</p>
            </div>
            <button onClick={() => onPreview(url, label)}
              className="p-1.5 bg-stone-100 hover:bg-stone-200 rounded-lg transition">
              <Eye className="w-3.5 h-3.5 text-stone-600" />
            </button>
          </div>
        </>
      ) : (
        <div className="h-36 flex flex-col items-center justify-center gap-1">
          <FileText className="w-7 h-7 text-stone-300" />
          <p className="text-stone-400 text-xs">Not uploaded</p>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SellerApplicationDetail() {
  const { id } = useParams();
  const router = useRouter();
  const [app, setApp] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<{ url: string; label: string } | null>(null);

  useEffect(() => {
    if (!id) return;
    fetchWithAuth(`${API_URL}/api/auth/seller/applications/${id}/`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setApp(d))
      .catch(() => setApp(null))
      .finally(() => setLoading(false));
  }, [id]);

  const doAction = async (action: "approve" | "reject") => {
    if (!app) return;
    setActionLoading(true);
    setError("");
    try {
      const res = await fetchWithAuth(
        `${API_URL}/api/auth/seller/applications/${app.id}/${action}/`,
        {
          method: "POST",
          ...(action === "reject" ? { body: JSON.stringify({ notes: "Application rejected by admin." }) } : {}),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `${action} failed`);
      setApp(prev => prev ? { ...prev, status: action === "approve" ? "approved" : "rejected" } : prev);
    } catch (e: any) {
      setError(e.message || "Action failed");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FFF8F0] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-stone-200 border-t-teal-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!app) {
    return (
      <div className="min-h-screen bg-[#FFF8F0] flex flex-col items-center justify-center px-6 gap-4">
        <AlertTriangle className="w-12 h-12 text-stone-300" />
        <p className="text-stone-500 font-medium">Application not found</p>
        <button onClick={() => router.push("/admin/seller-approvals")}
          className="px-5 py-2.5 bg-white border border-stone-200 rounded-full text-stone-700 text-sm font-semibold">
          Back
        </button>
      </div>
    );
  }

  const initials = (app.applicant_business_name || app.applicant_name || "?").slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-[#FFF8F0]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      {preview && <DocModal url={preview.url} label={preview.label} onClose={() => setPreview(null)} />}

      <AdminTopBar title="Application Detail" back="/admin/seller-approvals" />

      <div className="px-4 pt-5 pb-28 max-w-2xl mx-auto space-y-4">

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-2xl text-sm font-medium flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError("")} className="underline text-red-500 ml-3">Dismiss</button>
          </div>
        )}

        {/* Header card */}
        <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-xl flex-shrink-0"
            style={{ background: GRAD }}>
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-stone-900 text-lg leading-tight">{app.applicant_name}</p>
            {app.applicant_business_name && (
              <p className="text-teal-600 text-sm font-medium">{app.applicant_business_name}</p>
            )}
            <p className="text-stone-500 text-sm truncate">{app.applicant_email}</p>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                app.status === "pending"  ? "bg-amber-100 text-amber-700" :
                app.status === "approved" ? "bg-teal-100 text-teal-700"   :
                                            "bg-red-100 text-red-600"
              }`}>
                {app.status.charAt(0).toUpperCase() + app.status.slice(1)}
              </span>
              {app.business_age_confirmed && (
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-stone-100 text-stone-600">
                  Age confirmed
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Personal info */}
        <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
          <p className="text-teal-600 text-xs tracking-[0.18em] uppercase font-semibold mb-3">Personal Info</p>
          <Row icon={Mail}           label="Email"         value={app.applicant_email} />
          <Row icon={Phone}          label="Phone"         value={app.applicant_phone} />
          <Row icon={Hash}           label="Matric Number" value={app.applicant_matric} />
          <Row icon={Home}           label="Hostel"        value={app.applicant_hostel} />
          <Row icon={Store}          label="Business Name" value={app.applicant_business_name} />
          <Row icon={MessageCircle}  label="WhatsApp"      value={app.applicant_whatsapp} />
          <Row icon={Instagram}      label="Instagram"     value={app.applicant_instagram} />
          <Row icon={Calendar}       label="Submitted"
            value={new Date(app.submitted_at).toLocaleDateString("en-NG", {
              year: "numeric", month: "long", day: "numeric",
            })} />
          {app.notes && (
            <Row icon={FileText} label="Admin Notes" value={app.notes} />
          )}
        </div>

        {/* Documents */}
        <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
          <p className="text-teal-600 text-xs tracking-[0.18em] uppercase font-semibold mb-3 flex items-center gap-1.5">
            <CreditCard className="w-3.5 h-3.5" /> Documents
          </p>
          <div className="grid grid-cols-2 gap-3">
            <DocCard url={app.id_front_url}         label="ID Card — Front"    hint="Name, photo, matric"       onPreview={(u, l) => setPreview({ url: u, label: l })} />
            <DocCard url={app.id_back_url}          label="ID Card — Back"     hint="Expiry, barcode, seal"     onPreview={(u, l) => setPreview({ url: u, label: l })} />
            <DocCard url={app.admission_letter_url} label="Admission Letter"   hint="Proof of enrollment"       onPreview={(u, l) => setPreview({ url: u, label: l })} />
            <DocCard url={app.nin_document_url}     label="NIN Document"       hint="National ID"               onPreview={(u, l) => setPreview({ url: u, label: l })} />
          </div>
        </div>

        {/* Actions */}
        {app.status === "pending" && (
          <div className="flex gap-3">
            <button
              onClick={() => doAction("approve")}
              disabled={actionLoading}
              className="flex-1 py-3.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 text-sm transition disabled:opacity-50"
            >
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" /> Approve</>}
            </button>
            <button
              onClick={() => doAction("reject")}
              disabled={actionLoading}
              className="flex-1 py-3.5 bg-red-100 hover:bg-red-200 text-red-700 font-bold rounded-xl flex items-center justify-center gap-2 text-sm transition disabled:opacity-50"
            >
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><X className="w-4 h-4" /> Reject</>}
            </button>
          </div>
        )}

        {app.status === "approved" && (
          <div className="bg-teal-50 border border-teal-200 rounded-2xl p-4 flex items-center justify-center gap-2">
            <Check className="w-4 h-4 text-teal-600" />
            <p className="text-teal-700 font-semibold text-sm">Approved — Seller is live</p>
          </div>
        )}

        {app.status === "rejected" && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-center">
            <p className="text-red-600 font-semibold text-sm flex items-center justify-center gap-2">
              <X className="w-4 h-4" /> Rejected
            </p>
            {app.notes && <p className="text-red-400 text-xs mt-1">{app.notes}</p>}
          </div>
        )}

        {/* Link to user profile */}
        {app.applicant_user_id && (
          <button
            onClick={() => router.push(`/admin/users/${app.applicant_user_id}`)}
            className="w-full py-3 bg-white border border-stone-200 hover:border-teal-300 rounded-2xl text-stone-700 text-sm font-semibold flex items-center justify-center gap-2 transition"
          >
            <User className="w-4 h-4" /> View Full User Profile
          </button>
        )}

      </div>
    </div>
  );
}
