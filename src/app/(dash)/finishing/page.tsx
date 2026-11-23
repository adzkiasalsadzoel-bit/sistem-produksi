import { requireStaff } from "@/lib/auth";
import { boardData, floorOrders } from "@/lib/queries";
import { PageHeader } from "@/components/common/page-header";
import { Kanban } from "@/components/orders/kanban";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { TEAM_STAGES } from "@/lib/status";
import { fmtDateTime } from "@/lib/dates";
import Link from "next/link";

export const metadata = { title: "Papan Finishing" };

export default async function FinishingPage() {
  const { supabase, profile } = await requireStaff(["admin", "finishing"]);
  const stages = TEAM_STAGES.finishing;
  const { orders, designs, previews } = await boardData(supabase, stages);
  const done = (await floorOrders(supabase, ["selesai"], { limit: 200 }))
    .sort((a, b) => (b.done_at ?? "").localeCompare(a.done_at ?? ""))
    .slice(0, 10);
  return (
    <>
      <PageHeader title="Papan Finishing" description="Jahit & potong → QC & packing → Siap kirim. Input resi sebelum menandai Dikirim." actions={<RealtimeRefresh />} />
      <Kanban stages={stages} orders={orders} designs={designs} previews={previews} role={profile.role} />
      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-2 font-semibold">Baru dikirim</h2>
        <ul className="divide-y divide-slate-100 text-sm">
          {done.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center gap-2 py-2">
              <Link href={`/order/${o.id}`} className="font-mono text-xs text-brand">{o.no}</Link>
              <span>{o.customer_name}</span>
              <span className="text-slate-500">{o.product} · {o.qty} {o.unit}</span>
              <span className="ml-auto text-slate-500">{o.resi ? `${o.resi} (${o.courier ?? "-"})` : "tanpa resi"} · {fmtDateTime(o.done_at)}</span>
            </li>
          ))}
          {done.length === 0 && <li className="py-2 text-slate-500">Belum ada.</li>}
        </ul>
      </section>
    </>
  );
}
