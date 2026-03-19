// src/app/faq/page.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronDown, ChevronUp, HelpCircle, MessageCircle, Shield, CreditCard, Star, Package, Calendar } from "lucide-react";

const faqs = [
  {
    category: "Payments & Escrow",
    icon: CreditCard,
    color: "text-purple-600",
    bg: "bg-purple-50 dark:bg-purple-900/20",
    questions: [
      {
        q: "How does payment work on StudEx?",
        a: "When you pay for a service, your money is held securely in escrow — it is NOT sent to the vendor immediately. The vendor only receives payment after you confirm that the service was delivered. This protects you as a buyer.",
      },
      {
        q: "When is the vendor paid?",
        a: "The vendor is paid only after you tap 'Confirm Receipt' on your order. If you don't confirm within 7 days of the vendor marking the order complete, payment is automatically released to them.",
      },
      {
        q: "What payment methods are accepted?",
        a: "We accept debit/credit cards, bank transfers, and USSD via Paystack. All payments are processed securely.",
      },
      {
        q: "Can I get a refund?",
        a: "If there is a dispute, contact support before confirming receipt. Once you confirm receipt, payment is released and cannot be reversed. Always confirm only when satisfied.",
      },
    ],
  },
  {
    category: "Bookings",
    icon: Calendar,
    color: "text-teal-600",
    bg: "bg-teal-50 dark:bg-teal-900/20",
    questions: [
      {
        q: "How do I book a service?",
        a: "Open any listing, scroll to 'Book a Date & Time', pick a date and time slot, add an optional note, then tap 'Send Booking Request'. The vendor will accept or decline.",
      },
      {
        q: "Do I pay when I book?",
        a: "No. You only pay AFTER the vendor accepts your booking. You will see a 'Pay Now' button appear in your My Bookings page once the vendor confirms.",
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
    color: "text-indigo-600",
    bg: "bg-indigo-50 dark:bg-indigo-900/20",
    questions: [
      {
        q: "Where can I see my orders?",
        a: "Go to Account → My Orders to see all your paid orders. Go to Account → My Bookings to see your service booking requests.",
      },
      {
        q: "What does 'In Escrow' mean?",
        a: "It means your payment has been received and is being held safely. The vendor has not been paid yet. This status lasts until you confirm receipt.",
      },
      {
        q: "What does 'Seller Completed' mean?",
        a: "The vendor has marked the service as done on their end. You should now confirm receipt if you are satisfied, which releases payment to them.",
      },
    ],
  },
  {
    category: "Reviews & Loyalty",
    icon: Star,
    color: "text-amber-600",
    bg: "bg-amber-50 dark:bg-amber-900/20",
    questions: [
      {
        q: "How do I leave a review?",
        a: "After confirming receipt on a completed order, a review form will appear on the order detail page. Rate the vendor 1–5 stars and optionally leave a comment.",
      },
      {
        q: "What are loyalty credits?",
        a: "Every time you complete an order on StudEx, your loyalty count goes up. Every 5 completed orders, you earn ₦100 in credits. Credits are applied automatically at your next checkout.",
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
    color: "text-green-600",
    bg: "bg-green-50 dark:bg-green-900/20",
    questions: [
      {
        q: "Is StudEx safe to use?",
        a: "Yes. All vendors are verified students on your campus. Payments are protected by escrow so you never lose money for services not delivered. All transactions go through Paystack, a PCI-compliant payment processor.",
      },
      {
        q: "What if a vendor doesn't deliver?",
        a: "Do NOT confirm receipt if the service was not delivered. Contact support via the chat icon on the order page before the 7-day auto-release window expires.",
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
    <>
      {/* HEADER */}
      <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 z-40 flex items-center justify-between p-4">
        <button onClick={() => router.back()} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition">
          <ChevronLeft className="w-5 h-5 text-gray-700 dark:text-gray-300" />
        </button>
        <h1 className="text-xl font-black bg-gradient-to-r from-purple-600 to-teal-500 bg-clip-text text-transparent">
          Help & FAQ
        </h1>
        <div className="w-9" />
      </div>

      <div className="min-h-screen bg-[#FFF8F0] dark:bg-gray-950 pb-28 p-4 space-y-5">

        {/* HERO */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-purple-600 to-teal-500 rounded-3xl p-6 text-white text-center shadow-xl">
          <HelpCircle className="w-12 h-12 mx-auto mb-3 opacity-90" />
          <h2 className="text-2xl font-black mb-1">How can we help?</h2>
          <p className="text-sm opacity-80">Find answers to common questions about StudEx</p>
        </motion.div>

        {/* FAQ SECTIONS */}
        {faqs.map((section, si) => {
          const SectionIcon = section.icon;
          return (
            <motion.div key={section.category}
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: si * 0.05 }}
              className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">

              {/* Section header */}
              <div className={`flex items-center gap-3 p-4 ${section.bg}`}>
                <SectionIcon className={`w-5 h-5 ${section.color}`} />
                <h3 className={`font-black text-sm ${section.color}`}>{section.category}</h3>
              </div>

              {/* Questions */}
              <div className="divide-y divide-gray-50 dark:divide-gray-800">
                {section.questions.map((item, qi) => {
                  const key = `${si}-${qi}`;
                  const isOpen = openItem === key;
                  return (
                    <div key={key}>
                      <button onClick={() => toggle(key)}
                        className="w-full flex items-center justify-between p-4 text-left gap-3">
                        <span className="font-semibold text-gray-800 dark:text-gray-200 text-sm leading-snug">{item.q}</span>
                        {isOpen
                          ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                      </button>
                      <AnimatePresence>
                        {isOpen && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden">
                            <p className="px-4 pb-4 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                              {item.a}
                            </p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          );
        })}

        {/* CONTACT SUPPORT */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
          className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-800 text-center">
          <MessageCircle className="w-8 h-8 text-purple-600 mx-auto mb-2" />
          <p className="font-black text-gray-800 dark:text-white mb-1">Still need help?</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Chat with a vendor directly from any order or listing page, or reach us at support@studex.ng
          </p>
          <a href="mailto:support@studex.ng"
            className="inline-block px-6 py-3 bg-gradient-to-r from-purple-600 to-teal-500 text-white font-bold rounded-xl text-sm shadow-md">
            Email Support
          </a>
        </motion.div>

      </div>
    </>
  );
}
