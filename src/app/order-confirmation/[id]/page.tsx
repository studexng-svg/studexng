// src/app/order-confirmation/[id]/page.tsx
"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  CheckCircle,
  Package,
  Calendar,
  Clock,
  ArrowRight,
  Home,
  MessageCircle,
  Loader,
} from "lucide-react";

import { auth } from "@/lib/firebase"; // ✅ IMPORTANT (Firebase auth)

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

interface Order {
  id: number;
  reference: string;
  listing: {
    id: number;
    title: string;
    vendor: {
      username: string;
      business_name?: string;
    };
  };
  amount: number;
  status: string;
  created_at: string;
}

export default function OrderConfirmationPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params.id as string;

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchOrder = async () => {
      try {
        setLoading(true);

        /* =====================================
           ✅ GET FIREBASE TOKEN (NOT JWT)
        ===================================== */
        const user = auth.currentUser;

        if (!user) {
          router.push("/login");
          return;
        }

        const token = await user.getIdToken();

        /* =====================================
           FETCH ORDER
        ===================================== */
        const res = await fetch(
          `${API_URL}/api/orders/orders/${orderId}/`,
          {
            headers: {
              Authorization: `Bearer ${token}`, // ✅ Firebase token only
              "Content-Type": "application/json",
            },
          }
        );

        if (!res.ok) {
          const text = await res.text();
          console.error("Backend error:", text);
          throw new Error("Failed to fetch order");
        }

        const data = await res.json();
        setOrder(data);
      } catch (err: any) {
        console.error("Failed to load order:", err);
        setError(err.message || "Could not load order details");
      } finally {
        setLoading(false);
      }
    };

    if (orderId) fetchOrder();
  }, [orderId, router]);

  /* =====================================
     UI (unchanged)
  ===================================== */

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader className="w-12 h-12 animate-spin" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen flex items-center justify-center text-center">
        <div>
          <h2 className="text-xl font-bold mb-4">Order Not Found</h2>
          <p>{error}</p>
          <Link href="/home">Go Home</Link>
        </div>
      </div>
    );
  }

  const vendorName = order.listing.vendor.business_name || order.listing.vendor.username;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-teal-50 flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-2xl"
      >
        {/* Success Animation */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
          className="flex justify-center mb-8"
        >
          <div className="w-32 h-32 bg-gradient-to-br from-green-400 to-teal-500 rounded-full flex items-center justify-center shadow-2xl">
            <CheckCircle className="w-20 h-20 text-white" />
          </div>
        </motion.div>

        {/* Main Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white/90 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border border-white mb-6"
        >
          <h1 className="text-4xl font-black text-center bg-gradient-to-r from-purple-600 to-teal-600 bg-clip-text text-transparent mb-2">
            Order Confirmed!
          </h1>
          <p className="text-center text-gray-600 mb-8">
            Your order has been placed successfully and is now in escrow
          </p>

          {/* Order Details */}
          <div className="space-y-6">
            <div className="flex items-start gap-4 p-4 bg-gradient-to-r from-purple-50 to-teal-50 rounded-2xl">
              <div className="w-12 h-12 bg-purple-200 rounded-full flex items-center justify-center flex-shrink-0">
                <Package className="w-6 h-6 text-purple-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-gray-600">Order Reference</p>
                <p className="text-xl font-black text-gray-900">{order.reference}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-start gap-3">
                <Calendar className="w-5 h-5 text-purple-600 mt-1" />
                <div>
                  <p className="text-sm text-gray-600">Order Date</p>
                  <p className="font-bold text-gray-900">
                    {new Date(order.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Clock className="w-5 h-5 text-purple-600 mt-1" />
                <div>
                  <p className="text-sm text-gray-600">Status</p>
                  <p className="font-bold text-purple-600 capitalize">
                    {order.status.replace('_', ' ')}
                  </p>
                </div>
              </div>
            </div>

            <div className="border-t-2 border-purple-100 pt-6">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <p className="text-sm text-gray-600">Item</p>
                  <p className="font-bold text-gray-900 text-lg">{order.listing.title}</p>
                  <p className="text-sm text-gray-600">from {vendorName}</p>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-black bg-gradient-to-r from-purple-600 to-teal-600 bg-clip-text text-transparent">
                    ₦{order.amount.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>

            {/* Escrow Info */}
            <div className="bg-gradient-to-r from-purple-100 to-teal-100 rounded-2xl p-6 border-2 border-purple-200">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-10 h-10 bg-purple-500 rounded-full flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="font-black text-gray-900 text-lg">Protected by Escrow</p>
                  <p className="text-sm text-gray-700 mt-1">
                    Your payment is safely held by StudEx. Funds will only be released to the seller after you confirm receipt.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm text-purple-700 font-bold">
                <Clock className="w-4 h-4" />
                <span>You have 7 days to confirm or dispute this order</span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Action Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-4"
        >
          <Link href="/home" className="w-full">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="w-full py-4 bg-white text-purple-600 font-bold rounded-2xl shadow-lg flex items-center justify-center gap-2 hover:shadow-xl transition"
            >
              <Home className="w-5 h-5" />
              Back to Home
            </motion.button>
          </Link>

          <Link href={`/orders/${order.id}`} className="w-full">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="w-full py-4 bg-white text-purple-600 font-bold rounded-2xl shadow-lg flex items-center justify-center gap-2 hover:shadow-xl transition"
            >
              <Package className="w-5 h-5" />
              View Order
            </motion.button>
          </Link>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="w-full py-4 bg-gradient-to-r from-purple-600 to-teal-600 text-white font-bold rounded-2xl shadow-xl flex items-center justify-center gap-2"
          >
            <MessageCircle className="w-5 h-5" />
            Contact Seller
          </motion.button>
        </motion.div>

        {/* Next Steps */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-6 text-center text-sm text-gray-600"
        >
          <p>Check your email for order confirmation and tracking updates</p>
        </motion.div>
      </motion.div>
    </div>
  );
}
