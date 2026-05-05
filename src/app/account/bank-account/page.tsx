// src/app/account/bank-account/page.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth, fetchWithAuth } from "@/lib/authStore";
import { GRAD, SERIF } from "@/lib/tokens";
import { ChevronLeft, Banknote, Loader, Check, AlertCircle, Search } from "lucide-react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

interface Bank { name: string; code: string; }

function getVerificationError(error: any): string {
  const msg = (error?.message || error?.error || "").toLowerCase();
  if (msg.includes("invalid key") || msg.includes("unauthorized")) {
    return "Verification unavailable — please try again later";
  }
  if (
    msg.includes("invalid account") || msg.includes("could not resolve") ||
    msg.includes("account not found") || msg.includes("invalid bank")
  ) {
    return "Invalid account number — please check and try again";
  }
  if (msg.includes("timeout") || msg.includes("timed out")) {
    return "Verification timed out — please try again";
  }
  if (msg.includes("network") || msg.includes("fetch")) {
    return "Network error — check your connection and try again";
  }
  return "Invalid account number — please check and try again";
}

export default function BankAccountPage() {
  const { isLoggedIn, isHydrated } = useAuth();
  const router = useRouter();

  const [banks, setBanks] = useState<Bank[]>([]);
  const [banksLoading, setBanksLoading] = useState(true);
  const [bankSearch, setBankSearch] = useState("");
  const [showBankList, setShowBankList] = useState(false);

  const [selectedBank, setSelectedBank] = useState<Bank | null>(null);
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");

  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState("");

  const [pageLoading, setPageLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (isHydrated && !isLoggedIn) router.push("/auth");
  }, [isHydrated, isLoggedIn]);

  // Load banks from Paystack API
  useEffect(() => {
    const loadBanks = async () => {
      try {
        const res = await fetch("https://api.paystack.co/bank?country=nigeria&perPage=200&use_cursor=false");
        if (res.ok) {
          const data = await res.json();
          const raw: Bank[] = data.data?.map((b: any) => ({ name: b.name, code: b.code })) || [];
          const seen = new Set<string>();
          const unique = raw.filter(b => {
            if (seen.has(b.code)) return false;
            seen.add(b.code);
            return true;
          });
          setBanks(unique.length > 0 ? unique : FALLBACK_BANKS);
        } else {
          setBanks(FALLBACK_BANKS);
        }
      } catch {
        setBanks(FALLBACK_BANKS);
      } finally {
        setBanksLoading(false);
      }
    };
    loadBanks();
  }, []);

  // Load existing saved bank account
  useEffect(() => {
    if (!isHydrated || !isLoggedIn) return;
    const load = async () => {
      try {
        const res = await fetchWithAuth(`${API_URL}/api/payments/seller/bank-account/`);
        if (res.ok) {
          const data = await res.json();
          if (data?.account_number) {
            setAccountNumber(data.account_number);
            setAccountName(data.account_name || "");
            if (data.bank_code) {
              setSelectedBank({ name: data.bank_name || data.bank_code, code: data.bank_code });
              setBankSearch(data.bank_name || data.bank_code);
            }
          }
        }
      } catch {} finally { setPageLoading(false); }
    };
    load();
  }, [isHydrated, isLoggedIn]);

  // Auto-verify account name when account_number has 10 digits and bank is selected
  const verifyAccount = useCallback(async (accNum: string, bankCode: string) => {
    if (accNum.length !== 10 || !bankCode) return;
    setVerifying(true);
    setVerifyError("");
    try {
      const res = await fetchWithAuth(`${API_URL}/api/payments/verify-bank-account/`, {
        method: "POST",
        body: JSON.stringify({ account_number: accNum, bank_code: bankCode }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.account_name) {
          setAccountName(data.account_name);
          setVerifyError("");
        } else {
          setVerifyError("Account not found — enter name manually.");
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        setVerifyError(getVerificationError(errData));
      }
    } catch (err) {
      setVerifyError(getVerificationError(err));
    } finally { setVerifying(false); }
  }, []);

  const handleAccountNumberChange = (val: string) => {
    const cleaned = val.replace(/\D/g, "").slice(0, 10);
    setAccountNumber(cleaned);
    setVerifyError("");
    if (cleaned.length === 10 && selectedBank) {
      verifyAccount(cleaned, selectedBank.code);
    }
  };

  const handleSelectBank = (bank: Bank) => {
    setSelectedBank(bank);
    setBankSearch(bank.name);
    setShowBankList(false);
    setVerifyError("");
    if (accountNumber.length === 10) {
      verifyAccount(accountNumber, bank.code);
    }
  };

  const handleSave = async () => {
    if (!selectedBank || !accountNumber || !accountName) {
      setErrorMsg("All fields are required.");
      setStatus("error");
      return;
    }
    if (accountNumber.length !== 10) {
      setErrorMsg("Account number must be exactly 10 digits.");
      setStatus("error");
      return;
    }

    setSaving(true);
    setStatus("idle");
    try {
      const res = await fetchWithAuth(`${API_URL}/api/payments/seller/bank-account/`, {
        method: "POST",
        body: JSON.stringify({
          bank_code: selectedBank.code,
          bank_name: selectedBank.name,
          account_number: accountNumber,
          account_name: accountName,
        }),
      });
      if (res.ok) {
        setStatus("success");
        setTimeout(() => router.push("/account"), 1800);
      } else {
        const err = await res.json();
        setErrorMsg(err.error || err.detail || "Failed to save. Check your details.");
        setStatus("error");
      }
    } catch {
      setErrorMsg("Network error. Please try again.");
      setStatus("error");
    } finally { setSaving(false); }
  };

  const filteredBanks = banks.filter(b =>
    b.name.toLowerCase().includes(bankSearch.toLowerCase())
  );

  const isComplete = selectedBank && accountNumber.length === 10 && accountName.trim();

  if (!isHydrated || pageLoading) {
    return (
      <div className="min-h-screen bg-[#FAFAF9] flex items-center justify-center">
        <Loader className="w-8 h-8 text-teal-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAF9] pb-24" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      {/* HEADER */}
      <div className="sticky top-0 bg-white/80 backdrop-blur-md z-40 border-b border-stone-100 shadow-sm">
        <div className="flex items-center justify-between px-4 py-3 max-w-2xl mx-auto">
          <Link href="/account">
            <button className="p-2.5 bg-white border border-stone-200 rounded-full shadow-sm active:scale-95 transition-all">
              <ChevronLeft className="w-5 h-5 text-stone-600" />
            </button>
          </Link>
          <div className="text-center">
            <h1 className="text-base font-bold text-stone-900" style={SERIF}>
              Payout Account
            </h1>
            <p className="text-xs text-stone-500">Where your earnings are sent</p>
          </div>
          <div className="w-10" />
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-5 space-y-5">
        {/* Info Banner */}
        <div className="bg-teal-50 border border-teal-200 rounded-2xl p-4 flex items-start gap-3">
          <Banknote className="w-5 h-5 text-teal-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-teal-800 text-sm">How payouts work</p>
            <p className="text-xs text-teal-700 mt-1">
              When a customer pays, your earnings are sent to this account via Paystack's standard settlement cycle (usually 1-2 business days).
            </p>
          </div>
        </div>

        {/* Form */}
        <div className="bg-white rounded-2xl p-5 border border-stone-200 shadow-sm space-y-5">

          {/* Bank Selector */}
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

          {/* Account Number */}
          <div>
            <label className="text-xs text-stone-500 font-semibold uppercase tracking-wide mb-2 block">Account Number</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={10}
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

          {/* Account Name */}
          <div>
            <label className="text-xs text-stone-500 font-semibold uppercase tracking-wide mb-2 block">
              Account Name
              {accountName && !verifying && (
                <span className="ml-2 text-teal-600 normal-case font-normal">✓ Verified</span>
              )}
            </label>
            <input
              type="text"
              value={accountName}
              onChange={e => setAccountName(e.target.value)}
              placeholder="Auto-filled or enter manually"
              className={`w-full bg-white border rounded-xl px-4 py-3 text-stone-900 text-sm focus:outline-none transition ${
                accountName ? "border-teal-500/60 focus:ring-2 focus:ring-teal-500/30" : "border-stone-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30"
              }`}
            />
          </div>

          {/* Status Messages */}
          {status === "error" && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{errorMsg}</p>
            </div>
          )}
          {status === "success" && (
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
              <Check className="w-4 h-4 text-emerald-600" />
              <p className="text-sm text-emerald-700">Bank account saved! Redirecting...</p>
            </div>
          )}

          {/* Save Button */}
          <button onClick={handleSave} disabled={saving || !isComplete}
            className="w-full py-4 text-white disabled:opacity-40 disabled:cursor-not-allowed rounded-full font-semibold transition flex items-center justify-center gap-2 shadow-lg"
            style={{ background: GRAD }}>
            {saving ? <><Loader className="w-5 h-5 animate-spin" /> Saving...</> : <><Check className="w-5 h-5" /> Save Bank Account</>}
          </button>
        </div>

        <p className="text-xs text-stone-400 text-center px-4">
          Your bank details are encrypted and only used for payouts via Paystack. We never charge your account.
        </p>
      </div>
    </div>
  );
}

// Fallback in case Paystack API is unavailable
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
