// src/app/admin/bank-accounts/page.tsx
"use client";

import { CreditCard, Search, ToggleLeft, ToggleRight } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminTopBar from "@/components/layout/AdminTopBar";
import { api, fetchAllPages, BASE_URL } from "@/lib/api";

export default function AdminBankAccountsPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [toggling, setToggling] = useState<number | null>(null);

  const load = (s = search) => {
    setLoading(true);
    let url = `${BASE_URL}/api/admin/bank-accounts/?`;
    if (s) url += `search=${encodeURIComponent(s)}`;
    fetchAllPages(url)
      .then(d => setAccounts(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const toggleActive = async (account: any) => {
    setToggling(account.id);
    try {
      const res = await api.admin.updateBankAccount(account.id, { is_active: !account.is_active });
      if (res.ok) {
        const updated = await res.json();
        setAccounts(prev => prev.map(a => a.id === updated.id ? { ...a, is_active: updated.is_active } : a));
      }
    } catch {}
    finally { setToggling(null); }
  };

  return (
    <div className="min-h-screen bg-[#F5F5F5]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <AdminTopBar title="Bank Accounts" back="/admin" />

      <div className="px-4 pt-4 pb-28 max-w-2xl mx-auto space-y-3">

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input className="w-full bg-white border border-stone-200 rounded-xl pl-9 pr-4 py-2.5 text-sm placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-teal-400"
            placeholder="Search seller, bank, account number…"
            value={search} onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === "Enter" && load(search)} />
        </div>

        {!loading && <p className="text-xs text-stone-400">{accounts.length} bank account{accounts.length !== 1 ? "s" : ""}</p>}

        {loading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white border border-stone-200 rounded-2xl p-4 h-24 animate-pulse" />
            ))}
          </div>
        ) : accounts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <CreditCard className="w-10 h-10 text-stone-300" />
            <p className="text-stone-400 text-sm">No bank accounts found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {accounts.map((a: any) => (
              <div key={a.id} className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-stone-900 text-sm">@{a.username}</p>
                      {a.business_name && <p className="text-stone-500 text-xs">{a.business_name}</p>}
                    </div>
                    <p className="text-stone-600 text-sm mt-1">{a.bank_name}</p>
                    <p className="text-stone-500 text-xs mt-0.5">{a.account_name} · {a.account_number}</p>
                    {a.paystack_recipient_code && (
                      <p className="text-stone-400 text-xs mt-0.5 font-mono">RCP: {a.paystack_recipient_code}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${a.is_active ? "bg-teal-100 text-teal-700" : "bg-red-100 text-red-600"}`}>
                      {a.is_active ? "Active" : "Inactive"}
                    </span>
                    <button onClick={() => toggleActive(a)} disabled={toggling === a.id}
                      className="text-stone-400 hover:text-teal-600 transition disabled:opacity-50">
                      {a.is_active
                        ? <ToggleRight className="w-6 h-6 text-teal-500" />
                        : <ToggleLeft className="w-6 h-6 text-stone-400" />}
                    </button>
                    <button onClick={() => router.push(`/admin/users/${a.user_id}`)}
                      className="text-xs text-teal-600 font-semibold">View User</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
