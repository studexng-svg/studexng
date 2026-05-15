import { useEffect } from "react";
import { useAuth, fetchWithAuth } from "@/lib/authStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
const INTERVAL_MS = 30_000;

export function useHeartbeat() {
  const { isLoggedIn } = useAuth();

  useEffect(() => {
    if (!isLoggedIn) return;

    const ping = () => {
      fetchWithAuth(`${API_URL}/api/auth/heartbeat/`, { method: "POST" }).catch(() => {});
    };

    ping();
    const id = setInterval(ping, INTERVAL_MS);
    return () => clearInterval(id);
  }, [isLoggedIn]);
}
