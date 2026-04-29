"use client";

import { useRouter } from "next/navigation";
import { Shield } from "lucide-react";

interface Props {
  title?: string;
}

export default function AdminTopBar({ title = "Admin Panel" }: Props) {
  const router = useRouter();
  return (
    <div className="sticky top-0 z-50 border-b border-white/10 backdrop-blur-xl"
      style={{ background: "linear-gradient(to right, #0f172a, #1e1b4b, #0f172a)" }}>
      <div className="flex items-center justify-between px-4 py-3 max-w-6xl mx-auto">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-purple-400" />
          <span className="font-bold text-white text-sm">{title}</span>
        </div>
        <button onClick={() => router.push("/admin")}
          className="text-white/50 hover:text-white text-xs transition">
          ← Back to Dashboard
        </button>
      </div>
    </div>
  );
}
