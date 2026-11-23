import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Design, FloorOrder } from "@/lib/types";
import type { OrderStatus } from "@/lib/status";

export const FLOOR_COLS =
  "id, no, customer_name, channel, product, material, size, print_width_cm, qty, unit, deadline, priority, note_production, status, issue, resi, courier, reorder_of, created_at, status_changed_at, done_at, drive_folder_url";

/** Order untuk papan kanban — lewat view orders_floor (tanpa data pribadi) */
export async function floorOrders(sb: SupabaseClient, statuses: OrderStatus[], opts: { limit?: number } = {}) {
  const { data, error } = await sb
    .from("orders_floor")
    .select(FLOOR_COLS)
    .in("status", statuses)
    .order("priority", { ascending: false })
    .order("deadline", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(opts.limit ?? 300);
  if (error) throw error;
  return (data ?? []) as FloorOrder[];
}

export async function activeDesigns(sb: SupabaseClient, orderIds: string[]) {
  if (orderIds.length === 0) return new Map<string, Design[]>();
  const { data, error } = await sb
    .from("designs")
    .select("*")
    .in("order_id", orderIds)
    .eq("is_active", true)
    .order("file_no");
  if (error) throw error;
  const map = new Map<string, Design[]>();
  for (const d of (data ?? []) as Design[]) map.set(d.order_id, [...(map.get(d.order_id) ?? []), d]);
  return map;
}

/**
 * Signed URL preview. Dipanggil HANYA dengan desain yang sudah lolos RLS
 * (diambil memakai client user), jadi aman memakai service role di sini.
 */
export async function previewUrls(designs: Design[]): Promise<Map<string, string>> {
  const paths = [...new Set(designs.map((d) => d.preview_path).filter(Boolean) as string[])];
  const out = new Map<string, string>();
  if (paths.length === 0) return out;
  try {
    const { data } = await createAdminClient().storage.from("previews").createSignedUrls(paths, 60 * 60);
    for (const r of data ?? []) if (r.signedUrl && r.path) out.set(r.path, r.signedUrl);
  } catch {
    // storage belum siap → kartu tampil tanpa preview
  }
  return out;
}

export async function boardData(sb: SupabaseClient, statuses: OrderStatus[]) {
  const orders = await floorOrders(sb, statuses);
  const designs = await activeDesigns(sb, orders.map((o) => o.id));
  const previews = await previewUrls([...designs.values()].flat());
  return { orders, designs, previews };
}

export async function getSettings(sb: SupabaseClient) {
  const { data } = await sb.from("settings").select("key, value");
  return Object.fromEntries((data ?? []).map((r) => [r.key, r.value])) as Record<string, unknown>;
}
