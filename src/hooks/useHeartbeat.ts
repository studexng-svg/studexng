import { useEffect } from "react";
import { useAuth } from "@/lib/authStore";
import { api } from "@/lib/api";

const INTERVAL_MS = 60_000;

export function useHeartbeat() {
  const { isLoggedIn } = useAuth();

  useEffect(() => {
    if (!isLoggedIn) return;

    const ping = () => {
      api.auth.heartbeat().catch(() => {});
    };

    ping();
    const id = setInterval(ping, INTERVAL_MS);
    return () => clearInterval(id);
  }, [isLoggedIn]);
}
