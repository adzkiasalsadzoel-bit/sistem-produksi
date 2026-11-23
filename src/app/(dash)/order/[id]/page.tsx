import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, Pencil } from "lucide-react";
import { canSeeCustomer, requireStaff } from "@/lib/auth";
import { FLOOR_COLS, getSettings, previewUrls } from "@/lib/queries";
import { publicEnv } from "@/lib/env";
import { PageHeader } from "@/components/common/page-header";
import { ChannelBadge, DeadlineBadge, PriorityBadge, QualityBadges, StatusBadge } from "@/components/orders/badges";
import { StageActions } from "@/components/orders/stage-actions";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { CopyButton } from "@/components/copy-button";
import { DesignUploader } from "@/components/orders/design-uploader";
import { ReorderButton } from "@/components/orders/reorder-button";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { STATUS_LABEL, statusIndex } from "@/lib/status";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import { fmtBytes } from "@/lib/utils";
import { buildUpdateMessage, trackPageUrl, waLink } from "@/lib/track";
import { maxPrintWidthCm } from "@/lib/quality";
import { minDpiFor } from "@/lib/products";
import type { Design, FloorOrder, OrderEvent } from "@/lib/types";

export const metadata = { title: "Detail order" };

type PrivateCustomer = { id: string | null; name: string | null; wa: string | null; address: string | null; email: string | null; marketplace_ref: string | null; payment_note: string | null };

export default async function OrderDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ baru?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, profile } = await requireStaff();
  const role = profile.role;

  // Kolom kerja lewat orders_floor (RLS: produksi/finishing hanya order di tahapnya)
  const { data: o } = await supabase.from("orders_floor").select(FLOOR_COLS).eq("id", id).maybeSingle<FloorOrder>();
  if (!o) notFound();

  const [{ data: designsAll }, { data: events }, { data: staff }] = await Promise.all([
    supabase.from("designs").select("*").eq("order_id", id).order("file_no").order("version", { ascending: false }),
    supabase.from("order_events").select("*").eq("order_id", id).order("at", { ascending: false }),
    supabase.from("profiles").select("id, full_name"),
  ]);
  const designs = (designsAll ?? []) as Design[];
  const active = designs.filter((d) => d.is_active);
  const previews = await previewUrls(designs);
  const names = new Map((staff ?? []).map((s) => [s.id, s.full_name]));

  // Data pribadi HANYA diambil di server untuk admin/order (dicatat di audit_log oleh fungsi DB)
  let customer: PrivateCustomer | null = null;
  let trackCode: string | null = null;
  let waText = "";
  if (canSeeCustomer(role)) {
    const { data } = await supabase.rpc("get_order_customer", { p_order: id }).maybeSingle<PrivateCustomer>();
    customer = data ?? null;
    const { data: t } = await supabase.from("orders").select("track_code").eq("id", id).single();
    trackCode = t?.track_code ?? null;
    const settings = await getSettings(supabase);
    waText = buildUpdateMessage({
      customerName: o.customer_name, no: o.no, product: o.product, qty: o.qty, unit: o.unit, status: o.status,
      trackUrl: trackPageUrl(publicEnv.appUrl, trackCode ?? ""), resi: o.resi, courier: o.courier,
      businessName: String(settings.nama_usaha ?? ""),
    });
  }
  const canUpload = role === "admin" || role === "order" || role === "produksi";
  const files = [...new Set(designs.map((d) => d.file_no))];

  return (
    <>
      {sp.baru && <p className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">✓ SPK tersimpan. Langkah berikutnya: upload file desain, lalu tekan <b>Antri produksi</b>.</p>}
      <PageHeader
        title={`${o.no} · ${o.customer_name}`}
        description={`${o.product} — ${o.qty} ${o.unit}`}
        actions={
          <>
            <RealtimeRefresh />
            {canSeeCustomer(role) && (
              <>
                <Link href={`/order/${id}/edit`} className={buttonVariants({ variant: "outline", size: "sm" })}><Pencil /> Edit SPK</Link>
                <ReorderButton orderId={id} />
              </>
            )}
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge status={o.status} />
        <PriorityBadge priority={o.priority} />
        <ChannelBadge channel={o.channel} />
        <DeadlineBadge deadline={o.deadline} done={o.status === "selesai"} />
        {o.reorder_of && <Link href={`/order/${o.reorder_of}`} className="text-xs text-brand underline">Order ulang dari order sebelumnya</Link>}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader><CardTitle>Tahap: {STATUS_LABEL[o.status]}</CardTitle></CardHeader>
            <CardContent>
              {o.issue && <p className="mb-3 rounded-md bg-amber-50 p-2 text-sm text-amber-900">⚠️ Kendala: {o.issue}</p>}
              <StageActions orderId={o.id} status={o.status} role={role} channel={o.channel} activeDesigns={active.length} resi={o.resi} courier={o.courier} issue={o.issue} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Detail produksi</CardTitle></CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
                {[
                  ["Produk", o.product], ["Bahan", o.material], ["Ukuran", o.size],
                  ["Lebar cetak", o.print_width_cm ? `${Number(o.print_width_cm)} cm` : null], ["Jumlah", `${o.qty} ${o.unit}`], ["Deadline", fmtDate(o.deadline)],
                  ["Masuk", fmtDateTime(o.created_at)], ["Resi", o.resi ? `${o.resi} ${o.courier ? `(${o.courier})` : ""}` : null], ["Selesai", o.done_at ? fmtDateTime(o.done_at) : null],
                ].map(([k, v]) => (
                  <div key={k as string}><dt className="text-slate-500">{k}</dt><dd className="font-medium">{v || "—"}</dd></div>
                ))}
              </dl>
              {o.note_production && <p className="mt-4 rounded-md bg-slate-50 p-3 text-sm">📝 {o.note_production}</p>}
              {o.drive_folder_url && <a href={o.drive_folder_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-11 items-center gap-1 text-sm text-brand underline"><ExternalLink className="size-4" /> Buka folder di Google Drive</a>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>File desain ({active.length} aktif)</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-4">
              {active.length === 0 && <p className="text-sm text-red-600">Belum ada file desain. Order tidak bisa masuk antrian produksi sebelum ada minimal 1 file.</p>}
              <ul className="grid gap-4 sm:grid-cols-2">
                {active.map((d) => {
                  const url = d.preview_path ? previews.get(d.preview_path) : undefined;
                  const older = designs.filter((x) => x.file_no === d.file_no && !x.is_active);
                  return (
                    <li key={d.id} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3" data-testid="design">
                      <div className="aspect-square overflow-hidden rounded-md bg-slate-100">
                        {url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={url} alt={d.file_name} className="size-full object-contain" />
                        ) : (
                          <p className="flex size-full items-center justify-center p-4 text-center text-xs text-slate-500">Preview tidak tersedia</p>
                        )}
                      </div>
                      <p className="break-all font-mono text-xs">{d.file_name}</p>
                      <div className="flex flex-wrap gap-1"><QualityBadges design={d} product={o.product} /></div>
                      <p className="text-xs text-slate-500">
                        {d.width_px && d.height_px ? `${d.width_px}×${d.height_px} px · ` : ""}{fmtBytes(d.size_bytes)} · v{d.version}
                        {d.width_px && d.height_px && d.dpi_status === "rendah" && (
                          <span className="block text-red-600">Maks. aman ±{maxPrintWidthCm(d.width_px, d.height_px, minDpiFor(o.product))} cm untuk {minDpiFor(o.product)} dpi</span>
                        )}
                      </p>
                      {d.drive_url && <a href={d.drive_url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 text-sm text-brand underline"><ExternalLink className="size-4" /> File asli di Drive</a>}
                      {older.length > 0 && (
                        <details className="text-xs text-slate-500">
                          <summary className="cursor-pointer">Versi lama ({older.length})</summary>
                          <ul className="mt-1 flex flex-col gap-1">
                            {older.map((x) => (
                              <li key={x.id}>v{x.version} · {fmtDateTime(x.created_at)} {x.drive_url && <a className="text-brand underline" href={x.drive_url} target="_blank" rel="noreferrer">buka</a>}</li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </li>
                  );
                })}
              </ul>
              {canUpload && <DesignUploader orderId={id} existingFiles={files} />}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          {customer && (
            <Card className="border-brand/30">
              <CardHeader>
                <CardTitle>Data customer</CardTitle>
                <p className="text-xs text-slate-500">🔒 Hanya tim order & admin. Akses tercatat di audit log.</p>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                <p><span className="text-slate-500">Nama</span><br /><b>{customer.name}</b></p>
                <p><span className="text-slate-500">WhatsApp</span><br />{customer.wa ? <a className="font-medium text-brand underline" href={waLink(customer.wa, waText)} target="_blank" rel="noreferrer">{customer.wa}</a> : "—"}</p>
                <p><span className="text-slate-500">Alamat</span><br />{customer.address || "—"}</p>
                {customer.email && <p><span className="text-slate-500">Email</span><br />{customer.email}</p>}
                <p><span className="text-slate-500">No. pesanan / ref</span><br />{customer.marketplace_ref || "—"}</p>
                <p><span className="text-slate-500">Pembayaran</span><br />{customer.payment_note || "—"}</p>
                <div className="mt-2 flex flex-col gap-2 rounded-lg bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Kode lacak customer: <b className="font-mono text-slate-900">{trackCode}</b></p>
                  <CopyButton text={waText} label="Salin pesan update" className="w-full" />
                  {customer.wa && <a className={buttonVariants({ variant: "success", className: "w-full" })} href={waLink(customer.wa, waText)} target="_blank" rel="noreferrer">Kirim via WhatsApp</a>}
                  <a href={`/lacak/${trackCode}`} target="_blank" className="text-center text-xs text-brand underline">Lihat halaman lacak</a>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle>Riwayat</CardTitle></CardHeader>
            <CardContent>
              <ol className="relative flex flex-col gap-3 border-l border-slate-200 pl-4">
                {((events ?? []) as OrderEvent[]).map((e) => (
                  <li key={e.id} className="text-sm">
                    <span className={`absolute -left-1.5 mt-1.5 size-3 rounded-full ${e.kind === "status" && e.from_status && e.to_status && statusIndex(e.to_status) < statusIndex(e.from_status) ? "bg-red-500" : e.kind === "issue" ? "bg-amber-500" : "bg-brand"}`} />
                    <p className="font-medium">
                      {e.kind === "create" && "Order dibuat"}
                      {e.kind === "status" && `${STATUS_LABEL[e.from_status!]} → ${STATUS_LABEL[e.to_status!]}`}
                      {e.kind === "issue" && "Kendala"}
                      {e.kind === "resi" && "Resi diperbarui"}
                      {e.kind === "design" && "File desain"}
                      {e.kind === "edit" && "SPK diedit"}
                    </p>
                    {e.note && <p className="text-slate-600">{e.note}</p>}
                    <p className="text-xs text-slate-500">{fmtDateTime(e.at)} · {e.by_user ? names.get(e.by_user) ?? "Staf" : "Sistem"}</p>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
