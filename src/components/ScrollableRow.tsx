"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";

/**
 * Horizontal scroll container with a right-edge chevron affordance so users
 * know the row scrolls and isn't static. The chevron only shows while there is
 * more content to the right, and hides once the row is scrolled to the end.
 * Tapping it nudges the row along.
 */
export default function ScrollableRow({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // 2px tolerance absorbs sub-pixel rounding at the end of the scroll.
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

  const nudge = () => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: Math.round(el.clientWidth * 0.8), behavior: "smooth" });
  };

  return (
    <div className="relative">
      <div
        ref={ref}
        className={className}
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" } as React.CSSProperties}
      >
        {children}
      </div>

      {canScrollRight && (
        <button
          type="button"
          onClick={nudge}
          aria-label="Scroll for more"
          className="absolute right-1 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-white/95 shadow-md border border-stone-200 flex items-center justify-center text-stone-700 hover:bg-white active:scale-95 transition"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
