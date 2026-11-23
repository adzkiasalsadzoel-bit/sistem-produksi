import type { Role } from "@/lib/status";

export type NavItem = { href: string; label: string; icon: string; roles: Role[] };

export const NAV: NavItem[] = [
  { href: "/ringkasan", label: "Ringkasan", icon: "LayoutDashboard", roles: ["admin", "order", "produksi", "finishing"] },
  { href: "/order", label: "Papan Order", icon: "Inbox", roles: ["admin", "order"] },
  { href: "/produksi", label: "Papan Produksi", icon: "Printer", roles: ["admin", "produksi"] },
  { href: "/finishing", label: "Papan Finishing", icon: "Scissors", roles: ["admin", "finishing"] },
  { href: "/arsip", label: "Arsip & Order Ulang", icon: "Archive", roles: ["admin", "order"] },
  { href: "/analisa", label: "Analisa", icon: "ChartColumn", roles: ["admin", "order"] },
  { href: "/pengaturan", label: "Pengaturan", icon: "Settings", roles: ["admin"] },
];

export const navFor = (role: Role) => NAV.filter((n) => n.roles.includes(role));
