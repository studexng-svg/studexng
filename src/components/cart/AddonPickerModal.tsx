"use client";

import { useState } from "react";
import { X, Minus, Plus } from "lucide-react";
import { TEAL } from "@/lib/tokens";
import { useCartStore } from "@/lib/cartStore";

export interface AddonOption { id: number; name: string; price_delta: string; is_available: boolean; }
export interface AddonGroupData { id: number; name: string; is_required: boolean; min_selections: number; max_selections: number; addons: AddonOption[]; }

export default function AddonPickerModal({
  listing, addonGroups, quantity = 1, onClose, onAdded,
}: {
  listing: { id: number; title: string; price: number; image?: string | null; description?: string };
  addonGroups: AddonGroupData[];
  quantity?: number;
  onClose: () => void;
  onAdded: () => void;
}) {
  const addToCartWithAddons = useCartStore(s => s.addToCartWithAddons);
  const [selections, setSelections] = useState<Record<number, Set<number>>>({});
  const [qty, setQty] = useState(Math.max(1, quantity));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const toggle = (group: AddonGroupData, addonId: number) => {
    setSelections(prev => {
      const current = new Set(prev[group.id] || []);
      if (current.has(addonId)) {
        current.delete(addonId);
      } else {
        if (group.max_selections === 1) current.clear();
        else if (current.size >= group.max_selections) return prev; // at cap, ignore
        current.add(addonId);
      }
      return { ...prev, [group.id]: current };
    });
  };

  const selectedIds = Object.values(selections).flatMap(s => Array.from(s));
  const addonTotal = addonGroups
    .flatMap(g => g.addons)
    .filter(a => selectedIds.includes(a.id))
    .reduce((sum, a) => sum + parseFloat(a.price_delta), 0);

  const missingRequired = addonGroups.some(g => g.is_required && (selections[g.id]?.size || 0) === 0);

  const submit = async () => {
    if (missingRequired) { setError("Please make a selection for every required option."); return; }
    setSubmitting(true); setError("");
    try {
      await addToCartWithAddons(listing.id, qty, selectedIds);
      onAdded();
      onClose();
    } catch (err: any) {
      setError(err.message || "Could not add to cart.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4" onClick={() => !submitting && onClose()}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md space-y-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {listing.image && (
          <div className="w-full aspect-[16/9] bg-stone-50 overflow-hidden rounded-t-3xl -mb-1">
            <img src={listing.image} alt={listing.title} className="w-full h-full object-cover" />
          </div>
        )}

        <div className="px-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="font-bold text-stone-900 text-lg leading-tight">{listing.title}</p>
              {listing.description ? (
                <p className="text-stone-400 text-xs mt-1 line-clamp-2">{listing.description}</p>
              ) : (
                <p className="text-stone-400 text-xs mt-0.5">Customize your order</p>
              )}
              <p className="text-sm font-bold mt-1.5" style={{ color: TEAL }}>₦{listing.price.toLocaleString()}</p>
            </div>
            <button onClick={onClose} disabled={submitting} className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-stone-500 flex-shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>

          {addonGroups.length > 0 && (
            <p className="text-xs font-bold text-stone-500 uppercase tracking-wide">Customizations</p>
          )}

          {addonGroups.map(group => (
            <div key={group.id}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-stone-800">{group.name}</p>
                <span className="text-[11px] text-stone-400">
                  {group.is_required ? "Required" : "Optional"}
                  {group.max_selections > 1 ? ` · up to ${group.max_selections}` : ""}
                </span>
              </div>
              <div className="space-y-1.5">
                {group.addons.filter(a => a.is_available).map(a => {
                  const checked = selections[group.id]?.has(a.id) || false;
                  const delta = parseFloat(a.price_delta);
                  return (
                    <label key={a.id}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition ${checked ? "border-teal-400 bg-teal-50" : "border-stone-200 bg-white"}`}>
                      <input
                        type={group.max_selections === 1 ? "radio" : "checkbox"}
                        name={`group-${group.id}`}
                        checked={checked}
                        onChange={() => toggle(group, a.id)}
                        className="accent-teal-600"
                      />
                      <span className="flex-1 text-sm text-stone-700">{a.name}</span>
                      {delta !== 0 && (
                        <span className="text-xs font-semibold text-stone-500">
                          {delta > 0 ? "+" : ""}₦{delta.toLocaleString()}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Quantity */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-sm font-semibold text-stone-600">Quantity</span>
            <div className="flex items-center border border-stone-200 rounded-xl overflow-hidden">
              <button onClick={() => setQty(q => Math.max(1, q - 1))} className="px-3 py-2 text-stone-500 hover:bg-stone-50 transition">
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="px-4 text-sm font-bold text-stone-900 min-w-[2rem] text-center">{qty}</span>
              <button onClick={() => setQty(q => q + 1)} className="px-3 py-2 text-stone-500 hover:bg-stone-50 transition">
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <div className="border-t border-stone-100 pt-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-stone-600">Estimated total</span>
            <span className="text-lg font-bold" style={{ color: TEAL }}>₦{((listing.price + addonTotal) * qty).toLocaleString()}</span>
          </div>

          <button onClick={submit} disabled={submitting || missingRequired}
            className="w-full py-3.5 rounded-full font-bold text-white text-sm disabled:opacity-50 transition mb-6"
            style={{ background: TEAL }}>
            {submitting ? "Adding…" : "Add to Cart"}
          </button>
        </div>
      </div>
    </div>
  );
}
