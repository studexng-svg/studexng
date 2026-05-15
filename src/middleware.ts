import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const STATUS_URL =
  "https://raw.githubusercontent.com/studexng-svg/studexng/main/maintenance.json";

const CACHE_TTL = 30_000;
let cache: { active: boolean; at: number } | null = null;

async function isMaintenanceOn(): Promise<boolean> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL) return cache.active;

  try {
    const res = await fetch(STATUS_URL, { cache: "no-store" });
    const data = await res.json();
    const active = data.maintenance === true;
    cache = { active, at: now };
    return active;
  } catch {
    // If GitHub is unreachable, default to OFF so users aren't blocked
    cache = { active: false, at: now };
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    pathname.startsWith("/images") ||
    pathname.startsWith("/icons")
  ) {
    return NextResponse.next();
  }

  // Tag the maintenance page request so the root layout can skip LayoutClient
  if (pathname === "/maintenance") {
    const reqHeaders = new Headers(request.headers);
    reqHeaders.set("x-maintenance-page", "1");
    return NextResponse.next({ request: { headers: reqHeaders } });
  }

  if (await isMaintenanceOn()) {
    return NextResponse.redirect(new URL("/maintenance", request.url));
  }

  // Admin route protection — require an access_token cookie for all /admin/* pages
  // except /admin/login (the entry point). The component-level AdminGuard performs
  // the full is_admin check; this just prevents unauthenticated users from loading
  // the admin shell at all.
  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    const token = request.cookies.get("access_token");
    if (!token) {
      return NextResponse.redirect(new URL("/auth", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
