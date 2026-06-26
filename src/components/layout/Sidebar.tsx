"use client";

import { ReactNode, CSSProperties } from "react";

/* ─────────────────────────────────────────────────────────────────────────
   SidebarLayout
   Two-column grid: [sidebar | main].
   On mobile the sidebar stacks above the main content.
   ───────────────────────────────────────────────────────────────────────── */
interface SidebarLayoutProps {
  sidebar: ReactNode;
  children: ReactNode;
  /** Width of the left column on lg+. Defaults to "240px". */
  sidebarWidth?: string;
  maxWidth?: string;
  className?: string;
  padY?: boolean;
}

export function SidebarLayout({
  sidebar,
  children,
  sidebarWidth = "240px",
  maxWidth = "max-w-7xl",
  className = "",
  padY = true,
}: SidebarLayoutProps) {
  return (
    <div className={`${maxWidth} mx-auto px-4 lg:px-8 ${padY ? "py-6" : ""} ${className}`}>
      <div
        className="lg:grid lg:gap-8 lg:items-start"
        style={{ "--sb-w": sidebarWidth, gridTemplateColumns: `${sidebarWidth} 1fr` } as CSSProperties}
      >
        {sidebar}
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Sidebar
   Sticky left column. Children are SidebarCards or any node.
   ───────────────────────────────────────────────────────────────────────── */
interface SidebarProps {
  children: ReactNode;
  className?: string;
  top?: string;
}

export function Sidebar({ children, className = "", top = "top-20" }: SidebarProps) {
  return (
    <aside className={`lg:sticky lg:${top} space-y-3 mb-6 lg:mb-0 ${className}`}>
      {children}
    </aside>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   SidebarCard
   A white rounded card block inside the sidebar.
   ───────────────────────────────────────────────────────────────────────── */
interface SidebarCardProps {
  title?: string;
  children: ReactNode;
  className?: string;
  /** "warning" | "admin" | "info" | undefined (default white) */
  variant?: "admin" | "warning" | "info";
  noPad?: boolean;
}

const VARIANT_STYLES = {
  admin:   "bg-purple-50 border-purple-200",
  warning: "bg-amber-50 border-amber-200",
  info:    "bg-teal-50 border-teal-200",
};
const TITLE_COLORS = {
  admin:   "text-purple-600",
  warning: "text-amber-600",
  info:    "text-teal-600",
};

export function SidebarCard({
  title,
  children,
  className = "",
  variant,
  noPad = false,
}: SidebarCardProps) {
  const base = variant ? VARIANT_STYLES[variant] : "bg-white border-stone-100";
  const titleColor = variant ? TITLE_COLORS[variant] : "text-teal-600";

  return (
    <div className={`rounded-2xl border shadow-sm ${noPad ? "" : "p-5"} ${base} ${className}`}>
      {title && (
        <p className={`text-xs font-bold tracking-widest uppercase mb-3 ${titleColor} ${noPad ? "px-5 pt-5" : ""}`}>
          {title}
        </p>
      )}
      {children}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   SidebarDivider — thin line between sections inside a card
   ───────────────────────────────────────────────────────────────────────── */
export function SidebarDivider() {
  return <div className="border-t border-stone-100 my-3" />;
}

/* ─────────────────────────────────────────────────────────────────────────
   SidebarNavItem — a clickable row for nav sidebars (admin, settings, etc.)
   ───────────────────────────────────────────────────────────────────────── */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ElementType } from "react";

interface SidebarNavItemProps {
  href: string;
  icon: ElementType;
  label: string;
  badge?: string | number;
  exact?: boolean;
}

export function SidebarNavItem({ href, icon: Icon, label, badge, exact }: SidebarNavItemProps) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname.startsWith(href);

  return (
    <Link href={href}
      className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
        active
          ? "bg-teal-50 text-teal-700 font-semibold"
          : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
      }`}>
      <Icon className={`w-4 h-4 flex-shrink-0 ${active ? "text-teal-600" : "text-stone-400"}`} />
      <span className="flex-1 truncate">{label}</span>
      {badge !== undefined && (
        <span className="text-xs font-bold bg-red-500 text-white px-1.5 py-0.5 rounded-full leading-none">
          {badge}
        </span>
      )}
    </Link>
  );
}
