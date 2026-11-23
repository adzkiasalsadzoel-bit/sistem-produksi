import { z } from "zod";
import { assertStaff, AuthError } from "@/lib/auth";
import { createResumableSession, driveConfigured, DriveError } from "@/lib/drive";
import { ensureFolderForOrder } from "@/lib/drive-order";
import { designFileName } from "@/lib/naming";
import { publicEnv } from "@/lib/env";

export const runtime = "nodejs";

const body = z.object({
  orderId: z.string().uuid(),
  fileName: z.string().min(1).max(250),
  mime: z.string().max(120).default("application/octet-stream"),
  size: z.number().int().positive().max(5 * 1024 ** 3),
  fileNo: z.number().int().min(1).max(99).nullable().optional(),
});

/** Membuat sesi resumable upload Google Drive untuk satu file desain */
export async function POST(req: Request) {
  try {
    const { supabase } = await assertStaff(["admin", "order", "produksi"]);
    const v = body.parse(await req.json());
    if (!driveConfigured()) return Response.json({ error: "Google Drive belum dikonfigurasi (service account). Hubungi admin." }, { status: 503 });

    // Otorisasi: order harus terlihat oleh user ini (RLS)
    const { data: visible } = await supabase.from("orders_floor").select("id").eq("id", v.orderId).maybeSingle();
    if (!visible) return Response.json({ error: "Order tidak ditemukan atau bukan tahap tim Anda" }, { status: 404 });

    const { data: slot, error: slotErr } = await supabase
      .rpc("next_design_slot", { p_order: v.orderId, p_file_no: v.fileNo ?? null })
      .single<{ file_no: number; version: number }>();
    if (slotErr || !slot) throw slotErr ?? new Error("Gagal menentukan nomor file");

    const folder = await ensureFolderForOrder(v.orderId);
    const name = designFileName(folder.no, slot.file_no, v.fileName, slot.version);
    const origin = req.headers.get("origin") ?? publicEnv.appUrl;
    const uploadUrl = await createResumableSession({ name, mime: v.mime, size: v.size, parentId: folder.id, origin });
    return Response.json({ uploadUrl, fileNo: slot.file_no, version: slot.version, driveName: name });
  } catch (e) {
    if (e instanceof AuthError) return Response.json({ error: e.message }, { status: e.status });
    if (e instanceof z.ZodError) return Response.json({ error: "Data file tidak valid (maks 5 GB)" }, { status: 400 });
    const status = e instanceof DriveError ? e.status : 500;
    return Response.json({ error: (e as Error).message }, { status: status >= 400 ? status : 500 });
  }
}
