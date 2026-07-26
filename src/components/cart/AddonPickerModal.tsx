"use client";

import { useState } from "react";
import { X, Minus, Plus } from "lucide-react";
import { TEAL } from "@/lib/tokens";
import { useCartStore } from "@/lib/cartStore";

export interface AddonOption { id: number; name: string; price_delta: string; is_available: boolean; }
export interface AddonGroupData { id: number; name: string; is_required: boolean; min_selections: number; max_selections: number; addons: AddonOption[]; }

const MAX_ADDON_QTY = 20;

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
  // groupId -> { addonId -> quantity of that add-on, e.g. 2x Chicken }
  const [selections, setSelections] = useState<Record<number, Record<number, number>>>({});
  const [qty, setQty] = useState(Math.max(1, quantity));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const toggle = (group: AddonGroupData, addonId: number) => {
    setSelections(prev => {
      const current = { ...(prev[group.id] || {}) };
      if (addonId in current) {
        delete current[addonId];
      } else {
        if (group.max_selections === 1) return { ...prev, [group.id]: { [addonId]: 1 } };
        if (Object.keys(current).length >= group.max_selections) return prev; // at cap, ignore
        current[addonId] = 1;
      }
      return { ...prev, [group.id]: current };
    });
  };

  const setAddonQty = (groupId: number, addonId: number, next: number) => {
    setSelections(prev => {
      const current = prev[groupId] || {};
      if (!(addonId in current)) return prev;
      return { ...prev, [groupId]: { ...current, [addonId]: Math.min(MAX_ADDON_QTY, Math.max(1, next)) } };
    });
  };

  const qtyByAddonId: Record<number, number> = {};
  Object.values(selections).forEach(group => Object.entries(group).forEach(([id, q]) => { qtyByAddonId[Number(id)] = q; }));

  const addonTotal = addonGroups
    .flatMap(g => g.addons)
    .reduce((sum, a) => (a.id in qtyByAddonId ? sum + parseFloat(a.price_delta) * qtyByAddonId[a.id] : sum), 0);

  const missingRequired = addonGroups.some(g => g.is_required && Object.keys(selections[g.id] || {}).length === 0);

  const submit = async () => {
    if (missingRequired) { setError("Please make a selection for every required option."); return; }
    setSubmitting(true); setError("");
    try {
      const addonSelections = Object.entries(qtyByAddonId).map(([id, q]) => ({ id: Number(id), quantity: q }));
      await addToCartWithAddons(listing.id, qty, addonSelections);
      onAdded();
      onClose();
    } catch (err: any) {
      setError(err.message || "Could not add to cart.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/30 backdrop-blur-md flex items-center justify-center p-4" onClick={() => !submitting && onClose()}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="overflow-y-auto hide-scrollbar">
          {listing.image && (
            <div className="w-full aspect-[16/9] bg-stone-50 overflow-hidden">
              <img src={listing.image} alt={listing.title} className="w-full h-full object-cover" />
            </div>
          )}

          <div className="p-5 sm:p-6 space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold text-stone-900 text-lg leading-tight">{listing.title}</p>
                {listing.description ? (
                  <p className="text-stone-400 text-xs mt-1 line-clamp-2">{listing.description}</p>
                ) : (
                  <p className="text-stone-400 text-xs mt-1">Customize your order</p>
                )}
                <p className="text-sm font-bold mt-2" style={{ color: TEAL }}>₦{listing.price.toLocaleString()}</p>
              </div>
              <button onClick={onClose} disabled={submitting} className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-stone-500 flex-shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>

            {addonGroups.length > 0 && (
              <div className="space-y-4">
                <p className="text-xs font-bold text-stone-500 uppercase tracking-wide">Customizations</p>
                {addonGroups.map(group => (
                  <div key={group.id}>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-semibold text-stone-800">{group.name}</p>
                      <span className="text-[11px] text-stone-400 flex-shrink-0 ml-2">
                        {group.is_required ? "Required" : "Optional"}
                        {group.max_selections > 1 ? ` · up to ${group.max_selections}` : ""}
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {group.addons.filter(a => a.is_available).map(a => {
                        const selectedQty = qtyByAddonId[a.id];
                        const checked = selectedQty != null;
                        const delta = parseFloat(a.price_delta);
                        return (
                          <div key={a.id}
                            className={`rounded-xl border transition ${checked ? "border-teal-400 bg-teal-50" : "border-stone-200 bg-white"}`}>
                            <label className="flex items-center gap-3 px-3 py-2.5 cursor-pointer">
                              <input
                                type={group.max_selections === 1 ? "radio" : "checkbox"}
                                name={`group-${group.id}`}
                                checked={checked}
                                onChange={() => toggle(group, a.id)}
                                className="accent-teal-600 flex-shrink-0"
                              />
                              <span className="flex-1 text-sm text-stone-700 min-w-0 truncate">{a.name}</span>
                              {delta !== 0 && (
                                <span className="text-xs font-semibold text-stone-500 flex-shrink-0">
                                  {delta > 0 ? "+" : ""}₦{delta.toLocaleString()}{checked && selectedQty > 1 ? ` ×${selectedQty}` : ""}
                                </span>
                              )}
                            </label>
                            {checked && (
                              <div className="flex items-center justify-between px-3 pb-2.5 pl-9">
                                <span className="text-[11px] text-stone-400">Quantity</span>
                                <div className="flex items-center border border-stone-200 rounded-lg overflow-hidden bg-white">
                                  <button type="button" onClick={() => setAddonQty(group.id, a.id, selectedQty - 1)}
                                    className="px-2 py-1 text-stone-500 hover:bg-stone-50 transition">
                                    <Minus className="w-3 h-3" />
                                  </button>
                                  <span className="px-3 text-xs font-bold text-stone-900 min-w-[1.5rem] text-center">{selectedQty}</span>
                                  <button type="button" onClick={() => setAddonQty(group.id, a.id, selectedQty + 1)}
                                    className="px-2 py-1 text-stone-500 hover:bg-stone-50 transition">
                                    <Plus className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Quantity */}
            <div className="flex items-center justify-between">
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
          </div>
        </div>

        {/* Sticky footer — always visible even when the customization list scrolls */}
        <div className="p-5 sm:p-6 pt-3 border-t border-stone-100 space-y-3 flex-shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-stone-600">Estimated total</span>
            <span className="text-lg font-bold" style={{ color: TEAL }}>₦{((listing.price + addonTotal) * qty).toLocaleString()}</span>
          </div>
          <button onClick={submit} disabled={submitting || missingRequired}
            className="w-full py-3.5 rounded-full font-bold text-white text-sm disabled:opacity-50 transition"
            style={{ background: TEAL }}>
            {submitting ? "Adding…" : "Add to Cart"}
          </button>
        </div>
      </div>
    </div>
  );
}
