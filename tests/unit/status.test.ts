import { describe, expect, it } from "vitest";
import { buildTimeline, canActOn, nextStatus, prevStatus, stageOwner, validateTransition, visibleStages } from "@/lib/status";

const base = { channel: "shopee", activeDesigns: 1 } as const;

describe("pemilik tahap", () => {
  it("baru=order; antri/print/press=produksi; sisanya=finishing", () => {
    expect(stageOwner("baru")).toBe("order");
    expect(["antri", "print", "press"].map((s) => stageOwner(s as never))).toEqual(["produksi", "produksi", "produksi"]);
    expect(["finishing", "qc", "kirim", "selesai"].map((s) => stageOwner(s as never))).toEqual(Array(4).fill("finishing"));
  });
  it("admin boleh semua tahap, tim lain hanya tahapnya", () => {
    expect(canActOn("admin", "press")).toBe(true);
    expect(canActOn("produksi", "qc")).toBe(false);
    expect(canActOn("finishing", "qc")).toBe(true);
  });
  it("urutan maju/mundur", () => {
    expect(nextStatus("press")).toBe("finishing");
    expect(prevStatus("baru")).toBeNull();
    expect(nextStatus("selesai")).toBeNull();
  });
  it("visibilitas cermin RLS", () => {
    expect(visibleStages("produksi")).toEqual(["antri", "print", "press"]);
    expect(visibleStages("finishing")).toContain("selesai");
  });
});

describe("validateTransition", () => {
  it("baru → antri ditolak tanpa file desain", () => {
    const r = validateTransition({ ...base, role: "order", from: "baru", to: "antri", activeDesigns: 0 });
    expect(r.ok).toBe(false);
  });
  it("baru → antri boleh bila ada desain", () => {
    expect(validateTransition({ ...base, role: "order", from: "baru", to: "antri" })).toEqual({ ok: true, direction: "maju" });
  });
  it("lompat tahap ditolak", () => {
    expect(validateTransition({ ...base, role: "produksi", from: "antri", to: "press" }).ok).toBe(false);
  });
  it("mundur wajib alasan", () => {
    expect(validateTransition({ ...base, role: "produksi", from: "press", to: "print" }).ok).toBe(false);
    expect(validateTransition({ ...base, role: "produksi", from: "press", to: "print", note: "warna pudar" }))
      .toEqual({ ok: true, direction: "mundur" });
  });
  it("tim lain tidak boleh memindah tahap yang bukan miliknya", () => {
    expect(validateTransition({ ...base, role: "finishing", from: "press", to: "finishing" }).ok).toBe(false);
  });
  it("selesai wajib resi kecuali offline", () => {
    expect(validateTransition({ ...base, role: "finishing", from: "kirim", to: "selesai" }).ok).toBe(false);
    expect(validateTransition({ ...base, role: "finishing", from: "kirim", to: "selesai", resi: "JX123" }).ok).toBe(true);
    expect(validateTransition({ ...base, role: "finishing", from: "kirim", to: "selesai", existingResi: "JX1" }).ok).toBe(true);
    expect(validateTransition({ ...base, channel: "offline", role: "finishing", from: "kirim", to: "selesai" }).ok).toBe(true);
  });
});

describe("buildTimeline", () => {
  const entered = {
    baru: "2026-11-20T01:00:00Z", antri: "2026-11-20T05:00:00Z", print: "2026-11-20T09:00:00Z",
    press: "2026-11-21T01:00:00Z", finishing: "2026-11-21T09:00:00Z",
  };
  it("tahap sebelum status sekarang = done dengan tanggal selesai = masuk tahap berikutnya", () => {
    const t = buildTimeline("press", entered);
    expect(t.map((s) => s.state)).toEqual(["done", "done", "done", "current", "todo", "todo", "todo", "todo"]);
    expect(t[0].doneAt).toBe(entered.antri);
    expect(t[2].doneAt).toBe(entered.press);
    expect(t[3].doneAt).toBeNull();
  });
  it("data tahap di depan diabaikan setelah mundur", () => {
    const t = buildTimeline("press", entered); // entered.finishing ada (pernah maju lalu mundur)
    expect(t[4].enteredAt).toBeNull();
  });
  it("selesai: semua done, tanggal akhir = done_at", () => {
    const t = buildTimeline("selesai", entered, "2026-11-22T10:00:00Z");
    expect(t.every((s) => s.state === "done")).toBe(true);
    expect(t[7].doneAt).toBe("2026-11-22T10:00:00Z");
    expect(t[7].label).toBe("Sudah dikirim");
  });
});
