// src/components/layout/BackButton.tsx
"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

interface BackButtonProps {
  fallbackUrl?: string;
  label?: string;
  className?: string;
}

/**
 * Reusable Back Button Component
 *
 * Features:
 * - Uses Next.js router.back() for navigation
 * - Falls back to specified URL if no history
 * - Animated hover effects
 * - Dark mode support
 * - Accessible
 *
 * Usage:
 * <BackButton /> // Simple back
 * <BackButton fallbackUrl="/home" /> // With fallback
 * <BackButton label="Back to Products" /> // Custom label
 */
export default function BackButton({
  fallbackUrl = "/home",
  label,
  className = ""
}: BackButtonProps) {
  const router = useRouter();

  const handleBack = () => {
    // Check if there's history to go back to
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      // Fallback to specified URL
      router.push(fallbackUrl);
    }
  };

  return (
    <button
      onClick={handleBack}
      className={`
        flex items-center gap-2
        px-4 py-2
        bg-white dark:bg-gray-800
        text-gray-900 dark:text-gray-100
        border border-gray-200 dark:border-gray-700
        rounded-lg
        shadow-sm hover:shadow-md
        hover:scale-[1.05] hover:-translate-x-0.5
        active:scale-95
        transition-all duration-200
        font-medium text-sm
        ${className}
      `}
      aria-label={label || "Go back"}
    >
      <ArrowLeft className="w-4 h-4" />
      {label && <span>{label}</span>}
    </button>
  );
}
