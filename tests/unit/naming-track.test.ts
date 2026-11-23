import { describe, expect, it } from "vitest";
import { designFileName, firstName, monthFolderName, orderFolderName, sanitizeName } from "@/lib/naming";
import { buildUpdateMessage, isValidTrackCode, normalizeTrackCode, normalizeWa, TRACK_ALPHABET } from "@/lib/track";

describe("penamaan Drive", () => {
  it("karakter ilegal diganti -", () => {
    expect(sanitizeName('motif: "bunga"/final?.png')).toBe("motif- -bunga-final-.png");
  });
  it("nama file ORD_NN_nama", () => {
    expect(designFileName("ORD-261123-007", 1, "Motif Bunga Final.PNG")).toBe("ORD-261123-007_01_Motif-Bunga-Final.png");
    expect(designFileName("ORD-261123-007", 2, "a/b.tif", 3)).toBe("ORD-261123-007_02_a-b_v3.tif");
  });
  it("folder order pakai nama depan saja", () => {
    expect(orderFolderName("ORD-261123-001", "Aisyah Putri Rahma", "Hijab Printing")).toBe("ORD-261123-001 · Aisyah · Hijab Printing");
    expect(firstName("  ")).toBe("Customer");
  });
  it("folder bulan mengikuti WIB", () => {
    // 31 Okt 2026 20:00 UTC = 1 Nov 03:00 WIB
    expect(monthFolderName(new Date("2026-10-31T20:00:00Z"))).toBe("2026-11");
  });
});

describe("kode lacak", () => {
  it("alfabet 32 karakter tanpa O/0/I/1", () => {
    expect(TRACK_ALPHABET).toHaveLength(32);
    expect(TRACK_ALPHABET).not.toMatch(/[O0I1]/);
  });
  it("validasi & normalisasi", () => {
    expect(isValidTrackCode(normalizeTrackCode("np59-wbxb"))).toBe(true);
    expect(isValidTrackCode("NP59WBX0")).toBe(false);
    expect(isValidTrackCode("ABC")).toBe(false);
  });
  it("nomor WA ke 62", () => {
    expect(normalizeWa("0812-3456-0001")).toBe("6281234560001");
    expect(normalizeWa("+62 812 3456")).toBe("628123456");
    expect(normalizeWa("8123")).toBe("628123");
  });
  it("pesan update WA tanpa data sensitif", () => {
    const msg = buildUpdateMessage({
      customerName: "Aisyah Putri", no: "ORD-261123-001", product: "Hijab Printing", qty: 24, unit: "pcs",
      status: "press", trackUrl: "https://x.id/lacak/ABCDEFGH", businessName: "Atelier Cetak",
    });
    expect(msg).toContain("Kak Aisyah");
    expect(msg).not.toContain("Putri");
    expect(msg).toContain("Proses press warna");
    expect(msg).toContain("https://x.id/lacak/ABCDEFGH");
  });
});
