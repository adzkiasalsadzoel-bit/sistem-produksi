// Katalog produk, channel, & kurir. Ubah di sini bila menambah lini produk.

export type ProductDef = {
  name: string;
  /** batas minimal DPI efektif agar hasil cetak tajam */
  minDpi: number;
  unit: string;
  /** lebar cetak default (cm) untuk mempercepat input SPK */
  defaultWidthCm?: number;
  materials: string[];
};

export const PRODUCTS: ProductDef[] = [
  { name: "Hijab Printing", minDpi: 150, unit: "pcs", defaultWidthCm: 115, materials: ["Voal Ultrafine", "Voal Premium", "Satin Velvet", "Ceruty Babydoll"] },
  { name: "Pashmina", minDpi: 150, unit: "pcs", defaultWidthCm: 180, materials: ["Ceruty Babydoll", "Silk Premium", "Diamond Italiano", "Jersey Premium"] },
  { name: "Jersey", minDpi: 150, unit: "set", defaultWidthCm: 60, materials: ["Dryfit Milano", "Dryfit Puma", "Benzema", "Embos"] },
  { name: "Kain Meteran", minDpi: 150, unit: "meter", defaultWidthCm: 150, materials: ["Katun Rayon", "Maxmara", "Silk Armani", "Polyester"] },
  { name: "Home Living — Sarung Bantal", minDpi: 150, unit: "pcs", defaultWidthCm: 40, materials: ["Kanvas", "Beludru", "Katun"] },
  { name: "Home Living — Taplak & Gorden", minDpi: 120, unit: "pcs", defaultWidthCm: 150, materials: ["Kanvas", "Polyester", "Blackout"] },
  { name: "Backdrop", minDpi: 100, unit: "pcs", defaultWidthCm: 300, materials: ["Polyester Flag", "Kanvas", "Silk"] },
  { name: "Karpet", minDpi: 100, unit: "pcs", defaultWidthCm: 200, materials: ["Beludru Anti-slip", "Bulu Rasfur"] },
];

/** Batas DPI menurut nama produk (fallback 150). Backdrop & karpet = 100. */
export function minDpiFor(product: string): number {
  const p = PRODUCTS.find((x) => x.name.toLowerCase() === product.toLowerCase());
  if (p) return p.minDpi;
  const n = product.toLowerCase();
  if (n.includes("backdrop") || n.includes("karpet") || n.includes("banner")) return 100;
  return 150;
}

export const CHANNELS = [
  { id: "shopee", label: "Shopee" },
  { id: "tiktok", label: "TikTok Shop" },
  { id: "tokopedia", label: "Tokopedia" },
  { id: "lazada", label: "Lazada" },
  { id: "blibli", label: "Blibli" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "reseller", label: "Reseller" },
  { id: "offline", label: "Offline / datang langsung" },
  { id: "b2b", label: "B2B / Korporat" },
  { id: "website", label: "Website" },
  { id: "lainnya", label: "Lainnya" },
] as const;
export type Channel = (typeof CHANNELS)[number]["id"];
export const CHANNEL_IDS = CHANNELS.map((c) => c.id) as [Channel, ...Channel[]];
export const MARKETPLACES: Channel[] = ["shopee", "tiktok", "tokopedia", "lazada", "blibli"];

export function channelLabel(id: string): string {
  return CHANNELS.find((c) => c.id === id)?.label ?? id;
}

export const PRIORITIES = [
  { id: "normal", label: "Normal" },
  { id: "prioritas", label: "Prioritas" },
  { id: "urgent", label: "Urgent" },
] as const;

export const COURIERS = ["J&T", "JNE", "SiCepat", "AnterAja", "SPX (Shopee Express)", "ID Express", "Ninja Xpress", "Pos Indonesia", "Lion Parcel", "TIKI", "GoSend", "GrabExpress", "Kurir toko"] as const;

/**
 * Link cek resi untuk customer. Memakai agregator cekresi.com agar satu format
 * berlaku untuk semua kurir (ubah di sini bila ingin link resmi per kurir).
 */
export function trackingUrl(resi: string, _courier?: string | null): string {
  return `https://cekresi.com/?noresi=${encodeURIComponent(resi.trim())}`;
}
