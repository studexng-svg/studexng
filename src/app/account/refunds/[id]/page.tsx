// src/app/account/refunds/[id]/page.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/authStore";
import { TEAL, PURPLE } from "@/lib/tokens";
import { Banknote, Loader, Check, AlertCircle, Search, Clock, PartyPopper } from "lucide-react";
import TopNav from "@/components/layout/TopNav";
import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

interface Bank { name: string; code: string; }

const FALLBACK_BANKS: Bank[] = [
  { name: "Access Bank", code: "044" },
  { name: "Citibank", code: "023" },
  { name: "Ecobank Nigeria", code: "050" },
  { name: "Fidelity Bank", code: "070" },
  { name: "First Bank of Nigeria", code: "011" },
  { name: "First City Monument Bank (FCMB)", code: "214" },
  { name: "Globus Bank", code: "00103" },
  { name: "Guaranty Trust Bank", code: "058" },
  { name: "Heritage Bank", code: "030" },
  { name: "Keystone Bank", code: "082" },
  { name: "Kuda Bank", code: "999992" },
  { name: "Moniepoint MFB", code: "090405" },
  { name: "OPay", code: "526" },
  { name: "PalmPay", code: "999991" },
  { name: "Polaris Bank", code: "076" },
  { name: "Providus Bank", code: "101" },
  { name: "Stanbic IBTC Bank", code: "221" },
  { name: "Standard Chartered", code: "068" },
  { name: "Sterling Bank", code: "232" },
  { name: "Union Bank", code: "032" },
  { name: "United Bank for Africa (UBA)", code: "033" },
  { name: "Unity Bank", code: "215" },
  { name: "VFD Microfinance Bank", code: "090110" },
  { name: "Wema Bank", code: "035" },
  { name: "Zenith Bank", code: "057" },
];

interface RefundData {
  id: number;
  amount: number;
  reason: string;
  status: "awaiting_bank_details" | "awaiting_admin_action" | "completed";
  order_reference: string;
  item_title: string | null;
  buyer_account_name: string;
  buyer_account_number: string;
  buyer_bank_name: string;
}

export default function ManualRefundPage() {
  const { id } = useParams();
  const router = useRouter();
  const { isLoggedIn, isHydrated } = useAuth();

  const [refund, setRefund] = useState<RefundData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [bankSearch, setBankSearch] = useState("");
  const [showBankList, setShowBankList] = useState(false);
  const [selectedBank, setSelectedBank] = useState<Bank | null>(null);
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (isHydrated && !isLoggedIn) router.push("/auth");
  }, [isHydrated, isLoggedIn, router]);

  useEffect(() => {
    if (!id || !isLoggedIn) return;
    api.payments.manualRefund(id as string)
      .then(async r => {
        if (!r.ok) { setNotFound(true); return; }
        setRefund(await r.json());
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id, isLoggedIn]);

  const { data: banksData, isPending: banksLoading } = useQuery({
    queryKey: ["paystack-banks"],
    queryFn: async (): Promise<Bank[]> => {
      const res = await api.pub.paystackBanks();
      if (!res.ok) return FALLBACK_BANKS;
      const data = await res.json();
      const raw: Bank[] = data.data?.map((b: any) => ({ name: b.name, code: b.code })) || [];
      const seen = new Set<string>();
      const unique = raw.filter(b => { if (seen.has(b.code)) return false; seen.add(b.code); return true; });
      return unique.length > 0 ? unique : FALLBACK_BANKS;
    },
    staleTime: 3_600_000,
    retry: false,
    enabled: refund?.status === "awaiting_bank_details",
  });
  const banks = banksData ?? FALLBACK_BANKS;

  const verifyAccount = useCallback(async (accNum: string, bankCode: string) => {
    if (accNum.length !== 10 || !bankCode) return;
    setVerifying(true); setVerifyError("");
    try {
      const res = await api.payments.verifyBankAccount({ account_number: accNum, bank_code: bankCode });
      if (res.ok) {
        const data = await res.json();
        if (data.account_name) setAccountName(data.account_name);
        else setVerifyError("Account not found — enter name manually.");
      } else {
        setVerifyError("Invalid account number — please check and try again");
      }
    } catch { setVerifyError("Network error — check your connection and try again"); }
    finally { setVerifying(false); }
  }, []);

  const handleAccountNumberChange = (val: string) => {
    const cleaned = val.replace(/\D/g, "").slice(0, 10);
    setAccountNumber(cleaned);
    setVerifyError("");
    if (cleaned.length === 10 && selectedBank) verifyAccount(cleaned, selectedBank.code);
  };

  const handleSelectBank = (bank: Bank) => {
    setSelectedBank(bank);
    setBankSearch(bank.name);
    setShowBankList(false);
    setVerifyError("");
    if (accountNumber.length === 10) verifyAccount(accountNumber, bank.code);
  };

  const isComplete = selectedBank && accountNumber.length === 10 && accountName.trim();

  const handleSubmit = async () => {
    if (!refund || !selectedBank || !accountNumber || !accountName) {
      setSubmitError("All fields are required.");
      return;
    }
    if (accountNumber.length !== 10) { setSubmitError("Account number must be exactly 10 digits."); return; }

    setSubmitting(true); setSubmitError("");
    try {
      const res = await api.payments.submitManualRefundBankDetails(refund.id, {
        account_name: accountName,
        account_number: accountNumber,
        bank_name: selectedBank.name,
      });
      if (res.ok) {
        setSubmitted(true);
        setRefund(r => r ? { ...r, status: "awaiting_admin_action", buyer_account_name: accountName, buyer_account_number: accountNumber, buyer_bank_name: selectedBank.name } : r);
      } else {
        const d = await res.json().catch(() => ({}));
        setSubmitError(d.error || "Could not submit. Please try again.");
      }
    } catch { setSubmitError("Network error. Please try again."); }
    finally { setSubmitting(false); }
  };

  const filteredBanks = banks.filter(b => b.name.toLowerCase().includes(bankSearch.toLowerCase()));

  if (!isHydrated || loading) {
    return (
      <div className="min-h-screen bg-[#F5F5F5] flex items-center justify-center">
        <Loader className="w-8 h-8 text-teal-600 animate-spin" />
      </div>
    );
  }

  if (notFound || !refund) {
    return (
      <div className="min-h-screen bg-[#F5F5F5] flex flex-col items-center justify-center gap-4 px-6 text-center">
        <AlertCircle className="w-10 h-10 text-stone-300" />
        <p className="text-stone-500 text-sm">We couldn't find this refund, or it isn't yours.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F5F5] pb-24" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <TopNav showBack />

      <div className="max-w-lg mx-auto px-4 pt-5 space-y-5">
        {/* Refund summary */}
        <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 flex items-start gap-3">
          <Banknote className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-purple-800 text-sm">
              ₦{refund.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} owed to you
            </p>
            <p className="text-xs text-purple-700 mt-1">
              {refund.item_title ? `"${refund.item_title}" from order ` : "Order "}
              #{refund.order_reference} was unavailable. Since you paid by bank transfer, we need your account details to send this back.
            </p>
          </div>
        </div>

        {refund.status === "completed" ? (
          <div className="bg-white rounded-2xl p-6 border border-stone-200 shadow-sm text-center space-y-2">
            <PartyPopper className="w-10 h-10 text-teal-600 mx-auto" />
            <p className="font-bold text-stone-900">Refund Sent!</p>
            <p className="text-sm text-stone-500">
              ₦{refund.amount.toLocaleString()} was sent to {refund.buyer_account_name} ({refund.buyer_bank_name}).
            </p>
          </div>
        ) : refund.status === "awaiting_admin_action" || submitted ? (
          <div className="bg-white rounded-2xl p-6 border border-stone-200 shadow-sm text-center space-y-2">
            <Clock className="w-10 h-10 text-purple-600 mx-auto" />
            <p className="font-bold text-stone-900">Details Received</p>
            <p className="text-sm text-stone-500">
              We'll send ₦{refund.amount.toLocaleString()} to {refund.buyer_account_name || accountName} shortly.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-5 border border-stone-200 shadow-sm space-y-5">
            <div>
              <label className="text-xs text-stone-500 font-semibold uppercase tracking-wide mb-2 block">Bank Name</label>
              <div className="relative">
                <div className="flex items-center bg-white border border-stone-200 rounded-xl px-4 py-3 gap-2 focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-500/30 transition">
                  <Search className="w-4 h-4 text-stone-400 flex-shrink-0" />
                  <input
                    value={bankSearch}
                    onChange={e => { setBankSearch(e.target.value); setShowBankList(true); setSelectedBank(null); }}
                    onFocus={() => setShowBankList(true)}
                    placeholder={banksLoading ? "Loading banks..." : "Search your bank..."}
                    className="flex-1 bg-transparent text-stone-900 text-sm placeholder-stone-400 focus:outline-none"
                  />
                  {selectedBank && <Check className="w-4 h-4 text-teal-500 flex-shrink-0" />}
                </div>
                {showBankList && bankSearch.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-stone-200 rounded-xl overflow-hidden z-50 max-h-52 overflow-y-auto shadow-xl">
                    {filteredBanks.length === 0 ? (
                      <p className="p-4 text-sm text-stone-500 text-center">No banks found</p>
                    ) : filteredBanks.map((bank, idx) => (
                      <button key={`${bank.code}-${idx}`} onClick={() => handleSelectBank(bank)}
                        className="w-full text-left px-4 py-3 text-sm text-stone-800 hover:bg-stone-50 border-b border-stone-100 last:border-0 transition">
                        {bank.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="text-xs text-stone-500 font-semibold uppercase tracking-wide mb-2 block">Account Number</label>
              <input
                type="text" inputMode="numeric" maxLength={10}
                value={accountNumber}
                onChange={e => handleAccountNumberChange(e.target.value)}
                placeholder="10-digit NUBAN"
                className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-stone-900 text-sm focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30 transition font-mono tracking-[0.2em]"
              />
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-stone-400">{accountNumber.length}/10</span>
                {verifying && (
                  <span className="text-xs text-teal-600 flex items-center gap-1">
                    <Loader className="w-3 h-3 animate-spin" /> Verifying...
                  </span>
                )}
              </div>
              {verifyError && (
                <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> {verifyError}
                </p>
              )}
            </div>

            <div>
              <label className="text-xs text-stone-500 font-semibold uppercase tracking-wide mb-2 block">
                Account Name
                {accountName && !verifying && <span className="ml-2 text-teal-600 normal-case font-normal">✓ Verified</span>}
              </label>
              <input
                type="text" value={accountName} onChange={e => setAccountName(e.target.value)}
                placeholder="Auto-filled or enter manually"
                className={`w-full bg-white border rounded-xl px-4 py-3 text-stone-900 text-sm focus:outline-none transition ${
                  accountName ? "border-teal-500/60 focus:ring-2 focus:ring-teal-500/30" : "border-stone-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30"
                }`}
              />
            </div>

            {submitError && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{submitError}</p>
              </div>
            )}

            <button onClick={handleSubmit} disabled={submitting || !isComplete}
              className="w-full py-4 text-white disabled:opacity-40 disabled:cursor-not-allowed rounded-full font-semibold transition flex items-center justify-center gap-2 shadow-lg"
              style={{ background: PURPLE }}>
              {submitting ? <><Loader className="w-5 h-5 animate-spin" /> Submitting...</> : <><Check className="w-5 h-5" /> Submit Bank Details</>}
            </button>
          </div>
        )}

        <p className="text-xs text-stone-400 text-center px-4">
          Your bank details are only used to send you this refund.
        </p>
      </div>
    </div>
  );
}
