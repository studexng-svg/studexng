// src/lib/analyticsConfig.ts
// Shared between src/app/layout.tsx (Server Component, just needs the
// constant) and src/components/Analytics.tsx (Client Component, actually
// loads GA with it) — kept in its own file rather than exported from
// layout.tsx so client code never has to import anything from a file that
// also imports next/headers.
export const GA_ID = "G-RZMK0KLZHB";
