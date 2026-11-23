"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase/client";

/**
 * Berlangganan perubahan tabel lewat Supabase Realtime lalu me-refresh data server.
 * Data tetap diambil di server (RLS berlaku), realtime hanya pemicu.
 * Fallback: polling tiap `fallbackSeconds` bila realtime tidak tersambung.
 */
export function RealtimeRefresh({ tables = ["orders", "order_events", "designs"], fallbackSeconds = 60 }: { tables?: string[]; fallbackSeconds?: number }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const sb = getBrowserClient();
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 400);
    };
    let channel = sb.channel(`board-${Math.random().toString(36).slice(2)}`);
    for (const t of tables) channel = channel.on("postgres_changes", { event: "*", schema: "public", table: t }, refresh);
    channel.subscribe((status: string) => setLive(status === "SUBSCRIBED"));
    const poll = setInterval(() => router.refresh(), fallbackSeconds * 1000);
    return () => {
      clearInterval(poll);
      if (timer.current) clearTimeout(timer.current);
      sb.removeChannel(channel);
    };
  }, [router, tables, fallbackSeconds]);

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-500" aria-live="polite">
      <span className={`size-2 rounded-full ${live ? "bg-emerald-500" : "bg-slate-300"}`} />
      {live ? "Live" : "Auto-refresh"}
    </span>
  );
}
