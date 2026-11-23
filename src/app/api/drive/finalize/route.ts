import { randomUUID } from "node:crypto";
import { assertStaff, AuthError } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { downloadFile, downloadRange, downloadThumbnail, getFile } from "@/lib/drive";
import { readImageDimensions } from "@/lib/image-header";
import { makePreview, readDimensions } from "@/lib/preview";
import { assessQuality, isRaster } from "@/lib/quality";
import { serverEnv } from "@/lib/env";
import { friendlyError } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Setelah browser selesai upload ke Drive:
 * 1. pastikan file memang ada di folder order (tidak bisa menempel file sembarang)
 * 2. baca dimensi dari header file (Range 1 MB) → fallback sharp → fallback metadata Drive
 * 3. buat preview JPEG 1000 px ke bucket `previews`
 * 4. simpan ke tabel designs memakai client user (RLS berlaku)
 */
export async function POST(req: Request) {
  try {
    const { supabase, user } = await assertStaff(["admin", "order", "produksi"]);
    const form = await req.formData();
    const orderId = String(form.get("orderId") ?? "");
    const driveFileId = String(form.get("driveFileId") ?? "");
    const fileNo = Number(form.get("fileNo"));
    const version = Number(form.get("version"));
    const originalName = String(form.get("originalName") ?? "");
    const previewBlob = form.get("preview");
    if (!orderId || !driveFileId || !fileNo || !version) return Response.json({ error: "Data tidak lengkap" }, { status: 400 });

    const { data: order } = await supabase.from("orders_floor").select("id, product, print_width_cm").eq("id", orderId).maybeSingle();
    if (!order) return Response.json({ error: "Order tidak ditemukan atau bukan tahap tim Anda" }, { status: 404 });

    const admin = createAdminClient();
    const { data: folderRow } = await admin.from("orders").select("drive_folder_id").eq("id", orderId).single();
    const file = await getFile(driveFileId);
    if (!folderRow?.drive_folder_id || !file.parents?.includes(folderRow.drive_folder_id)) {
      return Response.json({ error: "File tidak berada di folder order ini" }, { status: 400 });
    }

    const size = Number(file.size ?? 0);
    const limit = serverEnv().previewMaxDownloadMb * 1024 * 1024;
    const raster = isRaster(file.name, file.mimeType);
    let full: Buffer | null = null;
    let dims: { width: number; height: number } | null = null;

    if (raster) {
      try {
        dims = readImageDimensions(await downloadRange(driveFileId, 1024 * 1024));
      } catch { /* lanjut fallback */ }
      if (!dims && size <= limit) {
        full = await downloadFile(driveFileId);
        dims = await readDimensions(full);
      }
      if (!dims && file.imageMediaMetadata?.width && file.imageMediaMetadata?.height) {
        dims = { width: file.imageMediaMetadata.width, height: file.imageMediaMetadata.height };
      }
    }

    // Preview: dari browser → dari file utuh (≤ batas) → thumbnail Drive
    let preview: Buffer | null = null;
    try {
      if (previewBlob instanceof Blob && previewBlob.size > 0 && previewBlob.size < 8 * 1024 * 1024) {
        preview = await makePreview(Buffer.from(await previewBlob.arrayBuffer()));
      } else if (raster && size <= limit) {
        full ??= await downloadFile(driveFileId);
        preview = await makePreview(full);
      } else if (file.thumbnailLink) {
        const thumb = await downloadThumbnail(file.thumbnailLink);
        if (thumb) preview = await makePreview(thumb);
      }
    } catch { /* preview opsional */ }

    let previewPath: string | null = null;
    if (preview) {
      previewPath = `${orderId}/${randomUUID()}.jpg`;
      const { error } = await admin.storage.from("previews").upload(previewPath, preview, { contentType: "image/jpeg", upsert: false });
      if (error) previewPath = null;
    }

    const q = raster
      ? assessQuality({ width: dims?.width, height: dims?.height, printWidthCm: order.print_width_cm ? Number(order.print_width_cm) : null, product: order.product })
      : { ok4k: null, dpi: null, status: "manual" as const, minDpi: 0 };

    const { data: design, error } = await supabase
      .from("designs")
      .insert({
        order_id: orderId, file_no: fileNo, version, is_active: true, file_name: file.name, original_name: originalName || file.name,
        mime: file.mimeType, size_bytes: size || null, width_px: dims?.width ?? null, height_px: dims?.height ?? null,
        ok_4k: q.ok4k, dpi: q.dpi, dpi_status: q.status, drive_file_id: file.id, drive_url: file.webViewLink ?? null,
        preview_path: previewPath, uploaded_by: user.id,
      })
      .select("*")
      .single();
    if (error) return Response.json({ error: friendlyError(error) }, { status: 400 });

    const summary =
      q.status === "manual"
        ? "Tersimpan — dimensi perlu dicek manual"
        : `${dims!.width}×${dims!.height}px · ${q.ok4k ? "4K ✓" : "di bawah 4K"} · ${q.dpi ?? "?"} dpi${q.status === "rendah" ? ` (min ${q.minDpi}!)` : ""}`;
    return Response.json({ design, summary });
  } catch (e) {
    if (e instanceof AuthError) return Response.json({ error: e.message }, { status: e.status });
    return Response.json({ error: friendlyError(e) }, { status: 500 });
  }
}
