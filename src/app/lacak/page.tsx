import { LookupForm } from "./lookup-form";
import { LacakShell, publicSettings } from "./shell";

export const metadata = { title: "Lacak pesanan", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function LacakPage() {
  const s = await publicSettings();
  return (
    <LacakShell s={s} waText="Halo admin, saya mau tanya status pesanan saya.">
      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h1 className="mb-4 text-xl font-bold">Lacak pesanan</h1>
        <LookupForm />
      </section>
    </LacakShell>
  );
}
