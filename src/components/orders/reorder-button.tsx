"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { reorderAction } from "@/app/(dash)/actions";

/** Order ulang satu klik: salin data + file desain aktif, opsional ubah qty/deadline */
export function ReorderButton({ orderId, compact = false }: { orderId: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState("");
  const [deadline, setDeadline] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const go = () =>
    start(async () => {
      setError(null);
      const r = await reorderAction(orderId, { qty: qty ? Number(qty) : undefined, deadline: deadline || undefined });
      if (!r.ok) return setError(r.error);
      router.push(`/order/${r.data!.id}${r.data?.driveNote ? `?drive=${encodeURIComponent(r.data.driveNote)}` : ""}`);
    });

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} data-testid="reorder">
        <RotateCcw /> {compact ? "Ulang" : "Order ulang"}
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-2">
      <Field label="Qty baru (kosong = sama)"><Input inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} className="w-32" /></Field>
      <Field label="Deadline (kosong = default)"><Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></Field>
      <Button size="sm" onClick={go} disabled={pending}>{pending ? "Membuat…" : "Buat order ulang"}</Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Batal</Button>
      {error && <p className="w-full text-xs text-red-600">{error}</p>}
    </div>
  );
}
