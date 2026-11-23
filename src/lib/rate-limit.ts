import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";

/** IP klien di-hash (tidak menyimpan IP mentah) */
export async function clientKey(prefix: string): Promise<string> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim();
  return `${prefix}:${createHash("sha256").update(serverEnv().rateLimitSalt + ip).digest("hex").slice(0, 32)}`;
}

/** true = boleh lanjut. 10 percobaan / 10 menit per IP (default) */
export async function rateLimit(prefix: string, max = 10, windowSeconds = 600): Promise<boolean> {
  try {
    const { data, error } = await createAdminClient().rpc("rate_limit_hit", {
      p_key: await clientKey(prefix), p_max: max, p_window_seconds: windowSeconds,
    });
    if (error) throw error;
    return data === true;
  } catch (e) {
    // Jangan kunci customer / tampilkan error 500 bila DB/konfigurasi bermasalah.
    // Lookup tetap aman: kode lacak acak 32^8 dan fungsi DB hanya bisa dipanggil server.
    console.error("[rate-limit] dilewati:", (e as Error).message);
    return true;
  }
}
