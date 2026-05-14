"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Check, X, Eye, Calendar, Clock,
  CreditCard, FlipHorizontal, ZoomIn, Loader2, RefreshCw, FileText, ExternalLink,
} from "lucide-react";
import AdminTopBar from "@/components/layout/AdminTopBar";
import { useState, useEffect, useCallback } from "react";
import { fetchWithAuth } from "@/lib/authStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Application {
  id: number;
  applicant_name: string;
  applicant_email: string;
  applicant_matric: string;
  submitted_at: string;
  status: "pending" | "approved" | "rejected";
  id_front_url: string | null;
  id_back_url: string | null;
  admission_letter_url: string | null;
  notes: string | null;
}

const IMAGE_EXTENSIONS = /\.(jpe?g|png|gif|webp|svg|bmp|avif|tiff?)(\?|$)/i;

const isPdf = (url: string) => {
  if (url.toLowerCase().includes('.pdf')) return true;
  // django-cloudinary-storage (MediaCloudinaryStorage) strips extensions from PDFs.
  // A Cloudinary URL with no recognizable image extension is a non-image document.
  if (url.includes('res.cloudinary.com') && !IMAGE_EXTENSIONS.test(url)) return true;
  return false;
};

// ─── Image Preview Modal ───────────────────────────────────────────────────────

function DocumentPreviewModal({
  url, label, onClose,
}: {
  url: string; label: string; onClose: () => void;
}) {
  const pdf = isPdf(url);
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.85, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          className="relative max-w-3xl w-full bg-white rounded-2xl overflow-hidden border border-stone-200 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between p-4 border-b border-stone-100">
            <p className="text-stone-900 font-bold text-base">{label}</p>
            <div className="flex items-center gap-2">
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-xl bg-stone-100 hover:bg-stone-200 transition text-stone-700 flex items-center gap-1.5 text-sm"
              >
                <ExternalLink className="w-4 h-4" /> Open
              </a>
              <button
                onClick={onClose}
                className="p-2 rounded-xl bg-stone-100 hover:bg-stone-200 transition text-stone-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="p-4">
            {pdf ? (
              <iframe
                src={`https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`}
                title={label}
                className="w-full rounded-2xl border border-white/10"
                style={{ height: "70vh" }}
              />
            ) : (
              <img
                src={url}
                alt={label}
                className="w-full rounded-2xl object-contain max-h-[70vh]"
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    "https://via.placeholder.com/600x400?text=Image+Not+Found";
                }}
              />
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

function AdminSellerApprovals() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [previewImage, setPreviewImage] = useState<{ url: string; label: string } | null>(null);
  const [mounted, setMounted] = useState(false);

  // ── Fetch all applications from backend ──
  const fetchApplications = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchWithAuth(`${API_URL}/api/auth/seller/applications/`);
      if (!res.ok) throw new Error("Failed to fetch applications");
      const data = await res.json();
      setApplications(Array.isArray(data) ? data : data.results || []);
    } catch (err: any) {
      setError(err.message || "Could not load applications. Try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    fetchApplications();
  }, [fetchApplications]);

  // ── Approve ──
  const approve = async (app: Application) => {
    setActionLoading(app.id);
    setError("");
    try {
      const res = await fetchWithAuth(
        `${API_URL}/api/auth/seller/applications/${app.id}/approve/`,
        { method: "POST" }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Approval failed");
      }

      setApplications((prev) =>
        prev.map((a) => (a.id === app.id ? { ...a, status: "approved" } : a))
      );
    } catch (err: any) {
      setError(err.message || "Approval failed. Try again.");
    } finally {
      setActionLoading(null);
    }
  };

  // ── Reject ──
  const reject = async (app: Application) => {
    setActionLoading(app.id);
    setError("");
    try {
      const res = await fetchWithAuth(
        `${API_URL}/api/auth/seller/applications/${app.id}/reject/`,
        {
          method: "POST",
          body: JSON.stringify({ notes: "Application rejected by admin." }),
        }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Rejection failed");
      }

      setApplications((prev) =>
        prev.map((a) => (a.id === app.id ? { ...a, status: "rejected" } : a))
      );
    } catch (err: any) {
      setError(err.message || "Rejection failed. Try again.");
    } finally {
      setActionLoading(null);
    }
  };

  if (!mounted) return null;

  const idCards = [
    { key: "id_front_url" as const, label: "ID Card — Front", icon: CreditCard, hint: "Shows name, photo, matric number" },
    { key: "id_back_url" as const, label: "ID Card — Back", icon: FlipHorizontal, hint: "Shows expiry, barcode or institution seal" },
  ];

  const pendingCount = applications.filter((a) => a.status === "pending").length;

  return (
    <>
      {previewImage && (
        <DocumentPreviewModal
          url={previewImage.url}
          label={previewImage.label}
          onClose={() => setPreviewImage(null)}
        />
      )}

      <AdminTopBar title="Seller Approvals" back="/admin" />

      <div className="min-h-screen bg-[#FFF8F0] px-4 pt-4 pb-32 space-y-4 max-w-2xl mx-auto" style={{ fontFamily: "'DM Sans', sans-serif" }}>
        <div className="flex justify-end">
          <button
            onClick={fetchApplications}
            className="text-stone-500 hover:text-stone-800 hover:bg-stone-100 px-3 py-2 rounded-xl transition flex items-center gap-2 text-sm font-medium"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {/* ERROR BANNER */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-2xl text-sm font-medium flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError("")} className="underline text-red-500 ml-3">Dismiss</button>
          </div>
        )}

        {/* LOADING */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-white border border-stone-200 rounded-2xl h-40 animate-pulse" />
            ))}
          </div>
        ) : applications.length === 0 ? (
          <div className="bg-white border border-stone-100 rounded-2xl p-16 text-center">
            <CreditCard className="w-12 h-12 mx-auto text-stone-200 mb-3" />
            <p className="text-stone-500 font-medium">No applications yet</p>
            <p className="text-stone-400 text-sm mt-1">Applications will appear here when sellers apply</p>
          </div>
        ) : (
          applications.map((app, i) => (
            <div
              key={app.id}
              className="bg-white border border-stone-200 rounded-2xl p-5 space-y-5 shadow-sm"
            >
              {/* APPLICANT INFO */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-stone-900">{app.applicant_name}</h3>
                  <p className="text-teal-600 text-sm mt-0.5">{app.applicant_email}</p>
                  {app.applicant_matric && (
                    <span className="inline-block mt-1.5 font-mono text-xs bg-stone-100 text-stone-600 px-2 py-0.5 rounded">
                      {app.applicant_matric}
                    </span>
                  )}
                  <p className="text-stone-400 text-xs flex items-center gap-1.5 mt-2">
                    <Calendar className="w-3.5 h-3.5" />
                    {new Date(app.submitted_at).toLocaleDateString("en-NG", {
                      year: "numeric", month: "short", day: "numeric",
                    })}
                  </p>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 flex-shrink-0 ${
                  app.status === "pending"  ? "bg-amber-100 text-amber-700" :
                  app.status === "approved" ? "bg-teal-100 text-teal-700" :
                                              "bg-red-100 text-red-700"
                }`}>
                  {app.status === "pending"  ? <Clock className="w-3.5 h-3.5" /> :
                   app.status === "approved" ? <Check className="w-3.5 h-3.5" /> :
                                               <X className="w-3.5 h-3.5" />}
                  {app.status.charAt(0).toUpperCase() + app.status.slice(1)}
                </span>
              </div>

              {/* ID CARD IMAGES */}
              <div className="space-y-3">
                <p className="text-teal-600 text-xs tracking-[0.2em] uppercase font-semibold flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5" /> Student ID Card
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {idCards.map(({ key, label, icon: Icon, hint }) => {
                    const url = app[key];
                    return (
                      <div key={key} className="bg-stone-50 border border-stone-200 rounded-2xl overflow-hidden">
                        <div className="relative group">
                          {url ? (
                            <>
                              <img
                                src={url}
                                alt={label}
                                className="w-full h-40 object-cover"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                              />
                              <button
                                onClick={() => setPreviewImage({ url, label })}
                                className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100"
                              >
                                <div className="bg-white/80 p-2.5 rounded-full">
                                  <ZoomIn className="w-5 h-5 text-stone-700" />
                                </div>
                              </button>
                            </>
                          ) : (
                            <div className="w-full h-40 flex items-center justify-center">
                              <p className="text-stone-400 text-sm">No image</p>
                            </div>
                          )}
                        </div>
                        <div className="p-3 flex items-center justify-between border-t border-stone-100">
                          <div>
                            <p className="font-semibold text-stone-900 text-xs">{label}</p>
                            <p className="text-stone-400 text-xs">{hint}</p>
                          </div>
                          {url && (
                            <button onClick={() => setPreviewImage({ url, label })}
                              className="p-1.5 bg-stone-100 hover:bg-stone-200 rounded-lg transition">
                              <Eye className="w-3.5 h-3.5 text-stone-600" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ADMISSION LETTER */}
              {app.admission_letter_url && (
                <div className="space-y-2">
                  <p className="text-teal-600 text-xs tracking-[0.2em] uppercase font-semibold flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" /> Admission Letter
                  </p>
                  <div className="bg-stone-50 border border-stone-200 rounded-2xl overflow-hidden">
                    {isPdf(app.admission_letter_url) ? (
                      <div className="p-4 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
                            <FileText className="w-5 h-5 text-red-600" />
                          </div>
                          <div>
                            <p className="font-semibold text-stone-900 text-sm">PDF Document</p>
                            <p className="text-stone-400 text-xs">Admission letter</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setPreviewImage({ url: app.admission_letter_url!, label: "Admission Letter" })}
                            className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 rounded-xl text-stone-700 text-xs font-medium flex items-center gap-1.5 transition"
                          >
                            <Eye className="w-3.5 h-3.5" /> Preview
                          </button>
                          <a href={app.admission_letter_url} target="_blank" rel="noopener noreferrer"
                            className="px-3 py-1.5 bg-teal-100 hover:bg-teal-200 rounded-xl text-teal-700 text-xs font-medium flex items-center gap-1.5 transition">
                            <ExternalLink className="w-3.5 h-3.5" /> Open
                          </a>
                        </div>
                      </div>
                    ) : (
                      <div className="relative group">
                        <img src={app.admission_letter_url} alt="Admission Letter"
                          className="w-full h-40 object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        <button
                          onClick={() => setPreviewImage({ url: app.admission_letter_url!, label: "Admission Letter" })}
                          className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100"
                        >
                          <div className="bg-white/80 p-2.5 rounded-full">
                            <ZoomIn className="w-5 h-5 text-stone-700" />
                          </div>
                        </button>
                        <div className="p-3 border-t border-stone-100 flex items-center justify-between">
                          <p className="font-semibold text-stone-900 text-xs">Admission Letter</p>
                          <button onClick={() => setPreviewImage({ url: app.admission_letter_url!, label: "Admission Letter" })}
                            className="p-1.5 bg-stone-100 hover:bg-stone-200 rounded-lg transition">
                            <Eye className="w-3.5 h-3.5 text-stone-600" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ACTION BUTTONS */}
              {app.status === "pending" && (
                <div className="flex gap-3 pt-4 border-t border-stone-100">
                  <button
                    onClick={() => approve(app)}
                    disabled={actionLoading === app.id}
                    className="flex-1 py-3 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 text-sm"
                  >
                    {actionLoading === app.id
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <><Check className="w-4 h-4" /> Approve</>}
                  </button>
                  <button
                    onClick={() => reject(app)}
                    disabled={actionLoading === app.id}
                    className="flex-1 py-3 bg-red-100 hover:bg-red-200 text-red-700 font-bold rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 text-sm"
                  >
                    {actionLoading === app.id
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <><X className="w-4 h-4" /> Reject</>}
                  </button>
                </div>
              )}

              {app.status === "approved" && (
                <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 flex items-center justify-center gap-2">
                  <Check className="w-4 h-4 text-teal-600" />
                  <p className="text-teal-700 font-semibold text-sm">Approved — Seller is live</p>
                </div>
              )}

              {app.status === "rejected" && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                  <p className="text-red-600 font-semibold text-sm flex items-center justify-center gap-2">
                    <X className="w-4 h-4" /> Rejected
                  </p>
                  {app.notes && <p className="text-red-400 text-xs mt-1">{app.notes}</p>}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </>
  );
}

export default AdminSellerApprovals;
