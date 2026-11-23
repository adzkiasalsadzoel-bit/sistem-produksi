"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Archive, ChartColumn, Inbox, LayoutDashboard, Monitor, Printer, Scissors, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NavItem } from "./nav";

const ICONS = { LayoutDashboard, Inbox, Printer, Scissors, Archive, ChartColumn, Settings } as const;

export function NavLinks({ items, mobile = false }: { items: NavItem[]; mobile?: boolean }) {
  const path = usePathname();
  return (
    <nav aria-label="Menu utama" className={cn(mobile ? "flex gap-1 overflow-x-auto px-3 pb-2" : "flex flex-col gap-1")}>
      {items.map((n) => {
        const Icon = ICONS[n.icon as keyof typeof ICONS];
        const active = path === n.href || path.startsWith(`${n.href}/`);
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium whitespace-nowrap",
              active ? "bg-brand text-white" : "text-slate-700 hover:bg-slate-100",
            )}
          >
            {Icon && <Icon className="size-4" aria-hidden />}
            {n.label}
          </Link>
        );
      })}
      <Link href="/tv" target="_blank" className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium whitespace-nowrap text-slate-700 hover:bg-slate-100">
        <Monitor className="size-4" aria-hidden /> Tampilan TV
      </Link>
    </nav>
  );
}
