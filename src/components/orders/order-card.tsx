import Link from "next/link";
import { ExternalLink, ImageOff, RotateCcw } from "lucide-react";
import { ChannelBadge, DeadlineBadge, PriorityBadge, QualityBadges } from "./badges";
import { StageActions } from "./stage-actions";
import type { Design, FloorOrder } from "@/lib/types";
import type { Role } from "@/lib/status";
import { fmtHours, hoursSince } from "@/lib/dates";

export function OrderCard({ o, designs, previews, role }: { o: FloorOrder; designs: Design[]; previews: Map<string, string>; role: Role }) {
  const first = designs[0];
  const preview = first?.preview_path ? previews.get(first.preview_path) : undefined;
  return (
    <article className={`flex flex-col gap-2 rounded-xl border bg-white p-3 shadow-sm ${o.issue ? "border-amber-400" : "border-slate-200"}`} data-testid="order-card" data-no={o.no}>
      <div className="flex gap-3">
        <Link href={`/order/${o.id}`} className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-slate-100">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt={`Preview ${o.no}`} className="size-full object-cover" loading="lazy" />
          ) : (
            <span className="flex size-full items-center justify-center text-slate-400"><ImageOff className="size-6" /></span>
          )}
          {designs.length > 1 && <span className="absolute right-1 bottom-1 rounded bg-black/70 px-1 text-[10px] text-white">+{designs.length - 1}</span>}
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1">
            <Link href={`/order/${o.id}`} className="font-mono text-xs font-semibold text-brand hover:underline">{o.no}</Link>
            <PriorityBadge priority={o.priority} />
            {o.reorder_of && <span title="Order ulang" className="text-slate-500"><RotateCcw className="size-3" /></span>}
          </div>
          <p className="truncate font-semibold">{o.customer_name}</p>
          <p className="truncate text-sm text-slate-600">{o.product} · <b>{o.qty} {o.unit}</b></p>
          <p className="truncate text-xs text-slate-500">
            {[o.material, o.size, o.print_width_cm ? `lebar ${Number(o.print_width_cm)} cm` : null].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <DeadlineBadge deadline={o.deadline} done={o.status === "selesai"} />
        <ChannelBadge channel={o.channel} />
        {first ? <QualityBadges design={first} product={o.product} /> : <span className="text-xs text-red-600">Belum ada file</span>}
        <span className="ml-auto text-[11px] text-slate-400" title="Lama di tahap ini">{fmtHours(hoursSince(o.status_changed_at))}</span>
      </div>
      {o.note_production && <p className="rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-700">📝 {o.note_production}</p>}
      {o.issue && <p className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-900">⚠️ {o.issue}</p>}
      {o.resi && <p className="text-xs text-slate-600">Resi: <b>{o.resi}</b> {o.courier && `(${o.courier})`}</p>}
      <div className="flex flex-wrap gap-2 text-xs">
        {first?.drive_url && (
          <a href={first.drive_url} target="_blank" rel="noreferrer" className="inline-flex min-h-8 items-center gap-1 text-brand hover:underline">
            <ExternalLink className="size-3" /> File asli
          </a>
        )}
        {o.drive_folder_url && (
          <a href={o.drive_folder_url} target="_blank" rel="noreferrer" className="inline-flex min-h-8 items-center gap-1 text-slate-600 hover:underline">
            <ExternalLink className="size-3" /> Folder Drive
          </a>
        )}
      </div>
      <StageActions orderId={o.id} status={o.status} role={role} channel={o.channel} activeDesigns={designs.length} resi={o.resi} courier={o.courier} issue={o.issue} compact />
    </article>
  );
}
