import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, Shield } from "lucide-react";

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
    body: "We collect your name, email, phone number, campus, and transaction history when you register and use StudEx.",
  },
  {
    num: "02",
    title: "How We Use Your Data",
    body: "Your data is used to process orders, send notifications, and improve the platform. We never sell your personal information to third parties.",
  },
  {
    num: "03",
    title: "Payments",
    body: "Payment processing is handled by Paystack. StudEx does not store your card details. Paystack's own privacy policy applies to all payment transactions.",
  },
  {
    num: "04",
    title: "Data Security",
    body: "We use industry-standard encryption and secure servers to protect your data. Access to personal data is restricted to authorised personnel only.",
  },
  {
    num: "05",
    title: "Your Rights",
    body: "You can request deletion of your account and data at any time by contacting us at studex.ng@gmail.com.",
  },
  {
    num: "06",
    title: "Contact",
    body: "For privacy concerns, email us at studex.ng@gmail.com — we typically respond within 24 hours.",
  },
];

export default function PrivacyPolicyPage() {
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
            Privacy Policy
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
              </div>
            </div>
          </div>
        ))}

        <p className="text-stone-400 text-xs text-center pt-2">Last updated · 2026</p>
      </div>
    </div>
  );
}
