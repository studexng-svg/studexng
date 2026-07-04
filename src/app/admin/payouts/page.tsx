// src/app/admin/payouts/page.tsx
"use client";

import { DollarSign, CreditCard, ArrowUpRight, ChevronRight } from "lucide-react";
import Link from "next/link";
import AdminTopBar from "@/components/layout/AdminTopBar";

export default function AdminPayoutsPage() {
  return (
    <div className="min-h-screen bg-[#F5F5F5]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <AdminTopBar title="Payouts" back="/admin" />

      <div className="px-6 pt-5 pb-28 space-y-3">
        <p className="text-teal-600 text-xs tracking-[0.2em] uppercase font-semibold">Payout Management</p>

        <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
          <Link href="/admin/payments">
            <div className="border-b border-stone-100 last:border-0 p-4 flex items-center justify-between hover:bg-stone-50/50 cursor-pointer transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-teal-100 rounded-xl flex items-center justify-center">
                  <DollarSign className="w-5 h-5 text-teal-600" />
                </div>
                <div>
                  <p className="font-semibold text-stone-900 text-sm">Payment Transactions</p>
                  <p className="text-stone-400 text-xs">All Paystack payments and transfer logs</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-stone-400" />
            </div>
          </Link>

          <Link href="/admin/bank-accounts">
            <div className="border-b border-stone-100 last:border-0 p-4 flex items-center justify-between hover:bg-stone-50/50 cursor-pointer transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                  <CreditCard className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="font-semibold text-stone-900 text-sm">Seller Bank Accounts</p>
                  <p className="text-stone-400 text-xs">Paystack recipient codes and account details</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-stone-400" />
            </div>
          </Link>

          <Link href="/admin/transactions">
            <div className="border-b border-stone-100 last:border-0 p-4 flex items-center justify-between hover:bg-stone-50/50 cursor-pointer transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                  <ArrowUpRight className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <p className="font-semibold text-stone-900 text-sm">Payout Transactions</p>
                  <p className="text-stone-400 text-xs">Escrow → released → withdrawn flow</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-stone-400" />
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
