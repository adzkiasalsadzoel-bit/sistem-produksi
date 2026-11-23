"use client";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { lookupAction } from "./actions";

export function LookupForm() {
  const [mode, setMode] = useState<"kode" | "order">("kode");
  const [state, action, pending] = useActionState(lookupAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="mode" value={mode} />
      <div role="tablist" className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
        {(["kode", "order"] as const).map((m) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
            className={`min-h-11 rounded-md text-sm font-medium ${mode === m ? "bg-white shadow-sm" : "text-slate-600"}`}>
            {m === "kode" ? "Kode lacak" : "No. order + WA"}
          </button>
        ))}
      </div>
      {mode === "kode" ? (
        <Field label="Kode lacak (8 karakter)" htmlFor="code" hint="Ada di pesan WhatsApp dari admin">
          <Input id="code" name="code" required autoCapitalize="characters" autoComplete="off" placeholder="contoh: NP59WBXB" className="font-mono text-lg tracking-widest uppercase" maxLength={12} />
        </Field>
      ) : (
        <>
          <Field label="Nomor order" htmlFor="no"><Input id="no" name="no" required placeholder="ORD-261123-001" className="font-mono uppercase" /></Field>
          <Field label="4 digit terakhir no WhatsApp" htmlFor="wa4"><Input id="wa4" name="wa4" required inputMode="numeric" pattern="\d{4}" maxLength={4} placeholder="0001" /></Field>
        </>
      )}
      {state?.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      <Button type="submit" size="lg" disabled={pending}>{pending ? "Mencari…" : "Lacak pesanan"}</Button>
    </form>
  );
}
