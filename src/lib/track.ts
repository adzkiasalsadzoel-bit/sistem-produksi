// Kode lacak & pesan WhatsApp
import { CUSTOMER_LABEL, type OrderStatus } from "./status";
import { firstName } from "./naming";
import { trackingUrl } from "./products";

export const TRACK_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const TRACK_RE = /^[A-HJ-NP-Z2-9]{8}$/;

/** Rapikan input customer: huruf besar, buang spasi/strip, O→? tidak dikonversi (bukan bagian alfabet) */
export function normalizeTrackCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, "");
}

export function isValidTrackCode(code: string): boolean {
  return TRACK_RE.test(code);
}

export function isValidOrderNo(no: string): boolean {
  return /^ORD-\d{6}-\d{3,}$/i.test(no.trim());
}

export function trackPageUrl(appUrl: string, code: string): string {
  return `${appUrl.replace(/\/$/, "")}/lacak/${code}`;
}

/** Nomor WA ke format internasional 62xxx */
export function normalizeWa(input: string | null | undefined): string {
  let d = (input ?? "").replace(/\D/g, "");
  if (d.startsWith("0")) d = "62" + d.slice(1);
  else if (d.startsWith("8")) d = "62" + d;
  return d;
}

export function waLink(number: string, text: string): string {
  const n = normalizeWa(number);
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}

export function buildUpdateMessage(o: {
  customerName: string;
  no: string;
  product: string;
  qty: number;
  unit: string;
  status: OrderStatus;
  trackUrl: string;
  resi?: string | null;
  courier?: string | null;
  businessName?: string;
}): string {
  const lines = [
    `Halo Kak ${firstName(o.customerName)} 👋`,
    ``,
    `Update pesanan *${o.no}*`,
    `${o.product} — ${o.qty} ${o.unit}`,
    `Status: *${CUSTOMER_LABEL[o.status]}*`,
  ];
  if (o.resi) {
    lines.push(`No. resi: *${o.resi}*${o.courier ? ` (${o.courier})` : ""}`);
    lines.push(`Cek resi: ${trackingUrl(o.resi, o.courier)}`);
  }
  lines.push(``, `Pantau pesanan kapan saja di sini:`, o.trackUrl, ``);
  lines.push(`Terima kasih sudah order di ${o.businessName || "toko kami"} 🙏`);
  return lines.join("\n");
}
