"use client";

import { useMemo, useState } from "react";
import { Plus, UtensilsCrossed } from "lucide-react";
import { TEAL } from "@/lib/tokens";
import { AddonGroupData } from "@/components/cart/AddonPickerModal";

function SafeImg({ src, alt }: { src?: string | null; alt: string }) {
  const [err, setErr] = useState(false);
  if (!src || err || !src.startsWith("http")) return (
    <div className="w-full h-full bg-stone-100 flex items-center justify-center">
      <UtensilsCrossed className="w-5 h-5 text-stone-300" />
    </div>
  );
  return <img src={src} alt={alt} loading="lazy" onError={() => setErr(true)} className="w-full h-full object-cover" />;
}

export interface MenuOrderingItem {
  id: number;
  title: string;
  description: string;
  price: number | string;
  image?: string | null;
  is_available: boolean;
  menu_item: { menu_category: string | null; is_hidden: boolean; addon_groups: AddonGroupData[] } | null;
}

// The buyer-facing "restaurant app" view for a menu-ordering vendor's
// storefront — browse by category, tap an item to customize/add to cart —
// swapped in for the marketplace grid on vendor/[username]/page.tsx when
// that vendor's listings carry a non-null `menu_item` (the signal that they
// support menu ordering; no backend change needed since ListingSerializer
// already exposes this on every listing).
export default function RestaurantMenuView({
  listings, isOwn, onSelectItem,
}: {
  listings: MenuOrderingItem[];
  isOwn: boolean;
  onSelectItem: (item: MenuOrderingItem) => void;
}) {
  const [activeCategory, setActiveCategory] = useState("All");

  const items = useMemo(
    () => listings.filter(l => l.is_available && l.menu_item && !l.menu_item.is_hidden),
    [listings]
  );

  const categories = useMemo(() => {
    const names = new Set<string>();
    items.forEach(i => names.add(i.menu_item?.menu_category || "Menu"));
    return ["All", ...Array.from(names).sort()];
  }, [items]);

  const visible = activeCategory === "All"
    ? items
    : items.filter(i => (i.menu_item?.menu_category || "Menu") === activeCategory);

  if (items.length === 0) {
    return (
      <div className="bg-stone-50 rounded-2xl p-16 text-center border border-stone-100">
        <UtensilsCrossed className="w-10 h-10 text-stone-200 mx-auto mb-3" />
        <p className="text-stone-400 font-semibold text-sm">No menu items yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Category chips */}
      {categories.length > 2 && (
        <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
          {categories.map(cat => (
            <button key={cat} onClick={() => setActiveCategory(cat)}
              className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all flex-shrink-0 ${
                activeCategory === cat ? "text-white shadow-sm" : "bg-stone-100 text-stone-500 hover:bg-stone-200"
              }`}
              style={activeCategory === cat ? { background: TEAL } : {}}>
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Menu item list */}
      <div className="space-y-3">
        {visible.map(item => {
          const hasCustomizations = (item.menu_item?.addon_groups?.length || 0) > 0;
          const price = Number(item.price);
          return (
            <button key={item.id} onClick={() => onSelectItem(item)}
              disabled={isOwn}
              className="w-full flex gap-4 bg-white border border-stone-100 rounded-2xl p-3 text-left hover:border-teal-200 hover:shadow-sm transition-all disabled:opacity-70 disabled:cursor-default">
              <div className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0">
                <SafeImg src={item.image} alt={item.title} />
              </div>
              <div className="flex-1 min-w-0 flex flex-col justify-center">
                <p className="font-bold text-stone-900 text-sm truncate">{item.title}</p>
                {item.description && (
                  <p className="text-stone-400 text-xs mt-0.5 line-clamp-2">{item.description}</p>
                )}
                <div className="flex items-center justify-between mt-1.5">
                  <span className="font-black text-stone-900 text-sm">₦{price.toLocaleString()}</span>
                  {hasCustomizations && (
                    <span className="text-[10px] font-semibold text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full">Customizable</span>
                  )}
                </div>
              </div>
              {!isOwn && (
                <div className="flex items-center flex-shrink-0">
                  <span className="w-9 h-9 rounded-full flex items-center justify-center text-white shadow-sm" style={{ background: TEAL }}>
                    <Plus className="w-4 h-4" />
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
