import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { PageHeader, Stat } from "@/components/common/page-header";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { StatusBadge, DeadlineBadge } from "@/components/orders/badges";
import { floorOrders } from "@/lib/queries";
import { STATUSES, STATUS_LABEL, visibleStages, type OrderStatus } from "@/lib/status";
import { daysUntil, fmtHours } from "@/lib/dates";

export const metadata = { title: "Ringkasan" };

type Summary = {
  aktif: number; telat: number; deadline_hari_ini: number; kendala: number; selesai_7_hari: number;
  lead_time_jam: number | null; per_tahap: Partial<Record<OrderStatus, number>>;
};

export default async function RingkasanPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { supabase, profile } = await requireStaff();
  const sp = await searchParams;
  const { data } = await supabase.rpc("dashboard_summary");
  const s = (data ?? {}) as Summary;
  const active = STATUSES.filter((x) => x !== "selesai");
  const max = Math.max(1, ...active.map((x) => s.per_tahap?.[x] ?? 0));

  const mine = await floorOrders(supabase, visibleStages(profile.role).filter((x) => x !== "selesai"));
  const attention = mine
    .filter((o) => o.issue || (o.deadline && daysUntil(o.deadline) <= 0))
    .slice(0, 12);

  const board = { admin: "/order", order: "/order", produksi: "/produksi", finishing: "/finishing" }[profile.role];

  return (
    <>
      <PageHeader title={`Halo, ${profile.full_name.split(/[\s—-]/)[0]} 👋`} description="Kondisi produksi saat ini" actions={<><RealtimeRefresh /><Link href={board} className="text-sm font-medium text-brand underline">Buka papan saya →</Link></>} />
      {sp.error === "akses" && <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Halaman itu bukan untuk peran Anda.</p>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Order aktif" value={s.aktif ?? 0} />
        <Stat label="Telat" value={s.telat ?? 0} tone={s.telat ? "red" : "default"} />
        <Stat label="Deadline hari ini" value={s.deadline_hari_ini ?? 0} tone={s.deadline_hari_ini ? "amber" : "default"} />
        <Stat label="Selesai 7 hari" value={s.selesai_7_hari ?? 0} tone="green" />
        <Stat label="Lead time rata-rata" value={fmtHours(s.lead_time_jam)} hint="Order masuk → dikirim (30 hari)" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-semibold">Order per tahap (WIP)</h2>
          <ul className="flex flex-col gap-2">
            {active.map((st) => {
              const n = s.per_tahap?.[st] ?? 0;
              const isMax = n === max && n >= 3;
              return (
                <li key={st} className="grid grid-cols-[8.5rem_1fr_2.5rem] items-center gap-2 text-sm">
                  <span className="truncate">{STATUS_LABEL[st]}</span>
                  <span className="h-3 overflow-hidden rounded-full bg-slate-100">
                    <span className={`block h-full rounded-full ${isMax ? "bg-red-500" : "bg-brand"}`} style={{ width: `${(n / max) * 100}%` }} />
                  </span>
                  <span className="text-right font-semibold tabular-nums">{n}</span>
                </li>
              );
            })}
          </ul>
          {s.kendala > 0 && <p className="mt-3 text-sm text-amber-700">⚠️ {s.kendala} order sedang ada kendala</p>}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-semibold">Perlu perhatian (tahap tim Anda)</h2>
          {attention.length === 0 ? (
            <p className="text-sm text-slate-500">Tidak ada order telat atau bermasalah. 👍</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {attention.map((o) => (
                <li key={o.id}>
                  <Link href={`/order/${o.id}`} className="flex min-h-11 flex-wrap items-center gap-2 py-2 text-sm hover:bg-slate-50">
                    <span className="font-mono text-xs text-brand">{o.no}</span>
                    <span className="font-medium">{o.customer_name}</span>
                    <StatusBadge status={o.status} />
                    <DeadlineBadge deadline={o.deadline} />
                    {o.issue && <span className="text-xs text-amber-700">⚠️ {o.issue}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
