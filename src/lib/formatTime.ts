/** "09:00" (24h "HH:MM") -> "9:00 AM". Returns null for empty/malformed input. */
export function formatOpensAt(hhmm?: string | null): string | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm.trim());
  if (!m) return null;
  let h = parseInt(m[1], 10);
  if (Number.isNaN(h)) return null;
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m[2]} ${ampm}`;
}
