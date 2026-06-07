"use client";

import { Trash2, Plus, Loader2, Search, Tag, Pencil, Check, X, ToggleLeft, ToggleRight } from "lucide-react";
import AdminTopBar from "@/components/layout/AdminTopBar";
import { useState, useEffect, useCallback } from "react";
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
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingListings, setLoadingListings] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedListingId, setSelectedListingId] = useState<number | null>(null);
  const [discountPercent, setDiscountPercent] = useState("");
  const [savingDeal, setSavingDeal] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDiscount, setEditDiscount] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const showError = useCallback((msg: string) => {
    setError(msg);
    setTimeout(() => setError(""), 4000);
  }, []);

  const showSuccess = useCallback((msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(""), 3000);
  }, []);

  const loadDeals = async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth(`${API_URL}/api/admin/deals/`);
      if (res.ok) {
        const data = await res.json();
        setDeals(Array.isArray(data) ? data : []);
      } else {
        showError("Failed to load deals");
      }
    } catch {
      showError("Failed to load deals");
    } finally {
      setLoading(false);
    }
  };

  const loadListings = async () => {
    setLoadingListings(true);
    try {
      const res = await fetchWithAuth(`${API_URL}/api/admin/listings/`);
      if (res.ok) {
        const data = await res.json();
        const items = Array.isArray(data) ? data : (data.results ?? []);
        setListings(items);
      }
    } catch {
      // non-critical, dropdown will just be empty
    } finally {
      setLoadingListings(false);
    }
  };

  useEffect(() => {
    loadDeals();
    loadListings();
  }, []);

  // Listings not yet on any deal
  const dealListingIds = new Set(deals.map((d) => d.listing?.id));
  const availableListings = listings.filter((l) => !dealListingIds.has(l.id));

  const validateDiscount = (value: string): number | null => {
    if (!/^\d+$/.test(value.trim())) return null;
    const n = parseInt(value, 10);
    return n >= 1 && n <= 100 ? n : null;
  };

  const saveDeal = async () => {
    if (!selectedListingId) {
      showError("Please select a listing");
      return;
    }
    const percent = validateDiscount(discountPercent);
    if (percent === null) {
      showError("Discount must be a whole number between 1 and 100");
      return;
    }

    setSavingDeal(true);
    try {
      const res = await fetchWithAuth(`${API_URL}/api/admin/deals/`, {
        method: "POST",
        body: JSON.stringify({ listing_id: selectedListingId, discount_percent: percent }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save deal");
      }

      await loadDeals();
      showSuccess("Deal created!");
      setSelectedListingId(null);
      setDiscountPercent("");
    } catch (e: any) {
      showError(e.message || "Failed to save deal");
    } finally {
      setSavingDeal(false);
    }
  };

  const startEdit = (deal: any) => {
    setEditingId(deal.id);
    setEditDiscount(String(deal.discount_percent));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDiscount("");
  };

  const saveEdit = async (dealId: number) => {
    const percent = validateDiscount(editDiscount);
    if (percent === null) {
      showError("Discount must be a whole number between 1 and 100");
      return;
    }

    setSavingEdit(true);
    try {
      const res = await fetchWithAuth(`${API_URL}/api/admin/deals/${dealId}/`, {
        method: "PATCH",
        body: JSON.stringify({ discount_percent: percent }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update deal");
      }

      await loadDeals();
      showSuccess("Deal updated!");
      cancelEdit();
    } catch (e: any) {
      showError(e.message || "Failed to update deal");
    } finally {
      setSavingEdit(false);
    }
  };

  const toggleActive = async (deal: any) => {
    setTogglingId(deal.id);
    try {
      const res = await fetchWithAuth(`${API_URL}/api/admin/deals/${deal.id}/`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !deal.is_active }),
      });

      if (!res.ok) throw new Error("Failed to toggle deal");
      await loadDeals();
    } catch (e: any) {
      showError(e.message || "Failed to toggle deal");
    } finally {
      setTogglingId(null);
    }
  };

  const deleteDeal = async (dealId: number) => {
    if (!window.confirm("Delete this deal?")) return;

    setDeletingId(dealId);
    try {
      const res = await fetchWithAuth(`${API_URL}/api/admin/deals/${dealId}/`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Failed to delete");
      await loadDeals();
      showSuccess("Deal deleted");
    } catch (e: any) {
      showError(e.message || "Failed to delete deal");
    } finally {
      setDeletingId(null);
    }
  };

  const filteredDeals = deals.filter(
    (deal) =>
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
                onChange={(e) => setSelectedListingId(e.target.value ? parseInt(e.target.value, 10) : null)}
                disabled={loadingListings}
                className="w-full px-3 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-900 focus:outline-none focus:border-teal-400 disabled:opacity-60"
              >
                <option value="">
                  {loadingListings ? "Loading listings..." : "Choose a product or service..."}
                </option>
                {availableListings.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.title} — ₦{parseFloat(l.price).toLocaleString()}
                    {l.vendor?.username ? ` (@${l.vendor.username})` : ""}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Discount % (1–100)">
              <input
                type="number"
                min="1"
                max="100"
                step="1"
                value={discountPercent}
                onChange={(e) => setDiscountPercent(e.target.value)}
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
                onChange={(e) => setSearchQuery(e.target.value)}
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
                    <th className="px-6 py-3 text-left text-xs font-semibold text-stone-600">Active</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-stone-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {filteredDeals.map((deal) => (
                    <tr key={deal.id} className="hover:bg-stone-50 transition">
                      <td className="px-6 py-4">
                        <p className="font-medium text-stone-900 text-sm">{deal.listing?.title}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-stone-600">@{deal.listing?.vendor?.username}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-medium text-stone-900">
                          ₦{parseFloat(deal.listing?.price).toLocaleString()}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        {editingId === deal.id ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min="1"
                              max="100"
                              step="1"
                              value={editDiscount}
                              onChange={(e) => setEditDiscount(e.target.value)}
                              className="w-16 px-2 py-1 bg-stone-50 border border-teal-400 rounded-lg text-xs text-stone-900 focus:outline-none"
                              autoFocus
                            />
                            <span className="text-xs text-stone-500">%</span>
                            {savingEdit ? (
                              <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
                            ) : (
                              <>
                                <button
                                  onClick={() => saveEdit(deal.id)}
                                  className="text-teal-600 hover:text-teal-700 transition"
                                  title="Save"
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={cancelEdit}
                                  className="text-stone-400 hover:text-stone-600 transition"
                                  title="Cancel"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </div>
                        ) : (
                          <div className="bg-red-50 text-red-700 px-3 py-1 rounded-full text-xs font-bold inline-block">
                            -{deal.discount_percent}%
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-bold text-teal-600">
                          ₦{parseFloat(deal.discounted_price).toLocaleString()}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => toggleActive(deal)}
                          disabled={togglingId === deal.id}
                          className="transition disabled:opacity-50"
                          title={deal.is_active ? "Deactivate" : "Activate"}
                        >
                          {togglingId === deal.id ? (
                            <Loader2 className="w-5 h-5 animate-spin text-stone-400" />
                          ) : deal.is_active ? (
                            <ToggleRight className="w-6 h-6 text-teal-600" />
                          ) : (
                            <ToggleLeft className="w-6 h-6 text-stone-400" />
                          )}
                        </button>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {editingId !== deal.id && (
                            <button
                              onClick={() => startEdit(deal)}
                              className="text-stone-500 hover:text-teal-600 transition"
                              title="Edit discount"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => deleteDeal(deal.id)}
                            disabled={deletingId === deal.id}
                            className="text-red-600 hover:text-red-700 transition disabled:opacity-50"
                            title="Delete deal"
                          >
                            {deletingId === deal.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                        </div>
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
