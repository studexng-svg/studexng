// Shared design tokens — import these instead of writing inline styles
import type { CSSProperties } from "react";

export const GRAD = "linear-gradient(135deg, #0D9488 0%, #7C3AED 100%)";

export const GRAD_DARK = "linear-gradient(135deg, #0b1a18 0%, #1a0b2e 100%)";

export const GRAD_TEXT: CSSProperties = {
  background: GRAD,
  WebkitBackgroundClip: "text",
  WebkitTextFillColor: "transparent",
  backgroundClip: "text",
};

export const SERIF: CSSProperties = {
  fontFamily: "'Playfair Display', Georgia, serif",
};

export const SANS: CSSProperties = {
  fontFamily: "'DM Sans', sans-serif",
};

export const toArray = (d: any): any[] =>
  Array.isArray(d) ? d : (d?.results ?? []);

/** StudEx service fee: 8% of order, minimum ₦50, capped at ₦3,000 */
export function calcServiceFee(amount: number): number {
  return Math.min(Math.max(amount * 0.08, 50), 3000);
}

/**
 * Paystack processing fee passed to customer:
 * 1.5% of checkout amount + ₦100 flat (for amounts ≥ ₦2,500).
 * This is what Paystack adds on top of our checkout amount before charging the card.
 */
export function calcPaystackFee(checkoutAmount: number): number {
  const flat = checkoutAmount >= 2500 ? 100 : 0;
  const gross = (checkoutAmount + flat) / (1 - 0.015);
  return Math.round((gross - checkoutAmount) * 100) / 100;
}

export const ACCENT = "#f97316"; // orange-500
export const ACCENT_DARK = "#ea580c"; // orange-600
