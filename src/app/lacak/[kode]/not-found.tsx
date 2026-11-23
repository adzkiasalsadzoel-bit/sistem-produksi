import Link from "next/link";
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-xl font-bold">Pesanan tidak ditemukan</h1>
      <p className="text-slate-600">Periksa kembali kode lacak dari pesan WhatsApp admin.</p>
      <Link href="/lacak" className="min-h-11 rounded-lg bg-brand px-4 py-3 font-medium text-white">Coba lagi</Link>
    </main>
  );
}
