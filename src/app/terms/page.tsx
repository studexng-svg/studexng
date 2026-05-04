import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, FileText } from "lucide-react";

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description:
    "Read StudEx's terms and conditions for using the campus marketplace. Learn about platform rules, payments, and vendor obligations.",
  openGraph: {
    title: "Terms & Conditions | StudEx",
    description: "Read StudEx's terms and conditions for the campus marketplace platform.",
  },
  twitter: {
    title: "Terms & Conditions | StudEx",
    description: "Read StudEx's terms and conditions for the campus marketplace platform.",
  },
};

const sections = [
  {
    num: "01",
    title: "Platform Use",
    body: "StudEx is a marketplace exclusively for students and vendors on supported campuses. You must be a registered member of an eligible campus community to use this platform.",
  },
  {
    num: "02",
    title: "Payments",
    body: "All transactions are processed securely via Paystack. StudEx collects a platform fee on each transaction. Once payment is confirmed, vendors are notified to fulfil their orders promptly.",
  },
  {
    num: "03",
    title: "Vendor Responsibilities",
    body: "Vendors are fully responsible for fulfilling their orders and services as described. Misleading listings or failure to deliver may result in account suspension.",
  },
  {
    num: "04",
    title: "Refunds",
    body: "Refunds are reviewed on a case-by-case basis. Contact support within 24 hours of a failed or incomplete delivery to request a refund.",
  },
  {
    num: "05",
    title: "Contact",
    body: "For support, reach us at studex.ng@gmail.com — we typically respond within 24 hours.",
  },
];

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#FAFAF9]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      {/* HEADER */}
      <div className="sticky top-0 bg-white/80 backdrop-blur-md z-40 border-b border-stone-100 shadow-sm">
        <div className="flex items-center justify-between px-4 py-3 max-w-2xl mx-auto">
          <Link href="/">
            <button className="p-2.5 bg-white border border-stone-200 rounded-full shadow-sm active:scale-95 transition-all">
              <ChevronLeft className="w-5 h-5 text-stone-600" />
            </button>
          </Link>
          <h1
            className="text-base font-bold text-stone-900"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
          >
            Terms & Conditions
          </h1>
          <div className="w-10" />
        </div>
      </div>

      <div className="px-4 pt-8 pb-32 max-w-2xl mx-auto space-y-4">
        {/* PAGE TITLE */}
        <div className="mb-6">
          <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-semibold mb-1">Legal</p>
          <h2
            className="text-3xl font-bold text-stone-900"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
          >
            Terms & Conditions
          </h2>
          <p className="text-stone-400 text-sm mt-2">
            By using StudEx, you agree to the following terms. Please read them carefully.
          </p>
        </div>

        {/* ICON BANNER */}
        <div
          className="rounded-2xl p-5 flex items-center gap-4 mb-2"
          style={{ background: "linear-gradient(135deg, #0D9488 0%, #7C3AED 100%)" }}
        >
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
            <FileText className="w-5 h-5 text-white" />
          </div>
          <p className="text-white text-sm leading-relaxed">
            These terms govern your use of the StudEx campus marketplace platform.
          </p>
        </div>

        {/* SECTIONS */}
        {sections.map((s) => (
          <div
            key={s.num}
            className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm"
          >
            <div className="flex items-start gap-4">
              <span className="text-teal-600 text-xs font-bold tracking-[0.2em] uppercase mt-0.5 flex-shrink-0">
                {s.num}
              </span>
              <div>
                <h3
                  className="text-base font-bold text-stone-900 mb-1.5"
                  style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
                >
                  {s.title}
                </h3>
                <p className="text-stone-500 text-sm leading-relaxed">{s.body}</p>
              </div>
            </div>
          </div>
        ))}

        <p className="text-stone-400 text-xs text-center pt-2">Last updated · 2026</p>
      </div>
    </div>
  );
}
