// src/app/admin/seller-approvals/page.tsx
"use client";

import { CreditCard, Clock, Check, X, ChevronRight, RefreshCw, Users } from "lucide-react";
import AdminTopBar from "@/components/layout/AdminTopBar";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { fetchWithAuth } from "@/lib/authStore";
import { GRAD } from "@/lib/tokens";
import { CampusPills, type Campus } from "@/components/admin/CampusPills";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

interface Application {
  id: number;
  applicant_name: string;
  applicant_email: string;
  applicant_matric: string;
  applicant_business_name: string;
  submitted_at: string;
  status: "pending" | "approved" | "rejected";
}

const STATUS_STYLES = {
  pending:  { bg: "bg-amber-100 text-amber-700", icon: Clock },
  approved: { bg: "bg-teal-100 text-teal-700",   icon: Check },
  rejected: { bg: "bg-red-100 text-red-600",     icon: X },
};

export default function AdminSellerApprovals() {
  const router = useRouter();
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [campus, setCampus] = useState<Campus>("");
  const campusRef = useRef<Campus>("");
  const [statusFilter, setStatusFilter] = useState<"" | "pending" | "approved" | "rejected">("");

  const fetchApplications = useCallback(async (c = campus, silent = false) => {
    if (!silent) { setLoading(true); setError(""); }
    try {
      let url = `${API_URL}/api/auth/seller/applications/`;
      if (c) url += `?school=${c}`;
      const res = await fetchWithAuth(url);
      if (!res.ok) { if (!silent) throw new Error("Failed to fetch applications"); return; }
      const data = await res.json();
      setApplications(Array.isArray(data) ? data : data.results || []);
    } catch (err: any) {
      if (!silent) setError(err.message || "Could not load applications.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  campusRef.current = campus;

  useEffect(() => {
    fetchApplications();
    const interval = setInterval(() => fetchApplications(campusRef.current, true), 15000);
    return () => clearInterval(interval);
  }, [fetchApplications]);

  const pending  = applications.filter(a => a.status === "pending").length;
  const approved = applications.filter(a => a.status === "approved").length;
  const rejected = applications.filter(a => a.status === "rejected").length;

  return (
    <div className="min-h-screen bg-[#F5F5F5]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <AdminTopBar title="Seller Approvals" back="/admin" />

      <div className="px-4 pt-4 pb-28 max-w-2xl mx-auto space-y-4">

        {/* Summary chips */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Pending",  value: pending,  color: "#F59E0B", key: "pending"  as const },
            { label: "Approved", value: approved, color: "#0D9488", key: "approved" as const },
            { label: "Rejected", value: rejected, color: "#EF4444", key: "rejected" as const },
          ].map(({ label, value, color, key }) => {
            const active = statusFilter === key;
            return (
              <button
                key={label}
                onClick={() => setStatusFilter(active ? "" : key)}
                className={`rounded-2xl p-3 text-center shadow-sm transition-all active:scale-95 border-2 ${
                  active ? "border-transparent" : "bg-white border-stone-200 hover:border-stone-300"
                }`}
                style={active ? { background: GRAD } : undefined}
              >
                <p className="text-xl font-bold" style={{ color: active ? "#fff" : color }}>{loading ? "—" : value}</p>
                <p className={`text-xs ${active ? "text-stone-300" : "text-stone-400"}`}>{label}</p>
              </button>
            );
          })}
        </div>

        <CampusPills value={campus} onChange={c => { setCampus(c); fetchApplications(c); }} />

        <div className="flex justify-end">
          <button
            onClick={() => fetchApplications(campus)}
            className="text-stone-500 hover:text-stone-800 hover:bg-stone-100 px-3 py-2 rounded-xl transition flex items-center gap-2 text-sm font-medium"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-2xl text-sm font-medium flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError("")} className="underline text-red-500 ml-3">Dismiss</button>
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white border border-stone-200 rounded-2xl h-16 animate-pulse" />
            ))}
          </div>
        ) : (() => {
          const visible = statusFilter ? applications.filter(a => a.status === statusFilter) : applications;
          return visible.length === 0 ? (
            <div className="bg-white border border-stone-100 rounded-2xl p-16 text-center">
              <CreditCard className="w-12 h-12 mx-auto text-stone-200 mb-3" />
              <p className="text-stone-500 font-medium">{statusFilter ? `No ${statusFilter} applications` : "No applications yet"}</p>
              <p className="text-stone-400 text-sm mt-1">{statusFilter ? <button onClick={() => setStatusFilter("")} className="underline">Clear filter</button> : "Applications will appear here when sellers apply"}</p>
            </div>
          ) : (
          <div className="space-y-2">
            {visible.map(app => {
              const { bg, icon: Icon } = STATUS_STYLES[app.status];
              return (
                <div
                  key={app.id}
                  onClick={() => router.push(`/admin/seller-approvals/${app.id}`)}
                  className="bg-white border border-stone-200 hover:border-teal-300 rounded-2xl p-3.5 flex items-center gap-3 transition-all cursor-pointer active:scale-[0.98] shadow-sm"
                >
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                    style={{ background: GRAD }}>
                    {(app.applicant_business_name || app.applicant_name || "?")[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-stone-900 text-sm truncate">{app.applicant_name}</p>
                    <p className="text-stone-400 text-xs truncate">
                      {app.applicant_email}
                      {app.applicant_matric ? ` · ${app.applicant_matric}` : ""}
                    </p>
                  </div>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold flex items-center gap-1 flex-shrink-0 ${bg}`}>
                    <Icon className="w-3 h-3" />
                    {app.status.charAt(0).toUpperCase() + app.status.slice(1)}
                  </span>
                  <ChevronRight className="w-4 h-4 text-stone-400 flex-shrink-0" />
                </div>
              );
            })}
          </div>
          );
        })()}
      </div>
    </div>
  );
}
