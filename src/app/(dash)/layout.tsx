import Image from "next/image";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/status";
import { navFor } from "@/components/layout/nav";
import { NavLinks } from "@/components/layout/sidebar";
import { logout } from "@/app/login/actions";
import { Button } from "@/components/ui/button";

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireStaff();
  const items = navFor(profile.role);
  return (
    <div className="min-h-dvh lg:flex">
      <aside className="hidden w-64 shrink-0 flex-col gap-4 border-r border-slate-200 bg-white p-4 lg:flex lg:sticky lg:top-0 lg:h-dvh">
        <Link href="/ringkasan" className="flex items-center gap-2 px-2">
          <Image src="/logo.svg" alt="" width={36} height={36} />
          <span className="font-semibold leading-tight">Sistem Produksi<br /><span className="text-xs font-normal text-slate-500">Percetakan kain</span></span>
        </Link>
        <NavLinks items={items} />
        <div className="mt-auto rounded-lg bg-slate-50 p-3 text-sm">
          <p className="font-medium">{profile.full_name}</p>
          <p className="text-slate-500">{ROLE_LABEL[profile.role]}</p>
          <form action={logout} className="mt-2">
            <Button variant="outline" size="sm" className="w-full"><LogOut /> Keluar</Button>
          </form>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between gap-2 p-3">
            <Link href="/ringkasan" className="flex items-center gap-2">
              <Image src="/logo.svg" alt="" width={32} height={32} />
              <span className="text-sm font-semibold">{profile.full_name}<span className="block text-xs font-normal text-slate-500">{ROLE_LABEL[profile.role]}</span></span>
            </Link>
            <form action={logout}><Button variant="ghost" size="icon" aria-label="Keluar"><LogOut /></Button></form>
          </div>
          <NavLinks items={items} mobile />
        </header>
        <main className="mx-auto max-w-[1600px] p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
