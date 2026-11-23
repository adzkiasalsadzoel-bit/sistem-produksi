import { assertStaff, AuthError } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { normalizeWa } from "@/lib/track";
import { firstName } from "@/lib/naming";
import { todayJakarta } from "@/lib/dates";

export const runtime = "nodejs";

type Row = { name: string; wa: string | null; email: string | null; orders: number; units: number; last_order: string; channels: string; products: string };

/**
 * Export repeat customer (≥2 order).
 *  ?format=wa     → daftar broadcast WhatsApp
 *  ?format=meta   → Meta Ads Custom Audience (phone, email, fn, country)
 *  ?format=tiktok → TikTok Ads Customer File (phone, email)
 * Query lewat fungsi INVOKER → RLS customers berlaku (produksi/finishing dapat 0 baris).
 */
export async function GET(req: Request) {
  try {
    const { supabase } = await assertStaff(["admin", "order"]);
    const url = new URL(req.url);
    const format = url.searchParams.get("format") ?? "wa";
    const min = Math.max(2, Number(url.searchParams.get("min") ?? 2));
    const { data, error } = await supabase.rpc("repeat_customers", { p_min: min });
    if (error) return Response.json({ error: error.message }, { status: 400 });
    const rows = (data ?? []) as Row[];
    await supabase.rpc("log_audit", { p_action: `export_repeat_${format}`, p_order: null, p_detail: { rows: rows.length } });

    let csv: string;
    if (format === "meta") {
      csv = toCsv([["phone", "email", "fn", "country"], ...rows.map((r) => [r.wa ? `+${normalizeWa(r.wa)}` : "", r.email ?? "", firstName(r.name).toLowerCase(), "ID"])]);
    } else if (format === "tiktok") {
      csv = toCsv([["phone_number", "email"], ...rows.map((r) => [r.wa ? `+${normalizeWa(r.wa)}` : "", r.email ?? ""])]);
    } else {
      csv = toCsv([
        ["nama", "no_wa", "jumlah_order", "total_unit", "order_terakhir", "channel", "produk"],
        ...rows.map((r) => [r.name, r.wa ? normalizeWa(r.wa) : "", r.orders, r.units, r.last_order, r.channels, r.products]),
      ]);
    }
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="repeat-customer-${format}-${todayJakarta()}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof AuthError) return Response.json({ error: e.message }, { status: e.status });
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
