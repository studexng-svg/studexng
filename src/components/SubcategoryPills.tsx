// src/components/SubcategoryPills.tsx
"use client";

export interface Subcategory {
  id: number;
  title: string;
  slug: string;
}

export function SubcategoryPills({
  subcategories,
  value,
  onChange,
}: {
  subcategories: Subcategory[];
  value: string;
  onChange: (v: string) => void;
}) {
  if (!subcategories.length) return null;

  return (
    <div className="flex gap-2 overflow-x-auto hide-scrollbar">
      <button
        onClick={() => onChange("")}
        className={`flex-shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-full text-xs font-bold transition-all border ${
          value === ""
            ? "bg-teal-600 border-teal-600 text-white shadow-sm"
            : "bg-white border-stone-200 text-stone-600 hover:border-teal-300 hover:text-teal-700"
        }`}
      >
        All
      </button>
      {subcategories.map(sub => (
        <button
          key={sub.id}
          onClick={() => onChange(sub.slug)}
          className={`flex-shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-full text-xs font-bold transition-all border ${
            value === sub.slug
              ? "bg-teal-600 border-teal-600 text-white shadow-sm"
              : "bg-white border-stone-200 text-stone-600 hover:border-teal-300 hover:text-teal-700"
          }`}
        >
          {sub.title}
        </button>
      ))}
    </div>
  );
}
