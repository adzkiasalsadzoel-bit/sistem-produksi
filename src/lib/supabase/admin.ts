import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv, serverEnv } from "@/lib/env";

/**
 * Client service_role — MELEWATI RLS. Pakai hanya di server, hanya setelah
 * otorisasi dicek dengan client user (createClient dari ./server), atau untuk
 * fungsi publik yang sudah di-rate-limit (halaman lacak).
 */
export function createAdminClient() {
  const key = serverEnv().serviceRoleKey;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY belum diisi");
  return createClient(publicEnv.supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
