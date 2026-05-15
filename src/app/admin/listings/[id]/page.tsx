// src/app/admin/listings/[id]/page.tsx
"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Package, Trash2, Eye, EyeOff } from "lucide-react";
import AdminTopBar from "@/components/layout/AdminTopBar";
import { fetchWithAuth } from "@/lib/authStore";
import { GRAD } from "@/lib/tokens";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

function Row({ label, value }: { label: string; value?: string | number | null }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex items-start justify-between py-3 border-b border-stone-100 last:border-0 gap-4">
      <p className="text-stone-500 text-sm flex-shrink-0">{label}</p>
      <p className="font-semibold text-stone-900 text-sm text-right">{value}</p>
    </div>
  );
}

export default function AdminListingDetail() {
  const { id } = useParams();
  const router = useRouter();
  const [listing, setListing] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [stock, setStock] = useState("");

  useEffect(() => {
    if (!id) return;
    fetchWithAuth(`${API_URL}/api/admin/listings/${id}/`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => {
        setListing(d);
        setTitle(d.title || "");
        setPrice(d.price || "");
        setDescription(d.description || "");
        setStock(String(d.stock_quantity ?? ""));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const patch = async (body: object) => {
    setSaving(true);
    try {
      const res = await fetchWithAuth(`${API_URL}/api/admin/listings/${id}/`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      if (res.ok) setListing(await res.json());
    } catch {}
    finally { setSaving(false); }
  };

  const saveEdit = async () => {
    await patch({ title, description, price: Number(price), stock_quantity: Number(stock) });
    setEditing(false);
  };

  const deleteListing = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setSaving(true);
    await fetchWithAuth(`${API_URL}/api/admin/listings/${id}/`, { method: "DELETE" });
    router.replace("/admin/listings");
  };

  if (loading) return (
    <div className="min-h-screen bg-[#FFF8F0] flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-stone-200 border-t-teal-500 rounded-full animate-spin" />
    </div>
  );
  if (!listing) return (
    <div className="min-h-screen bg-[#FFF8F0] flex flex-col items-center justify-center gap-4">
      <Package className="w-12 h-12 text-stone-300" />
      <p className="text-stone-500">Listing not found</p>
      <button onClick={() => router.back()} className="px-5 py-2.5 bg-white border border-stone-200 rounded-full text-sm font-semibold">Go back</button>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#FFF8F0]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <AdminTopBar title={`Listing #${listing.id}`} back="/admin/listings" />

      <div className="px-4 pt-5 pb-28 max-w-2xl mx-auto space-y-4">

        {/* Image */}
        {listing.image && (
          <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm">
            <img src={listing.image} alt={listing.title} className="w-full h-48 object-cover" />
          </div>
        )}

        {/* Status */}
        <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <p className="text-stone-600 text-sm font-medium">Status</p>
          <span className={`px-3 py-1 rounded-full text-xs font-bold ${listing.is_available ? "bg-teal-100 text-teal-700" : "bg-amber-100 text-amber-700"}`}>
            {listing.is_available ? "Live" : "Pending Approval"}
          </span>
        </div>

        {/* Details — view or edit */}
        <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="text-teal-600 text-xs tracking-[0.2em] uppercase font-semibold">Details</p>
            <button onClick={() => setEditing(!editing)} className="text-xs text-teal-600 font-semibold">
              {editing ? "Cancel" : "Edit"}
            </button>
          </div>
          {editing ? (
            <div className="space-y-3 mt-2">
              <div>
                <label className="text-xs text-stone-500 mb-1 block">Title</label>
                <input className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  value={title} onChange={e => setTitle(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-stone-500 mb-1 block">Price (₦)</label>
                <input type="number" className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  value={price} onChange={e => setPrice(e.target.value)} />
              </div>
              {listing.track_inventory && (
                <div>
                  <label className="text-xs text-stone-500 mb-1 block">Stock Quantity</label>
                  <input type="number" className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                    value={stock} onChange={e => setStock(e.target.value)} />
                </div>
              )}
              <div>
                <label className="text-xs text-stone-500 mb-1 block">Description</label>
                <textarea rows={3} className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  value={description} onChange={e => setDescription(e.target.value)} />
              </div>
              <button onClick={saveEdit} disabled={saving}
                className="w-full py-3 text-white font-semibold rounded-xl text-sm disabled:opacity-50 transition"
                style={{ background: GRAD }}>
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          ) : (
            <>
              <Row label="Title"       value={listing.title} />
              <Row label="Vendor"      value={listing.vendor?.username || listing.vendor} />
              <Row label="Category"    value={listing.category?.title || listing.category} />
              <Row label="Type"        value={listing.listing_type} />
              <Row label="Price"       value={`₦${Number(listing.price).toLocaleString()}`} />
              <Row label="Campus"      value={listing.campus?.toUpperCase()} />
              {listing.track_inventory && <Row label="Stock" value={`${listing.stock_quantity} units`} />}
              <Row label="Created"     value={listing.created_at ? new Date(listing.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }) : undefined} />
            </>
          )}
        </div>

        {/* Description (view mode) */}
        {!editing && listing.description && (
          <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
            <p className="text-teal-600 text-xs tracking-[0.2em] uppercase font-semibold mb-2">Description</p>
            <p className="text-stone-700 text-sm leading-relaxed">{listing.description}</p>
          </div>
        )}

        {/* Admin actions */}
        {!editing && (
          <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm space-y-2">
            <p className="text-teal-600 text-xs tracking-[0.2em] uppercase font-semibold mb-3">Admin Actions</p>

            <button onClick={() => patch({ is_available: !listing.is_available })} disabled={saving}
              className="w-full py-3 font-semibold rounded-xl text-sm disabled:opacity-50 transition flex items-center justify-center gap-2"
              style={{ background: GRAD, color: "#fff" }}>
              {saving ? "Updating…" : listing.is_available
                ? <><EyeOff className="w-4 h-4" /> Hide Listing</>
                : <><Eye className="w-4 h-4" /> Approve & Publish</>}
            </button>

            <button onClick={deleteListing} disabled={saving}
              className={`w-full py-3 font-semibold rounded-xl text-sm disabled:opacity-50 transition flex items-center justify-center gap-2 ${confirmDelete ? "bg-red-600 text-white" : "bg-red-100 text-red-700 hover:bg-red-200"}`}>
              <Trash2 className="w-4 h-4" />
              {confirmDelete ? "Confirm Delete?" : "Delete Listing"}
            </button>
            {confirmDelete && (
              <p className="text-xs text-red-500 text-center">This action cannot be undone.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
