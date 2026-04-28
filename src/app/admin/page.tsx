// src/app/admin/page.tsx
"use client";

import {
  Shield,
  Users,
  Package,
  DollarSign,
  Store,
  FileText,
  LogOut,
  Bell,
  TrendingUp,
  AlertCircle,
  ChevronRight,
  Wallet,
  AlertTriangle,
  CheckCircle,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { adminApi } from "@/lib/adminApi";

export default function AdminDashboard() {
  const router = useRouter();
  const [adminName, setAdminName] = useState("Admin");
  const [stats, setStats] = useState([
    { label: "Total Users", value: "1,284", change: "+12%", icon: Users, color: "from-purple-500 to-purple-600" },
    { label: "Active Sellers", value: "87", change: "+8%", icon: Store, color: "from-teal-500 to-teal-600" },
    { label: "Total Orders", value: "342", change: "+23%", icon: Package, color: "from-amber-500 to-amber-600" },
    { label: "Platform Revenue", value: "₦2.4M", change: "+41%", icon: DollarSign, color: "from-emerald-500 to-emerald-600" },
  ]);

  const [escrowData, setEscrowData] = useState({
    inEscrow: 0,
    pendingDisputes: 0,
    pendingWithdrawals: 0,
    pendingApprovals: 0,
    completedOrders: 0,
    totalRevenue: 0,
  });

  useEffect(() => {
    const isAdmin = localStorage.getItem("isAdmin") === "true";
    const name = localStorage.getItem("adminName") || "Admin";

    if (!isAdmin) {
      router.push("/admin/login");
      return;
    }

    setAdminName(name);

    // Fetch real dashboard data from backend
    const fetchDashboardData = async () => {
      try {
        const data = await adminApi.getDashboardStats();

        // Update stats with real backend data
        setStats([
          {
            label: "Total Users",
            value: data.users.total_users.toString(),
            change: `+${data.users.new_users_30d}`,
            icon: Users,
            color: "from-purple-500 to-purple-600"
          },
          {
            label: "Active Sellers",
            value: data.users.verified_vendors.toString(),
            change: `${data.users.pending_vendors} pending`,
            icon: Store,
            color: "from-teal-500 to-teal-600"
          },
          {
            label: "Total Orders",
            value: data.orders.total_orders.toString(),
            change: `${data.orders.pending_orders} pending`,
            icon: Package,
            color: "from-amber-500 to-amber-600"
          },
          {
            label: "Platform Revenue",
            value: `₦${data.orders.total_revenue.toLocaleString()}`,
            change: `₦${data.orders.revenue_30d.toLocaleString()} (30d)`,
            icon: DollarSign,
            color: "from-emerald-500 to-emerald-600"
          },
        ]);

        // Update escrow data (for now using mock data for escrow, disputes, withdrawals)
        // These would need separate endpoints in the backend
        const inEscrow = parseFloat(localStorage.getItem("walletInEscrow") || "0");
        const disputes = JSON.parse(localStorage.getItem("disputes") || "[]");
        const openDisputes = disputes.filter((d: any) => d.status === "open").length;
        const withdrawals = JSON.parse(localStorage.getItem("withdrawalRequests") || "[]");
        const pendingWithds = withdrawals.filter((w: any) => w.status === "pending").length;
        const apps = JSON.parse(localStorage.getItem("sellerApplication") || "{}");
        const hasPendingApp = apps?.id ? 1 : 0;

        setEscrowData({
          inEscrow,
          pendingDisputes: openDisputes,
          pendingWithdrawals: pendingWithds,
          pendingApprovals: data.users.pending_vendors,
          completedOrders: data.orders.completed_orders,
          totalRevenue: data.orders.total_revenue,
        });
      } catch (error) {
        console.error("Failed to fetch dashboard data:", error);
        // Keep default values if fetch fails
      }
    };

    fetchDashboardData();
  }, [router]);

  const handleLogout = async () => {
    await adminApi.logout();
    router.push("/admin/login");
  };

  const quickActions = [
    { 
      label: "Pending Disputes", 
      href: "/admin/disputes", 
      icon: AlertTriangle, 
      badge: escrowData.pendingDisputes,
      color: "from-red-600 to-orange-600",
      show: escrowData.pendingDisputes > 0
    },
    { 
      label: "Withdrawal Requests", 
      href: "/admin/payouts", 
      icon: DollarSign,
      badge: escrowData.pendingWithdrawals,
      color: "from-emerald-600 to-teal-600",
      show: escrowData.pendingWithdrawals > 0
    },
    { 
      label: "Seller Approvals", 
      href: "/admin/seller-approvals", 
      icon: FileText, 
      badge: escrowData.pendingApprovals,
      color: "from-amber-600 to-orange-600",
      show: escrowData.pendingApprovals > 0
    },
    { label: "All Sellers", href: "/admin/sellers", icon: Store, color: "from-purple-600 to-pink-600" },
    { label: "All Orders", href: "/admin/orders", icon: Package, color: "from-blue-600 to-cyan-600" },
    { label: "Manage Users", href: "/admin/users", icon: Users, color: "from-indigo-600 to-blue-600" },
    { label: "Reports & Analytics", href: "/admin/analytics", icon: TrendingUp, color: "from-cyan-600 to-blue-600" },
  ];

  return (
    <>
      <div className="sticky top-0 z-50 bg-gradient-to-r from-slate-900 via-purple-900 to-slate-900 border-b border-white/10 backdrop-blur-xl animate-fadeUp">
        <div className="flex items-center justify-between p-5">
          <div className="flex items-center gap-4 animate-fadeIn">
            <div className="w-12 h-12 bg-gradient-to-br from-purple-600 to-teal-600 rounded-2xl flex items-center justify-center shadow-2xl">
              <Shield className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white">Admin Panel</h1>
              <p className="text-white/70 text-sm">
                Welcome back, <span className="font-bold text-purple-300">{adminName}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 animate-fadeIn">
            <button className="relative p-3 rounded-xl bg-white/10 hover:bg-white/20 transition">
              <Bell className="w-6 h-6 text-white" />
              {(escrowData.pendingDisputes > 0 || escrowData.pendingWithdrawals > 0) && (
                <span className="absolute top-1 right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse"></span>
              )}
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-3 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-xl transition"
            >
              <LogOut className="w-5 h-5" />
              <span className="font-medium">Logout</span>
            </button>
          </div>
        </div>
      </div>

      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6 pb-32">
        {/* PRIMARY STATS */}
        <div className="grid grid-cols-2 gap-5 mb-8">
          {stats.map((stat, i) => (
            <div
              key={i}
              className="bg-white/5 backdrop-blur-xl rounded-3xl p-6 border border-white/10 hover:border-purple-500/50 hover:scale-105 transition-all animate-fadeUp"
            >
              <div className="flex items-center justify-between mb-4">
                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${stat.color} flex items-center justify-center shadow-lg`}>
                  <stat.icon className="w-8 h-8 text-white" />
                </div>
                <span className="text-emerald-400 text-sm font-bold flex items-center gap-1">
                  <TrendingUp className="w-4 h-4" />
                  {stat.change}
                </span>
              </div>
              <p className="text-3xl font-black text-white">{stat.value}</p>
              <p className="text-white/70 text-sm mt-1">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* ESCROW ALERT & STATS */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-8">
          {/* IN ESCROW */}
          <div className="bg-gradient-to-r from-blue-500/20 to-cyan-500/20 border border-blue-500/50 rounded-3xl p-6 backdrop-blur-xl animate-fadeUp">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-white/80 text-sm font-semibold flex items-center gap-2">
                  <Wallet className="w-5 h-5" /> In Escrow
                </p>
                <p className="text-4xl font-black text-white mt-2">₦{escrowData.inEscrow.toLocaleString()}</p>
                <p className="text-blue-300 text-sm mt-1">Held safely until order completion</p>
              </div>
            </div>
          </div>

          {/* DISPUTES ALERT */}
          {escrowData.pendingDisputes > 0 && (
            <div className="bg-gradient-to-r from-red-500/20 to-orange-500/20 border border-red-500/50 rounded-3xl p-6 backdrop-blur-xl animate-fadeUp">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-white/80 text-sm font-semibold flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-red-400" /> Open Disputes
                  </p>
                  <p className="text-4xl font-black text-white mt-2">{escrowData.pendingDisputes}</p>
                  <p className="text-red-300 text-sm mt-1">Require your resolution</p>
                </div>
                <Link
                  href="/admin/disputes"
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-sm transition"
                >
                  Review
                </Link>
              </div>
            </div>
          )}

          {/* COMPLETED ORDERS */}
          <div className="bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border border-emerald-500/50 rounded-3xl p-6 backdrop-blur-xl animate-fadeUp">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-white/80 text-sm font-semibold flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-emerald-400" /> Completed Orders
                </p>
                <p className="text-4xl font-black text-white mt-2">{escrowData.completedOrders}</p>
                <p className="text-emerald-300 text-sm mt-1">₦{escrowData.totalRevenue.toLocaleString()}</p>
              </div>
            </div>
          </div>
        </div>

        {/* CRITICAL ALERTS */}
        <div className="space-y-4 mb-8">
          {escrowData.pendingWithdrawals > 0 && (
            <div className="bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border border-emerald-500/50 rounded-3xl p-6 flex items-center justify-between backdrop-blur-xl animate-fadeUp">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-emerald-500/30 rounded-2xl flex items-center justify-center">
                  <DollarSign className="w-8 h-8 text-emerald-300" />
                </div>
                <div>
                  <p className="text-xl font-bold text-white">{escrowData.pendingWithdrawals} Payout Request{escrowData.pendingWithdrawals !== 1 ? "s" : ""}</p>
                  <p className="text-white/70 text-sm">Awaiting your approval</p>
                </div>
              </div>
              <Link
                href="/admin/payouts"
                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl transition shadow-lg"
              >
                Process
              </Link>
            </div>
          )}

          {escrowData.pendingApprovals > 0 && (
            <div className="bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/50 rounded-3xl p-6 flex items-center justify-between backdrop-blur-xl animate-fadeUp">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-amber-500/30 rounded-2xl flex items-center justify-center">
                  <AlertCircle className="w-8 h-8 text-amber-300" />
                </div>
                <div>
                  <p className="text-xl font-bold text-white">{escrowData.pendingApprovals} New Seller Request</p>
                  <p className="text-white/70 text-sm">Requires your verification</p>
                </div>
              </div>
              <Link
                href="/admin/seller-approvals"
                className="px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-2xl transition shadow-lg"
              >
                Review Now
              </Link>
            </div>
          )}
        </div>

        {/* QUICK ACTIONS */}
        <div className="animate-fadeIn">
          <h2 className="text-2xl font-black text-white mb-6">Quick Actions</h2>
          <div className="space-y-4">
            {quickActions.map((action, i) => (
              <div
                key={i}
                className="animate-fadeUp hover:translate-x-2 transition-transform"
              >
                <Link
                  href={action.href}
                  className="block bg-white/5 backdrop-blur-xl rounded-3xl p-6 border border-white/10 hover:border-purple-500/50 hover:bg-white/10 transition-all group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-5">
                      <div className={`w-14 h-14 bg-gradient-to-br ${action.color} rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 transition`}>
                        <action.icon className="w-7 h-7 text-white" />
                      </div>
                      <div>
                        <p className="text-xl font-bold text-white">{action.label}</p>
                        <p className="text-white/60 text-sm">Manage and monitor</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {action.badge !== undefined && action.badge > 0 && (
                        <span className="px-3 py-1 bg-red-500 text-white text-sm font-bold rounded-full animate-fadeIn">
                          {action.badge} New
                        </span>
                      )}
                      <ChevronRight className="w-6 h-6 text-white/50 group-hover:text-white group-hover:translate-x-2 transition" />
                    </div>
                  </div>
                </Link>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 text-center">
          <p className="text-white/40 text-xs">
            © 2025 StudEx • Pan-Atlantic University Marketplace • Admin Portal v1.0 • Escrow System Active
          </p>
        </div>
      </div>
    </>
  );
}