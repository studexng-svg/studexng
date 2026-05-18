"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Shield } from "lucide-react";
import { useAdminMode } from "@/hooks/useAdminMode";
import { GRAD } from "@/lib/tokens";

export default function AdminBar() {
  const { isAdmin } = useAdminMode();

  if (!isAdmin) return null;

  return (
    <div className="fixed bottom-24 right-4 z-[60]">
      <Link href="/admin">
        <motion.div
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
          title="Admin Dashboard"
          className="w-12 h-12 rounded-full shadow-lg flex items-center justify-center relative cursor-pointer"
          style={{ background: GRAD }}
        >
          <Shield className="w-5 h-5 text-white" />
          <span className="absolute inset-0 rounded-full animate-ping opacity-30"
            style={{ background: GRAD }} />
        </motion.div>
      </Link>
    </div>
  );
}
