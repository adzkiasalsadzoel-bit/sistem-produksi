// Penamaan folder & file di Google Drive

const ILLEGAL = /[\\/:*?"<>|#%{}~&\u0000-\u001f]/g;

/** Ganti karakter ilegal (Windows/Drive) dengan "-" dan rapikan spasi */
export function sanitizeName(name: string): string {
  return name
    .normalize("NFKC")
    .replace(ILLEGAL, "-")
    .replace(/\s+/g, " ")
    .replace(/-{2,}/g, "-")
    .trim()
    .replace(/^[.\s-]+|[.\s]+$/g, "");
}

/** Nama depan saja (privasi) */
export function firstName(full: string): string {
  const first = full.trim().split(/\s+/)[0] ?? "";
  return sanitizeName(first) || "Customer";
}

/** YYYY-MM menurut zona Asia/Jakarta */
export function monthFolderName(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit" }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  return `${y}-${m}`;
}

/** ORD-YYMMDD-NNN · NamaDepan · Produk */
export function orderFolderName(no: string, customerName: string, product: string): string {
  return `${no} · ${firstName(customerName)} · ${sanitizeName(product)}`.slice(0, 200);
}

/** ORD-YYMMDD-NNN_01_namaasli.ext (revisi: _v2 sebelum ekstensi) */
export function designFileName(no: string, fileNo: number, original: string, version = 1): string {
  const clean = sanitizeName(original).replace(/\s+/g, "-") || "desain";
  const dot = clean.lastIndexOf(".");
  const base = dot > 0 ? clean.slice(0, dot) : clean;
  const ext = dot > 0 ? clean.slice(dot).toLowerCase() : "";
  const v = version > 1 ? `_v${version}` : "";
  return `${no}_${String(fileNo).padStart(2, "0")}_${base.slice(0, 120)}${v}${ext}`;
}
