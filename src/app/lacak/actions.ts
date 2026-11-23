"use server";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";
import { trackFormSchema } from "@/lib/validation";
import { isValidOrderNo, isValidTrackCode, normalizeTrackCode } from "@/lib/track";
import type { TrackResult } from "@/lib/types";

export async function lookupAction(_: { error?: string } | undefined, form: FormData) {
  const parsed = trackFormSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Isian belum lengkap" };
  if (!(await rateLimit("lacak"))) {
    return { error: "Terlalu banyak percobaan. Coba lagi dalam 10 menit atau chat admin via WhatsApp." };
  }
  const sb = createAdminClient();
  let result: TrackResult | null = null;
  if (parsed.data.mode === "kode") {
    const code = normalizeTrackCode(parsed.data.code);
    if (isValidTrackCode(code)) result = (await sb.rpc("track_lookup", { p_code: code })).data as TrackResult | null;
  } else {
    const no = parsed.data.no.trim().toUpperCase();
    if (isValidOrderNo(no)) result = (await sb.rpc("track_lookup_by_order", { p_no: no, p_wa_last4: parsed.data.wa4 })).data as TrackResult | null;
  }
  if (!result) return { error: "Pesanan tidak ditemukan. Periksa kembali kode / nomor order dan 4 digit WA." };
  redirect(`/lacak/${result.code}`);
}
