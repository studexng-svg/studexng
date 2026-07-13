"use client";

import { useState, useEffect } from "react";
import {
  Calendar, Clock, FileText, Loader, CreditCard,
  CheckCircle, AlertCircle, ChevronLeft, ChevronRight,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/authStore";
import { api } from "@/lib/api";
import { TEAL, PURPLE } from "@/lib/tokens";
import ReferenceImageUpload from "@/components/booking/ReferenceImageUpload";

const TIME_SLOTS = [
  "6:00 AM", "7:00 AM", "8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM",
  "12:00 PM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM", "5:00 PM",
  "6:00 PM", "7:00 PM", "8:00 PM", "9:00 PM", "10:00 PM", "11:00 PM", "12:00 AM",
];

const NOTE_MAX_LENGTH = 250;
const STEPS = ["Date & Time", "Photos", "Notes", "Review", "Payment"] as const;

interface BookingListing {
  id: number;
  title: string;
  price: number;
  deal?: { discounted_price: number } | null;
  sale_price?: number | null;
  vendor: { username: string; business_name?: string };
}

interface BookingWizardProps {
  listing: BookingListing;
  onClose: () => void;
  onSuccess: (orderId: number) => void;
}

declare global {
  interface Window {
    PaystackPop?: any;
  }
}

export default function BookingWizard({ listing, onClose, onSuccess }: BookingWizardProps) {
  const { user } = useAuth();

  const [step, setStep] = useState(0);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [paystackReady, setPaystackReady] = useState(false);

  const today = new Date().toISOString().split("T")[0];
  const vendorName = listing.vendor.business_name || listing.vendor.username;
  // listing.price is already all-inclusive (vendor payout + platform fee baked in
  // at listing-creation time) — no separate fee gets added at checkout.
  const effectivePrice = listing.deal?.discounted_price ?? listing.sale_price ?? listing.price;
  const price = Number(effectivePrice);
  const total = price;

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.PaystackPop) { setPaystackReady(true); return; }
    const existing = document.getElementById("paystack-script");
    if (existing) { existing.addEventListener("load", () => setPaystackReady(true)); return; }
    const script = document.createElement("script");
    script.id = "paystack-script";
    script.src = "https://js.paystack.co/v1/inline.js";
    script.async = true;
    script.onload = () => setPaystackReady(true);
    document.head.appendChild(script);
  }, []);

  const canProceedFromStep = (s: number) => {
    if (s === 0) return !!date && !!time;
    return true;
  };

  const goNext = () => {
    setError("");
    if (!canProceedFromStep(step)) {
      setError(step === 0 ? "Please pick a date and time." : "");
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const goBack = () => { setError(""); setStep((s) => Math.max(s - 1, 0)); };

  const payNow = async () => {
    if (!paystackReady || !window.PaystackPop) {
      setError("Payment system not ready. Please wait a moment and try again.");
      return;
    }
    setSubmitting(true);
    setError("");

    try {
      // 1. Create the booking (pending — no vendor pre-approval under this flow).
      const formData = new FormData();
      formData.append("listing", String(listing.id));
      formData.append("scheduled_date", date);
      formData.append("scheduled_time", time);
      formData.append("note", note);
      images.forEach((file) => formData.append("reference_images", file));

      const bookingRes = await api.orders.createBooking(formData);
      if (!bookingRes.ok) {
        const data = await bookingRes.json().catch(() => ({}));
        throw new Error(data.detail || data.note?.[0] || Object.values(data).flat().join(" ") || "Could not create booking.");
      }

      // 2. Initialize Paystack for this listing (same flow as account/bookings/page.tsx).
      const initRes = await api.payments.initialize({ listing_id: listing.id });
      const initData = await initRes.json();
      if (!initRes.ok) throw new Error(initData.error || "Failed to initialize payment.");

      const { access_code, reference, amount_kobo } = initData;
      if (!access_code) throw new Error("Payment initialization failed. Please try again.");

      const paystackKey = (process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY || "").trim();

      const handler = window.PaystackPop.setup({
        key: paystackKey,
        access_code,
        email: user?.email || "",
        amount: amount_kobo ?? Math.round(total * 100),
        currency: "NGN",
        ref: reference,
        callback: function (response: any) {
          if (response.status !== "success") { setSubmitting(false); return; }
          api.payments.verify({
            reference: response.reference,
            transaction_id: response.reference,
            listing_id: listing.id,
            order_type: "service",
          }).then(async (res) => {
            const data = await res.json();
            if (res.ok && data.order_id) {
              onSuccess(data.order_id);
            } else {
              setSubmitting(false);
              setError(data.error || `Payment received — reference ${response.reference}. Contact support if your order doesn't appear.`);
            }
          }).catch(() => {
            setSubmitting(false);
            setError(`Payment received — reference ${response.reference}. Contact support if your order doesn't appear.`);
          });
        },
        onClose: function () { setSubmitting(false); },
      });
      handler.openIframe();
    } catch (err: unknown) {
      setSubmitting(false);
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: PURPLE }}>
              <Calendar className="w-4 h-4 text-white" />
            </div>
            <DialogTitle>Book {listing.title}</DialogTitle>
          </div>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-1.5">
          {STEPS.map((label, i) => (
            <div key={label} className="flex-1 flex items-center gap-1.5">
              <div
                className={`h-1.5 flex-1 rounded-full transition-colors ${i <= step ? "bg-teal-500" : "bg-stone-200"}`}
              />
            </div>
          ))}
        </div>
        <p className="text-xs text-stone-400 -mt-2">{STEPS[step]} ({step + 1}/{STEPS.length})</p>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        {/* Step 0: date & time */}
        {step === 0 && (
          <div className="space-y-4">
            <div>
              <label className="text-xs text-stone-500 font-bold uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-teal-500" />Pick a Date
              </label>
              <input type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-stone-200 text-sm focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20" />
            </div>
            <div>
              <label className="text-xs text-stone-500 font-bold uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-teal-500" />Time Slot
              </label>
              <div className="grid grid-cols-3 gap-2 max-h-56 overflow-y-auto">
                {TIME_SLOTS.map((slot) => (
                  <button key={slot} type="button" onClick={() => setTime(slot)}
                    className={`py-2 rounded-xl text-xs font-medium border transition ${time === slot ? "text-white border-transparent" : "bg-stone-50 text-stone-600 border-stone-200 hover:border-teal-300"}`}
                    style={time === slot ? { background: TEAL } : {}}>
                    {slot}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 1: reference images */}
        {step === 1 && (
          <div>
            <label className="text-xs text-stone-500 font-bold uppercase tracking-wide mb-2 block">
              Reference Images (optional)
            </label>
            <ReferenceImageUpload files={images} onChange={setImages} />
          </div>
        )}

        {/* Step 2: notes */}
        {step === 2 && (
          <div>
            <label className="text-xs text-stone-500 font-bold uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-teal-500" />Booking Notes (optional)
            </label>
            <Textarea
              value={note}
              maxLength={NOTE_MAX_LENGTH}
              onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX_LENGTH))}
              placeholder="Any special requests…"
              rows={4}
            />
            <p className={`text-xs mt-1 text-right ${note.length >= NOTE_MAX_LENGTH ? "text-red-500" : "text-stone-400"}`}>
              {note.length}/{NOTE_MAX_LENGTH}
            </p>
          </div>
        )}

        {/* Step 3: review */}
        {step === 3 && (
          <div className="bg-stone-50 rounded-2xl p-4 space-y-2 border border-stone-100">
            <div className="flex justify-between text-sm"><span className="text-stone-500">Service</span><span className="font-semibold text-stone-900">{listing.title}</span></div>
            <div className="flex justify-between text-sm"><span className="text-stone-500">Vendor</span><span className="font-semibold text-stone-900">{vendorName}</span></div>
            <div className="flex justify-between text-sm"><span className="text-stone-500">Date</span><span className="font-semibold text-stone-900">{date}</span></div>
            <div className="flex justify-between text-sm"><span className="text-stone-500">Time</span><span className="font-semibold text-stone-900">{time}</span></div>
            {images.length > 0 && (
              <div className="flex justify-between text-sm"><span className="text-stone-500">Reference photos</span><span className="font-semibold text-stone-900">{images.length}</span></div>
            )}
            {note && (
              <div className="text-sm"><span className="text-stone-500">Note: </span><span className="text-stone-700">{note}</span></div>
            )}
            <div className="flex justify-between pt-2 border-t border-stone-200"><span className="font-semibold text-stone-900">Total</span><span className="font-bold text-teal-600 text-lg">₦{total.toLocaleString()}</span></div>
          </div>
        )}

        {/* Step 4: payment */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="bg-teal-50 border border-teal-100 rounded-xl p-3 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-teal-600 flex-shrink-0" />
              <p className="text-xs text-teal-700">Payment is held securely until your order is completed. Chat with the vendor unlocks right after payment.</p>
            </div>
            <div className="flex justify-between items-center bg-stone-50 rounded-xl p-4 border border-stone-100">
              <span className="font-semibold text-stone-900">Total to pay</span>
              <span className="font-bold text-teal-600 text-xl">₦{total.toLocaleString()}</span>
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          {step > 0 && (
            <button onClick={goBack} disabled={submitting}
              className="flex-shrink-0 py-3 px-4 bg-stone-100 rounded-full font-semibold text-stone-600 text-sm flex items-center gap-1">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button onClick={goNext}
              className="flex-1 py-3 text-white rounded-full font-semibold text-sm flex items-center justify-center gap-2 shadow-md"
              style={{ background: TEAL }}>
              Continue <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button onClick={payNow} disabled={submitting}
              className="flex-1 py-3 text-white rounded-full font-semibold text-sm flex items-center justify-center gap-2 shadow-md disabled:opacity-70"
              style={{ background: TEAL }}>
              {submitting ? <><Loader className="w-4 h-4 animate-spin" /> Processing…</> : <><CreditCard className="w-4 h-4" /> Pay ₦{total.toLocaleString()}</>}
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
