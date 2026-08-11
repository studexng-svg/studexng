import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, Shield } from "lucide-react";
import ManageCookiePreferencesButton from "@/components/ManageCookiePreferencesButton";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Learn how StudEx collects, uses, and protects your personal data. We are committed to keeping your information safe on the campus marketplace.",
  openGraph: {
    title: "Privacy Policy | StudEx",
    description: "Learn how StudEx collects, uses, and protects your personal data.",
  },
  twitter: {
    title: "Privacy Policy | StudEx",
    description: "Learn how StudEx collects, uses, and protects your personal data.",
  },
};

const sections = [
  {
    num: "01",
    title: "Data We Collect",
    body: "We collect your name, email, phone number, campus, matric number or NIN (for verification), and transaction history when you register and use StudEx.",
  },
  {
    num: "02",
    title: "How We Use Your Data",
    body: "Your data is used to process orders, send notifications, and improve the platform. We never sell your personal information to third parties.",
  },
  {
    num: "03",
    title: "Cookies & Analytics",
    body: "We use essential cookies to keep you signed in and cart working. Analytics cookies (Google Analytics) only load after you accept them in the cookie banner — if you reject or ignore it, no analytics script runs on your visit. You can change your choice any time below.",
  },
  {
    num: "04",
    title: "Payments",
    body: "Payment processing is handled by Paystack. StudEx does not store your card details. Paystack's own privacy policy applies to all payment transactions.",
  },
  {
    num: "05",
    title: "Data Security",
    body: "We use industry-standard encryption and secure servers to protect your data. Access to personal data is restricted to authorised personnel only.",
  },
  {
    num: "06",
    title: "Data Retention",
    body: "We keep your account data for as long as your account is active. If you delete your account, your personal details (name, email, phone, matric number/NIN, and similar) are permanently erased immediately. Order and payment records tied to your account are kept in anonymized form — no longer linked to you personally — because we have a separate legal and accounting basis to retain transaction records.",
  },
  {
    num: "07",
    title: "Your Rights",
    body: "Under Nigeria's Data Protection Act, you have the right to access the personal data we hold on you, correct it if it's wrong, restrict or object to how it's used, and request its erasure. You can delete your own account and data at any time from Account Settings → Delete Account — no need to email us for that one. For access, correction, or anything else, contact studex.ng@gmail.com.",
  },
  {
    num: "08",
    title: "Contact",
    body: "For privacy concerns, email us at studex.ng@gmail.com — we typically respond within 24 hours.",
  },
];

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-[#F5F5F5]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="sticky top-0 bg-white z-40 border-b border-stone-100 shadow-sm">
        <div className="flex items-center justify-between px-4 py-3 max-w-2xl mx-auto">
          <Link href="/" className="p-2 bg-stone-100 hover:bg-stone-200 rounded-full transition-all">
            <ChevronLeft className="w-5 h-5 text-stone-600" />
          </Link>
          <h1 className="text-base font-bold text-stone-900">Privacy Policy</h1>
          <div className="w-9" />
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
            Privacy Policy
          </h2>
          <p className="text-stone-400 text-sm mt-2">
            Your privacy is important to us. This policy explains how StudEx collects and uses your data.
          </p>
        </div>

        {/* ICON BANNER */}
        <div
          className="rounded-2xl p-5 flex items-center gap-4 mb-2"
          style={{ background: "linear-gradient(135deg, #0D9488 0%, #7C3AED 100%)" }}
        >
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <p className="text-white text-sm leading-relaxed">
            We are committed to keeping your data safe and never selling it to third parties.
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
                {s.num === "03" && (
                  <div className="mt-3">
                    <ManageCookiePreferencesButton />
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        <p className="text-stone-400 text-xs text-center pt-2">Last updated · 2026</p>
      </div>
    </div>
  );
}
