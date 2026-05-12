import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const HEALTH_URL = "https://api.studex.com.ng/api/health/maintenance/";
const CACHE_TTL = 30_000; // 30 seconds

let cache: { down: boolean; at: number } | null = null;

async function isMaintenanceActive(): Promise<boolean> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL) return cache.down;

  try {
    const res = await fetch(HEALTH_URL, {
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });

    // Render maintenance mode returns 503 before Django even runs
    if (res.status === 503) {
      cache = { down: true, at: now };
      return true;
    }

    const data = await res.json();
    const down = data.maintenance === true;
    cache = { down, at: now };
    return down;
  } catch {
    // Network error or timeout — treat as maintenance
    cache = { down: true, at: now };
    return true;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always skip these
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

  // Don't redirect if already on maintenance page
  if (pathname === "/maintenance") {
    return NextResponse.next();
  }

  if (await isMaintenanceActive()) {
    return NextResponse.redirect(new URL("/maintenance", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
