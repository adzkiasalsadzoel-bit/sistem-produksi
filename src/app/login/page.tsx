import Image from "next/image";
import { LoginForm } from "./login-form";

export const metadata = { title: "Masuk" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  const notice = sp.error === "nonaktif" ? "Akun Anda belum aktif atau belum punya peran. Hubungi admin." : undefined;
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <Image src="/logo.svg" alt="" width={44} height={44} />
          <div>
            <h1 className="text-lg font-semibold">Sistem Produksi Cetak</h1>
            <p className="text-sm text-slate-500">Masuk untuk staf</p>
          </div>
        </div>
        <LoginForm next={sp.next} notice={notice} />
        <p className="mt-6 text-center text-sm text-slate-500">
          Customer? <a className="font-medium text-brand underline" href="/lacak">Lacak pesanan di sini</a>
        </p>
      </div>
    </main>
  );
}
