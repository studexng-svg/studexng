"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Horizontal scroll container with left/right chevron affordances so users know
 * the row scrolls and isn't static.
 *
 * - The right chevron shows while there is more content to the right; the left
 *   chevron shows once the row has been scrolled away from the start. Each hides
 *   when it reaches that end.
 * - Nudging moves by whole card widths and clamps to the exact scroll bounds, so
 *   the row lands flush on the last card instead of overshooting into blank
 *   space past the final store.
 */
export default function ScrollableRow({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // 2px tolerance absorbs sub-pixel rounding at either end of the scroll.
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollWidth - el.clientWidth - el.scrollLeft > 2);
  }, []);

  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    // Cards/images can arrive async — re-measure shortly after mount.
    const t = setTimeout(update, 400);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      clearTimeout(t);
    };
  }, [update, children]);

  const nudge = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    // Step by a whole number of cards so we always land on a card boundary.
    const firstCard = el.firstElementChild as HTMLElement | null;
    const gap = parseFloat(getComputedStyle(el).columnGap || "0") || 0;
    const step = firstCard ? firstCard.offsetWidth + gap : el.clientWidth * 0.8;
    const perPage = Math.max(1, Math.floor(el.clientWidth / step));
    const max = el.scrollWidth - el.clientWidth;
    const target = Math.max(0, Math.min(el.scrollLeft + dir * step * perPage, max));
    el.scrollTo({ left: target, behavior: "smooth" });
  };

  const btn =
    "absolute top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-white/95 shadow-md " +
    "border border-stone-200 flex items-center justify-center text-stone-700 hover:bg-white active:scale-95 transition";

  return (
    <div className="relative">
      <div
        ref={ref}
        // snap-proximity + snap-start on each card makes a free swipe settle on a
        // card edge too, without the parent having to tag every child. proximity
        // (not mandatory) so it never fights the ends — the last card can rest
        // flush at the right instead of being pulled off-screen.
        className={`${className} snap-x snap-proximity [&>*]:snap-start`}
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" } as React.CSSProperties}
      >
        {children}
      </div>

      {canScrollLeft && (
        <button type="button" onClick={() => nudge(-1)} aria-label="Scroll back" className={`${btn} left-1`}>
          <ChevronLeft className="w-4 h-4" />
        </button>
      )}
      {canScrollRight && (
        <button type="button" onClick={() => nudge(1)} aria-label="Scroll for more" className={`${btn} right-1`}>
          <ChevronRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
