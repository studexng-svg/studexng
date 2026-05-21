// src/app/faq/page.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { GRAD, SERIF } from "@/lib/tokens";
import { ChevronDown, ChevronUp, HelpCircle, MessageCircle, Shield, CreditCard, Star, Package, Calendar } from "lucide-react";
import TopNav from "@/components/layout/TopNav";

const faqs = [
  {
    category: "Payments",
    icon: CreditCard,
    color: "text-teal-600",
    bg: "bg-teal-50",
    questions: [
      {
        q: "How does payment work on StudEx?",
        a: "When you pay for a service, your payment is processed securely via Paystack. StudEx charges an 8% service fee (minimum ₦50, maximum ₦1,500) which covers both the platform and Paystack's payment processing cost — no hidden charges on top. The vendor receives their full listing price directly via Paystack transfer.",
      },
      {
        q: "When is the vendor paid?",
        a: "The vendor receives their portion of the payment automatically via Paystack once your transaction is verified. You will receive a confirmation once your order is placed.",
      },
      {
        q: "What payment methods are accepted?",
        a: "We accept debit/credit cards, bank transfers, and USSD via Paystack. All payments are processed securely.",
      },
      {
        q: "Can I get a refund?",
        a: "If you have a dispute with an order, contact support as soon as possible. Our team will review the case and work with both you and the vendor to find a resolution.",
      },
    ],
  },
  {
    category: "Bookings",
    icon: Calendar,
    color: "text-teal-600",
    bg: "bg-teal-50",
    questions: [
      {
        q: "How do I book a service?",
        a: "Open any listing, scroll to 'Book a Date & Time', pick a date and time slot, add an optional note, then tap 'Send Booking Request'. The vendor will accept or decline.",
      },
      {
        q: "Do I pay when I book?",
        a: "No. You only pay AFTER the vendor accepts your booking. A 'Pay Now' button will appear in your My Bookings page once the vendor confirms.",
      },
      {
        q: "What if the vendor declines my booking?",
        a: "If a vendor declines, your booking will show as 'Declined' and no payment is taken. You can rebook with a different vendor or try a different date.",
      },
      {
        q: "Can I cancel a booking?",
        a: "Yes, you can cancel a pending booking (before the vendor accepts) from your My Bookings page. Once a booking is confirmed and paid, contact support to resolve.",
      },
    ],
  },
  {
    category: "Orders",
    icon: Package,
    color: "text-stone-600",
    bg: "bg-stone-50",
    questions: [
      {
        q: "Where can I see my orders?",
        a: "Go to Account → My Orders to see all your paid orders. Go to Account → My Bookings to see your service booking requests.",
      },
      {
        q: "What does 'In Progress' mean?",
        a: "It means your payment has been received and the vendor is working on your order. You will be updated when the vendor marks it as completed.",
      },
      {
        q: "What does 'Seller Completed' mean?",
        a: "The vendor has marked the service as done on their end. You should confirm receipt if you are satisfied, which completes the order.",
      },
    ],
  },
  {
    category: "Reviews & Loyalty",
    icon: Star,
    color: "text-amber-600",
    bg: "bg-amber-50",
    questions: [
      {
        q: "How do I leave a review?",
        a: "After a completed order, a review form will appear on the order detail page. Rate the vendor 1–5 stars and optionally leave a comment.",
      },
      {
        q: "What are loyalty credits?",
        a: "Every time you complete an order on StudEx, your loyalty count goes up. Every 10 completed orders, you earn ₦200 in credits. Credits are applied automatically at your next checkout.",
      },
      {
        q: "Where do I see my loyalty balance?",
        a: "Go to Account → Loyalty Rewards to see your credit balance, progress to the next reward, and your transaction history.",
      },
    ],
  },
  {
    category: "Safety & Trust",
    icon: Shield,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    questions: [
      {
        q: "Is StudEx safe to use?",
        a: "Yes. All vendors are verified students on your campus. All transactions go through Paystack, a PCI-compliant payment processor used by thousands of Nigerian businesses.",
      },
      {
        q: "What if a vendor doesn't deliver?",
        a: "Contact support via the chat icon on any order page as soon as possible. Our team will investigate and help resolve the dispute.",
      },
      {
        q: "How are vendors verified?",
        a: "Vendors apply through the app and are manually reviewed and approved by the StudEx admin team before they can list services.",
      },
    ],
  },
];

export default function FAQPage() {
  const router = useRouter();
  const [openItem, setOpenItem] = useState<string | null>(null);

  const toggle = (key: string) => setOpenItem(prev => prev === key ? null : key);

  return (
    <div className="min-h-screen bg-[#F5F5F5]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <TopNav showBack />

      <div className="pb-28 p-4 space-y-5 max-w-2xl mx-auto">

        {/* HERO */}
        <div className="rounded-2xl p-6 text-white text-center shadow-md animate-fadeUp" style={{ background: GRAD }}>
          <HelpCircle className="w-12 h-12 mx-auto mb-3 opacity-90" />
          <h2 className="text-xl font-bold mb-1" style={SERIF}>
            How can we help?
          </h2>
          <p className="text-sm opacity-80">Find answers to common questions about StudEx</p>
        </div>

        {/* FAQ SECTIONS */}
        {faqs.map((section, si) => {
          const SectionIcon = section.icon;
          return (
            <div key={section.category}
              className="bg-white rounded-2xl shadow-sm border border-stone-200 overflow-hidden animate-fadeUp">

              {/* Section header */}
              <div className={`flex items-center gap-3 p-4 ${section.bg}`}>
                <SectionIcon className={`w-5 h-5 ${section.color}`} />
                <h3 className={`font-semibold text-sm ${section.color}`}>{section.category}</h3>
              </div>

              {/* Questions */}
              <div className="divide-y divide-stone-100">
                {section.questions.map((item, qi) => {
                  const key = `${si}-${qi}`;
                  const isOpen = openItem === key;
                  return (
                    <div key={key}>
                      <button onClick={() => toggle(key)}
                        className="w-full flex items-center justify-between p-4 text-left gap-3">
                        <span className="font-semibold text-stone-900 text-sm leading-snug">{item.q}</span>
                        {isOpen
                          ? <ChevronUp className="w-4 h-4 text-stone-400 flex-shrink-0" />
                          : <ChevronDown className="w-4 h-4 text-stone-400 flex-shrink-0" />}
                      </button>
                      <AnimatePresence>
                        {isOpen && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden">
                            <p className="px-4 pb-4 text-sm text-stone-500 leading-relaxed">
                              {item.a}
                            </p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* CONTACT SUPPORT */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-stone-200 text-center animate-fadeUp">
          <MessageCircle className="w-8 h-8 text-teal-600 mx-auto mb-2" />
          <p className="font-bold text-stone-900 mb-1" style={SERIF}>
            Still need help?
          </p>
          <p className="text-sm text-stone-500 mb-4">
            Chat with a vendor directly from any order or listing page, or reach us at studex.ng@gmail.com
          </p>
          <a href="mailto:studex.ng@gmail.com"
            className="inline-block px-6 py-3 text-white font-semibold rounded-full text-sm shadow-lg shadow-teal-200/60 transition active:scale-[0.98]"
            style={{ background: GRAD }}>
            Email Support
          </a>
        </div>

      </div>
    </div>
  );
}
