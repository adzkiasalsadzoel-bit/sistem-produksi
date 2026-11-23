// Semua tanggal ditampilkan dalam zona Asia/Jakarta
export const TZ = "Asia/Jakarta";

export function todayJakarta(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now); // YYYY-MM-DD
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Selisih hari kalender (deadline - hari ini, WIB). Negatif = telat. */
export function daysUntil(deadline: string, now: Date = new Date()): number {
  const a = Date.parse(`${todayJakarta(now)}T00:00:00Z`);
  const b = Date.parse(`${deadline.slice(0, 10)}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function fmtDate(v: string | Date | null | undefined): string {
  if (!v) return "-";
  const d = typeof v === "string" && v.length === 10 ? new Date(`${v}T12:00:00+07:00`) : new Date(v);
  return new Intl.DateTimeFormat("id-ID", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" }).format(d);
}

export function fmtDateTime(v: string | Date | null | undefined): string {
  if (!v) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  }).format(new Date(v));
}

export function deadlineLabel(deadline: string | null, now: Date = new Date()): { text: string; tone: "red" | "amber" | "gray" } {
  if (!deadline) return { text: "Tanpa deadline", tone: "gray" };
  const d = daysUntil(deadline, now);
  if (d < 0) return { text: `Telat ${-d} hari`, tone: "red" };
  if (d === 0) return { text: "Deadline hari ini", tone: "red" };
  if (d === 1) return { text: "Besok", tone: "amber" };
  return { text: `${d} hari lagi`, tone: "gray" };
}

export function hoursSince(v: string, now: Date = new Date()): number {
  return Math.max(0, (now.getTime() - new Date(v).getTime()) / 3_600_000);
}

export function fmtHours(h: number | null | undefined): string {
  if (h == null || Number.isNaN(h)) return "-";
  if (h < 1) return `${Math.round(h * 60)} mnt`;
  if (h < 48) return `${Math.round(h * 10) / 10} jam`;
  return `${Math.round((h / 24) * 10) / 10} hari`;
}
