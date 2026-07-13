"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/authStore";
import { TEAL, toArray } from "@/lib/tokens";
import { Plus, Edit2, Trash2, Loader, ToggleLeft, ToggleRight, X, Share2 } from "lucide-react";
import { EmptyState, LoadingSpinner, HEADING_FONT } from "../_shared";
import { api } from "@/lib/api";

export default function ListingsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({
    title: "", description: "", payoutAmount: "", category: "",
    is_per_unit: false, unit_label: "",
    variants: [] as { id?: number; title: string; payout_amount: string }[],
    listing_type: "service", track_inventory: false,
    stock_quantity: 0, discount_percent: 0, images: Array(5).fill(null) as (File | null)[],
    brand: "", condition: "", delivery_time: "", tags: "",
  });
  const [pricePreview, setPricePreview] = useState<{ price: number; platform_fee: number } | null>(null);
  const previewDebounce = useRef<NodeJS.Timeout | null>(null);

  // Live "buyer pays ₦X" preview — server computes it, no fee math duplicated here.
  useEffect(() => {
    if (previewDebounce.current) clearTimeout(previewDebounce.current);
    const amount = Number(form.payoutAmount);
    if (!amount || amount <= 0) { setPricePreview(null); return; }
    previewDebounce.current = setTimeout(async () => {
      try {
        const res = await api.services.previewPrice(amount);
        if (res.ok) setPricePreview(await res.json());
      } catch { /* preview is best-effort */ }
    }, 400);
    return () => { if (previewDebounce.current) clearTimeout(previewDebounce.current); };
  }, [form.payoutAmount]);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data: listingsData, isPending: loading } = useQuery({
    queryKey: ["vendor-listings"],
    queryFn: async () => {
      const res = await api.services.listingsAuth({ vendor_username: user!.username, page_size: "500" });
      const data = await res.json();
      return toArray(data);
    },
    enabled: !!user?.username,
    staleTime: 30_000,
  });

  const { data: categoriesData } = useQuery({
    queryKey: ["vendor-categories"],
    queryFn: async () => {
      const res = await api.services.categoriesAuth();
      return toArray(await res.json());
    },
    staleTime: 300_000,
  });

  const listings: any[] = listingsData ?? [];
  const categories: any[] = categoriesData ?? [];
  const selectedCategory = categories.find((c: any) => c.slug === form.category);
  const isLaundryCategory = (selectedCategory?.title || "").toLowerCase().includes("laundry");

  const openEdit = (listing: any) => {
    setEditing(listing);
    setForm({
      title: listing.title, description: listing.description,
      payoutAmount: (listing.payout_amount ?? listing.price).toString(), category: listing.category,
      is_per_unit: listing.is_per_unit || false, unit_label: listing.unit_label || "",
      variants: (listing.variants || []).map((v: any) => ({ id: v.id, title: v.title, payout_amount: String(v.payout_amount) })),
      listing_type: listing.listing_type || "service",
      track_inventory: listing.track_inventory || false,
      stock_quantity: listing.stock_quantity || 0,
      discount_percent: listing.discount_percent || 0,
      images: Array(5).fill(null),
      brand: listing.brand || "",
      condition: listing.condition || "",
      delivery_time: listing.delivery_time || "",
      tags: listing.tags || "",
    });
    setShowForm(true);
  };

  const resetForm = () => {
    setForm({ title: "", description: "", payoutAmount: "", category: "", is_per_unit: false, unit_label: "", variants: [], listing_type: "service", track_inventory: false, stock_quantity: 0, discount_percent: 0, images: Array(5).fill(null), brand: "", condition: "", delivery_time: "", tags: "" });
    setEditing(null);
    setShowForm(false);
    setPricePreview(null);
  };

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 2500); };

  const handleSave = async () => {
    if (!form.title || !form.payoutAmount || !form.category) return;
    if (form.is_per_unit && !form.unit_label.trim()) return;
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("title", form.title);
      fd.append("description", form.description);
      fd.append("payout_amount", form.payoutAmount);
      fd.append("category", form.category);
      fd.append("is_per_unit", form.is_per_unit ? "true" : "false");
      fd.append("unit_label", form.is_per_unit ? form.unit_label.trim() : "");
      if (isLaundryCategory && form.is_per_unit) {
        const validVariants = form.variants.filter(v => v.title.trim() && v.payout_amount);
        fd.append("variants", JSON.stringify(validVariants));
      }
      fd.append("listing_type", form.listing_type);
      const isInventoryType = form.listing_type === "food" || form.listing_type === "product";
      fd.append("track_inventory", isInventoryType ? "true" : "false");
      fd.append("stock_quantity", isInventoryType ? form.stock_quantity.toString() : "0");
      fd.append("discount_percent", form.discount_percent.toString());
      if (form.brand) fd.append("brand", form.brand);
      if (form.condition) fd.append("condition", form.condition);
      if (form.delivery_time) fd.append("delivery_time", form.delivery_time);
      if (form.tags) fd.append("tags", form.tags);
      const slots = ['image', 'image2', 'image3', 'image4', 'image5'];
      form.images.forEach((file, i) => { if (file) fd.append(slots[i], file); });

      const res = editing
        ? await api.services.updateListing(editing.id, fd)
        : await api.services.createListing(fd);
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.variant_warnings?.length) showToast(data.variant_warnings[0]);
        else showToast(editing ? "Updated!" : "Created!");
        resetForm();
        queryClient.invalidateQueries({ queryKey: ["vendor-listings"] });
      }
      else showToast("Failed to save.");
    } catch { showToast("Error."); } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    setDeleting(true);
    try {
      const res = await api.services.deleteListing(id);
      if (res.ok || res.status === 204) { showToast("Listing deleted."); queryClient.invalidateQueries({ queryKey: ["vendor-listings"] }); }
      else showToast("Could not delete. Try again.");
    } catch { showToast("Error deleting listing."); }
    finally { setDeleting(false); setConfirmDeleteId(null); }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="pb-4">
      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full font-semibold text-white text-sm z-50 shadow-xl" style={{ background: TEAL }}>
          {toast}
        </div>
      )}

      {/* Share store banner */}
      {user?.username && (
        <div className="mb-5 bg-gradient-to-r from-teal-50 to-purple-50 border border-teal-100 rounded-2xl p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center flex-shrink-0 shadow-sm">
            <Share2 className="w-4 h-4 text-teal-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-stone-900 text-sm">Share your store</p>
            <p className="text-stone-400 text-xs mt-0.5 truncate">studex.com.ng/vendor/{(user as any).username}</p>
          </div>
          <button
            onClick={async () => {
              const url = `${window.location.origin}/vendor/${(user as any).username}`;
              if (navigator.share) {
                await navigator.share({ title: (user as any).business_name || (user as any).username, url }).catch(() => {});
              } else {
                await navigator.clipboard.writeText(url);
                setToast("Store link copied!");
              }
            }}
            className="flex-shrink-0 px-3 py-1.5 rounded-lg text-white text-xs font-bold"
            style={{ background: TEAL }}>
            Share
          </button>
        </div>
      )}

      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-bold mb-0.5">Manage</p>
          <h2 className="font-black text-stone-900 text-xl tracking-tight" style={HEADING_FONT}>My Listings</h2>
          <p className="text-stone-400 text-xs mt-0.5">{listings.length} {listings.length === 1 ? "service" : "services"}</p>
        </div>
        <button onClick={() => { resetForm(); setShowForm(true); }}
          className="flex items-center gap-1.5 px-4 py-2 text-white rounded-full font-semibold text-sm transition active:scale-95"
          style={{ background: TEAL }}>
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>

      {showForm && (
        <div className="bg-white border border-stone-200 rounded-2xl p-5 mb-5 shadow-sm">
          <h3 className="font-semibold text-stone-800 mb-4 text-sm">{editing ? "Edit Listing" : "New Listing"}</h3>
          <div className="space-y-3">
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Title (e.g. Gel Manicure)"
              className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-stone-900 text-base focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition placeholder:text-stone-400" />
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={3} placeholder="Describe your service..."
              className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-stone-900 text-base focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition resize-none placeholder:text-stone-400" />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <input type="number" value={form.payoutAmount} onChange={e => setForm(f => ({ ...f, payoutAmount: e.target.value }))}
                  placeholder={form.is_per_unit ? `Amount per ${form.unit_label.trim() || "unit"} (₦)` : "Amount you want to receive (₦)"}
                  className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-stone-900 text-base focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition" />
                {pricePreview && (
                  <p className="text-xs text-stone-400 mt-1.5 px-1">
                    Buyer pays <span className="font-semibold text-stone-600">₦{pricePreview.price.toLocaleString()}</span>
                    {form.is_per_unit ? ` per ${form.unit_label.trim() || "unit"}` : ""}
                    {" "}· platform fee ₦{pricePreview.platform_fee.toLocaleString()}
                  </p>
                )}
              </div>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="bg-white border border-stone-200 rounded-xl px-4 py-3 text-stone-900 text-base focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition">
                <option value="">Select category</option>
                {categories.map((cat: any) => (
                  <option key={cat.slug} value={cat.slug}>{cat.title}</option>
                ))}
              </select>
            </div>
            {isLaundryCategory && (
              <div className="bg-stone-50 border border-stone-100 rounded-xl px-4 py-3 flex items-center gap-4">
                <div className="flex-1">
                  <p className="text-stone-800 text-sm font-semibold">Price per unit <span className="font-normal text-stone-400">(e.g. per cloth)</span></p>
                  <p className="text-stone-400 text-xs">Buyer picks a quantity when booking; you get paid per unit</p>
                  {form.is_per_unit && (
                    <input value={form.unit_label} onChange={e => setForm(f => ({ ...f, unit_label: e.target.value }))}
                      placeholder="Unit label (e.g. cloth)"
                      className="mt-2 w-full bg-white border border-stone-200 rounded-lg px-3 py-2 text-stone-900 text-sm focus:outline-none focus:border-teal-500 transition placeholder:text-stone-400" />
                  )}
                </div>
                <button type="button" onClick={() => setForm(f => ({ ...f, is_per_unit: !f.is_per_unit }))}>
                  {form.is_per_unit
                    ? <ToggleRight className="w-8 h-8 text-teal-600" />
                    : <ToggleLeft className="w-8 h-8 text-stone-300" />}
                </button>
              </div>
            )}
            {isLaundryCategory && form.is_per_unit && (
              <div className="bg-stone-50 border border-stone-100 rounded-xl px-4 py-3 space-y-2">
                <p className="text-stone-800 text-sm font-semibold">Service options <span className="font-normal text-stone-400">(optional)</span></p>
                <p className="text-stone-400 text-xs">
                  Add options like "Washing Only" / "Ironing Only" / "Washing & Ironing" — each at its own price per {form.unit_label.trim() || "unit"}.
                  Leave empty to just sell "{form.title || "this listing"}" as one option.
                </p>
                {form.variants.map((v, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input value={v.title}
                      onChange={e => setForm(f => ({ ...f, variants: f.variants.map((row, idx) => idx === i ? { ...row, title: e.target.value } : row) }))}
                      placeholder="Option name (e.g. Washing Only)"
                      className="flex-1 bg-white border border-stone-200 rounded-lg px-3 py-2 text-stone-900 text-sm focus:outline-none focus:border-teal-500 transition placeholder:text-stone-400" />
                    <input type="number" value={v.payout_amount}
                      onChange={e => setForm(f => ({ ...f, variants: f.variants.map((row, idx) => idx === i ? { ...row, payout_amount: e.target.value } : row) }))}
                      placeholder={`₦ per ${form.unit_label.trim() || "unit"}`}
                      className="w-32 bg-white border border-stone-200 rounded-lg px-3 py-2 text-stone-900 text-sm focus:outline-none focus:border-teal-500 transition" />
                    <button type="button" onClick={() => setForm(f => ({ ...f, variants: f.variants.filter((_, idx) => idx !== i) }))}
                      className="p-2 bg-red-50 hover:bg-red-100 border border-red-100 rounded-lg transition flex-shrink-0">
                      <X className="w-3.5 h-3.5 text-red-500" />
                    </button>
                  </div>
                ))}
                <button type="button"
                  onClick={() => setForm(f => ({ ...f, variants: [...f.variants, { title: "", payout_amount: "" }] }))}
                  className="flex items-center gap-1 text-teal-600 text-xs font-semibold">
                  <Plus className="w-3.5 h-3.5" /> Add option
                </button>
              </div>
            )}
            {/* Discount */}
            <div className="bg-stone-50 border border-stone-100 rounded-xl px-4 py-3 flex items-center gap-4">
              <div className="flex-1">
                <p className="text-stone-800 text-sm font-semibold">Discount % <span className="font-normal text-stone-400">(optional)</span></p>
                <p className="text-stone-400 text-xs">
                  {form.discount_percent > 0 && pricePreview
                    ? `Sale price: ₦${(pricePreview.price * (1 - form.discount_percent / 100)).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                    : "Set a % to run a sale — shows in Hot Deals on the home page"}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <input type="number" min="0" max="100" step="1" value={form.discount_percent || ""}
                  onChange={e => setForm(f => ({ ...f, discount_percent: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) }))}
                  placeholder="0"
                  className="w-16 bg-white border border-stone-200 rounded-lg px-2 py-2 text-stone-900 text-sm text-center focus:outline-none focus:border-teal-500" />
                <span className="text-stone-500 text-sm font-semibold">%</span>
              </div>
            </div>
            <div>
              <p className="text-xs text-stone-400 mb-2">Photos · up to 5 · first is the main photo</p>
              <div className="grid grid-cols-5 gap-2">
                {[0,1,2,3,4].map(i => {
                  const imgSlots = ['image','image2','image3','image4','image5'];
                  const existingUrl: string | null = editing ? editing[imgSlots[i]] || null : null;
                  const newFile = form.images[i];
                  return (
                    <div key={i} className="relative aspect-square">
                      {newFile ? (
                        <>
                          <img src={URL.createObjectURL(newFile)} alt="" className="w-full h-full object-cover rounded-xl border-2 border-teal-400" />
                          <button type="button" onClick={() => {
                            const imgs = [...form.images]; imgs[i] = null;
                            setForm(f => ({ ...f, images: imgs }));
                          }} className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center shadow">
                            <X className="w-2.5 h-2.5 text-white" />
                          </button>
                        </>
                      ) : existingUrl ? (
                        <div className="relative w-full h-full group">
                          <img src={existingUrl} alt="" className="w-full h-full object-cover rounded-xl border border-stone-200" />
                          <label className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 rounded-xl cursor-pointer transition">
                            <span className="text-white text-xs font-semibold">Replace</span>
                            <input type="file" accept="image/*" className="hidden" onChange={e => {
                              const f = e.target.files?.[0]; if (!f) return;
                              const imgs = [...form.images]; imgs[i] = f;
                              setForm(prev => ({ ...prev, images: imgs }));
                            }} />
                          </label>
                          {i === 0 && <span className="absolute bottom-1 left-1 text-xs bg-teal-600 text-white px-1.5 py-0.5 rounded-full font-semibold">Main</span>}
                        </div>
                      ) : (
                        <label className="w-full h-full border-2 border-dashed border-stone-200 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-teal-400 hover:bg-teal-50/30 transition">
                          <Plus className="w-4 h-4 text-stone-300" />
                          <span className="text-xs text-stone-300 mt-0.5">{i === 0 ? 'Main' : `Photo ${i+1}`}</span>
                          <input type="file" accept="image/*" className="hidden" onChange={e => {
                            const f = e.target.files?.[0]; if (!f) return;
                            const imgs = [...form.images]; imgs[i] = f;
                            setForm(prev => ({ ...prev, images: imgs }));
                          }} />
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <select value={form.listing_type} onChange={e => setForm(f => ({ ...f, listing_type: e.target.value }))}
              className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition">
              <option value="service">Service (e.g. nails, lashes)</option>
              <option value="food">Food (stock tracked)</option>
              <option value="product">Physical Product (stock tracked)</option>
            </select>
            {(form.listing_type === "food" || form.listing_type === "product") && (
              <div className="flex items-center gap-4 bg-stone-50 border border-stone-100 rounded-xl px-4 py-3">
                <div className="flex-1">
                  <p className="text-stone-800 text-sm font-semibold">Stock Quantity</p>
                  <p className="text-stone-400 text-xs">Auto-marks unavailable when stock hits 0</p>
                </div>
                <input type="number" min="0" value={form.stock_quantity}
                  onChange={e => setForm(f => ({ ...f, stock_quantity: parseInt(e.target.value) || 0, track_inventory: true }))}
                  className="w-20 bg-white border border-stone-200 rounded-lg px-3 py-2 text-stone-900 text-sm text-center focus:outline-none focus:border-teal-500" />
              </div>
            )}

            {/* Extra details */}
            <div className="border-t border-stone-100 pt-3 space-y-3">
              <p className="text-xs text-stone-400 font-semibold uppercase tracking-wider">Extra details (optional)</p>
              <div className="grid grid-cols-2 gap-3">
                <input value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))}
                  placeholder="Brand (e.g. Samsung, Gucci)"
                  className="bg-white border border-stone-200 rounded-xl px-4 py-3 text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition placeholder:text-stone-400" />
                <select value={form.condition} onChange={e => setForm(f => ({ ...f, condition: e.target.value }))}
                  className="bg-white border border-stone-200 rounded-xl px-4 py-3 text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition">
                  <option value="">Condition</option>
                  <option value="new">Brand New</option>
                  <option value="fairly_used">Fairly Used</option>
                  <option value="refurbished">Refurbished</option>
                </select>
              </div>
              <input value={form.delivery_time} onChange={e => setForm(f => ({ ...f, delivery_time: e.target.value }))}
                placeholder="Est. delivery / completion time (e.g. 15-20 mins, Same day)"
                className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition placeholder:text-stone-400" />
              <input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                placeholder="Tags — comma separated (e.g. Authentic, Express, Handmade)"
                className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition placeholder:text-stone-400" />
            </div>

            <div className="flex gap-3">
              <button onClick={handleSave} disabled={saving || !form.title || !form.payoutAmount || !form.category || (form.is_per_unit && !form.unit_label.trim())}
                className="flex-1 py-3 text-white disabled:opacity-40 rounded-full font-semibold text-sm transition active:scale-[0.98]"
                style={{ background: TEAL }}>
                {saving ? "Saving..." : editing ? "Update" : "Create Listing"}
              </button>
              <button onClick={resetForm}
                className="px-6 py-3 bg-stone-100 hover:bg-stone-200 rounded-full font-semibold text-stone-600 text-sm transition">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {confirmDeleteId !== null && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="font-bold text-stone-900 text-base mb-1">Delete listing?</h3>
            <p className="text-stone-500 text-sm mb-5">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => handleDelete(confirmDeleteId)} disabled={deleting}
                className="flex-1 py-2.5 rounded-full text-white font-semibold text-sm bg-red-500 disabled:opacity-50 flex items-center justify-center gap-2">
                {deleting ? <><Loader className="w-4 h-4 animate-spin" />Deleting...</> : "Delete"}
              </button>
              <button onClick={() => setConfirmDeleteId(null)} disabled={deleting}
                className="px-6 py-2.5 rounded-full bg-stone-100 text-stone-600 font-semibold text-sm">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {listings.length === 0 ? (
        <EmptyState icon={Plus} message="No listings yet. Add your first service!" />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {listings.map(listing => (
            <div key={listing.id} className="bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm hover:border-teal-300 hover:shadow-md transition-all">
              {listing.image && (
                <div className="w-full aspect-square overflow-hidden">
                  <img src={listing.image} alt={listing.title} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                </div>
              )}
              <div className="p-4">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h3 className="font-semibold text-stone-900 text-sm">{listing.title}</h3>
                  <div className="text-right">
                    {listing.discount_percent > 0 ? (
                      <>
                        <span className="text-stone-400 text-xs line-through block">₦{Number(listing.price).toLocaleString()}</span>
                        <span className="font-bold text-red-600 text-sm whitespace-nowrap">
                          ₦{Math.round(Number(listing.price) * (1 - listing.discount_percent / 100)).toLocaleString()}
                        </span>
                        <span className="ml-1 text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-bold">-{listing.discount_percent}%</span>
                      </>
                    ) : (
                      <span className="font-bold text-teal-600 text-sm whitespace-nowrap">₦{Number(listing.price).toLocaleString()}</span>
                    )}
                  </div>
                </div>
                <p className="text-stone-400 text-xs mb-2 line-clamp-2">{listing.description}</p>
                {listing.track_inventory && (
                  <p className={`text-xs font-semibold mb-2 ${listing.stock_quantity <= 3 ? "text-amber-600" : "text-teal-600"}`}>
                    📦 Stock: {listing.stock_quantity} remaining
                  </p>
                )}
                <div className="flex items-center justify-between">
                  <span className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg ${
                    listing.is_available ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-600"
                  }`}>
                    {listing.is_available ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                    {listing.is_available ? "Active" : "Pending Approval"}
                  </span>
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(listing)} className="p-2 bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded-lg transition">
                      <Edit2 className="w-3.5 h-3.5 text-stone-500" />
                    </button>
                    <button onClick={() => setConfirmDeleteId(listing.id)} className="p-2 bg-red-50 hover:bg-red-100 border border-red-100 rounded-lg transition">
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
