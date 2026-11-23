import Image from "next/image";
import { MessageCircle } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { waLink } from "@/lib/track";

export type PublicSettings = {
  wa_bisnis?: string;
  nama_usaha?: string;
  banner_lacak?: { aktif?: boolean; judul?: string; teks?: string; tombol?: string };
};

export async function publicSettings(): Promise<PublicSettings> {
  try {
    const { data } = await createAdminClient().rpc("public_settings");
    return (data ?? {}) as PublicSettings;
  } catch {
    return {};
  }
}

export function LacakShell({ s, children, waText }: { s: PublicSettings; children: React.ReactNode; waText: string }) {
  return (
    <div className="min-h-dvh bg-gradient-to-b from-brand-light/60 to-slate-50">
      <main className="mx-auto flex max-w-lg flex-col gap-4 px-4 py-6">
        <header className="flex items-center gap-3">
          <Image src="/logo.svg" alt="" width={44} height={44} priority />
          <div>
            <p className="text-lg font-bold">{s.nama_usaha || "Lacak Pesanan"}</p>
            <p className="text-sm text-slate-600">Cek status pesanan Kakak</p>
          </div>
        </header>
        {children}
        {s.wa_bisnis && (
          <a href={waLink(s.wa_bisnis, waText)} target="_blank" rel="noreferrer"
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 font-semibold text-white shadow hover:bg-emerald-700">
            <MessageCircle className="size-5" /> Chat admin via WhatsApp
          </a>
        )}
        <p className="text-center text-xs text-slate-500">Data pribadi Kakak tidak ditampilkan di halaman ini.</p>
      </main>
    </div>
  );
}
