import Link from "next/link";
import { AlertTriangle, CheckCircle2, Download, Info } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { PageHeader, Stat } from "@/components/common/page-header";
import { BarList } from "@/components/charts/bar-list";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { findBottleneck, generateInsights, processPromise, type Analytics } from "@/lib/insights";
import { STATUSES, STATUS_LABEL } from "@/lib/status";
import { channelLabel } from "@/lib/products";
import { fmtDate, fmtHours } from "@/lib/dates";
import { fmtNumber } from "@/lib/utils";

export const metadata = { title: "Analisa" };

export default async function AnalisaPage({ searchParams }: { searchParams: Promise<{ hari?: string }> }) {
  const { supabase, profile } = await requireStaff(["admin", "order"]);
  const days = (await searchParams).hari === "90" ? 90 : 30;
  const { data, error } = await supabase.rpc("analytics", { p_days: days });
  if (error || !data) return <p className="text-red-600">Gagal memuat analisa: {error?.message}</p>;
  const a = data as Analytics;
  const isAdmin = profile.role === "admin";
  const insights = generateInsights(a);
  const bottleneck = findBottleneck(a.wip);
  const promise = processPromise(a.stage_hours);

  // throughput per tim per hari → tabel (dua tim = dua kolom, tanpa encoding warna)
  const daysList = [...new Set(a.throughput.map((t) => t.hari))].sort().slice(-14);
  const tp = (hari: string, tim: string) => a.throughput.find((t) => t.hari === hari && t.tim === tim)?.n ?? 0;

  return (
    <>
      <PageHeader
        title="Analisa"
        description="Data produksi untuk keputusan marketing: kapasitas, channel, produk, dan repeat customer."
        actions={
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1" role="tablist" aria-label="Rentang waktu">
            {[30, 90].map((d) => (
              <Link key={d} href={`/analisa?hari=${d}`} aria-selected={d === days} role="tab"
                className={`flex min-h-11 items-center rounded-md px-4 text-sm font-medium ${d === days ? "bg-white shadow-sm" : "text-slate-600"}`}>{d} hari</Link>
            ))}
          </div>
        }
      />

      <Card className="mb-6 border-brand/30">
        <CardHeader><CardTitle>Analisa & tindakan</CardTitle><CardDescription>Dibuat otomatis dari data {days} hari terakhir</CardDescription></CardHeader>
        <CardContent>
          {insights.length === 0 ? <p className="text-sm text-slate-500">Data belum cukup untuk rekomendasi.</p> : (
            <ul className="flex flex-col gap-3" data-testid="insights">
              {insights.map((i) => {
                const Icon = i.tone === "warning" ? AlertTriangle : i.tone === "success" ? CheckCircle2 : Info;
                const color = i.tone === "warning" ? "text-amber-600" : i.tone === "success" ? "text-emerald-600" : "text-blue-600";
                return (
                  <li key={i.title} className="flex gap-3 rounded-lg bg-slate-50 p-3">
                    <Icon className={`mt-0.5 size-5 shrink-0 ${color}`} aria-label={i.tone === "warning" ? "Perlu tindakan" : i.tone === "success" ? "Peluang" : "Info"} />
                    <div><p className="font-semibold">{i.title}</p><p className="text-sm text-slate-700">→ {i.action}</p></div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label={`Order ${days} hari`} value={fmtNumber(a.totals.orders)} />
        <Stat label="Unit" value={fmtNumber(a.totals.units)} />
        <Stat label="Order telat" value={a.totals.late_pct != null ? `${a.totals.late_pct}%` : "-"} tone={(a.totals.late_pct ?? 0) > 10 ? "red" : "default"} />
        <Stat label="Order ulang" value={fmtNumber(a.totals.reorders)} tone="green" />
        <Stat label="Janji waktu proses" value={promise ? `${Math.max(1, Math.ceil(promise.p80Hours / 24))} hari` : "-"} hint="80% order selesai dalam waktu ini" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {isAdmin && (
          <Card>
            <CardHeader><CardTitle>Order per tahap (WIP)</CardTitle><CardDescription>{bottleneck ? `Bottleneck: ${STATUS_LABEL[bottleneck.status]} (${bottleneck.n})` : "Tidak ada antrian"}</CardDescription></CardHeader>
            <CardContent>
              <BarList unit=" order" rows={STATUSES.filter((s) => s !== "selesai").map((s) => ({ label: STATUS_LABEL[s], value: a.wip[s] ?? 0, highlight: bottleneck?.status === s && (a.wip[s] ?? 0) >= 3 }))} />
            </CardContent>
          </Card>
        )}
        {isAdmin && (
          <Card>
            <CardHeader><CardTitle>Rata-rata lama per tahap</CardTitle><CardDescription>Dari riwayat perpindahan (order_events) — dasar janji waktu di listing & iklan</CardDescription></CardHeader>
            <CardContent>
              <BarList rows={STATUSES.filter((s) => s !== "selesai").map((s) => {
                const r = a.stage_hours.find((x) => x.status === s);
                return { label: STATUS_LABEL[s], value: Number(r?.jam ?? 0), display: fmtHours(r?.jam ?? null), hint: r ? `${STATUS_LABEL[s]}: rata-rata ${fmtHours(r.jam)}, 80% ≤ ${fmtHours(r.p80)} (${r.n} order)` : "Belum ada data" };
              })} />
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader><CardTitle>Unit per channel ({days} hari)</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-4">
            <BarList unit=" unit" rows={a.channels.map((c) => ({ label: channelLabel(c.channel), value: Number(c.units) }))} />
            <table className="w-full text-sm">
              <caption className="sr-only">Detail per channel</caption>
              <thead className="text-left text-slate-500"><tr><th className="py-1">Channel</th><th className="text-right">Order</th><th className="text-right">Unit</th><th className="text-right">% telat</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {a.channels.map((c) => (
                  <tr key={c.channel}>
                    <td className="py-1.5">{channelLabel(c.channel)}</td>
                    <td className="text-right tabular-nums">{c.orders}</td>
                    <td className="text-right tabular-nums">{fmtNumber(Number(c.units))}</td>
                    <td className={`text-right tabular-nums ${(c.late_pct ?? 0) >= 20 ? "font-semibold text-red-600" : ""}`}>{c.late_pct != null ? `${c.late_pct}%` : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Unit per produk ({days} hari)</CardTitle></CardHeader>
          <CardContent><BarList unit=" unit" rows={a.products.map((p) => ({ label: p.product, value: Number(p.units), hint: `${p.product}: ${p.units} unit dari ${p.orders} order` }))} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Tren order mingguan</CardTitle><CardDescription>12 minggu terakhir (minggu berjalan belum penuh)</CardDescription></CardHeader>
          <CardContent><BarList unit=" order" rows={a.weekly.map((w) => ({ label: `Mg ${fmtDate(w.minggu)}`, value: w.orders, hint: `${w.orders} order, ${w.units} unit` }))} /></CardContent>
        </Card>
        {isAdmin && (
          <Card>
            <CardHeader><CardTitle>Throughput per tim per hari</CardTitle><CardDescription>Jumlah pemindahan tahap maju (produksi: 3 langkah/order, finishing: 3 langkah/order)</CardDescription></CardHeader>
            <CardContent className="overflow-x-auto">
              {daysList.length === 0 ? <p className="text-sm text-slate-500">Belum ada data.</p> : (
                <table className="w-full text-sm">
                  <thead className="text-left text-slate-500"><tr><th className="py-1">Hari</th><th className="text-right">Order</th><th className="text-right">Produksi</th><th className="text-right">Finishing</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {daysList.map((h) => (
                      <tr key={h}><td className="py-1.5">{fmtDate(h)}</td><td className="text-right tabular-nums">{tp(h, "order")}</td><td className="text-right tabular-nums">{tp(h, "produksi")}</td><td className="text-right tabular-nums">{tp(h, "finishing")}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        )}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Repeat customer</CardTitle>
            <CardDescription>
              {a.repeat.customers} dari {a.repeat.all_customers} customer order ≥ 2 kali · {a.repeat.orders_from_repeat_pct ?? 0}% order berasal dari pelanggan lama
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              <a href="/api/export/repeat-customers?format=wa" className={buttonVariants({ variant: "outline" })}><Download /> CSV broadcast WA</a>
              <a href="/api/export/repeat-customers?format=meta" className={buttonVariants({ variant: "outline" })}><Download /> CSV Meta Custom Audience</a>
              <a href="/api/export/repeat-customers?format=tiktok" className={buttonVariants({ variant: "outline" })}><Download /> CSV TikTok Ads Audience</a>
            </div>
            <table className="w-full text-sm">
              <thead className="text-left text-slate-500"><tr><th className="py-1">Customer</th><th className="text-right">Jumlah order</th><th className="text-right">Order terakhir</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {a.top_repeat.map((r) => (
                  <tr key={r.name + r.last}><td className="py-1.5">{r.name}</td><td className="text-right tabular-nums">{r.orders}</td><td className="text-right">{fmtDate(r.last)}</td></tr>
                ))}
                {a.top_repeat.length === 0 && <tr><td colSpan={3} className="py-2 text-slate-500">Belum ada repeat customer.</td></tr>}
              </tbody>
            </table>
            <p className="text-xs text-slate-500">Export berisi nomor WA — hanya untuk admin/tim order, tercatat di audit log. Pastikan customer setuju menerima promosi.</p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
