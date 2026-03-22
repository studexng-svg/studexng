// src/components/VendorBadge.tsx
import React from "react";

type BadgeType = "rising" | "trusted" | "top";

interface VendorBadgeProps {
  badge: BadgeType;
  size?: "sm" | "md" | "lg";
}

const BADGE_CONFIG: Record<BadgeType, { label: string; emoji: string; className: string }> = {
  rising: {
    label: "Rising Vendor",
    emoji: "⭐",
    className: "bg-amber-100 text-amber-700 border-amber-200",
  },
  trusted: {
    label: "Trusted Vendor",
    emoji: "✅",
    className: "bg-blue-100 text-blue-700 border-blue-200",
  },
  top: {
    label: "Top Vendor",
    emoji: "🏆",
    className: "bg-purple-100 text-purple-700 border-purple-200",
  },
};

const SIZE_CLASS: Record<string, string> = {
  sm: "text-[10px] px-1.5 py-0.5",
  md: "text-xs px-2 py-1",
  lg: "text-sm px-3 py-1.5",
};

export default function VendorBadge({ badge, size = "md" }: VendorBadgeProps) {
  const config = BADGE_CONFIG[badge];
  if (!config) return null;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-bold whitespace-nowrap
        ${config.className} ${SIZE_CLASS[size]}`}
      title={config.label}
    >
      <span>{config.emoji}</span>
      <span>{config.label}</span>
    </span>
  );
}
