import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Circle, Loader2, Truck } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";
import { isValidTrackCode, normalizeTrackCode, waLink } from "@/lib/track";
import { buildTimeline, CUSTOMER_LABEL } from "@/lib/status";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import { trackingUrl } from "@/lib/products";
import type { TrackResult } from "@/lib/types";
import { LacakShell, publicSettings } from "../shell";

export const metadata = { title: "Status pesanan", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function LacakDetailPage({ params }: { params: Promise<{ kode: string }> }) {
  const code = normalizeTrackCode((await params).kode);
  // kode salah format tidak perlu menyentuh DB, tapi tetap dihitung sebagai percobaan
  if (!isValidTrackCode(code)) {
    await rateLimit("lacak");
    notFound();
  }
  const { data } = await createAdminClient().rpc("track_lookup", { p_code: code });
  const t = data as TrackResult | null;
  if (!t) {
    // hanya percobaan GAGAL yang dihitung agar customer yang refresh tidak terblokir
    if (!(await rateLimit("lacak"))) return <TooMany />;
    notFound();
  }
  const s = await publicSettings();
  const steps = buildTimeline(t.status, t.entered, t.done_at);
  const banner = s.banner_lacak;

  return (
    <LacakShell s={s} waText={`Halo admin, saya mau tanya pesanan ${t.no} (kode ${t.code}).`}>
      <section className="rounded-2xl bg-white p-5 shadow-sm" data-testid="track-card">
        <p className="font-mono text-sm text-slate-500">{t.no}</p>
        <h1 className="text-xl font-bold">{t.product}</h1>
        <p className="text-slate-600">{t.qty} {t.unit}</p>
        <div className="mt-4 rounded-xl bg-brand-light/60 p-4">
          <p className="text-sm text-brand-dark">Status saat ini</p>
          <p className="text-2xl font-bold text-brand-dark" data-testid="track-status">{CUSTOMER_LABEL[t.status]}</p>
          {t.status !== "selesai" && t.deadline && <p className="mt-1 text-sm text-slate-700">Estimasi selesai: <b>{fmtDate(t.deadline)}</b></p>}
        </div>
        {t.has_issue && (
          <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Sedang ada penyesuaian, tim kami akan menghubungi Kakak.</p>
        )}
        {t.resi && (
          <div className="mt-3 flex items-center gap-3 rounded-lg border border-slate-200 p-3">
            <Truck className="size-6 shrink-0 text-brand" />
            <div className="min-w-0 flex-1 text-sm">
              <p className="text-slate-500">No. resi {t.courier && `· ${t.courier}`}</p>
              <p className="font-mono font-semibold break-all">{t.resi}</p>
            </div>
            <a href={trackingUrl(t.resi, t.courier)} target="_blank" rel="noreferrer" className="min-h-11 shrink-0 rounded-lg bg-brand px-3 py-3 text-sm font-medium text-white">Cek resi</a>
          </div>
        )}
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="mb-4 font-semibold">Perjalanan pesanan</h2>
        <ol className="flex flex-col">
          {steps.map((st, i) => (
            <li key={st.status} className="relative flex gap-3 pb-5 last:pb-0">
              {i < steps.length - 1 && <span className={`absolute top-6 left-[11px] h-full w-0.5 ${st.state === "done" ? "bg-emerald-500" : "bg-slate-200"}`} />}
              <span className="relative z-10 bg-white">
                {st.state === "done" ? <CheckCircle2 className="size-6 text-emerald-500" /> : st.state === "current" ? <Loader2 className="size-6 animate-spin text-brand [animation-duration:3s]" /> : <Circle className="size-6 text-slate-300" />}
              </span>
              <div>
                <p className={st.state === "todo" ? "text-slate-400" : "font-medium"}>{st.label}</p>
                {st.state === "done" && st.doneAt && <p className="text-xs text-slate-500">Selesai {fmtDateTime(st.doneAt)}</p>}
                {st.state === "current" && st.enteredAt && <p className="text-xs text-brand">Sedang berlangsung sejak {fmtDateTime(st.enteredAt)}</p>}
              </div>
            </li>
          ))}
        </ol>
      </section>

      {banner?.aktif && banner.judul && (
        <section className="rounded-2xl border border-brand/20 bg-white p-5 shadow-sm">
          <p className="font-semibold text-brand-dark">{banner.judul}</p>
          {banner.teks && <p className="mt-1 text-sm text-slate-600">{banner.teks}</p>}
          {s.wa_bisnis && (
            <a href={waLink(s.wa_bisnis, `Halo admin, saya mau order ulang pesanan ${t.no} (kode ${t.code}).`)} target="_blank" rel="noreferrer"
              className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-brand px-4 text-sm font-semibold text-brand hover:bg-brand-light">
              {banner.tombol || "Order ulang"}
            </a>
          )}
        </section>
      )}
      <Link href="/lacak" className="text-center text-sm text-slate-600 underline">Lacak pesanan lain</Link>
    </LacakShell>
  );
}

function TooMany() {
  return (
    <main className="mx-auto max-w-lg p-6 text-center">
      <h1 className="text-lg font-semibold">Terlalu banyak percobaan</h1>
      <p className="text-slate-600">Coba lagi dalam 10 menit.</p>
    </main>
  );
}
