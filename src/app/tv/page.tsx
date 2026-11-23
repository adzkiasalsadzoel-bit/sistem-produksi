import { requireStaff } from "@/lib/auth";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { STATUS_LABEL, type OrderStatus } from "@/lib/status";
import { deadlineLabel, fmtHours, hoursSince } from "@/lib/dates";
import { Clock } from "./clock";

export const metadata = { title: "TV Produksi" };
export const dynamic = "force-dynamic";

type Row = { id: string; no: string; nama: string; product: string; qty: number; unit: string; status: OrderStatus; deadline: string | null; priority: string; has_issue: boolean; status_changed_at: string };
const COLS: OrderStatus[] = ["antri", "print", "press", "finishing", "qc", "kirim"];

/** Layar penuh read-only untuk monitor area produksi — hanya nama depan customer */
export default async function TvPage() {
  const { supabase } = await requireStaff();
  const { data } = await supabase.rpc("tv_board");
  const rows = (data ?? []) as Row[];
  const max = Math.max(...COLS.map((c) => rows.filter((r) => r.status === c).length));
  return (
    <div className="min-h-dvh bg-slate-950 p-4 text-white">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Papan Produksi</h1>
        <div className="flex items-center gap-4 text-slate-300"><RealtimeRefresh fallbackSeconds={30} /><Clock /></div>
      </header>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {COLS.map((c) => {
          const list = rows.filter((r) => r.status === c);
          const bottleneck = max >= 3 && list.length === max;
          return (
            <section key={c} className={`rounded-xl p-3 ${bottleneck ? "bg-red-950 ring-2 ring-red-500" : "bg-slate-900"}`}>
              <h2 className="mb-2 flex items-center justify-between text-lg font-semibold">
                {STATUS_LABEL[c]} <span className="rounded-full bg-white/10 px-2 text-base tabular-nums">{list.length}</span>
              </h2>
              <ul className="flex flex-col gap-2">
                {list.slice(0, 12).map((r) => {
                  const d = deadlineLabel(r.deadline);
                  return (
                    <li key={r.id} className={`rounded-lg bg-white/5 p-2 ${r.priority === "urgent" ? "border-l-4 border-red-500" : ""}`}>
                      <p className="text-lg font-semibold leading-tight">{r.nama}{r.has_issue && " ⚠️"}</p>
                      <p className="text-sm text-slate-300">{r.product} · {r.qty} {r.unit}</p>
                      <p className="mt-1 flex justify-between text-xs">
                        <span className={d.tone === "red" ? "font-bold text-red-400" : d.tone === "amber" ? "text-amber-300" : "text-slate-400"}>{d.text}</span>
                        <span className="text-slate-500">{fmtHours(hoursSince(r.status_changed_at))}</span>
                      </p>
                    </li>
                  );
                })}
                {list.length > 12 && <li className="text-center text-sm text-slate-400">+{list.length - 12} lainnya</li>}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
