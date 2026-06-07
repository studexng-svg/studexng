"use client";

import { Trash2, Plus, Loader2, Search, Tag, Pencil, Check, X, ToggleLeft, ToggleRight, Store, Clock } from "lucide-react";
import AdminTopBar from "@/components/layout/AdminTopBar";
import { useState, useEffect, useCallback, useRef } from "react";
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
  const [deals, setDeals]               = useState<any[]>([]);
  const [loading, setLoading]           = useState(true);
  const [dealSearch, setDealSearch]     = useState("");

  // Listing search state (replaces the full paginated fetch)
  const [listingQuery, setListingQuery]       = useState("");
  const [listingResults, setListingResults]   = useState<any[]>([]);
  const [searchingListings, setSearchingListings] = useState(false);
  const [showDropdown, setShowDropdown]       = useState(false);
  const [selectedListing, setSelectedListing] = useState<any | null>(null);

  const [discountPercent, setDiscountPercent] = useState("");
  const [savingDeal, setSavingDeal]     = useState(false);
  const [error, setError]               = useState("");
  const [success, setSuccess]           = useState("");
  const [deletingId, setDeletingId]     = useState<number | null>(null);
  const [editingId, setEditingId]       = useState<number | null>(null);
  const [editDiscount, setEditDiscount] = useState("");
  const [savingEdit, setSavingEdit]     = useState(false);
  const [togglingId, setTogglingId]     = useState<number | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const showError = useCallback((msg: string) => {
    setError(msg);
    setTimeout(() => setError(""), 4000);
  }, []);

  const showSuccess = useCallback((msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(""), 3000);
  }, []);

  // ── Load existing deals (single request, small payload) ──────────────
  const loadDeals = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth(`${API_URL}/api/admin/deals/`);
      if (res.ok) { const d = await res.json(); setDeals(Array.isArray(d) ? d : []); }
    } catch {
      showError("Failed to load deals");
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => { loadDeals(); }, [loadDeals]);

  // ── Listing search — debounced, fires only when admin types ──────────
  const dealListingIds = new Set(deals.map((d) => d.listing?.id));

  const searchListings = useCallback(async (query: string) => {
    if (!query.trim()) { setListingResults([]); setShowDropdown(false); return; }
    setSearchingListings(true);
    try {
      const res = await fetchWithAuth(
        `${API_URL}/api/admin/listings/?search=${encodeURIComponent(query)}&page_size=8`
      );
      if (!res.ok) return;
      const data = await res.json();
      const items: any[] = Array.isArray(data) ? data : (data.results ?? []);
      // Filter out listings already on a deal
      setListingResults(items.filter((l) => !dealListingIds.has(l.id)));
      setShowDropdown(true);
    } catch {
      // silently ignore
    } finally {
      setSearchingListings(false);
    }
  }, [dealListingIds]);

  const handleListingQueryChange = (value: string) => {
    setListingQuery(value);
    setSelectedListing(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchListings(value), 300);
  };

  const selectListing = (listing: any) => {
    setSelectedListing(listing);
    setListingQuery(listing.title);
    setShowDropdown(false);
  };

  const clearSelection = () => {
    setSelectedListing(null);
    setListingQuery("");
    setListingResults([]);
    setShowDropdown(false);
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Validation ───────────────────────────────────────────────────────
  const validateDiscount = (value: string): number | null => {
    if (!/^\d+$/.test(value.trim())) return null;
    const n = parseInt(value, 10);
    return n >= 1 && n <= 100 ? n : null;
  };

  // ── Create deal ──────────────────────────────────────────────────────
  const saveDeal = async () => {
    if (!selectedListing) { showError("Please select a listing"); return; }
    const percent = validateDiscount(discountPercent);
    if (percent === null) { showError("Discount must be a whole number between 1 and 100"); return; }

    setSavingDeal(true);
    try {
      const res = await fetchWithAuth(`${API_URL}/api/admin/deals/`, {
        method: "POST",
        body: JSON.stringify({ listing_id: selectedListing.id, discount_percent: percent }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save deal");
      }
      await loadDeals();
      showSuccess("Deal created!");
      clearSelection();
      setDiscountPercent("");
    } catch (e: any) {
      showError(e.message || "Failed to save deal");
    } finally {
      setSavingDeal(false);
    }
  };

  // ── Edit / toggle / delete ───────────────────────────────────────────
  const startEdit  = (deal: any) => { setEditingId(deal.id); setEditDiscount(String(deal.discount_percent)); };
  const cancelEdit = () => { setEditingId(null); setEditDiscount(""); };

  const saveEdit = async (dealId: number) => {
    const percent = validateDiscount(editDiscount);
    if (percent === null) { showError("Discount must be a whole number between 1 and 100"); return; }
    setSavingEdit(true);
    try {
      const res = await fetchWithAuth(`${API_URL}/api/admin/deals/${dealId}/`, {
        method: "PATCH",
        body: JSON.stringify({ discount_percent: percent }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed to update deal"); }
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
      const res = await fetchWithAuth(`${API_URL}/api/admin/deals/${dealId}/`, { method: "DELETE" });
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
      deal.listing?.title?.toLowerCase().includes(dealSearch.toLowerCase()) ||
      deal.listing?.vendor?.username?.toLowerCase().includes(dealSearch.toLowerCase()) ||
      (deal.source === 'vendor' && 'vendor'.includes(dealSearch.toLowerCase()))
  );

  const isVendorDeal = (deal: any) => deal.source === 'vendor';

  const fmt = (iso: string | null) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="min-h-screen bg-stone-50">
      <AdminTopBar />
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div>
          <h1 className="text-3xl font-black text-stone-900">Deals Management</h1>
          <p className="text-stone-500 mt-1">Create and manage product discounts</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>
        )}
        {success && (
          <div className="bg-teal-50 border border-teal-200 text-teal-700 px-4 py-3 rounded-xl text-sm">✓ {success}</div>
        )}

        {/* ── Create Deal ── */}
        <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm space-y-4">
          <h2 className="text-lg font-bold text-stone-900 flex items-center gap-2">
            <Plus className="w-5 h-5 text-teal-600" /> Add New Deal
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Search Listing">
              <div className="relative" ref={dropdownRef}>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
                  <input
                    type="text"
                    value={listingQuery}
                    onChange={(e) => handleListingQueryChange(e.target.value)}
                    onFocus={() => listingResults.length > 0 && setShowDropdown(true)}
                    placeholder="Type product name to search..."
                    className="w-full pl-9 pr-8 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-teal-400"
                  />
                  {searchingListings && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-stone-400" />
                  )}
                  {selectedListing && !searchingListings && (
                    <button onClick={clearSelection} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {showDropdown && listingResults.length > 0 && (
                  <div className="absolute z-50 top-full mt-1 w-full bg-white border border-stone-200 rounded-xl shadow-lg overflow-hidden">
                    {listingResults.map((l) => (
                      <button
                        key={l.id}
                        onMouseDown={(e) => { e.preventDefault(); selectListing(l); }}
                        className="w-full text-left px-4 py-2.5 hover:bg-stone-50 transition border-b border-stone-100 last:border-0"
                      >
                        <p className="text-sm font-medium text-stone-900 truncate">{l.title}</p>
                        <p className="text-xs text-stone-400">
                          ₦{parseFloat(l.price).toLocaleString()}
                          {l.vendor?.username ? ` · @${l.vendor.username}` : ""}
                        </p>
                      </button>
                    ))}
                  </div>
                )}

                {showDropdown && !searchingListings && listingQuery && listingResults.length === 0 && (
                  <div className="absolute z-50 top-full mt-1 w-full bg-white border border-stone-200 rounded-xl shadow-lg px-4 py-3 text-sm text-stone-400">
                    No listings found
                  </div>
                )}
              </div>
              {selectedListing && (
                <p className="text-xs text-teal-600 font-medium mt-1">
                  ✓ Selected: {selectedListing.title} — ₦{parseFloat(selectedListing.price).toLocaleString()}
                </p>
              )}
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
            disabled={savingDeal || !selectedListing || !discountPercent}
            className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition disabled:opacity-40 bg-teal-600 hover:bg-teal-700 text-white"
          >
            {savingDeal ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {savingDeal ? "Saving..." : "Create Deal"}
          </button>
        </div>

        {/* ── Deals List ── */}
        <div className="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-stone-200">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <input
                type="text"
                value={dealSearch}
                onChange={(e) => setDealSearch(e.target.value)}
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
              <p className="text-xs mt-1">Search for a listing above to create your first deal</p>
            </div>
          ) : (
            <>
              {/* ── Mobile cards (hidden on md+) ── */}
              <div className="divide-y divide-stone-100 md:hidden">
                {filteredDeals.map((deal) => (
                  <div key={deal.id} className={`p-4 space-y-3 ${isVendorDeal(deal) ? "bg-amber-50/40" : ""}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          {isVendorDeal(deal) ? (
                            <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                              <Store className="w-2.5 h-2.5" /> Vendor
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-teal-50 text-teal-700">Admin</span>
                          )}
                        </div>
                        <p className="font-semibold text-stone-900 text-sm truncate">{deal.listing?.title}</p>
                        <p className="text-xs text-stone-400 mt-0.5">@{deal.listing?.vendor?.username}</p>
                        <p className="text-[10px] text-stone-400 mt-0.5 flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" /> {fmt(deal.created_at)}
                        </p>
                      </div>
                      <span className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded-full ${deal.is_active ? "bg-teal-50 text-teal-700" : "bg-stone-100 text-stone-400"}`}>
                        {deal.is_active ? "Active" : "Inactive"}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <p className="text-xs text-stone-400 line-through">₦{parseFloat(deal.listing?.price).toLocaleString()}</p>
                      <p className="text-sm font-bold text-teal-600">₦{parseFloat(deal.discounted_price).toLocaleString()}</p>
                      <div className="bg-red-50 text-red-700 px-2 py-0.5 rounded-full text-xs font-bold">
                        -{deal.discount_percent}%
                      </div>
                    </div>

                    {isVendorDeal(deal) ? (
                      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-1.5">
                        Vendor-controlled discount — edit the listing to change or remove it.
                      </p>
                    ) : editingId === deal.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number" min="1" max="100" step="1"
                          value={editDiscount}
                          onChange={(e) => setEditDiscount(e.target.value)}
                          className="w-20 px-2 py-1.5 bg-stone-50 border border-teal-400 rounded-lg text-sm text-stone-900 focus:outline-none"
                          autoFocus
                        />
                        <span className="text-xs text-stone-500">%</span>
                        {savingEdit ? (
                          <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
                        ) : (
                          <>
                            <button onClick={() => saveEdit(deal.id)} className="text-teal-600 hover:text-teal-700"><Check className="w-4 h-4" /></button>
                            <button onClick={cancelEdit} className="text-stone-400 hover:text-stone-600"><X className="w-4 h-4" /></button>
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 pt-1">
                        <button
                          onClick={() => toggleActive(deal)}
                          disabled={togglingId === deal.id}
                          className="flex items-center gap-1.5 text-xs font-medium text-stone-500 hover:text-teal-600 transition disabled:opacity-50"
                        >
                          {togglingId === deal.id ? <Loader2 className="w-4 h-4 animate-spin" /> : deal.is_active ? <ToggleRight className="w-5 h-5 text-teal-600" /> : <ToggleLeft className="w-5 h-5 text-stone-400" />}
                          {deal.is_active ? "Deactivate" : "Activate"}
                        </button>
                        <button onClick={() => startEdit(deal)} className="flex items-center gap-1.5 text-xs font-medium text-stone-500 hover:text-teal-600 transition">
                          <Pencil className="w-4 h-4" /> Edit %
                        </button>
                        <button
                          onClick={() => deleteDeal(deal.id)}
                          disabled={deletingId === deal.id}
                          className="flex items-center gap-1.5 text-xs font-medium text-red-500 hover:text-red-700 transition disabled:opacity-50 ml-auto"
                        >
                          {deletingId === deal.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* ── Desktop table (hidden below md) ── */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-stone-200 bg-stone-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-stone-600">Product / Service</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-stone-600">Vendor</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-stone-600">Source</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-stone-600">Original Price</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-stone-600">Discount</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-stone-600">Deal Price</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-stone-600">Set On</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-stone-600">Active</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-stone-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {filteredDeals.map((deal) => (
                      <tr key={deal.id} className={`transition ${isVendorDeal(deal) ? "bg-amber-50/30 hover:bg-amber-50/60" : "hover:bg-stone-50"}`}>
                        <td className="px-6 py-4">
                          <p className="font-medium text-stone-900 text-sm">{deal.listing?.title}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-stone-600">@{deal.listing?.vendor?.username}</p>
                        </td>
                        <td className="px-6 py-4">
                          {isVendorDeal(deal) ? (
                            <span className="flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 w-fit">
                              <Store className="w-3 h-3" /> Vendor
                            </span>
                          ) : (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-teal-50 text-teal-700">Admin</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm font-medium text-stone-900">₦{parseFloat(deal.listing?.price).toLocaleString()}</p>
                        </td>
                        <td className="px-6 py-4">
                          {!isVendorDeal(deal) && editingId === deal.id ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="number" min="1" max="100" step="1"
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
                                  <button onClick={() => saveEdit(deal.id)} className="text-teal-600 hover:text-teal-700 transition"><Check className="w-4 h-4" /></button>
                                  <button onClick={cancelEdit} className="text-stone-400 hover:text-stone-600 transition"><X className="w-4 h-4" /></button>
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
                          <p className="text-sm font-bold text-teal-600">₦{parseFloat(deal.discounted_price).toLocaleString()}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-xs text-stone-400 whitespace-nowrap">{fmt(deal.created_at)}</p>
                        </td>
                        <td className="px-6 py-4">
                          {isVendorDeal(deal) ? (
                            <span className={`text-xs font-medium ${deal.is_active ? "text-teal-600" : "text-stone-400"}`}>
                              {deal.is_active ? "Active" : "Inactive"}
                            </span>
                          ) : (
                            <button onClick={() => toggleActive(deal)} disabled={togglingId === deal.id} className="transition disabled:opacity-50" title={deal.is_active ? "Deactivate" : "Activate"}>
                              {togglingId === deal.id ? <Loader2 className="w-5 h-5 animate-spin text-stone-400" /> : deal.is_active ? <ToggleRight className="w-6 h-6 text-teal-600" /> : <ToggleLeft className="w-6 h-6 text-stone-400" />}
                            </button>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {isVendorDeal(deal) ? (
                            <span className="text-xs text-stone-400 italic">Vendor-set</span>
                          ) : (
                            <div className="flex items-center gap-3">
                              {editingId !== deal.id && (
                                <button onClick={() => startEdit(deal)} className="text-stone-500 hover:text-teal-600 transition"><Pencil className="w-4 h-4" /></button>
                              )}
                              <button onClick={() => deleteDeal(deal.id)} disabled={deletingId === deal.id} className="text-red-600 hover:text-red-700 transition disabled:opacity-50">
                                {deletingId === deal.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>

          )}
        </div>
      </div>
    </div>
  );
}
