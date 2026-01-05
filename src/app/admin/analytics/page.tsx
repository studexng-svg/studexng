// src/app/admin/analytics/page.tsx
"use client";

import { motion } from "framer-motion";
import {
  ChevronLeft,
  TrendingUp,
  Users,
  Package,
  DollarSign,
  ShoppingCart,
  ArrowUp,
  Calendar,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts";

export const dynamic = 'force-dynamic';
export default function AdminAnalytics() {
  const router = useRouter();
  const [stats, setStats] = useState({
    totalRevenue: 0,
    totalOrders: 0,
    totalUsers: 2847,
    totalProducts: 892,
    avgOrderValue: 0,
  });

  // Real data from localStorage
  useEffect(() => {
    const orders = JSON.parse(localStorage.getItem("adminOrders") || "[]");
    const totalRevenue = orders.reduce((sum: number, o: any) => sum + o.total, 0);
    const avgOrderValue = orders.length > 0 ? Math.round(totalRevenue / orders.length) : 0;

    setStats(prev => ({
      ...prev,
      totalRevenue,
      totalOrders: orders.length,
      avgOrderValue,
    }));
  }, []);

  const monthlyRevenue = [
    { month: "Jan", revenue: 285000 },
    { month: "Feb", revenue: 420000 },
    { month: "Mar", revenue: 680000 },
    { month: "Apr", revenue: 890000 },
    { month: "May", revenue: 1150000 },
    { month: "Jun", revenue: 1480000 },
    { month: "Jul", revenue: 1780000 },
    { month: "Aug", revenue: 2120000 },
    { month: "Sep", revenue: 2580000 },
    { month: "Oct", revenue: 2980000 },
    { month: "Nov", revenue: stats.totalRevenue > 3000000 ? stats.totalRevenue : 3420000 },
  ];

  const orderStatus = [
    { name: "Delivered", value: 68, color: "#10b981" },
    { name: "Shipped", value: 18, color: "#3b82f6" },
    { name: "Pending", value: 9, color: "#f59e0b" },
    { name: "Cancelled", value: 5, color: "#ef4444" },
  ];

  const categorySales = [
    { category: "Electronics", sales: 2850000 },
    { category: "Fashion", sales: 1680000 },
    { category: "Books & Stationery", sales: 980000 },
    { category: "Home & Living", sales: 740000 },
    { category: "Beauty", sales: 620000 },
  ];

  return (
    <>
      {/* TOP BAR */}
      <motion.div
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        className="sticky top-0 z-50 bg-gradient-to-r from-slate-900 via-purple-900 to-slate-900 border-b border-white/10 backdrop-blur-xl"
      >
        <div className="flex items-center justify-between px-5 py-4">
          <button onClick={() => router.back()} className="p-2 hover:bg-white/10 rounded-xl transition">
            <ChevronLeft className="w-6 h-6 text-white" />
          </button>
          <h1 className="text-xl font-black text-white">Analytics</h1>
          <Calendar className="w-6 h-6 text-white/60" />
        </div>
      </motion.div>

      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 px-5 pt-4 pb-32 space-y-6">

        {/* HERO STATS */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Total Revenue", value: `₦${(stats.totalRevenue / 1000000).toFixed(2)}M`, icon: DollarSign, color: "from-emerald-500 to-teal-600", trend: "+64.2%" },
            { label: "Total Orders", value: stats.totalOrders, icon: ShoppingCart, color: "from-blue-500 to-cyan-600", trend: "+38.7%" },
            { label: "Active Users", value: stats.totalUsers.toLocaleString(), icon: Users, color: "from-purple-600 to-pink-600", trend: "+18.7%" },
            { label: "Live Products", value: stats.totalProducts, icon: Package, color: "from-amber-500 to-orange-600", trend: "+9.1%" },
          ].map((stat, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className={`bg-gradient-to-br ${stat.color} rounded-3xl p-6 text-white shadow-2xl relative overflow-hidden`}
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-4xl font-black">{stat.value}</p>
                  <p className="text-white/80 text-sm mt-2">{stat.label}</p>
                </div>
                <div className="text-right">
                  <div className="bg-white/20 px-3 py-1 rounded-full text-sm font-bold flex items-center gap-1">
                    <ArrowUp className="w-4 h-4 text-emerald-300" />
                    {stat.trend}
                  </div>
                  <stat.icon className="w-12 h-12 mt-4 opacity-40" />
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* REVENUE CHART */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/5 backdrop-blur-xl rounded-3xl p-6 border border-white/10"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-2xl font-black text-white flex items-center gap-3">
              <TrendingUp className="w-8 h-8 text-emerald-400" />
              Revenue Over Time
            </h3>
            <span className="text-emerald-400 font-black text-3xl">+64.2% YoY</span>
          </div>
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyRevenue}>
                <CartesianGrid strokeDasharray="4 4" stroke="#ffffff10" />
                <XAxis dataKey="month" stroke="#ffffff60" />
                <YAxis stroke="#ffffff60" tickFormatter={(v) => `₦${(v / 1000000).toFixed(1)}M`} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1e1b4b", border: "1px solid #6366f1", borderRadius: "16px" }}
                  labelStyle={{ color: "#a78bfa" }}
                  formatter={(value: any) => `₦${Number(value).toLocaleString()}`}
                />
                <Line 
                  type="monotone" 
                  dataKey="revenue" 
                  stroke="#10b981" 
                  strokeWidth={5}
                  dot={{ fill: "#10b981", r: 8 }}
                  activeDot={{ r: 12 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* PIE + BAR ROW */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ORDER STATUS PIE */}
          <motion.div className="bg-white/5 backdrop-blur-xl rounded-3xl p-6 border border-white/10">
            <h3 className="text-xl font-black text-white mb-6">Order Status Distribution</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={orderStatus}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={110}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {orderStatus.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: "#1e1b4b", borderRadius: "12px" }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-2 gap-4 mt-6">
              {orderStatus.map((s) => (
                <div key={s.name} className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: s.color }} />
                  <span className="text-white/80">{s.name}</span>
                  <span className="ml-auto font-black text-white">{s.value}%</span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* CATEGORY SALES BAR */}
          <motion.div className="bg-white/5 backdrop-blur-xl rounded-3xl p-6 border border-white/10">
            <h3 className="text-xl font-black text-white mb-6">Top Categories</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={categorySales}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                <XAxis dataKey="category" stroke="#ffffff60" angle={-20} textAnchor="end" height={80} />
                <YAxis stroke="#ffffff60" />
                <Tooltip contentStyle={{ backgroundColor: "#1e1b4b", borderRadius: "12px" }} />
                <Bar dataKey="sales" fill="#a78bfa" radius={[12, 12, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </motion.div>
        </div>

        {/* AOV HERO */}
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 rounded-3xl p-10 text-white shadow-2xl relative overflow-hidden"
        >
          <div className="relative z-10">
            <p className="text-2xl opacity-90">Average Order Value</p>
            <p className="text-7xl font-black mt-4">₦{stats.avgOrderValue.toLocaleString()}</p>
            <p className="text-xl mt-4 opacity-80">Across {stats.totalOrders} completed orders</p>
          </div>
          <div className="absolute -bottom-20 -right-20 opacity-20">
            <DollarSign className="w-80 h-80" />
          </div>
        </motion.div>
      </div>

      {/* BOTTOM NAV */}
      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent backdrop-blur-xl border-t border-white/10 z-40">
        <div className="flex justify-around py-4">
          <button className="text-white/60">Dashboard</button>
          <button className="text-white/60">Users</button>
          <button className="text-white/60">Orders</button>
          <button className="text-white font-black text-lg">Analytics</button>
        </div>
      </div>
    </>
  );
}