import { OrderCard } from "./order-card";
import { STATUS_LABEL, type OrderStatus, type Role } from "@/lib/status";
import type { Design, FloorOrder } from "@/lib/types";
import { daysUntil } from "@/lib/dates";

export function Kanban({ stages, orders, designs, previews, role }: {
  stages: OrderStatus[]; orders: FloorOrder[]; designs: Map<string, Design[]>; previews: Map<string, string>; role: Role;
}) {
  const counts = stages.map((s) => orders.filter((o) => o.status === s).length);
  const max = Math.max(...counts);
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {stages.map((s, i) => {
        const list = orders.filter((o) => o.status === s);
        const late = list.filter((o) => o.deadline && daysUntil(o.deadline) < 0).length;
        const bottleneck = max >= 3 && counts[i] === max;
        return (
          <section key={s} aria-label={STATUS_LABEL[s]} className={`flex flex-col gap-3 rounded-2xl p-3 ${bottleneck ? "bg-red-50 ring-1 ring-red-200" : "bg-slate-100"}`}>
            <header className="flex items-center justify-between px-1">
              <h2 className="font-semibold">{STATUS_LABEL[s]} <span className="text-slate-500">({list.length})</span></h2>
              <div className="flex gap-1 text-xs">
                {bottleneck && <span className="rounded-full bg-red-600 px-2 py-0.5 font-medium text-white">Bottleneck</span>}
                {late > 0 && <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-800">{late} telat</span>}
              </div>
            </header>
            {list.length === 0 && <p className="px-1 py-6 text-center text-sm text-slate-500">Kosong</p>}
            {list.map((o) => <OrderCard key={o.id} o={o} designs={designs.get(o.id) ?? []} previews={previews} role={role} />)}
          </section>
        );
      })}
    </div>
  );
}
