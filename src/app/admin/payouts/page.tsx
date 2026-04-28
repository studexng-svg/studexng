// src/app/admin/payouts/page.tsx
"use client";

import {
  ChevronLeft,
  DollarSign,
  CheckCircle,
  Clock,
  Calendar,
  Search,
  Download,
  Landmark,
  AlertCircle,
  ArrowRight,
  Wallet,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useEffect, useMemo } from "react";

interface WithdrawalRequest {
  id: string;
  sellerId: string;
  sellerName: string;
  amount: number;
  date: string;
  status: "pending" | "approved" | "completed" | "rejected";
  bankName?: string;
  accountNumber?: string;
  accountName?: string;
}

function AdminPayouts() {
  const router = useRouter();
  const [payouts, setPayouts] = useState<WithdrawalRequest[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [releasingId, setReleasingId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const withdrawalRequests = JSON.parse(localStorage.getItem("withdrawalRequests") || "[]");
    setPayouts(withdrawalRequests);
  }, []);

  const filteredPayouts = useMemo(() => {
    if (!searchQuery.trim()) return payouts;
    const q = searchQuery.toLowerCase();
    return payouts.filter(p =>
      (p.id || "").toLowerCase().includes(q) ||
      (p.sellerName || "").toLowerCase().includes(q) ||
      p.amount.toString().includes(q) ||
      (p.bankName || "").toLowerCase().includes(q) ||
      (p.accountNumber || "").includes(q)
    );
  }, [payouts, searchQuery]);

  const stats = {
    total: payouts.length,
    pending: payouts.filter(p => p.status === "pending").length,
    approved: payouts.filter(p => p.status === "approved").length,
    completed: payouts.filter(p => p.status === "completed").length,
  };

  const totalPending = filteredPayouts
    .filter(p => p.status === "pending" || p.status === "approved")
    .reduce((sum, p) => sum + (p.amount || 0), 0);

  const approvePayment = (payoutId: string) => {
    const updated = payouts.map(p =>
      p.id === payoutId ? { ...p, status: "approved" as const } : p
    );
    setPayouts(updated);
    localStorage.setItem("withdrawalRequests", JSON.stringify(updated));
    alert("✓ Payment approved!");
  };

  const releasePayment = (payoutId: string) => {
    const payout = payouts.find(p => p.id === payoutId);
    if (!payout) return;

    setReleasingId(payoutId);

    setTimeout(() => {
      // Update escrow balance
      const currentEscrow = parseFloat(localStorage.getItem("walletInEscrow") || "0");
      const newEscrow = Math.max(0, currentEscrow - payout.amount);
      localStorage.setItem("walletInEscrow", newEscrow.toString());

      // Update payout status
      const updated = payouts.map(p =>
        p.id === payoutId ? { ...p, status: "completed" as const } : p
      );
      setPayouts(updated);
      localStorage.setItem("withdrawalRequests", JSON.stringify(updated));

      alert(`✓ ₦${payout.amount.toLocaleString()} released to ${payout.accountName}`);
      setReleasingId(null);
    }, 1500);
  };

  const exportPayouts = () => {
    const headers = ["ID", "Seller", "Amount", "Status", "Date", "Bank", "Account"];
    const rows = filteredPayouts.map(p => [
      p.id,
      p.sellerName,
      p.amount,
      p.status,
      p.date,
      p.bankName || "N/A",
      p.accountNumber || "N/A"
    ]);
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payouts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const getInitials = (name: string | undefined) => {
    if (!name) return "??";
    return name.trim().split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
  };

  if (!mounted) return null;

  return (
    <>
      {/* TOP BAR */}
      <div className="sticky top-0 z-50 bg-gradient-to-r from-slate-900 via-purple-900 to-slate-900 border-b border-white/10 backdrop-blur-xl animate-fadeUp">
        <div className="flex items-center justify-between px-5 py-4">
          <button onClick={() => router.back()} className="p-2 hover:bg-white/10 rounded-xl transition">
            <ChevronLeft className="w-6 h-6 text-white" />
          </button>
          <h1 className="text-xl font-black text-white flex items-center gap-3">
            <DollarSign className="w-7 h-7 text-emerald-400" />
            Payouts
          </h1>
          <button
            onClick={exportPayouts}
            className="p-2 hover:bg-white/10 rounded-xl transition"
            title="Export as CSV"
          >
            <Download className="w-6 h-6 text-white" />
          </button>
        </div>

        <div className="px-5 pb-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/50" />
            <input
              type="text"
              placeholder="Search payout ID, seller, bank..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-white/10 backdrop-blur-xl rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            />
          </div>
        </div>
      </div>

      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 px-5 pt-4 pb-32 space-y-6">

        {/* STATS GRID */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Total Requests", value: stats.total, color: "from-purple-600 to-pink-600" },
            { label: "Pending", value: stats.pending, color: "from-yellow-500 to-orange-600" },
            { label: "Approved", value: stats.approved, color: "from-blue-500 to-cyan-600" },
            { label: "Completed", value: stats.completed, color: "from-emerald-500 to-teal-600" },
          ].map((stat, i) => (
            <div
              key={stat.label}
              className={`bg-gradient-to-br ${stat.color} rounded-2xl p-5 text-white shadow-xl animate-fadeUp`}
            >
              <p className="text-sm opacity-90">{stat.label}</p>
              <p className="text-3xl font-black mt-1">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* PENDING SUMMARY */}
        <div className="bg-gradient-to-r from-emerald-500 to-teal-600 rounded-3xl p-6 text-white shadow-2xl animate-fadeUp">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-lg font-bold flex items-center gap-2">
                <Wallet className="w-7 h-7" /> Pending Release
              </p>
              <p className="text-4xl font-black mt-2">₦{totalPending.toLocaleString()}</p>
              <p className="text-white/80 text-sm mt-1">
                {filteredPayouts.filter(p => p.status === "pending" || p.status === "approved").length} requests to process
              </p>
            </div>
            <button
              onClick={exportPayouts}
              className="px-5 py-3 bg-white/20 rounded-2xl font-bold flex items-center gap-2 hover:bg-white/30 transition"
            >
              <Download className="w-5 h-5" /> Export
            </button>
          </div>
        </div>

        {/* PAYOUTS LIST */}
        <div className="space-y-4">
          {filteredPayouts.length === 0 ? (
            <div className="text-center py-20 bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10">
              <AlertCircle className="w-16 h-16 mx-auto text-white/20 mb-4" />
              <p className="text-white/60 text-lg">No withdrawal requests</p>
              <p className="text-white/40 text-sm mt-2">Check back when sellers request payouts</p>
            </div>
          ) : (
            filteredPayouts.map((payout, i) => (
              <div
                key={payout.id}
                onClick={() => router.push(`/admin/payouts/${payout.id}`)}
                className="bg-white/5 backdrop-blur-xl rounded-2xl p-5 border border-white/10 hover:border-purple-500/50 hover:bg-white/10 transition cursor-pointer animate-fadeUp"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-gradient-to-br from-purple-600 to-teal-600 rounded-2xl flex items-center justify-center text-xl font-black text-white">
                      {getInitials(payout.sellerName)}
                    </div>
                    <div>
                      <h3 className="font-bold text-white text-lg">{payout.sellerName || "Unknown Seller"}</h3>
                      <p className="text-purple-300 text-sm font-mono">{payout.id}</p>
                    </div>
                  </div>

                  <div className={`px-4 py-2 rounded-full font-bold flex items-center gap-2 whitespace-nowrap ${
                    payout.status === "pending"
                      ? "bg-yellow-500/20 text-yellow-300 border border-yellow-500/50"
                      : payout.status === "approved"
                      ? "bg-blue-500/20 text-blue-300 border border-blue-500/50"
                      : payout.status === "completed"
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/50"
                      : "bg-red-500/20 text-red-300 border border-red-500/50"
                  }`}>
                    {payout.status === "pending" && <Clock className="w-5 h-5" />}
                    {payout.status === "approved" && <CheckCircle className="w-5 h-5" />}
                    {payout.status === "completed" && <CheckCircle className="w-5 h-5" />}
                    {payout.status === "rejected" && <AlertCircle className="w-5 h-5" />}
                    {payout.status.toUpperCase()}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 mb-5 text-sm">
                  <div>
                    <p className="text-white/60">Amount</p>
                    <p className="text-2xl font-black text-emerald-400">₦{payout.amount.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-white/60 flex items-center gap-1">
                      <Landmark className="w-4 h-4" /> Bank
                    </p>
                    <p className="text-white font-medium">{payout.bankName || "Not provided"}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-white/60 flex items-center justify-end gap-1">
                      <Calendar className="w-4 h-4" />
                    </p>
                    <p className="text-white font-medium text-sm">{new Date(payout.date).toLocaleDateString()}</p>
                  </div>
                </div>

                {payout.status === "pending" && (
                  <div className="flex items-center justify-between">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        approvePayment(payout.id);
                      }}
                      className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-sm transition"
                    >
                      Approve
                    </button>
                    <ArrowRight className="w-6 h-6 text-white/40" />
                  </div>
                )}

                {payout.status === "approved" && (
                  <div className="flex items-center justify-between">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        releasePayment(payout.id);
                      }}
                      disabled={releasingId === payout.id}
                      className="px-6 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold rounded-lg text-sm shadow-lg hover:shadow-emerald-500/50 transition disabled:opacity-70"
                    >
                      {releasingId === payout.id ? "Releasing..." : "Release Payment"}
                    </button>
                    <ArrowRight className="w-6 h-6 text-white/40" />
                  </div>
                )}

                {(payout.status === "completed" || payout.status === "rejected") && (
                  <div className="flex items-center justify-end">
                    <span className="text-white/60 text-sm">Tap to view details</span>
                    <ArrowRight className="w-6 h-6 text-white/40 ml-2" />
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

export default AdminPayouts;