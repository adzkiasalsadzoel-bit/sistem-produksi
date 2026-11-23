import Link from "next/link";
import { Plus } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { boardData } from "@/lib/queries";
import { PageHeader, Stat } from "@/components/common/page-header";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { OrderCard } from "@/components/orders/order-card";
import { buttonVariants } from "@/components/ui/button";
import { STATUSES } from "@/lib/status";
import { daysUntil } from "@/lib/dates";

export const metadata = { title: "Papan Order" };

export default async function OrderBoardPage() {
  const { supabase, profile } = await requireStaff(["admin", "order"]);
  const { orders, designs, previews } = await boardData(supabase, STATUSES.filter((s) => s !== "selesai"));
  const inbox = orders.filter((o) => o.status === "baru");
  const needConfirm = inbox.filter((o) => (designs.get(o.id)?.length ?? 0) === 0 || o.issue || (designs.get(o.id) ?? []).some((d) => d.dpi_status !== "ok"));
  const ready = inbox.filter((o) => !needConfirm.includes(o));
  const problems = orders.filter((o) => o.status !== "baru" && (o.issue || (o.deadline && daysUntil(o.deadline) < 0)));

  return (
    <>
      <PageHeader
        title="Papan Order"
        description="Inbox order masuk, cek file, lalu kirim ke produksi."
        actions={<><RealtimeRefresh /><Link href="/order/baru" className={buttonVariants()}><Plus /> SPK baru</Link></>}
      />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Order masuk" value={inbox.length} />
        <Stat label="Perlu konfirmasi" value={needConfirm.length} tone={needConfirm.length ? "amber" : "default"} hint="Belum ada file / DPI rendah / kendala" />
        <Stat label="Siap ke produksi" value={ready.length} tone="green" />
        <Stat label="Bermasalah di lantai" value={problems.length} tone={problems.length ? "red" : "default"} hint="Telat atau ada kendala" />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        {[
          { title: "Perlu konfirmasi", list: needConfirm, empty: "Semua order masuk sudah lengkap." },
          { title: "Siap kirim ke produksi", list: ready, empty: "Belum ada." },
          { title: "Bermasalah di produksi/finishing", list: problems, empty: "Tidak ada. 👍" },
        ].map((col) => (
          <section key={col.title} className="flex flex-col gap-3 rounded-2xl bg-slate-100 p-3">
            <h2 className="px-1 font-semibold">{col.title} <span className="text-slate-500">({col.list.length})</span></h2>
            {col.list.length === 0 && <p className="px-1 py-6 text-center text-sm text-slate-500">{col.empty}</p>}
            {col.list.map((o) => <OrderCard key={o.id} o={o} designs={designs.get(o.id) ?? []} previews={previews} role={profile.role} />)}
          </section>
        ))}
      </div>
    </>
  );
}
