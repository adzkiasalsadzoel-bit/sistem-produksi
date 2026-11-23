import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { readImageDimensions } from "@/lib/image-header";

async function make(format: "png" | "jpeg" | "webp" | "tiff", w: number, h: number, opts: object = {}) {
  const img = sharp({ create: { width: w, height: h, channels: 3, background: "#c33" } });
  return img.toFormat(format, opts).toBuffer();
}

describe("readImageDimensions (header saja)", () => {
  it.each([
    ["png", 4000, 2250],
    ["jpeg", 3840, 2160],
    ["webp", 1200, 700],
    ["tiff", 5000, 3000],
  ] as const)("%s %ix%i", async (fmt, w, h) => {
    const buf = await make(fmt, w, h);
    expect(readImageDimensions(new Uint8Array(buf))).toMatchObject({ width: w, height: h, format: fmt });
  });
  it("WebP lossless (VP8L)", async () => {
    const buf = await make("webp", 333, 777, { lossless: true });
    expect(readImageDimensions(new Uint8Array(buf))).toMatchObject({ width: 333, height: 777 });
  });
  it("cukup 64 KB pertama untuk JPEG/PNG", async () => {
    const buf = await make("jpeg", 6000, 6000);
    expect(readImageDimensions(new Uint8Array(buf.subarray(0, 65536)))).toMatchObject({ width: 6000, height: 6000 });
  });
  it("bukan gambar → null", () => {
    expect(readImageDimensions(new TextEncoder().encode("%PDF-1.7 lorem ipsum dolor sit amet"))).toBeNull();
  });
});
