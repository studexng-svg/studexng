"use client";

import { Trash2, Plus, Loader2, Search, Tag } from "lucide-react";
import AdminTopBar from "@/components/layout/AdminTopBar";
import { useState, useEffect } from "react";
import { fetchWithAuth } from "@/lib/authStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-stone-500 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

export default function DealsPage() {
  const [deals, setDeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedListingId, setSelectedListingId] = useState<number | null>(null);
  const [discountPercent, setDiscountPercent] = useState("");
  const [savingDeal, setSavingDeal] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    loadDeals();
  }, []);

  const loadDeals = async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth(`${API_URL}/api/admin/deals/`);
      if (res.ok) {
        const data = await res.json();
        setDeals(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      setError("Failed to load deals");
    } finally {
      setLoading(false);
    }
  };

  const saveDeal = async () => {
    if (!selectedListingId || !discountPercent) {
      setError("Please select a listing and enter a discount");
      return;
    }

    const percent = parseInt(discountPercent);
    if (percent < 0 || percent > 100) {
      setError("Discount must be between 0 and 100");
      return;
    }

    setSavingDeal(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetchWithAuth(`${API_URL}/api/admin/deals/`, {
        method: "POST",
        body: JSON.stringify({
          listing_id: selectedListingId,
          discount_percent: percent,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save deal");
      }

      await loadDeals();
      setSuccess("Deal saved successfully!");
      setSelectedListingId(null);
      setDiscountPercent("");
      setTimeout(() => setSuccess(""), 3000);
    } catch (e: any) {
      setError(e.message || "Failed to save deal");
    } finally {
      setSavingDeal(false);
    }
  };

  const deleteDeal = async (dealId: number) {
    if (!window.confirm("Delete this deal?")) return;

    setDeletingId(dealId);
    try {
      const res = await fetchWithAuth(`${API_URL}/api/admin/deals/${dealId}/`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Failed to delete");
      await loadDeals();
      setSuccess("Deal deleted");
      setTimeout(() => setSuccess(""), 3000);
    } catch (e: any) {
      setError(e.message || "Failed to delete deal");
    } finally {
      setDeletingId(null);
    }
  };

  const filteredDeals = deals.filter(deal =>
    deal.listing?.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    deal.listing?.vendor?.username?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-stone-50">
      <AdminTopBar />
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div>
          <h1 className="text-3xl font-black text-stone-900">Deals Management</h1>
          <p className="text-stone-500 mt-1">Create and manage product discounts</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-teal-50 border border-teal-200 text-teal-700 px-4 py-3 rounded-xl text-sm">
            ✓ {success}
          </div>
        )}

        {/* Create Deal Section */}
        <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm space-y-4">
          <h2 className="text-lg font-bold text-stone-900 flex items-center gap-2">
            <Plus className="w-5 h-5 text-teal-600" /> Add New Deal
          </h2>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Select Listing">
              <select
                value={selectedListingId || ""}
                onChange={e => setSelectedListingId(e.target.value ? parseInt(e.target.value) : null)}
                className="w-full px-3 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-900 focus:outline-none focus:border-teal-400"
              >
                <option value="">Choose a product or service...</option>
                {deals.length > 0 && (
                  <optgroup label="Already on deals">
                    {deals.map(d => (
                      <option key={d.listing?.id} value={d.listing?.id} disabled>
                        {d.listing?.title} — {d.discount_percent}% off
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </Field>

            <Field label="Discount %">
              <input
                type="number"
                min="0"
                max="100"
                value={discountPercent}
                onChange={e => setDiscountPercent(e.target.value)}
                placeholder="e.g., 20"
                className="w-full px-3 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-teal-400"
              />
            </Field>
          </div>

          <button
            onClick={saveDeal}
            disabled={savingDeal || !selectedListingId || !discountPercent}
            className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition disabled:opacity-40 bg-teal-600 hover:bg-teal-700 text-white"
          >
            {savingDeal ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {savingDeal ? "Saving..." : "Create Deal"}
          </button>
        </div>

        {/* Deals List */}
        <div className="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-stone-200">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search deals by product or vendor..."
                className="w-full pl-10 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-teal-400"
              />
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-center text-stone-400">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
              Loading deals...
            </div>
          ) : filteredDeals.length === 0 ? (
            <div className="p-8 text-center text-stone-400">
              <Tag className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="font-medium">No deals yet</p>
              <p className="text-xs mt-1">Create your first deal above</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-stone-200 bg-stone-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-stone-600">Product / Service</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-stone-600">Vendor</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-stone-600">Original Price</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-stone-600">Discount</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-stone-600">Discounted Price</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-stone-600">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {filteredDeals.map(deal => (
                    <tr key={deal.id} className="hover:bg-stone-50 transition">
                      <td className="px-6 py-4">
                        <p className="font-medium text-stone-900 text-sm">{deal.listing?.title}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-stone-600">@{deal.listing?.vendor?.username}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-medium text-stone-900">₦{parseFloat(deal.listing?.price).toLocaleString()}</p>
                      </td>
                      <td className="px-6 py-4">
                        <div className="bg-red-50 text-red-700 px-3 py-1 rounded-full text-xs font-bold inline-block">
                          -{deal.discount_percent}%
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-bold text-teal-600">₦{parseFloat(deal.discounted_price).toLocaleString()}</p>
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => deleteDeal(deal.id)}
                          disabled={deletingId === deal.id}
                          className="text-red-600 hover:text-red-700 transition disabled:opacity-50"
                        >
                          {deletingId === deal.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
