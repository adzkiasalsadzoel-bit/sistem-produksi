import { requireStaff } from "@/lib/auth";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSettings } from "@/lib/queries";
import { driveConfigured, serviceAccountEmail } from "@/lib/drive";
import { fmtDateTime } from "@/lib/dates";
import { CreateStaffForm, DrivePanel, SettingsForm, StaffRow } from "./forms";
import type { Profile } from "@/lib/types";

export const metadata = { title: "Pengaturan" };

export default async function PengaturanPage() {
  const { supabase, user } = await requireStaff(["admin"]);
  const s = await getSettings(supabase);
  const [{ data: staff }, { data: audit }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, role, active").order("role").order("full_name"),
    supabase.from("audit_log").select("id, user_id, action, order_id, at").order("at", { ascending: false }).limit(30),
  ]);
  const names = new Map(((staff ?? []) as Profile[]).map((p) => [p.id, p.full_name]));
  const banner = (s.banner_lacak ?? {}) as { aktif?: boolean; judul?: string; teks?: string; tombol?: string };
  const envDrive = process.env.GOOGLE_SHARED_DRIVE_ID || null;

  return (
    <>
      <PageHeader title="Pengaturan" description="Khusus admin/owner" />
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader><CardTitle>Profil usaha & halaman lacak</CardTitle></CardHeader>
          <CardContent>
            <SettingsForm v={{ nama_usaha: String(s.nama_usaha ?? ""), wa_bisnis: String(s.wa_bisnis ?? ""), lead: Number(s.lead_time_default_hari ?? 3), banner }} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Google Drive</CardTitle><CardDescription>File asli desain disimpan di Shared Drive: /YYYY-MM/ORD-… · Nama · Produk/</CardDescription></CardHeader>
          <CardContent><DrivePanel current={(s.drive_id as string | null) ?? envDrive} configured={driveConfigured()} email={serviceAccountEmail()} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Staf & peran</CardTitle><CardDescription>Produksi & finishing hanya melihat nama customer. Pendaftaran publik dimatikan — staf hanya dibuat dari sini.</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-6">
            <CreateStaffForm />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="text-left text-slate-500"><tr><th className="py-1">Nama</th><th>Peran</th><th>Status</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {((staff ?? []) as Profile[]).map((p) => <StaffRow key={p.id} id={p.id} name={p.full_name} role={p.role} active={p.active} self={p.id === user.id} />)}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Audit akses data customer</CardTitle><CardDescription>30 terakhir</CardDescription></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="text-left text-slate-500"><tr><th className="py-1">Waktu</th><th>Staf</th><th>Aksi</th><th>Order</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {(audit ?? []).map((a) => (
                  <tr key={a.id}><td className="py-1.5">{fmtDateTime(a.at)}</td><td>{names.get(a.user_id) ?? "-"}</td><td>{a.action}</td><td>{a.order_id ? <a className="text-brand underline" href={`/order/${a.order_id}`}>buka</a> : "-"}</td></tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
