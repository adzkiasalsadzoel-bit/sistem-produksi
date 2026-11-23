"use client";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { CHANNELS, MARKETPLACES, PRIORITIES, PRODUCTS } from "@/lib/products";
import { searchCustomersAction } from "@/app/(dash)/actions";

type State = { error?: string; fieldErrors?: Record<string, string> } | undefined;
export type OrderFormValues = Partial<Record<string, string | number | null>>;

export function OrderForm({ action, initial = {}, submitLabel }: {
  action: (s: State, f: FormData) => Promise<State>;
  initial?: OrderFormValues;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [product, setProduct] = useState(String(initial.product ?? PRODUCTS[0].name));
  const [channel, setChannel] = useState(String(initial.channel ?? "shopee"));
  const [cust, setCust] = useState({
    id: String(initial.customer_id ?? ""), name: String(initial.customer_name ?? ""), wa: String(initial.customer_wa ?? ""),
    address: String(initial.customer_address ?? ""), email: String(initial.customer_email ?? ""),
  });
  const [matches, setMatches] = useState<Awaited<ReturnType<typeof searchCustomersAction>>>([]);
  const def = useMemo(() => PRODUCTS.find((p) => p.name === product), [product]);
  const widthRef = useRef<HTMLInputElement>(null);
  const unitRef = useRef<HTMLInputElement>(null);
  const fe = state?.fieldErrors ?? {};

  // isi default lebar cetak & satuan saat produk berubah (hanya bila kosong / form baru)
  useEffect(() => {
    if (!def || initial.product) return;
    if (widthRef.current && def.defaultWidthCm) widthRef.current.value = String(def.defaultWidthCm);
    if (unitRef.current) unitRef.current.value = def.unit;
  }, [def, initial.product]);

  // autocomplete customer lama
  useEffect(() => {
    if (cust.id) return;
    const q = cust.wa.replace(/\D/g, "").length >= 4 ? cust.wa : cust.name;
    if (q.trim().length < 3) { setMatches([]); return; }
    const t = setTimeout(() => searchCustomersAction(q).then(setMatches).catch(() => setMatches([])), 350);
    return () => clearTimeout(t);
  }, [cust.name, cust.wa, cust.id]);

  const err = (k: string) => fe[k] && <p className="text-xs text-red-600">{fe[k]}</p>;

  return (
    <form action={formAction} className="grid gap-6 lg:grid-cols-2">
      <input type="hidden" name="customer_id" value={cust.id} />
      <fieldset className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4">
        <legend className="px-1 font-semibold">Customer <span className="text-xs font-normal text-slate-500">(data pribadi — hanya tim order)</span></legend>
        <Field label="Nama customer *" htmlFor="customer_name">
          <Input id="customer_name" name="customer_name" required value={cust.name} autoComplete="off"
            onChange={(e) => setCust({ ...cust, id: "", name: e.target.value })} />
          {err("customer_name")}
        </Field>
        {matches.length > 0 && !cust.id && (
          <div className="rounded-lg border border-brand/30 bg-brand-light/40 p-2">
            <p className="mb-1 text-xs font-medium text-brand-dark">Customer lama ditemukan — pilih untuk repeat order:</p>
            <ul className="flex flex-col gap-1">
              {matches.map((m) => (
                <li key={m.id}>
                  <button type="button" className="min-h-11 w-full rounded-md bg-white px-3 text-left text-sm hover:bg-slate-50"
                    onClick={() => { setCust({ id: m.id, name: m.name, wa: m.wa ?? "", address: m.address ?? "", email: m.email ?? "" }); setMatches([]); }}>
                    <b>{m.name}</b> · {m.wa ?? "tanpa WA"}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {cust.id && <p className="text-xs text-emerald-700">✓ Terhubung ke customer lama (riwayat order tergabung). <button type="button" className="underline" onClick={() => setCust({ ...cust, id: "" })}>Lepas</button></p>}
        <Field label="No WhatsApp" htmlFor="customer_wa" hint="Dipakai untuk lacak pesanan (4 digit terakhir) & broadcast repeat order">
          <Input id="customer_wa" name="customer_wa" inputMode="tel" value={cust.wa} onChange={(e) => setCust({ ...cust, wa: e.target.value })} />
          {err("customer_wa")}
        </Field>
        <Field label="Alamat kirim" htmlFor="customer_address">
          <Textarea id="customer_address" name="customer_address" value={cust.address} onChange={(e) => setCust({ ...cust, address: e.target.value })} />
        </Field>
        <Field label="Email (opsional)" htmlFor="customer_email">
          <Input id="customer_email" name="customer_email" type="email" value={cust.email} onChange={(e) => setCust({ ...cust, email: e.target.value })} />
          {err("customer_email")}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Channel *" htmlFor="channel">
            <Select id="channel" name="channel" value={channel} onChange={(e) => setChannel(e.target.value)}>
              {CHANNELS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </Select>
          </Field>
          <Field label={MARKETPLACES.includes(channel as never) ? "No. pesanan marketplace" : "No. referensi"} htmlFor="marketplace_ref">
            <Input id="marketplace_ref" name="marketplace_ref" defaultValue={String(initial.marketplace_ref ?? "")} />
          </Field>
        </div>
        <Field label="Catatan pembayaran" htmlFor="payment_note">
          <Input id="payment_note" name="payment_note" placeholder="Lunas / DP 50% / COD" defaultValue={String(initial.payment_note ?? "")} />
        </Field>
      </fieldset>

      <fieldset className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4">
        <legend className="px-1 font-semibold">Detail produksi <span className="text-xs font-normal text-slate-500">(terlihat tim produksi)</span></legend>
        <Field label="Produk *" htmlFor="product">
          <Input id="product" name="product" list="product-list" required value={product} onChange={(e) => setProduct(e.target.value)} />
          <datalist id="product-list">{PRODUCTS.map((p) => <option key={p.name} value={p.name} />)}</datalist>
          {def && <p className="text-xs text-slate-500">Minimal {def.minDpi} dpi efektif</p>}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Bahan" htmlFor="material">
            <Input id="material" name="material" list="material-list" defaultValue={String(initial.material ?? "")} />
            <datalist id="material-list">{(def?.materials ?? []).map((m) => <option key={m} value={m} />)}</datalist>
          </Field>
          <Field label="Ukuran" htmlFor="size">
            <Input id="size" name="size" placeholder="115x115 cm / Set L-XL" defaultValue={String(initial.size ?? "")} />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Lebar cetak (cm)" htmlFor="print_width_cm">
            <Input ref={widthRef} id="print_width_cm" name="print_width_cm" inputMode="decimal" defaultValue={String(initial.print_width_cm ?? def?.defaultWidthCm ?? "")} />
            {err("print_width_cm")}
          </Field>
          <Field label="Qty *" htmlFor="qty">
            <Input id="qty" name="qty" inputMode="numeric" required defaultValue={String(initial.qty ?? "")} />
            {err("qty")}
          </Field>
          <Field label="Satuan" htmlFor="unit">
            <Input ref={unitRef} id="unit" name="unit" defaultValue={String(initial.unit ?? def?.unit ?? "pcs")} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Deadline" htmlFor="deadline">
            <Input id="deadline" name="deadline" type="date" defaultValue={String(initial.deadline ?? "")} />
            {err("deadline")}
          </Field>
          <Field label="Prioritas" htmlFor="priority">
            <Select id="priority" name="priority" defaultValue={String(initial.priority ?? "normal")}>
              {PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Catatan produksi" htmlFor="note_production" hint="Jangan tulis no WA/alamat di sini — kolom ini dibaca tim produksi">
          <Textarea id="note_production" name="note_production" defaultValue={String(initial.note_production ?? "")} />
        </Field>
      </fieldset>

      <div className="flex flex-col gap-2 lg:col-span-2">
        {state?.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
        <Button type="submit" size="lg" disabled={pending} className="sm:w-fit">{pending ? "Menyimpan…" : submitLabel}</Button>
      </div>
    </form>
  );
}
