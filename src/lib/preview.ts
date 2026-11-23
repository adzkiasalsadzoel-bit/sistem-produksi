import "server-only";
import sharp from "sharp";

sharp.cache(false);

/** Preview JPEG sisi panjang maks 1000 px */
export async function makePreview(input: Buffer): Promise<Buffer> {
  return sharp(input, { limitInputPixels: false, failOn: "none" })
    .rotate()
    .resize({ width: 1000, height: 1000, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 80, mozjpeg: true })
    .toBuffer();
}

export async function readDimensions(input: Buffer): Promise<{ width: number; height: number } | null> {
  try {
    const m = await sharp(input, { limitInputPixels: false, failOn: "none" }).metadata();
    if (!m.width || !m.height) return null;
    // orientasi EXIF 5-8 = diputar 90°
    const rotated = (m.orientation ?? 1) >= 5;
    return rotated ? { width: m.height, height: m.width } : { width: m.width, height: m.height };
  } catch {
    return null;
  }
}
