// src/components/admin/CampusPills.tsx
"use client";

export type Campus = "" | "pau" | "futo" | "imsu";

const PILLS: { value: Campus; label: string }[] = [
  { value: "",     label: "All" },
  { value: "pau",  label: "PAU" },
  { value: "futo", label: "FUTO" },
  { value: "imsu", label: "IMSU" },
];

export function CampusPills({
  value,
  onChange,
}: {
  value: Campus;
  onChange: (v: Campus) => void;
}) {
  return (
    <div className="flex gap-2">
      {PILLS.map(p => (
        <button
          key={p.value}
          onClick={() => onChange(p.value)}
          className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all border ${
            value === p.value
              ? "bg-teal-600 border-teal-600 text-white shadow-sm"
              : "bg-white border-stone-200 text-stone-600 hover:border-teal-300 hover:text-teal-700"
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
