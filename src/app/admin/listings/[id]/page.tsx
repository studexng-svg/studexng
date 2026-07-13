// src/app/admin/listings/[id]/page.tsx
"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Package, Trash2, Eye, EyeOff, ChevronLeft, ChevronRight,
  Shield, Tag, Sparkles, ZoomIn, X as XIcon, Edit2, Check,
  Store, Star, MapPin, Truck, CheckCircle,
} from "lucide-react";
import AdminTopBar from "@/components/layout/AdminTopBar";
import { api } from "@/lib/api";
import { TEAL, PURPLE } from "@/lib/tokens";

export default function AdminListingDetail() {
  const { id } = useParams();
  const router = useRouter();
  const [listing, setListing] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [toast, setToast] = useState("");

  const [title, setTitle] = useState("");
  const [payoutAmount, setPayoutAmount] = useState("");
  const [description, setDescription] = useState("");
  const [stock, setStock] = useState("");

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  };

  useEffect(() => {
    if (!id) return;
    api.admin.listing(id as string)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => {
        setListing(d);
        setTitle(d.title || "");
        setPayoutAmount(d.payout_amount || "");
        setDescription(d.description || "");
        setStock(String(d.stock_quantity ?? ""));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const patch = async (body: object, key = "toggle") => {
    setSaving(key);
    try {
      const res = await api.admin.updateListing(id as string, body as Record<string, unknown>);
      if (res.ok) {
        const updated = await res.json();
        setListing(updated);
        return updated;
      }
    } catch {}
    finally { setSaving(null); }
  };

  const saveEdit = async () => {
    const updated = await patch({ title, description, payout_amount: Number(payoutAmount), stock_quantity: Number(stock) }, "save");
    if (updated) {
      setEditing(false);
      showToast("Changes saved!");
    }
  };

  const toggleAvailability = async () => {
    const updated = await patch({ is_available: !listing.is_available }, "toggle");
    if (updated) showToast(updated.is_available ? "Listing is now live!" : "Listing hidden from marketplace");
  };

  const deleteListing = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setSaving("delete");
    await api.admin.deleteListing(id as string);
    showToast("Deleted");
    setTimeout(() => router.replace("/admin/listings"), 800);
  };

  if (loading) return (
    <div className="min-h-screen bg-[#F5F5F5] flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-stone-200 border-t-teal-500 rounded-full animate-spin" />
    </div>
  );

  if (!listing) return (
    <div className="min-h-screen bg-[#F5F5F5] flex flex-col items-center justify-center gap-4">
      <Package className="w-12 h-12 text-stone-300" />
      <p className="text-stone-500">Listing not found</p>
      <button onClick={() => router.back()} className="px-5 py-2.5 bg-white border border-stone-200 rounded-full text-sm font-semibold">Go back</button>
    </div>
  );

  const allImages = [listing.image, listing.image2, listing.image3, listing.image4, listing.image5]
    .filter((img: string | null): img is string => !!img && img.startsWith("http"));
  const activeImg = allImages[activeIdx] ?? null;

  const vendorName = listing.vendor?.business_name || listing.vendor?.username || listing.vendor || "—";
  const isService = (listing.listing_type || "").toLowerCase() === "service";
  const hasDiscount = listing.deal || (listing.sale_price && Number(listing.sale_price) < Number(listing.price));
  const displayPrice = listing.deal?.discounted_price ?? listing.sale_price ?? listing.price;
  const discountPct = listing.deal?.discount_percent ?? listing.discount_percent ?? 0;

  return (
    <div className="min-h-screen bg-[#F5F5F5]" style={{ fontFamily: "'DM Sans', sans-serif" }}>

      {/* Toast */}
      {toast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[9999] px-6 py-3 rounded-full text-white text-sm font-semibold shadow-xl"
          style={{ background: TEAL }}>
          {toast}
        </div>
      )}

      {/* Lightbox */}
      {imageOpen && (
        <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4" onClick={() => setImageOpen(false)}>
          <button onClick={() => setImageOpen(false)} className="absolute top-4 right-4 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center z-10">
            <XIcon className="w-5 h-5 text-white" />
          </button>
          <img src={activeImg ?? ""} alt={listing.title}
            className="max-w-full max-h-full object-contain rounded-xl shadow-2xl" onClick={e => e.stopPropagation()} />
        </div>
      )}

      <AdminTopBar title={`Listing #${listing.id}`} back="/admin/listings" />

      <div className="px-4 pt-4 pb-28 max-w-2xl mx-auto space-y-4">

        {/* ── Image gallery ── */}
        {allImages.length > 0 && (
          <div className="relative">
            <div
              className="w-full aspect-[4/3] bg-stone-100 rounded-2xl overflow-hidden cursor-zoom-in shadow-sm"
              onClick={() => setImageOpen(true)}
            >
              <img src={activeImg!} alt={listing.title} className="w-full h-full object-cover" />
              {!listing.is_available && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <span className="bg-red-500 text-white font-bold px-5 py-2 rounded-full text-sm">Pending Approval</span>
                </div>
              )}
              {hasDiscount && discountPct > 0 && (
                <div className="absolute top-3 left-3 bg-red-500 text-white text-xs font-black px-2.5 py-1 rounded-xl">
                  -{discountPct}% OFF
                </div>
              )}
              <div className="absolute bottom-3 right-3 bg-black/40 backdrop-blur-sm rounded-full p-2">
                <ZoomIn className="w-4 h-4 text-white" />
              </div>
            </div>

            {/* Swipe arrows */}
            {allImages.length > 1 && activeIdx > 0 && (
              <button onClick={() => setActiveIdx(i => i - 1)}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/30 backdrop-blur-sm rounded-full flex items-center justify-center z-10">
                <ChevronLeft className="w-4 h-4 text-white" />
              </button>
            )}
            {allImages.length > 1 && activeIdx < allImages.length - 1 && (
              <button onClick={() => setActiveIdx(i => i + 1)}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/30 backdrop-blur-sm rounded-full flex items-center justify-center z-10">
                <ChevronRight className="w-4 h-4 text-white" />
              </button>
            )}

            {/* Dot indicators */}
            {allImages.length > 1 && (
              <div className="flex justify-center gap-1.5 mt-3">
                {allImages.map((_, idx) => (
                  <button key={idx} onClick={() => setActiveIdx(idx)}
                    className={`rounded-full transition-all ${activeIdx === idx ? "w-5 h-1.5 bg-teal-500" : "w-1.5 h-1.5 bg-stone-300"}`} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Title + price header ── */}
        <div className="bg-white rounded-2xl p-5 shadow-sm space-y-2">
          <p className="text-teal-600 text-xs tracking-[0.2em] uppercase font-bold">
            {listing.category?.title || "Listing"}
          </p>
          <h1 className="text-2xl font-black text-stone-900 leading-tight" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            {listing.title}
          </h1>
          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-black text-stone-900">₦{Number(displayPrice).toLocaleString()}</span>
            {hasDiscount && Number(listing.price) > Number(displayPrice) && (
              <>
                <span className="text-base text-stone-400 line-through">₦{Number(listing.price).toLocaleString()}</span>
                <span className="text-sm font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded-lg">{discountPct}% off</span>
              </>
            )}
          </div>

          {/* Payout / fee / buyer-price breakdown */}
          {listing.variants?.length > 0 ? (
            <div className="bg-stone-50 border border-stone-100 rounded-xl p-3 space-y-2">
              {listing.variants.map((v: any) => {
                const fee = Number(v.price) - Number(v.payout_amount);
                const unitSuffix = listing.is_per_unit ? `/${listing.unit_label || "unit"}` : "";
                return (
                  <div key={v.id} className="text-xs">
                    <p className="font-semibold text-stone-700 mb-0.5">{v.title}</p>
                    <div className="flex items-center justify-between text-stone-400">
                      <span>Vendor gets ₦{Number(v.payout_amount).toLocaleString()}{unitSuffix}</span>
                      <span>+₦{fee.toLocaleString()} fee</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-stone-400">Buyer pays</span>
                      <span className="font-bold text-teal-600">₦{Number(v.price).toLocaleString()}{unitSuffix}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-stone-50 border border-stone-100 rounded-xl px-3 py-2 text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-stone-400">Vendor gets</span>
                <span className="font-semibold text-stone-700">
                  ₦{Number(listing.payout_amount ?? listing.price).toLocaleString()}
                  {listing.is_per_unit ? `/${listing.unit_label || "unit"}` : ""}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-stone-400">Platform fee</span>
                <span className="font-semibold text-stone-700">+₦{Number(listing.platform_fee ?? 0).toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between pt-1 mt-1 border-t border-stone-200">
                <span className="text-stone-400">Buyer pays</span>
                <span className="font-bold text-teal-600">
                  ₦{Number(listing.price).toLocaleString()}{listing.is_per_unit ? `/${listing.unit_label || "unit"}` : ""}
                </span>
              </div>
            </div>
          )}

          {/* Status pill */}
          <div>
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${listing.is_available ? "bg-teal-100 text-teal-700" : "bg-amber-100 text-amber-700"}`}>
              {listing.is_available ? <><CheckCircle className="w-3 h-3" /> Live</> : "Pending Approval"}
            </span>
          </div>
        </div>

        {/* ── Details ── */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <p className="text-teal-600 text-xs tracking-[0.2em] uppercase font-semibold">Details</p>
            <button onClick={() => setEditing(!editing)}
              className="flex items-center gap-1.5 text-xs text-teal-600 font-semibold hover:text-teal-700 transition">
              <Edit2 className="w-3.5 h-3.5" />
              {editing ? "Cancel" : "Edit"}
            </button>
          </div>

          {editing ? (
            <div className="px-5 pb-5 space-y-3">
              <div>
                <label className="text-xs text-stone-500 mb-1 block font-medium">Title</label>
                <input className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  value={title} onChange={e => setTitle(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-stone-500 mb-1 block font-medium">
                  Vendor payout (₦){listing.is_per_unit ? ` per ${listing.unit_label || "unit"}` : ""}
                </label>
                <input type="number" className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  value={payoutAmount} onChange={e => setPayoutAmount(e.target.value)} />
                <p className="text-xs text-stone-400 mt-1">
                  Buyer price is computed automatically (payout + platform fee) — it's never entered directly.
                </p>
              </div>
              {listing.track_inventory && (
                <div>
                  <label className="text-xs text-stone-500 mb-1 block font-medium">Stock Quantity</label>
                  <input type="number" className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                    value={stock} onChange={e => setStock(e.target.value)} />
                </div>
              )}
              <div>
                <label className="text-xs text-stone-500 mb-1 block font-medium">Description</label>
                <textarea rows={4} className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none"
                  value={description} onChange={e => setDescription(e.target.value)} />
              </div>
              <button onClick={saveEdit} disabled={saving === "save"}
                className="w-full py-3 text-white font-semibold rounded-xl text-sm disabled:opacity-50 transition flex items-center justify-center gap-2"
                style={{ background: TEAL }}>
                {saving === "save" ? "Saving…" : <><Check className="w-4 h-4" /> Save Changes</>}
              </button>
            </div>
          ) : (
            <div className="divide-y divide-stone-100">
              {[
                { label: "Vendor",   value: vendorName },
                { label: "Category", value: listing.category?.title || listing.category },
                { label: "Type",     value: listing.listing_type },
                { label: "Campus",   value: listing.campus?.toUpperCase() },
                listing.track_inventory ? { label: "Stock", value: `${listing.stock_quantity} units` } : null,
                { label: "Created",  value: listing.created_at ? new Date(listing.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }) : undefined },
              ].filter((r): r is { label: string; value: string | undefined } => !!r && !!r.value).map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between px-5 py-3.5 gap-4">
                  <p className="text-stone-500 text-sm">{label}</p>
                  <p className="font-semibold text-stone-900 text-sm text-right">{value}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Description ── */}
        {!editing && listing.description && (
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <p className="text-teal-600 text-xs tracking-[0.2em] uppercase font-semibold mb-3">Description</p>
            <p className="text-stone-700 text-sm leading-relaxed">{listing.description}</p>
          </div>
        )}

        {/* ── Attributes (brand, condition, delivery_time) ── */}
        {!editing && (listing.brand || listing.condition || listing.delivery_time) && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <p className="text-teal-600 text-xs tracking-[0.2em] uppercase font-semibold px-5 pt-4 pb-2">Attributes</p>
            <div className="divide-y divide-stone-100">
              {listing.brand && (
                <div className="flex items-center gap-3 px-5 py-3.5">
                  <Package className="w-4 h-4 text-stone-400 flex-shrink-0" />
                  <p className="text-stone-500 text-sm flex-1">Brand</p>
                  <p className="font-semibold text-stone-900 text-sm">{listing.brand}</p>
                </div>
              )}
              {listing.condition && (
                <div className="flex items-center gap-3 px-5 py-3.5">
                  <Star className="w-4 h-4 text-stone-400 flex-shrink-0" />
                  <p className="text-stone-500 text-sm flex-1">Condition</p>
                  <p className="font-semibold text-stone-900 text-sm">
                    {({ new: "Brand New", fairly_used: "Fairly Used", refurbished: "Refurbished" } as Record<string, string>)[listing.condition] || listing.condition}
                  </p>
                </div>
              )}
              {listing.delivery_time && (
                <div className="flex items-center gap-3 px-5 py-3.5">
                  <Truck className="w-4 h-4 text-stone-400 flex-shrink-0" />
                  <p className="text-stone-500 text-sm flex-1">Est. Delivery</p>
                  <p className="font-semibold text-stone-900 text-sm">{listing.delivery_time}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Tags ── */}
        {!editing && listing.tags && (
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <p className="text-teal-600 text-xs tracking-[0.2em] uppercase font-semibold mb-3">Tags</p>
            <div className="flex flex-wrap gap-1.5">
              {listing.tags.split(",").map((t: string) => t.trim()).filter(Boolean).map((tag: string) => (
                <span key={tag} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-teal-50 border border-teal-100 text-teal-700 text-xs font-medium">
                  <Tag className="w-3 h-3" />{tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── Vendor card ── */}
        {!editing && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <p className="text-teal-600 text-xs tracking-[0.2em] uppercase font-semibold mb-3">Vendor</p>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0"
                style={{ background: PURPLE }}>
                {vendorName[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-stone-900 text-sm">{vendorName}</p>
                {listing.vendor?.email && (
                  <p className="text-stone-400 text-xs truncate">{listing.vendor.email}</p>
                )}
              </div>
              {listing.vendor?.id && (
                <button
                  onClick={() => router.push(`/admin/sellers/${listing.vendor.id}`)}
                  className="flex items-center gap-1.5 px-3 py-2 border border-stone-200 hover:border-teal-400 text-stone-600 hover:text-teal-600 rounded-xl text-xs font-semibold transition-all flex-shrink-0">
                  <Store className="w-3.5 h-3.5" /> View Store
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Admin actions ── */}
        {!editing && (
          <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-purple-600" />
              <p className="text-purple-700 text-xs tracking-[0.2em] uppercase font-semibold">Admin Controls</p>
              <span className={`ml-auto px-2.5 py-0.5 rounded-full text-xs font-semibold ${listing.is_available ? "bg-teal-100 text-teal-700" : "bg-amber-100 text-amber-700"}`}>
                {listing.is_available ? "Live" : "Pending"}
              </span>
            </div>

            <div className="flex gap-2">
              <button
                onClick={toggleAvailability}
                disabled={!!saving}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-2 ${
                  listing.is_available
                    ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                    : "bg-teal-100 text-teal-700 hover:bg-teal-200"
                }`}>
                {saving === "toggle" ? "Updating…"
                  : listing.is_available
                  ? <><EyeOff className="w-3.5 h-3.5" /> Hide Listing</>
                  : <><Eye className="w-3.5 h-3.5" /> Approve &amp; Publish</>}
              </button>

              <button
                onClick={deleteListing}
                disabled={!!saving}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-2 ${
                  confirmDelete ? "bg-red-600 text-white" : "bg-red-100 text-red-700 hover:bg-red-200"
                }`}>
                <Trash2 className="w-3.5 h-3.5" />
                {saving === "delete" ? "Deleting…" : confirmDelete ? "Confirm Delete?" : "Delete"}
              </button>
            </div>

            {confirmDelete && (
              <div className="flex items-center justify-between">
                <p className="text-xs text-red-500">This cannot be undone.</p>
                <button onClick={() => setConfirmDelete(false)} className="text-xs text-stone-500 underline">Cancel</button>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
