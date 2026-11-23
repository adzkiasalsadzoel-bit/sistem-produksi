"use client";
import { useEffect, useState } from "react";

export function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);
  if (!now) return null;
  return <span className="text-xl font-semibold tabular-nums">{new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", weekday: "long", hour: "2-digit", minute: "2-digit" }).format(now)} WIB</span>;
}
