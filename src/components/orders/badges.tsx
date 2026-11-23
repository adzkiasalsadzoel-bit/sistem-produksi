import { AlertTriangle, CheckCircle2, HelpCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { STATUS_LABEL, type OrderStatus } from "@/lib/status";
import { deadlineLabel } from "@/lib/dates";
import { channelLabel, minDpiFor } from "@/lib/products";
import type { Design } from "@/lib/types";

const STATUS_TONE: Record<OrderStatus, "gray" | "blue" | "violet" | "amber" | "green" | "brand"> = {
  baru: "gray", antri: "blue", print: "violet", press: "violet", finishing: "amber", qc: "amber", kirim: "brand", selesai: "green",
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>;
}

export function DeadlineBadge({ deadline, done }: { deadline: string | null; done?: boolean }) {
  if (done) return null;
  const d = deadlineLabel(deadline);
  return <Badge tone={d.tone}>{d.text}</Badge>;
}

export function PriorityBadge({ priority }: { priority: string }) {
  if (priority === "urgent") return <Badge tone="red">URGENT</Badge>;
  if (priority === "prioritas") return <Badge tone="amber">Prioritas</Badge>;
  return null;
}

export function ChannelBadge({ channel }: { channel: string }) {
  return <Badge tone="gray">{channelLabel(channel)}</Badge>;
}

/** Badge 4K + DPI efektif (merah bila di bawah batas produk) */
export function QualityBadges({ design, product }: { design: Design; product: string }) {
  if (design.dpi_status === "manual") {
    return (
      <Badge tone="amber" title="Format vektor/layered atau dimensi tidak terbaca — cek manual sebelum cetak">
        <HelpCircle className="size-3" /> Cek manual
      </Badge>
    );
  }
  return (
    <span className="inline-flex flex-wrap gap-1">
      {design.ok_4k != null && (
        <Badge tone={design.ok_4k ? "green" : "red"} title={`${design.width_px}×${design.height_px}px`}>
          {design.ok_4k ? <CheckCircle2 className="size-3" /> : <AlertTriangle className="size-3" />}
          {design.ok_4k ? "4K" : "< 4K"}
        </Badge>
      )}
      {design.dpi != null && (
        <Badge tone={design.dpi_status === "ok" ? "green" : "red"} title={`Minimal ${minDpiFor(product)} dpi untuk ${product}`}>
          {Math.round(Number(design.dpi))} dpi
        </Badge>
      )}
    </span>
  );
}
