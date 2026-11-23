import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureOrderFolder } from "@/lib/drive";
import { serverEnv } from "@/lib/env";

/** ID Shared Drive dari Pengaturan (fallback env) */
export async function getDriveId(): Promise<string | null> {
  const { data } = await createAdminClient().from("settings").select("value").eq("key", "drive_id").maybeSingle();
  return (data?.value as string | null) || serverEnv().googleSharedDriveId || null;
}

/**
 * Pastikan folder Drive order ada & tersimpan di orders.drive_folder_id.
 * PANGGIL HANYA setelah order terbukti terlihat oleh user (RLS) — memakai service role.
 */
export async function ensureFolderForOrder(orderId: string) {
  const admin = createAdminClient();
  const { data: o, error } = await admin
    .from("orders")
    .select("id, no, customer_name, product, created_at, drive_folder_id, drive_folder_url")
    .eq("id", orderId)
    .single();
  if (error || !o) throw new Error("Order tidak ditemukan");
  if (o.drive_folder_id) return { id: o.drive_folder_id as string, url: o.drive_folder_url as string, no: o.no as string };
  const driveId = await getDriveId();
  if (!driveId) throw new Error("Shared Drive belum dipilih. Admin: buka Pengaturan → Google Drive.");
  const folder = await ensureOrderFolder({ driveId, no: o.no, customerName: o.customer_name, product: o.product, createdAt: o.created_at });
  await admin.from("orders").update({ drive_folder_id: folder.id, drive_folder_url: folder.webViewLink }).eq("id", o.id);
  return { id: folder.id, url: folder.webViewLink, no: o.no as string };
}
