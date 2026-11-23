"use client";
import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { ROLES, ROLE_LABEL, type Role } from "@/lib/status";
import { fmtBytes, fmtNumber } from "@/lib/utils";
import { chooseDriveAction, createStaffAction, driveStatsAction, saveSettingsAction, testDriveAction, updateStaffAction } from "./actions";

const Msg = ({ s }: { s?: { error?: string; message?: string } }) =>
  s?.error ? <p role="alert" className="text-sm text-red-600">{s.error}</p> : s?.message ? <p className="text-sm text-emerald-700">{s.message}</p> : null;

export function SettingsForm({ v }: { v: { nama_usaha: string; wa_bisnis: string; lead: number; banner: { aktif?: boolean; judul?: string; teks?: string; tombol?: string } } }) {
  const [state, action, pending] = useActionState(saveSettingsAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Nama usaha (tampil di halaman lacak & pesan WA)"><Input name="nama_usaha" defaultValue={v.nama_usaha} required /></Field>
        <Field label="No WA bisnis" hint="Format 62812…"><Input name="wa_bisnis" defaultValue={v.wa_bisnis} required inputMode="tel" /></Field>
        <Field label="Default lead time (hari)" hint="Deadline otomatis SPK & order ulang"><Input name="lead_time_default_hari" type="number" min={1} max={60} defaultValue={v.lead} /></Field>
      </div>
      <fieldset className="flex flex-col gap-3 rounded-lg bg-slate-50 p-3">
        <legend className="font-medium">Banner promo di halaman lacak (peluang upsell)</legend>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="banner_aktif" defaultChecked={v.banner.aktif} className="size-5" /> Tampilkan banner</label>
        <Field label="Judul"><Input name="banner_judul" defaultValue={v.banner.judul} /></Field>
        <Field label="Teks"><Textarea name="banner_teks" defaultValue={v.banner.teks} /></Field>
        <Field label="Label tombol"><Input name="banner_tombol" defaultValue={v.banner.tombol} /></Field>
      </fieldset>
      <Msg s={state} />
      <Button type="submit" disabled={pending} className="sm:w-fit">Simpan pengaturan</Button>
    </form>
  );
}

export function DrivePanel({ current, configured, email }: { current: string | null; configured: boolean; email: string | null }) {
  const [pending, start] = useTransition();
  const [drives, setDrives] = useState<{ id: string; name: string }[] | null>(null);
  const [stats, setStats] = useState<{ name: string; files: number; bytes: number; truncated: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState(current ?? "");

  return (
    <div className="flex flex-col gap-3 text-sm">
      <p>Service account: {configured ? <b className="break-all">{email}</b> : <span className="text-red-600">belum dikonfigurasi di env server</span>}</p>
      <p className="text-slate-500">Tambahkan email di atas sebagai <b>Content manager</b> di Shared Drive &quot;SISTEM PRODUKSI CETAK&quot;.</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={pending || !configured} onClick={() => start(async () => {
          setError(null);
          const r = await testDriveAction();
          if (!r.ok) return setError(r.error);
          setDrives(r.data!.drives);
          if (r.data!.drives.length === 0) setError("Koneksi OK, tapi service account belum ditambahkan ke Shared Drive mana pun.");
        })}>Tes koneksi Drive</Button>
        {current && <Button variant="outline" disabled={pending} onClick={() => start(async () => {
          setError(null);
          const r = await driveStatsAction(current);
          if (!r.ok) return setError(r.error);
          setStats(r.data!);
        })}>Lihat jumlah file & ukuran</Button>}
      </div>
      {drives && drives.length > 0 && (
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Pilih Shared Drive"><Select value={selected} onChange={(e) => setSelected(e.target.value)} className="w-72">
            <option value="">— pilih —</option>{drives.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select></Field>
          <Button disabled={!selected || pending} onClick={() => start(async () => {
            const r = await chooseDriveAction(selected);
            if (!r.ok) setError(r.error);
          })}>Simpan</Button>
        </div>
      )}
      {current && <p>Shared Drive aktif: <code className="rounded bg-slate-100 px-1">{current}</code></p>}
      {stats && <p className="rounded-lg bg-slate-50 p-3">📁 <b>{stats.name}</b>: {fmtNumber(stats.files)} file{stats.truncated ? "+" : ""} · total {fmtBytes(stats.bytes)}. Kuota Shared Drive mengikuti kuota penyimpanan Google Workspace organisasi.</p>}
      {error && <p role="alert" className="text-red-600">{error}</p>}
    </div>
  );
}

export function CreateStaffForm() {
  const [state, action, pending] = useActionState(createStaffAction, undefined);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
      <Field label="Nama"><Input name="full_name" required /></Field>
      <Field label="Email"><Input name="email" type="email" required /></Field>
      <Field label="Peran"><Select name="role" defaultValue="produksi">{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</Select></Field>
      <Field label="Password awal"><Input name="password" type="text" minLength={8} required /></Field>
      <Button type="submit" disabled={pending}>Tambah staf</Button>
      <div className="lg:col-span-5"><Msg s={state} /></div>
    </form>
  );
}

export function StaffRow({ id, name, role, active, self }: { id: string; name: string; role: Role; active: boolean; self: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const update = (p: { role?: string; active?: boolean }) => start(async () => {
    const r = await updateStaffAction(id, p);
    setError(r.ok ? null : r.error);
  });
  return (
    <tr>
      <td className="py-2">{name}{self && " (Anda)"}</td>
      <td><Select aria-label={`Peran ${name}`} defaultValue={role} disabled={pending || self} onChange={(e) => update({ role: e.target.value })} className="w-44">{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</Select></td>
      <td><Button size="sm" variant={active ? "outline" : "success"} disabled={pending || self} onClick={() => update({ active: !active })}>{active ? "Nonaktifkan" : "Aktifkan"}</Button>{error && <span className="ml-2 text-xs text-red-600">{error}</span>}</td>
    </tr>
  );
}
