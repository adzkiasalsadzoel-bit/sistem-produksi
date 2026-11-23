import { describe, expect, it } from "vitest";
import { findBottleneck, generateInsights, processPromise, weeklyChange, type Analytics } from "@/lib/insights";
import { toCsv } from "@/lib/csv";

const base: Analytics = {
  days: 30,
  wip: { antri: 4, print: 3, press: 12, finishing: 2 },
  stage_hours: [
    { status: "antri", jam: 10, p80: 16, n: 20 }, { status: "print", jam: 4, p80: 6, n: 20 },
    { status: "press", jam: 5, p80: 8, n: 20 }, { status: "finishing", jam: 9, p80: 14, n: 20 },
    { status: "qc", jam: 3, p80: 4, n: 20 }, { status: "kirim", jam: 6, p80: 10, n: 20 },
  ],
  throughput: [{ hari: "2026-11-20", tim: "produksi", n: 30 }, { hari: "2026-11-21", tim: "produksi", n: 30 }],
  channels: [
    { channel: "shopee", orders: 20, units: 600, late_pct: 25, selesai: 15 },
    { channel: "tiktok", orders: 10, units: 300, late_pct: 0, selesai: 9 },
  ],
  products: [{ product: "Hijab Printing", orders: 18, units: 700 }, { product: "Pashmina", orders: 12, units: 200 }],
  weekly: [{ minggu: "2026-11-02", orders: 20, units: 1 }, { minggu: "2026-11-09", orders: 10, units: 1 }, { minggu: "2026-11-16", orders: 3, units: 1 }],
  totals: { orders: 30, units: 900, late_pct: 17, reorders: 4 },
  repeat: { customers: 3, all_customers: 20, orders_from_repeat_pct: 18 },
  top_repeat: [],
};

describe("insights", () => {
  it("bottleneck = tahap dengan antrian terbanyak", () => {
    expect(findBottleneck(base.wip)).toEqual({ status: "press", n: 12 });
  });
  it("kalimat bottleneck menyarankan tambah shift sebelum menaikkan iklan", () => {
    const t = generateInsights(base).map((i) => `${i.title} ${i.action}`).join("\n");
    expect(t).toContain("Bottleneck di Press / sublim (12 order)");
    expect(t).toMatch(/shift.*sebelum menaikkan budget iklan/);
  });
  it("janji waktu proses dari P80", () => {
    expect(processPromise(base.stage_hours)).toEqual({ avgHours: 37, p80Hours: 58 });
    expect(generateInsights(base).some((i) => i.action.includes("3 hari kerja"))).toBe(true);
  });
  it("channel telat ≥20% ditandai, repeat rendah → saran broadcast/custom audience, tren turun", () => {
    const t = generateInsights(base).map((i) => i.title).join("\n");
    expect(t).toContain("25% order Shopee telat");
    expect(t).toContain("18% order dari pelanggan lama");
    expect(weeklyChange(base.weekly)).toEqual({ pct: -50, last: 10, prev: 20 });
    expect(t).toContain("Order turun 50%");
  });
  it("kapasitas: order/hari vs throughput produksi", () => {
    // 30 order/30 hari = 1/hari; produksi 60 langkah / 3 / 2 hari = 10 order/hari → longgar
    expect(generateInsights(base).some((i) => i.title.startsWith("Kapasitas produksi masih longgar"))).toBe(true);
  });
  it("data kosong tidak error", () => {
    expect(generateInsights({ ...base, wip: {}, stage_hours: [], throughput: [], channels: [], products: [], weekly: [], repeat: { customers: 0, all_customers: 0, orders_from_repeat_pct: null } })).toEqual([]);
  });
});

describe("csv", () => {
  it("escape & cegah formula injection", () => {
    expect(toCsv([["a,b", '=HYPERLINK("x")', 5]])).toBe('﻿"a,b","\'=HYPERLINK(""x"")",5\r\n');
  });
});
