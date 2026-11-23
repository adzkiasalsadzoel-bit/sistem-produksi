// Membaca dimensi gambar dari byte awal file (PNG, JPEG, WebP, TIFF/BigTIFF)
// tanpa decode penuh — cukup ~1 MB pertama untuk file sebesar apa pun
// (kecuali TIFF yang IFD-nya ditulis di akhir file → fallback ke sharp/Drive).

export type Dimensions = { width: number; height: number; format: "png" | "jpeg" | "webp" | "tiff" };

export function readImageDimensions(buf: Uint8Array): Dimensions | null {
  if (buf.length < 24) return null;
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  // PNG: 89 50 4E 47 ... IHDR width/height big-endian @16/@20
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { width: dv.getUint32(16), height: dv.getUint32(20), format: "png" };
  }

  // JPEG: cari marker SOFn
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      if (marker === 0xff) { i++; continue; }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      const len = dv.getUint16(i + 2);
      const isSOF = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSOF) {
        return { height: dv.getUint16(i + 5), width: dv.getUint16(i + 7), format: "jpeg" };
      }
      if (marker === 0xda) return null; // start of scan tanpa SOF
      i += 2 + len;
    }
    return null;
  }

  // WebP: RIFF....WEBP
  if (ascii(buf, 0, 4) === "RIFF" && ascii(buf, 8, 4) === "WEBP") {
    const chunk = ascii(buf, 12, 4);
    if (chunk === "VP8X" && buf.length >= 30) {
      const w = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
      const h = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
      return { width: w, height: h, format: "webp" };
    }
    if (chunk === "VP8 " && buf.length >= 30) {
      return { width: dv.getUint16(26, true) & 0x3fff, height: dv.getUint16(28, true) & 0x3fff, format: "webp" };
    }
    if (chunk === "VP8L" && buf.length >= 25) {
      const b0 = buf[21], b1 = buf[22], b2 = buf[23], b3 = buf[24];
      const w = 1 + (((b1 & 0x3f) << 8) | b0);
      const h = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
      return { width: w, height: h, format: "webp" };
    }
    return null;
  }

  // TIFF: II*\0 / MM\0* (classic) atau BigTIFF (versi 43)
  const le = buf[0] === 0x49 && buf[1] === 0x49;
  const be = buf[0] === 0x4d && buf[1] === 0x4d;
  if (le || be) {
    const little = le;
    const version = dv.getUint16(2, little);
    if (version === 42) {
      const ifd = dv.getUint32(4, little);
      return tiffIfd(dv, ifd, little, false);
    }
    if (version === 43) {
      const ifd = Number(dv.getBigUint64(8, little));
      return tiffIfd(dv, ifd, little, true);
    }
  }
  return null;
}

function tiffIfd(dv: DataView, ifd: number, little: boolean, big: boolean): Dimensions | null {
  const countSize = big ? 8 : 2;
  const entrySize = big ? 20 : 12;
  if (ifd + countSize > dv.byteLength) return null; // IFD di luar buffer
  const count = big ? Number(dv.getBigUint64(ifd, little)) : dv.getUint16(ifd, little);
  let width = 0;
  let height = 0;
  for (let k = 0; k < count; k++) {
    const e = ifd + countSize + k * entrySize;
    if (e + entrySize > dv.byteLength) return null;
    const tag = dv.getUint16(e, little);
    const type = dv.getUint16(e + 2, little);
    const valOff = e + (big ? 12 : 8);
    const val = type === 3 ? dv.getUint16(valOff, little) : type === 16 ? Number(dv.getBigUint64(valOff, little)) : dv.getUint32(valOff, little);
    if (tag === 256) width = val;
    if (tag === 257) height = val;
    if (width && height) return { width, height, format: "tiff" };
  }
  return null;
}

function ascii(buf: Uint8Array, start: number, len: number): string {
  return String.fromCharCode(...buf.subarray(start, start + len));
}
