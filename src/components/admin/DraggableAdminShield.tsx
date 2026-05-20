"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Shield } from "lucide-react";
import { GRAD } from "@/lib/tokens";
import { useAdminMode } from "@/hooks/useAdminMode";

const MARGIN = 14;
const STORAGE_KEY = "admin-shield-pos";

export default function DraggableAdminShield() {
  const { isAdmin } = useAdminMode();
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const didDrag = useRef(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  // Initialise position from storage or default to bottom-right
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setPos(JSON.parse(saved));
        return;
      }
    } catch {}
    setPos({ x: window.innerWidth - 56 - MARGIN, y: window.innerHeight - 56 - MARGIN });
  }, []);

  const snapToCorner = useCallback((rawX: number, rawY: number) => {
    const el = ref.current;
    const w = el ? el.offsetWidth : 44;
    const h = el ? el.offsetHeight : 44;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    return {
      x: rawX + w / 2 < vw / 2 ? MARGIN : vw - w - MARGIN,
      y: rawY + h / 2 < vh / 2 ? MARGIN : vh - h - MARGIN,
    };
  }, []);

  // ── Mouse ────────────────────────────────────────────────────────────────
  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    didDrag.current = false;
    const rect = ref.current!.getBoundingClientRect();
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    setDragging(true);
  };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      didDrag.current = true;
      setPos({ x: e.clientX - dragOffset.current.x, y: e.clientY - dragOffset.current.y });
    };
    const onUp = (e: MouseEvent) => {
      const snapped = snapToCorner(
        e.clientX - dragOffset.current.x,
        e.clientY - dragOffset.current.y,
      );
      setPos(snapped);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapped));
      setDragging(false);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, snapToCorner]);

  // ── Touch ────────────────────────────────────────────────────────────────
  const onTouchStart = (e: React.TouchEvent) => {
    didDrag.current = false;
    const t = e.touches[0];
    const rect = ref.current!.getBoundingClientRect();
    dragOffset.current = { x: t.clientX - rect.left, y: t.clientY - rect.top };
    setDragging(true);
  };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: TouchEvent) => {
      e.preventDefault();
      didDrag.current = true;
      const t = e.touches[0];
      setPos({ x: t.clientX - dragOffset.current.x, y: t.clientY - dragOffset.current.y });
    };
    const onEnd = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      const snapped = snapToCorner(
        t.clientX - dragOffset.current.x,
        t.clientY - dragOffset.current.y,
      );
      setPos(snapped);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapped));
      if (!didDrag.current) router.push("/admin");
      setDragging(false);
    };
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);
    return () => {
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
    };
  }, [dragging, snapToCorner]);

  if (!isAdmin || pos === null) return null;

  return (
    <div
      ref={ref}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      onClick={() => { if (!didDrag.current) router.push("/admin"); }}
      className="fixed z-[9999] w-11 h-11 rounded-2xl flex items-center justify-center shadow-lg select-none"
      style={{
        left: pos.x,
        top: pos.y,
        background: GRAD,
        cursor: dragging ? "grabbing" : "grab",
        transition: dragging ? "none" : "left 0.22s cubic-bezier(.4,0,.2,1), top 0.22s cubic-bezier(.4,0,.2,1)",
        touchAction: "none",
      }}
      title="Admin Panel"
    >
      <Shield className="w-5 h-5 text-white pointer-events-none" />
    </div>
  );
}
