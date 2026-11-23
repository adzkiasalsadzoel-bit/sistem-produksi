import { describe, expect, it } from "vitest";
import { assessQuality, effectiveDpi, isOk4k, maxPrintWidthCm, needsManualCheck } from "@/lib/quality";
import { minDpiFor } from "@/lib/products";

describe("4K", () => {
  it("sisi panjang ≥3840 dan sisi pendek ≥2160, orientasi bebas", () => {
    expect(isOk4k(3840, 2160)).toBe(true);
    expect(isOk4k(2160, 3840)).toBe(true);
    expect(isOk4k(3839, 2160)).toBe(false);
    expect(isOk4k(5000, 2000)).toBe(false);
  });
});

describe("DPI efektif", () => {
  it("sisi panjang px ÷ (lebar cetak cm ÷ 2,54)", () => {
    // 6000 px untuk 115 cm → 6000 / 45,276 = 132,5 dpi
    expect(effectiveDpi(6000, 6000, 115)).toBe(132.5);
    expect(effectiveDpi(8000, 4000, 100)).toBe(203.2);
  });
  it("batas per produk: hijab/pashmina/jersey 150, backdrop/karpet 100", () => {
    expect(minDpiFor("Hijab Printing")).toBe(150);
    expect(minDpiFor("Pashmina")).toBe(150);
    expect(minDpiFor("Jersey")).toBe(150);
    expect(minDpiFor("Backdrop")).toBe(100);
    expect(minDpiFor("Karpet")).toBe(100);
    expect(minDpiFor("Backdrop Wisuda Custom")).toBe(100);
  });
  it("status rendah bila di bawah batas", () => {
    expect(assessQuality({ width: 6000, height: 6000, printWidthCm: 115, product: "Hijab Printing" }).status).toBe("rendah");
    expect(assessQuality({ width: 7000, height: 7000, printWidthCm: 115, product: "Hijab Printing" }).status).toBe("ok");
    // backdrop 300 cm, 12000 px → 101,6 dpi → ok untuk backdrop
    expect(assessQuality({ width: 12000, height: 8000, printWidthCm: 300, product: "Backdrop" }).status).toBe("ok");
  });
  it("tanpa dimensi / lebar cetak = cek manual", () => {
    expect(assessQuality({ product: "Hijab Printing" }).status).toBe("manual");
    expect(assessQuality({ width: 4000, height: 4000, product: "Hijab Printing" })).toMatchObject({ status: "manual", ok4k: true });
  });
  it("lebar cetak maksimal aman", () => {
    expect(maxPrintWidthCm(6000, 6000, 150)).toBe(101);
  });
  it("PSD/AI/CDR/PDF = cek manual", () => {
    for (const f of ["a.psd", "b.ai", "c.cdr", "d.pdf"]) expect(needsManualCheck(f)).toBe(true);
    for (const f of ["a.png", "b.JPG", "c.tif", "d.webp"]) expect(needsManualCheck(f)).toBe(false);
  });
});
