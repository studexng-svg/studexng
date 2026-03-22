"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  CalendarCheck, Clock, MapPin, ChevronRight, Shield,
  Bell, CheckCircle2, XCircle, Loader, CreditCard,
} from "lucide-react";
import { useAuth, fetchWithAuth } from "@/lib/authStore";
import { useBookingStore } from "@/lib/bookingStore";
import { useRouter } from "next/navigation";
import Image from "next/image";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

interface ApiBooking {
  id: number;
  listing: {
    id: number;
    title: string;
    price: number;
    vendor: { username: string };
    images?: { image: string }[];
  };
  scheduled_date: string;
  scheduled_time: string;
  note: string;
  status: "pending" | "confirmed" | "paid" | "cancelled" | "completed";
  created_at: string;
}

const STATUS_CONFIG = {
  pending: {
    label: "Awaiting Vendor",
    color: "bg-amber-100 text-amber-700 border-amber-200",
    icon: Clock,
    description: "Waiting for vendor to confirm your booking",
  },
  confirmed: {
    label: "Confirmed — Pay Now",
    color: "bg-blue-100 text-blue-700 border-blue-200",
    icon: CheckCircle2,
    description: "Vendor confirmed! Proceed to payment to lock it in.",
  },
  paid: {
    label: "Paid & In Escrow",
    color: "bg-purple-100 text-purple-700 border-purple-200",
    icon: Shield,
    description: "Payment held safely in escrow",
  },
  completed: {
    label: "Completed",
    color: "bg-green-100 text-green-700 border-green-200",
    icon: CheckCircle2,
    description: "Service completed",
  },
  cancelled: {
    label: "Cancelled",
    color: "bg-red-100 text-red-700 border-red-200",
    icon: XCircle,
    description: "This booking was cancelled",
  },
};

export default function MyBookingsPage() {
  const { isLoggedIn } = useAuth();
  const { setBooking } = useBookingStore();
  const router = useRouter();

  const [bookings, setBookings] = useState<ApiBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchBookings = async () => {
    try {
      const res = await fetchWithAuth(`${API_URL}/api/orders/bookings/`);
      if (!res.ok) throw new Error("Failed to load bookings");
      const data = await res.json();
      const list: ApiBooking[] = Array.isArray(data) ? data : (data.results || []);
      // Only show the buyer's own bookings (not ones where they're the vendor)
      setBookings(list.filter((b) => b.listing?.vendor !== undefined));
    } catch (e: any) {
      setError("Could not load bookings. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isLoggedIn) {
      router.push("/auth");
      return;
    }
    fetchBookings();
  }, [isLoggedIn]);

  const handlePayNow = (b: ApiBooking) => {
    // Reconstruct bookingStore item so checkout page works
    setBooking({
      providerId: String(b.listing.id),
      providerName: b.listing.title,
      providerImg: b.listing.images?.[0]?.image || "placeholder.jpg",
      service: b.listing.title,
      date: b.scheduled_date,
      time: b.scheduled_time,
      location: "As arranged with vendor",
      addons: {},
      note: b.note,
      total: b.listing.price,
    });
    router.push("/checkout");
  };

  const handleCancel = async (bookingId: number) => {
    if (!confirm("Are you sure you want to cancel this booking?")) return;
    try {
      const res = await fetchWithAuth(
        `${API_URL}/api/orders/bookings/${bookingId}/cancel/`,
        { method: "POST" }
      );
      if (res.ok) {
        setBookings((prev) =>
          prev.map((b) =>
            b.id === bookingId ? { ...b, status: "cancelled" } : b
          )
        );
      }
    } catch (e) {
      alert("Failed to cancel. Please try again.");
    }
  };

  const upcoming = bookings.filter(
    (b) => !["completed", "cancelled"].includes(b.status)
  );
  const past = bookings.filter((b) =>
    ["completed", "cancelled"].includes(b.status)
  );

  return (
    <>
      {/* HEADER */}
      <div className="sticky top-0 bg-white/95 backdrop-blur-xl z-50 border-b shadow-sm">
        <div className="flex items-center justify-center py-5">
          <h1 className="text-xl font-black text-gray-900">My Bookings</h1>
        </div>
      </div>

      <div className="px-6 py-8 space-y-10 pb-32">

        {/* LOADING */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader className="w-10 h-10 text-purple-500 animate-spin mb-4" />
            <p className="text-gray-500 font-medium">Loading your bookings...</p>
          </div>
        )}

        {/* ERROR */}
        {!loading && error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-center">
            <p className="text-red-700 font-bold">{error}</p>
            <button
              onClick={fetchBookings}
              className="mt-3 text-sm text-red-600 underline font-semibold"
            >
              Try again
            </button>
          </div>
        )}

        {/* UPCOMING */}
        {!loading && !error && (
          <section>
            <h2 className="text-2xl font-black mb-6 flex items-center gap-3">
              <CalendarCheck className="w-8 h-8 text-purple-600" /> Upcoming
            </h2>

            {upcoming.length === 0 ? (
              <div className="bg-gradient-to-br from-purple-50 to-teal-50 rounded-3xl p-8 text-center border border-purple-200">
                <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-r from-purple-200 to-teal-200 flex items-center justify-center">
                  <CalendarCheck className="w-14 h-14 text-purple-600" />
                </div>
                <p className="text-xl font-black text-purple-900 mb-2">
                  No upcoming bookings yet
                </p>
                <p className="text-gray-600 mb-6">Time to book your next session!</p>
                <Link href="/categories">
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.98 }}
                    className="w-full max-w-xs mx-auto py-5 bg-gradient-to-r from-purple-600 to-teal-600 text-white font-black text-xl rounded-3xl shadow-2xl flex items-center justify-center gap-3"
                  >
                    Browse Categories
                    <ChevronRight className="w-6 h-6" />
                  </motion.button>
                </Link>
              </div>
            ) : (
              <div className="space-y-5">
                {upcoming.map((b, i) => {
                  const cfg = STATUS_CONFIG[b.status];
                  const StatusIcon = cfg.icon;
                  return (
                    <motion.div
                      key={b.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.08 }}
                      className="bg-white rounded-3xl p-6 shadow-lg border border-purple-100"
                    >
                      {/* Booking header */}
                      <div className="flex gap-4 mb-4">
                        <div className="w-16 h-16 rounded-2xl overflow-hidden bg-purple-100 flex-shrink-0 flex items-center justify-center">
                          {b.listing.images?.[0]?.image ? (
                            <Image
                              src={b.listing.images[0].image}
                              alt={b.listing.title}
                              width={64}
                              height={64}
                              className="object-cover w-full h-full"
                            />
                          ) : (
                            <CalendarCheck className="w-8 h-8 text-purple-400" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-black text-lg leading-tight truncate">
                            {b.listing.title}
                          </h3>
                          <p className="text-sm text-gray-500 mt-0.5">
                            by {b.listing.vendor.username}
                          </p>
                          <div className="flex flex-wrap gap-3 mt-2 text-sm text-gray-600">
                            <span className="flex items-center gap-1">
                              <CalendarCheck className="w-4 h-4" />
                              {b.scheduled_date}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-4 h-4" />
                              {b.scheduled_time}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Status badge */}
                      <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-bold mb-4 ${cfg.color}`}>
                        <StatusIcon className="w-4 h-4 flex-shrink-0" />
                        <span>{cfg.label}</span>
                      </div>

                      {/* Status description */}
                      <p className="text-xs text-gray-500 mb-4">{cfg.description}</p>

                      {/* Notification hint for pending */}
                      {b.status === "pending" && (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2 mb-4">
                          <Bell className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                          <p className="text-xs text-amber-700 font-medium">
                            You'll get a notification as soon as the vendor confirms your booking.
                          </p>
                        </div>
                      )}

                      {/* Price + actions */}
                      <div className="flex justify-between items-center">
                        <p className="font-black text-2xl text-purple-700">
                          ₦{b.listing.price.toLocaleString()}
                        </p>
                        <div className="flex gap-2">
                          {/* Pay Now — only for confirmed bookings */}
                          {b.status === "confirmed" && (
                            <motion.button
                              whileTap={{ scale: 0.95 }}
                              onClick={() => handlePayNow(b)}
                              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-teal-600 text-white rounded-xl font-black text-sm shadow"
                            >
                              <CreditCard className="w-4 h-4" />
                              Pay Now
                            </motion.button>
                          )}
                          {/* Cancel — only for pending/confirmed */}
                          {["pending", "confirmed"].includes(b.status) && (
                            <motion.button
                              whileTap={{ scale: 0.95 }}
                              onClick={() => handleCancel(b.id)}
                              className="px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-xl font-bold text-sm"
                            >
                              Cancel
                            </motion.button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* PAST */}
        {!loading && !error && past.length > 0 && (
          <section>
            <h2 className="text-2xl font-black mb-6 flex items-center gap-3">
              <Clock className="w-8 h-8 text-gray-500" /> Past Bookings
            </h2>
            <div className="space-y-4">
              {past.map((b, i) => {
                const cfg = STATUS_CONFIG[b.status];
                const StatusIcon = cfg.icon;
                return (
                  <div
                    key={b.id}
                    className="bg-gray-50 rounded-3xl p-5 border border-gray-100"
                  >
                    <div className="flex gap-4">
                      <div className="w-12 h-12 rounded-xl overflow-hidden bg-gray-200 flex-shrink-0 flex items-center justify-center">
                        {b.listing.images?.[0]?.image ? (
                          <Image
                            src={b.listing.images[0].image}
                            alt={b.listing.title}
                            width={48}
                            height={48}
                            className="object-cover w-full h-full"
                          />
                        ) : (
                          <Clock className="w-6 h-6 text-gray-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold truncate">{b.listing.title}</h3>
                        <p className="text-sm text-gray-500">
                          {b.scheduled_date} at {b.scheduled_time}
                        </p>
                        <div className={`inline-flex items-center gap-1 mt-2 px-2 py-1 rounded-lg text-xs font-bold border ${cfg.color}`}>
                          <StatusIcon className="w-3 h-3" />
                          {cfg.label}
                        </div>
                      </div>
                      <p className="font-black text-lg text-gray-700 self-center">
                        ₦{b.listing.price.toLocaleString()}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ESCROW BADGE */}
        <div className="bg-purple-50 rounded-3xl p-6 text-center border-2 border-purple-200">
          <Shield className="w-14 h-14 text-purple-600 mx-auto mb-3" />
          <p className="text-2xl font-black text-purple-900">100% Escrow Protected</p>
          <p className="text-gray-700 mt-2">
            You only release payment when you say "Perfect"
          </p>
        </div>
      </div>
    </>
  );
}