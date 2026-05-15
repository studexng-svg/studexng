// src/app/admin/seller-approvals/page.tsx
"use client";

import { CreditCard, Clock, Check, X, ChevronRight, RefreshCw, Users } from "lucide-react";
import AdminTopBar from "@/components/layout/AdminTopBar";
import { useState, useEffect, useCallback } from "react";
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

  const fetchApplications = useCallback(async (c = campus) => {
    setLoading(true);
    setError("");
    try {
      let url = `${API_URL}/api/auth/seller/applications/`;
      if (c) url += `?school=${c}`;
      const res = await fetchWithAuth(url);
      if (!res.ok) throw new Error("Failed to fetch applications");
      const data = await res.json();
      setApplications(Array.isArray(data) ? data : data.results || []);
    } catch (err: any) {
      setError(err.message || "Could not load applications.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchApplications(); }, [fetchApplications]);

  const pending  = applications.filter(a => a.status === "pending").length;
  const approved = applications.filter(a => a.status === "approved").length;
  const rejected = applications.filter(a => a.status === "rejected").length;

  return (
    <div className="min-h-screen bg-[#FFF8F0]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <AdminTopBar title="Seller Approvals" back="/admin" />

      <div className="px-4 pt-4 pb-28 max-w-2xl mx-auto space-y-4">

        {/* Summary chips */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Pending",  value: pending,  color: "#F59E0B" },
            { label: "Approved", value: approved, color: "#0D9488" },
            { label: "Rejected", value: rejected, color: "#EF4444" },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white border border-stone-200 rounded-2xl p-3 text-center shadow-sm">
              <p className="text-xl font-bold text-stone-900" style={{ color }}>{loading ? "—" : value}</p>
              <p className="text-xs text-stone-400">{label}</p>
            </div>
          ))}
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
        ) : applications.length === 0 ? (
          <div className="bg-white border border-stone-100 rounded-2xl p-16 text-center">
            <CreditCard className="w-12 h-12 mx-auto text-stone-200 mb-3" />
            <p className="text-stone-500 font-medium">No applications yet</p>
            <p className="text-stone-400 text-sm mt-1">Applications will appear here when sellers apply</p>
          </div>
        ) : (
          <div className="space-y-2">
            {applications.map(app => {
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
        )}
      </div>
    </div>
  );
}
