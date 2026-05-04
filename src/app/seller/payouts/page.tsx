// src/app/seller/payouts/page.tsx
"use client";

import { ChevronLeft, TrendingUp, Wallet, AlertCircle, DollarSign, Calendar } from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useAuth, fetchWithAuth } from "@/lib/authStore";
import { GRAD, SERIF } from "@/lib/tokens";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

interface Transaction {
  id: number;
  order_reference: string;
  amount: number;
  created_at: string;
  status: "in_escrow" | "released" | "withdrawn";
  buyer_username: string;
  listing: {
    title: string;
  };
}

export default function SellerPayouts() {
  const router = useRouter();
  const { user: authUser } = useAuth();

  const [walletBalance, setWalletBalance] = useState(0);
  const [inEscrow, setInEscrow] = useState(0);
  const [totalEarned, setTotalEarned] = useState(0);
  const [totalWithdrawn, setTotalWithdrawn] = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authUser) {
      router.push("/auth");
      return;
    }

    const fetchData = async () => {
      try {
        const profileRes = await fetchWithAuth(`${API_URL}/api/auth/profile/`);
        if (!profileRes.ok) throw new Error("Failed to load profile");
        const profileData = await profileRes.json();
        setWalletBalance(parseFloat(profileData.wallet_balance || "0"));

        const txRes = await fetchWithAuth(`${API_URL}/api/transactions/`);
        if (!txRes.ok) throw new Error("Failed to load transactions");

        const txData = await txRes.json();
        const txList = Array.isArray(txData) ? txData : txData.results || [];
        setTransactions(txList);

        const escrow = txList
          .filter((t: Transaction) => t.status === "in_escrow")
          .reduce((sum: number, t: Transaction) => sum + parseFloat(String(t.amount)), 0);
        const earned = txList.reduce(
          (sum: number, t: Transaction) => sum + parseFloat(String(t.amount)), 0
        );
        const withdrawn = txList
          .filter((t: Transaction) => t.status === "withdrawn")
          .reduce((sum: number, t: Transaction) => sum + parseFloat(String(t.amount)), 0);

        setInEscrow(escrow);
        setTotalEarned(earned);
        setTotalWithdrawn(withdrawn);
      } catch (err) {
        setError("Failed to load payout data. Make sure backend is running.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [authUser, router]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "released": return "bg-emerald-100 text-emerald-700";
      case "in_escrow": return "bg-amber-100 text-amber-700";
      case "withdrawn": return "bg-purple-100 text-purple-700";
      default: return "bg-stone-100 text-stone-600";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "released": return "Released";
      case "in_escrow": return "In Escrow";
      case "withdrawn": return "Withdrawn";
      default: return status;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAF9]">
        <div className="animate-spin">
          <Wallet className="w-10 h-10 text-teal-600" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAF9]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      {/* HEADER */}
      <div className="sticky top-0 bg-white/80 backdrop-blur-md z-40 border-b border-stone-100 shadow-sm">
        <div className="flex items-center justify-between px-4 py-3 max-w-2xl mx-auto">
          <button onClick={() => router.back()} className="p-2.5 bg-white border border-stone-200 rounded-full shadow-sm active:scale-95 transition-all">
            <ChevronLeft className="w-5 h-5 text-stone-600" />
          </button>
          <h1 className="text-base font-bold text-stone-900" style={SERIF}>
            Payout History
          </h1>
          <div className="w-10" />
        </div>
      </div>

      <div className="px-4 pt-6 pb-32 space-y-5 max-w-2xl mx-auto">
        {/* WALLET OVERVIEW CARD */}
        <div
          className="rounded-2xl p-5 text-white shadow-md"
          style={{ background: GRAD }}
        >
          <div className="flex items-center gap-2 mb-4">
            <Wallet className="w-5 h-5" />
            <span className="font-semibold text-sm opacity-90">Your Earnings</span>
          </div>
          <div className="mb-5">
            <p className="text-xs opacity-75">Current Balance</p>
            <p className="text-3xl font-bold">₦{walletBalance.toLocaleString()}</p>
            <p className="text-xs opacity-65 mt-0.5">Ready to use or withdraw</p>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-5">
            <div className="bg-white/10 rounded-xl p-3">
              <p className="text-xs opacity-75 mb-0.5">In Escrow</p>
              <p className="text-base font-bold">₦{inEscrow.toLocaleString()}</p>
              <p className="text-xs opacity-65 mt-0.5">Waiting for buyer</p>
            </div>
            <div className="bg-white/10 rounded-xl p-3">
              <p className="text-xs opacity-75 mb-0.5">Total Earned</p>
              <p className="text-base font-bold">₦{totalEarned.toLocaleString()}</p>
              <p className="text-xs opacity-65 mt-0.5">All time</p>
            </div>
            <div className="bg-white/10 rounded-xl p-3">
              <p className="text-xs opacity-75 mb-0.5">Withdrawn</p>
              <p className="text-base font-bold">₦{totalWithdrawn.toLocaleString()}</p>
              <p className="text-xs opacity-65 mt-0.5">To your bank</p>
            </div>
          </div>
          <Link href="/wallet/withdraw" className="block">
            <button className="w-full bg-white text-teal-700 py-3 rounded-full font-semibold shadow flex items-center justify-center gap-2 text-sm active:scale-[0.98] transition-all">
              <DollarSign className="w-4 h-4" />
              Withdraw to Bank
            </button>
          </Link>
        </div>

        {/* TRANSACTION HISTORY */}
        <div>
          <h2 className="text-sm font-semibold text-stone-800 mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-teal-600" />
            Transaction History
          </h2>

          {error && (
            <div className="text-center text-red-600 text-sm font-medium mb-4 bg-red-50 border border-red-100 p-3 rounded-2xl">
              {error}
            </div>
          )}

          {transactions.length === 0 ? (
            <div className="text-center py-12 space-y-2">
              <AlertCircle className="w-10 h-10 text-stone-300 mx-auto" />
              <p className="text-stone-500 font-medium text-sm">No transactions yet</p>
              <p className="text-stone-400 text-xs">Your sales will appear here</p>
            </div>
          ) : (
            <div className="space-y-2">
              {transactions.map((txn, i) => (
                <button
                  key={txn.id}
                  onClick={() => setSelectedTransaction(txn)}
                  className="w-full text-left"
                >
                  <div className="bg-white border border-stone-200 rounded-2xl p-4 flex items-center justify-between hover:border-teal-300 hover:shadow-md transition-all animate-fadeUp">
                    <div className="flex items-center gap-3 flex-1">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${getStatusColor(txn.status)}`}>
                        <DollarSign className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-stone-800 text-sm">₦{parseFloat(String(txn.amount)).toLocaleString()}</p>
                        <p className="text-xs text-stone-500 truncate">{txn.listing.title}</p>
                        <p className="text-xs text-stone-400 flex items-center gap-1 mt-0.5">
                          <Calendar className="w-3 h-3" />
                          {new Date(txn.created_at).toLocaleDateString("en-GB")}
                        </p>
                      </div>
                    </div>
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap flex-shrink-0 ml-2 ${getStatusColor(txn.status)}`}>
                      {getStatusText(txn.status)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* INFO BOX */}
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
          <p className="text-xs text-blue-700">
            <span className="font-semibold">How it works:</span> When a buyer purchases your service, the money goes to escrow. Once they confirm receipt, it's released to your wallet. You can then withdraw to your bank anytime.
          </p>
        </div>
      </div>

      {/* TRANSACTION DETAIL MODAL */}
      {selectedTransaction && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => setSelectedTransaction(null)}
        >
          <div
            className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl border border-stone-100 animate-fadeUp"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-stone-900 mb-4" style={SERIF}>
              Transaction Details
            </h3>
            <div className="space-y-4">
              <div className="bg-stone-50 border border-stone-100 rounded-xl p-4">
                <p className="text-xs text-stone-400 mb-1">Amount</p>
                <p className="text-2xl font-bold text-stone-900">
                  ₦{parseFloat(String(selectedTransaction.amount)).toLocaleString()}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-stone-400 mb-1">Service</p>
                  <p className="font-semibold text-stone-800">{selectedTransaction.listing.title}</p>
                </div>
                <div>
                  <p className="text-xs text-stone-400 mb-1">Date</p>
                  <p className="font-semibold text-stone-800">
                    {new Date(selectedTransaction.created_at).toLocaleDateString("en-GB")}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-stone-400 mb-1">Buyer</p>
                  <p className="font-semibold text-stone-800">{selectedTransaction.buyer_username}</p>
                </div>
                <div>
                  <p className="text-xs text-stone-400 mb-1">Order ID</p>
                  <p className="font-semibold text-stone-800 text-xs">#{selectedTransaction.order_reference}</p>
                </div>
              </div>
              <div className={`rounded-xl p-3 text-center text-xs font-medium ${getStatusColor(selectedTransaction.status)}`}>
                {selectedTransaction.status === "released"
                  ? "✓ Released to your wallet"
                  : selectedTransaction.status === "in_escrow"
                  ? "⏳ Waiting for buyer confirmation"
                  : "💳 Transferred to your bank"}
              </div>
              <button
                onClick={() => setSelectedTransaction(null)}
                className="w-full py-3 text-white rounded-full font-semibold text-sm active:scale-[0.98] transition-all"
                style={{ background: GRAD }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
