import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmtNumber(n: number | null | undefined): string {
  return n == null ? "-" : new Intl.NumberFormat("id-ID").format(n);
}

export function fmtBytes(b: number | null | undefined): string {
  if (!b) return "-";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = b;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${u[i]}`;
}

/** Pesan error Postgres/Supabase → kalimat yang ramah */
export function friendlyError(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? String(e);
  if (/row-level security|permission denied/i.test(msg)) return "Anda tidak punya akses untuk tindakan ini.";
  if (/JWT|session/i.test(msg)) return "Sesi habis, silakan login ulang.";
  return msg.replace(/^.*?ERROR:\s*/, "");
}
