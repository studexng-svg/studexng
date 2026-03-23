"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  Check, X, Eye, Calendar, Clock, Zap, ArrowLeft,
  UserCheck, CreditCard, FlipHorizontal, ZoomIn, Loader2, RefreshCw,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://studex-backend-v2.onrender.com";

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
  notes: string | null;
}

// ─── Image Preview Modal ───────────────────────────────────────────────────────

function ImagePreviewModal({
  url, label, onClose,
}: {
  url: string; label: string; onClose: () => void;
}) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.85, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          className="relative max-w-2xl w-full bg-slate-900 rounded-3xl overflow-hidden border border-white/10 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between p-5 border-b border-white/10">
            <p className="text-white font-bold text-lg">{label}</p>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-4">
            <img
              src={url}
              alt={label}
              className="w-full rounded-2xl object-contain max-h-[70vh]"
              onError={(e) => {
                (e.target as HTMLImageElement).src =
                  "https://via.placeholder.com/600x400?text=Image+Not+Found";
              }}
            />
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

function AdminSellerApprovals() {
  const router = useRouter();
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [previewImage, setPreviewImage] = useState<{ url: string; label: string } | null>(null);
  const [mounted, setMounted] = useState(false);

  const getToken = () =>
    typeof window !== "undefined"
      ? localStorage.getItem("admin_access_token")
      : null;

  // ── Fetch all applications from backend ──
  const fetchApplications = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = getToken();
      if (!token) {
        router.replace("/admin/login");
        return;
      }

      const res = await fetch(`${API_URL}/api/auth/seller/applications/`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401 || res.status === 403) {
        router.replace("/admin/login");
        return;
      }

      if (!res.ok) throw new Error("Failed to fetch applications");

      const data = await res.json();
      setApplications(Array.isArray(data) ? data : data.results || []);
    } catch (err: any) {
      setError(err.message || "Could not load applications. Try again.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    setMounted(true);
    fetchApplications();
  }, [fetchApplications]);

  // ── Approve ──
  const approve = async (app: Application) => {
    setActionLoading(app.id);
    setError("");
    try {
      const token = getToken();
      const res = await fetch(
        `${API_URL}/api/auth/seller/applications/${app.id}/approve/`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
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
      const token = getToken();
      const res = await fetch(
        `${API_URL}/api/auth/seller/applications/${app.id}/reject/`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
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
        <ImagePreviewModal
          url={previewImage.url}
          label={previewImage.label}
          onClose={() => setPreviewImage(null)}
        />
      )}

      {/* TOP BAR */}
      <motion.div
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        className="sticky top-0 z-50 bg-gradient-to-r from-slate-900 via-purple-900 to-slate-900 border-b border-white/10 backdrop-blur-xl"
      >
        <div className="flex items-center justify-between p-5">
          <button
            onClick={() => router.back()}
            className="text-white hover:bg-white/10 p-3 rounded-xl transition"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-2xl font-black text-white flex items-center gap-3">
            <UserCheck className="w-8 h-8 text-purple-400" />
            Seller Approvals
            {pendingCount > 0 && (
              <span className="bg-yellow-500 text-black text-sm font-black px-2.5 py-0.5 rounded-full">
                {pendingCount}
              </span>
            )}
          </h1>
          <button
            onClick={fetchApplications}
            className="text-white hover:bg-white/10 p-3 rounded-xl transition"
            title="Refresh"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </motion.div>

      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6 pb-32 space-y-6">

        {/* ERROR BANNER */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-red-500/20 border border-red-500/40 text-red-300 px-4 py-3 rounded-2xl text-center text-sm font-medium flex items-center justify-between"
          >
            <span>{error}</span>
            <button onClick={() => setError("")} className="underline text-red-200 ml-3">
              Dismiss
            </button>
          </motion.div>
        )}

        {/* LOADING */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <Loader2 className="w-12 h-12 text-purple-400 animate-spin" />
            <p className="text-white/60">Loading applications...</p>
          </div>
        ) : applications.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-20"
          >
            <CreditCard className="w-20 h-20 mx-auto text-white/20 mb-4" />
            <p className="text-white/60 text-lg">No applications yet</p>
            <p className="text-white/40 text-sm mt-2">
              Applications will appear here when sellers apply
            </p>
          </motion.div>
        ) : (
          applications.map((app, i) => (
            <motion.div
              key={app.id}
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="bg-white/5 backdrop-blur-xl rounded-3xl p-6 border border-white/10 space-y-6"
            >
              {/* APPLICANT INFO */}
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-2xl font-black text-white">{app.applicant_name}</h3>
                  <p className="text-purple-300 font-medium mt-1">{app.applicant_email}</p>
                  {app.applicant_matric && (
                    <p className="text-white/60 text-sm flex items-center gap-2 mt-2">
                      <span className="font-mono bg-white/10 px-2 py-1 rounded">
                        {app.applicant_matric}
                      </span>
                    </p>
                  )}
                  <p className="text-white/50 text-sm flex items-center gap-2 mt-3">
                    <Calendar className="w-4 h-4" />
                    Submitted{" "}
                    {new Date(app.submitted_at).toLocaleDateString("en-US", {
                      year: "numeric", month: "long", day: "numeric",
                    })}
                  </p>
                </div>

                <div className={`px-4 py-2 rounded-full font-bold flex items-center gap-2 whitespace-nowrap ${
                  app.status === "pending"
                    ? "bg-yellow-500/20 text-yellow-300 border border-yellow-500/50"
                    : app.status === "approved"
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/50"
                    : "bg-red-500/20 text-red-300 border border-red-500/50"
                }`}>
                  {app.status === "pending" ? <Clock className="w-5 h-5" /> :
                   app.status === "approved" ? <Check className="w-5 h-5" /> :
                   <X className="w-5 h-5" />}
                  {app.status.toUpperCase()}
                </div>
              </div>

              {/* ID CARD IMAGES — rendered from backend URLs */}
              <div className="space-y-4">
                <h4 className="text-lg font-bold text-white flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-purple-400" />
                  Student ID Card
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {idCards.map(({ key, label, icon: Icon, hint }) => {
                    const url = app[key];
                    return (
                      <motion.div
                        key={key}
                        whileHover={{ scale: 1.01 }}
                        className="bg-white/10 rounded-2xl overflow-hidden border border-white/20 hover:border-purple-500/50 transition-all"
                      >
                        <div className="relative group">
                          {url ? (
                            <>
                              <img
                                src={url}
                                alt={label}
                                className="w-full h-44 object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src =
                                    "https://via.placeholder.com/400x220?text=Image+Not+Found";
                                }}
                              />
                              <button
                                onClick={() => setPreviewImage({ url, label })}
                                className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100"
                              >
                                <div className="bg-white/20 backdrop-blur-md p-3 rounded-full border border-white/30">
                                  <ZoomIn className="w-6 h-6 text-white" />
                                </div>
                              </button>
                            </>
                          ) : (
                            <div className="w-full h-44 bg-white/5 flex items-center justify-center">
                              <p className="text-white/30 text-sm">No image uploaded</p>
                            </div>
                          )}
                        </div>

                        <div className="p-4 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-teal-600 rounded-xl flex items-center justify-center flex-shrink-0">
                              <Icon className="w-5 h-5 text-white" />
                            </div>
                            <div>
                              <p className="text-white font-bold text-sm">{label}</p>
                              <p className="text-white/50 text-xs">{hint}</p>
                            </div>
                          </div>
                          {url && (
                            <button
                              onClick={() => setPreviewImage({ url, label })}
                              className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition"
                              title="Full screen"
                            >
                              <Eye className="w-4 h-4 text-white" />
                            </button>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>

              {/* ACTION BUTTONS */}
              {app.status === "pending" && (
                <div className="flex gap-4 pt-4 border-t border-white/10">
                  <button
                    onClick={() => approve(app)}
                    disabled={actionLoading === app.id}
                    className="flex-1 py-5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-black text-lg rounded-2xl hover:shadow-xl hover:shadow-emerald-500/50 transition-all flex items-center justify-center gap-3 disabled:opacity-60"
                  >
                    {actionLoading === app.id ? (
                      <Loader2 className="w-6 h-6 animate-spin" />
                    ) : (
                      <><Check className="w-7 h-7" /> Approve Seller</>
                    )}
                  </button>
                  <button
                    onClick={() => reject(app)}
                    disabled={actionLoading === app.id}
                    className="flex-1 py-5 bg-gradient-to-r from-red-600 to-pink-600 text-white font-black text-lg rounded-2xl hover:shadow-xl hover:shadow-red-500/50 transition-all flex items-center justify-center gap-3 disabled:opacity-60"
                  >
                    {actionLoading === app.id ? (
                      <Loader2 className="w-6 h-6 animate-spin" />
                    ) : (
                      <><X className="w-7 h-7" /> Reject</>
                    )}
                  </button>
                </div>
              )}

              {app.status === "approved" && (
                <motion.div className="bg-emerald-500/20 border border-emerald-500/50 rounded-2xl p-4 text-center">
                  <p className="text-emerald-300 font-bold flex items-center justify-center gap-2">
                    <Check className="w-5 h-5" /> Approved — Seller can now start selling
                  </p>
                </motion.div>
              )}

              {app.status === "rejected" && (
                <motion.div className="bg-red-500/20 border border-red-500/50 rounded-2xl p-4 text-center">
                  <p className="text-red-300 font-bold flex items-center justify-center gap-2">
                    <X className="w-5 h-5" /> Rejected — Seller cannot proceed
                  </p>
                  {app.notes && (
                    <p className="text-red-400/70 text-xs mt-1">{app.notes}</p>
                  )}
                </motion.div>
              )}
            </motion.div>
          ))
        )}
      </div>
    </>
  );
}

export default AdminSellerApprovals;
