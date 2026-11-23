// Alur status — cermin dari aturan di Postgres (change_order_status).
// Database tetap sumber kebenaran; modul ini untuk validasi cepat di UI & tes.

export const STATUSES = ["baru", "antri", "print", "press", "finishing", "qc", "kirim", "selesai"] as const;
export type OrderStatus = (typeof STATUSES)[number];

export const ROLES = ["admin", "order", "produksi", "finishing"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin (Owner)",
  order: "Tim Order",
  produksi: "Tim Produksi",
  finishing: "Tim Finishing",
};

/** Label internal (staf) */
export const STATUS_LABEL: Record<OrderStatus, string> = {
  baru: "Order masuk",
  antri: "Antri produksi",
  print: "Printing",
  press: "Press / sublim",
  finishing: "Jahit & potong",
  qc: "QC & packing",
  kirim: "Siap kirim",
  selesai: "Dikirim",
};

/** Label untuk customer di halaman lacak */
export const CUSTOMER_LABEL: Record<OrderStatus, string> = {
  baru: "Pesanan diterima",
  antri: "Menunggu giliran cetak",
  print: "Sedang dicetak",
  press: "Proses press warna",
  finishing: "Proses jahit & potong",
  qc: "Pengecekan kualitas & packing",
  kirim: "Siap dikirim",
  selesai: "Sudah dikirim",
};

export const TEAM_STAGES: Record<"order" | "produksi" | "finishing", OrderStatus[]> = {
  order: ["baru"],
  produksi: ["antri", "print", "press"],
  finishing: ["finishing", "qc", "kirim"],
};

export function statusIndex(s: OrderStatus): number {
  return STATUSES.indexOf(s);
}

export function nextStatus(s: OrderStatus): OrderStatus | null {
  return STATUSES[statusIndex(s) + 1] ?? null;
}

export function prevStatus(s: OrderStatus): OrderStatus | null {
  const i = statusIndex(s);
  return i > 0 ? STATUSES[i - 1] : null;
}

export function stageOwner(s: OrderStatus): Exclude<Role, "admin"> {
  if (s === "baru") return "order";
  if (s === "antri" || s === "print" || s === "press") return "produksi";
  return "finishing";
}

/** Apakah peran boleh memindahkan order yang sedang di tahap `s` */
export function canActOn(role: Role, s: OrderStatus): boolean {
  return role === "admin" || stageOwner(s) === role;
}

/** Tahap yang boleh dilihat suatu peran (cermin RLS orders_select) */
export function visibleStages(role: Role): OrderStatus[] {
  if (role === "admin" || role === "order") return [...STATUSES];
  if (role === "produksi") return TEAM_STAGES.produksi;
  return [...TEAM_STAGES.finishing, "selesai"];
}

export type TransitionInput = {
  role: Role;
  from: OrderStatus;
  to: OrderStatus;
  note?: string | null;
  resi?: string | null;
  existingResi?: string | null;
  channel: string;
  activeDesigns: number;
};

export type TransitionResult = { ok: true; direction: "maju" | "mundur" } | { ok: false; error: string };

export function validateTransition(t: TransitionInput): TransitionResult {
  if (!canActOn(t.role, t.from)) {
    return { ok: false, error: `Tahap "${STATUS_LABEL[t.from]}" bukan milik tim Anda` };
  }
  const fi = statusIndex(t.from);
  const ti = statusIndex(t.to);
  if (fi === ti) return { ok: false, error: "Order sudah di tahap ini" };
  if (Math.abs(ti - fi) !== 1) return { ok: false, error: "Hanya boleh pindah satu tahap" };
  const mundur = ti < fi;
  if (mundur && !t.note?.trim()) return { ok: false, error: "Mundur tahap wajib mengisi alasan" };
  if (t.from === "baru" && t.to === "antri" && t.activeDesigns < 1) {
    return { ok: false, error: "Belum ada file desain — upload minimal 1 file sebelum kirim ke produksi" };
  }
  if (t.to === "selesai" && t.channel !== "offline" && !(t.resi?.trim() || t.existingResi?.trim())) {
    return { ok: false, error: "Wajib isi no resi sebelum status Dikirim" };
  }
  return { ok: true, direction: mundur ? "mundur" : "maju" };
}

// ---------- Timeline customer ----------
export type TimelineStep = {
  status: OrderStatus;
  label: string;
  state: "done" | "current" | "todo";
  /** waktu tahap ini selesai (masuk tahap berikutnya) */
  doneAt: string | null;
  /** waktu masuk tahap ini */
  enteredAt: string | null;
};

/**
 * entered: waktu terakhir order MASUK tiap status (dari order_events).
 * Tahap X dianggap selesai saat order masuk tahap X+1. Tahap terakhir selesai = done_at.
 * Bila order pernah mundur, data tahap di depan status sekarang diabaikan.
 */
export function buildTimeline(
  status: OrderStatus,
  entered: Partial<Record<OrderStatus, string>>,
  doneAt?: string | null,
): TimelineStep[] {
  const cur = statusIndex(status);
  return STATUSES.map((s, i) => {
    const next = STATUSES[i + 1];
    let done: string | null = null;
    if (i < cur && next) done = entered[next] ?? null;
    if (s === "selesai" && status === "selesai") done = doneAt ?? entered.selesai ?? null;
    return {
      status: s,
      label: CUSTOMER_LABEL[s],
      state: i < cur || (s === "selesai" && status === "selesai") ? "done" : i === cur ? "current" : "todo",
      doneAt: done,
      enteredAt: i <= cur ? (entered[s] ?? null) : null,
    };
  });
}
