// Validasi kualitas file desain: 4K & DPI efektif
import { minDpiFor } from "./products";

export const RASTER_MIMES = ["image/png", "image/jpeg", "image/tiff", "image/webp"];
const RASTER_EXT = ["png", "jpg", "jpeg", "tif", "tiff", "webp"];
/** Format yang dimensinya harus dicek manual (vektor / layered) */
const MANUAL_EXT = ["psd", "psb", "ai", "cdr", "pdf", "eps", "svg"];

export function fileExt(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : "";
}

export function isRaster(name: string, mime?: string | null): boolean {
  if (mime && RASTER_MIMES.includes(mime.toLowerCase())) return true;
  return RASTER_EXT.includes(fileExt(name));
}

export function needsManualCheck(name: string, mime?: string | null): boolean {
  return !isRaster(name, mime) || MANUAL_EXT.includes(fileExt(name));
}

/** Sisi panjang ≥ 3840 px DAN sisi pendek ≥ 2160 px */
export function isOk4k(width: number, height: number): boolean {
  const long = Math.max(width, height);
  const short = Math.min(width, height);
  return long >= 3840 && short >= 2160;
}

/** DPI efektif = sisi panjang px ÷ (lebar cetak cm ÷ 2,54) */
export function effectiveDpi(width: number, height: number, printWidthCm: number): number {
  if (!printWidthCm || printWidthCm <= 0) return NaN;
  const long = Math.max(width, height);
  return Math.round((long / (printWidthCm / 2.54)) * 10) / 10;
}

export type Quality = {
  ok4k: boolean | null;
  dpi: number | null;
  minDpi: number;
  status: "ok" | "rendah" | "manual";
};

export function assessQuality(input: {
  width?: number | null;
  height?: number | null;
  printWidthCm?: number | null;
  product: string;
}): Quality {
  const minDpi = minDpiFor(input.product);
  const { width, height } = input;
  if (!width || !height) return { ok4k: null, dpi: null, minDpi, status: "manual" };
  const ok4k = isOk4k(width, height);
  if (!input.printWidthCm) return { ok4k, dpi: null, minDpi, status: "manual" };
  const dpi = effectiveDpi(width, height, input.printWidthCm);
  return { ok4k, dpi, minDpi, status: dpi >= minDpi ? "ok" : "rendah" };
}

/** Lebar cetak maksimum (cm) yang masih aman untuk ukuran file ini */
export function maxPrintWidthCm(width: number, height: number, minDpi: number): number {
  return Math.floor((Math.max(width, height) / minDpi) * 2.54);
}
