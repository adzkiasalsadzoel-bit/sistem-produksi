"use client";
import { useState, useTransition } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { changeStatusAction, setIssueAction, setResiAction } from "@/app/(dash)/actions";
import { canActOn, nextStatus, prevStatus, STATUS_LABEL, validateTransition, type OrderStatus, type Role } from "@/lib/status";
import { COURIERS } from "@/lib/products";

type Props = {
  orderId: string;
  status: OrderStatus;
  role: Role;
  channel: string;
  activeDesigns: number;
  resi: string | null;
  courier: string | null;
  issue: string | null;
  compact?: boolean;
};

export function StageActions(p: Props) {
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<null | "mundur" | "kendala" | "resi">(null);
  const [note, setNote] = useState("");
  const [resi, setResi] = useState(p.resi ?? "");
  const [courier, setCourier] = useState(p.courier ?? "");
  const [error, setError] = useState<string | null>(null);

  const canMove = canActOn(p.role, p.status);
  // tim order boleh mencatat kendala & resi di tahap mana pun (sesuai fungsi DB)
  const canNote = canMove || p.role === "order";
  if (!canNote) return null;
  const next = nextStatus(p.status);
  const prev = prevStatus(p.status);
  const needsResi = next === "selesai" && p.channel !== "offline";
  const showResi = ["qc", "kirim", "selesai"].includes(p.status) && p.role !== "produksi";

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Gagal");
      else {
        setMode(null);
        setNote("");
      }
    });

  const move = (to: OrderStatus, n?: string) => {
    const v = validateTransition({
      role: p.role, from: p.status, to, note: n, resi, existingResi: p.resi, channel: p.channel, activeDesigns: p.activeDesigns,
    });
    if (!v.ok) {
      setError(v.error);
      if (needsResi && to === "selesai") setMode("resi");
      return;
    }
    run(() => changeStatusAction({ orderId: p.orderId, to, note: n, resi: resi || undefined, courier: courier || undefined }));
  };

  return (
    <div className="flex flex-col gap-2">
      {canNote && (
        <div className="flex flex-wrap gap-2">
          {canMove && next && (
            <Button size="sm" variant={next === "selesai" ? "success" : "default"} disabled={pending} onClick={() => move(next)} className="flex-1">
              {STATUS_LABEL[next]} <ArrowRight />
            </Button>
          )}
          {canMove && prev && (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => setMode(mode === "mundur" ? null : "mundur")} aria-label={`Kembalikan ke ${STATUS_LABEL[prev]}`}>
              <ArrowLeft /> {p.compact ? "" : "Mundur"}
            </Button>
          )}
          <Button size="sm" variant={p.issue ? "warning" : "outline"} disabled={pending} onClick={() => setMode(mode === "kendala" ? null : "kendala")} aria-label="Catat kendala">
            <AlertTriangle /> {p.compact ? "" : "Kendala"}
          </Button>
          {showResi && (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => setMode(mode === "resi" ? null : "resi")} aria-label="Input resi">
              <Truck /> {p.compact ? "" : "Resi"}
            </Button>
          )}
        </div>
      )}

      {mode === "mundur" && prev && (
        <div className="flex flex-col gap-2 rounded-lg bg-slate-50 p-2">
          <Textarea autoFocus placeholder={`Alasan kembali ke ${STATUS_LABEL[prev]} (wajib)`} value={note} onChange={(e) => setNote(e.target.value)} />
          <Button size="sm" variant="destructive" disabled={pending || !note.trim()} onClick={() => move(prev, note)}>
            Kembalikan ke {STATUS_LABEL[prev]}
          </Button>
        </div>
      )}

      {mode === "kendala" && (
        <div className="flex flex-col gap-2 rounded-lg bg-amber-50 p-2">
          <Textarea autoFocus placeholder="Contoh: tinta cyan habis, kain belum datang" defaultValue={p.issue ?? ""} onChange={(e) => setNote(e.target.value)} />
          <div className="flex gap-2">
            <Button size="sm" variant="warning" disabled={pending} onClick={() => run(() => setIssueAction(p.orderId, note || p.issue || ""))}>Simpan kendala</Button>
            {p.issue && <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setIssueAction(p.orderId, ""))}>Tandai selesai</Button>}
          </div>
        </div>
      )}

      {mode === "resi" && (
        <div className="flex flex-col gap-2 rounded-lg bg-slate-50 p-2">
          <Input autoFocus placeholder="No. resi" value={resi} onChange={(e) => setResi(e.target.value)} inputMode="text" />
          <Input list="couriers" placeholder="Kurir (J&T, JNE, SPX…)" value={courier} onChange={(e) => setCourier(e.target.value)} />
          <datalist id="couriers">{COURIERS.map((c) => <option key={c} value={c} />)}</datalist>
          <Button size="sm" disabled={pending || !resi.trim()} onClick={() => run(() => setResiAction(p.orderId, resi, courier))}>Simpan resi</Button>
        </div>
      )}

      {error && <p role="alert" className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}
