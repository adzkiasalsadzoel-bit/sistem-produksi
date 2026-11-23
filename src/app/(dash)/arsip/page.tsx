import Link from "next/link";
import { Search } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/orders/badges";
import { ReorderButton } from "@/components/orders/reorder-button";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { CHANNELS, channelLabel } from "@/lib/products";
import { STATUSES, STATUS_LABEL } from "@/lib/status";
import { fmtDate } from "@/lib/dates";
import type { Order } from "@/lib/types";

export const metadata = { title: "Arsip & Order Ulang" };
const PAGE = 50;

export default async function ArsipPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { supabase } = await requireStaff(["admin", "order"]);
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.hal ?? 1));
  const q = (sp.q ?? "").trim();

  let query = supabase
    .from("orders")
    .select("id, no, customer_name, channel, product, qty, unit, status, created_at, done_at, reorder_of", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE, page * PAGE - 1);
  if (q) {
    const safe = q.replace(/[%,()*]/g, " ");
    query = query.or(`no.ilike.%${safe}%,customer_name.ilike.%${safe}%,product.ilike.%${safe}%,track_code.eq.${safe.toUpperCase()}`);
  }
  if (sp.status && (STATUSES as readonly string[]).includes(sp.status)) query = query.eq("status", sp.status);
  if (sp.channel) query = query.eq("channel", sp.channel);
  if (sp.bulan && /^\d{4}-\d{2}$/.test(sp.bulan)) {
    const [y, m] = sp.bulan.split("-").map(Number);
    const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
    query = query.gte("created_at", `${sp.bulan}-01T00:00:00+07:00`).lt("created_at", `${next}-01T00:00:00+07:00`);
  }
  const { data, count } = await query;
  const rows = (data ?? []) as Pick<Order, "id" | "no" | "customer_name" | "channel" | "product" | "qty" | "unit" | "status" | "created_at" | "done_at" | "reorder_of">[];
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  const qs = (p: number) => new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => v)), hal: String(p) } as Record<string, string>).toString();

  return (
    <>
      <PageHeader title="Arsip & Order Ulang" description="Cari order lama lalu order ulang satu klik — data & file desain aktif ikut tersalin." />
      <form className="mb-4 grid gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto_auto]">
        <Input name="q" defaultValue={q} placeholder="No. order, nama customer, produk, kode lacak" aria-label="Cari" />
        <Select name="status" defaultValue={sp.status ?? ""} aria-label="Status"><option value="">Semua status</option>{STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</Select>
        <Select name="channel" defaultValue={sp.channel ?? ""} aria-label="Channel"><option value="">Semua channel</option>{CHANNELS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select>
        <Input type="month" name="bulan" defaultValue={sp.bulan ?? ""} aria-label="Bulan" />
        <Button type="submit"><Search /> Cari</Button>
      </form>
      <p className="mb-2 text-sm text-slate-500">{count ?? 0} order</p>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr><th className="p-3">No. order</th><th>Customer</th><th>Produk</th><th>Channel</th><th>Status</th><th>Tanggal</th><th className="p-3 text-right">Aksi</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((o) => (
              <tr key={o.id} className="align-middle">
                <td className="p-3"><Link href={`/order/${o.id}`} className="font-mono text-xs font-semibold text-brand hover:underline">{o.no}</Link>{o.reorder_of && <span className="ml-1 text-xs text-slate-500">(ulang)</span>}</td>
                <td>{o.customer_name}</td>
                <td>{o.product} · {o.qty} {o.unit}</td>
                <td>{channelLabel(o.channel)}</td>
                <td><StatusBadge status={o.status} /></td>
                <td>{fmtDate(o.created_at)}</td>
                <td className="p-2 text-right"><ReorderButton orderId={o.id} compact /></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-slate-500">Tidak ada order yang cocok.</td></tr>}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <nav className="mt-4 flex items-center justify-center gap-2" aria-label="Halaman">
          {page > 1 && <Link className="min-h-11 rounded-lg border px-4 py-3 text-sm" href={`/arsip?${qs(page - 1)}`}>← Sebelumnya</Link>}
          <span className="text-sm text-slate-500">Hal {page} / {pages}</span>
          {page < pages && <Link className="min-h-11 rounded-lg border px-4 py-3 text-sm" href={`/arsip?${qs(page + 1)}`}>Berikutnya →</Link>}
        </nav>
      )}
    </>
  );
}
