export const dynamic = 'force-dynamic';

import type { Metadata } from "next";
import VendorOfMonthHistoryClient from "./VendorOfMonthHistoryClient";

export const metadata: Metadata = {
  title: { absolute: "Vendor of the Month Hall of Fame | StudEx" },
  description: "Every vendor who has earned the Vendor of the Month title on StudEx.",
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export default async function VendorOfMonthPage() {
  let history: any[] = [];
  try {
    const res = await fetch(`${API_URL}/api/services/vendor-of-month/history/`, {
      cache: "no-store",
    });
    if (res.ok) history = await res.json();
  } catch {}

  return <VendorOfMonthHistoryClient history={history} />;
}
